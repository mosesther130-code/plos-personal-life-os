"""PLOS Jobs — Deep Search Engine.

Aggregates real-time job postings from multiple sources in parallel:
- SerpApi Google Jobs   (primary aggregator across all major job boards)
- SerpApi google engine + site: filters for LinkedIn, Indeed, Glassdoor
- Devex RSS             (international development)
- ReliefWeb v1 API      (humanitarian / dev finance)
- USAJobs API           (federal — when USAJOBS_API_KEY present)

Every result is deduped, HEAD-verified, ranked, and stored in `jobs_feed`
with a TTL of 30 days.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from xml.etree import ElementTree as ET

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

SERPAPI_URL = "https://serpapi.com/search.json"
DEVEX_RSS = "https://www.devex.com/jobs/rss"
RELIEFWEB_URL = "https://api.reliefweb.int/v1/jobs"
USAJOBS_URL = "https://data.usajobs.gov/api/search"

FRESHNESS_DAYS = {"24h": 1, "3d": 3, "7d": 7, "30d": 30, "any": 3650}
SEARCH_TIMEOUT = 25.0
VERIFY_TIMEOUT = 6.0

DEFAULT_INDUSTRIES = [
    "Federal Government",
    "International Organizations (UN, ADB, World Bank, IMF, NATO)",
    "International Development NGO",
    "International Development Consulting",
    "Higher Education Administration",
    "Nonprofit and Foundation",
    "State and Local Government",
    "Financial Services and Banking",
    "Healthcare Administration",
    "Technology and Software",
    "Government Contracting",
    "Eco-Tourism and Hospitality",
    "Agritourism and Rural Development",
    "Educational Assessment and Testing",
    "Professional Services and Consulting",
    "Bilateral Development Agencies",
    "Regional Development Organizations",
    "Multilateral Financial Institutions",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _job_id(title: str, employer: str, url: str = "") -> str:
    seed = f"{(title or '').strip().lower()}|{(employer or '').strip().lower()}|{(url or '').lower()}"
    return hashlib.sha1(seed.encode()).hexdigest()[:20]


def _parse_relative_time(text: str) -> Optional[datetime]:
    """Convert 'Posted 3 days ago' / '2 hours ago' → datetime."""
    if not text:
        return None
    m = re.search(r"(\d+)\s*(minute|hour|day|week|month)s?\s+ago", text.lower())
    if not m:
        return None
    val = int(m.group(1))
    unit = m.group(2)
    delta = {"minute": timedelta(minutes=val), "hour": timedelta(hours=val),
             "day": timedelta(days=val), "week": timedelta(weeks=val),
             "month": timedelta(days=val * 30)}[unit]
    return _now() - delta


def _parse_salary(text: str) -> Tuple[Optional[int], Optional[int]]:
    if not text:
        return None, None
    # Extract "$65,000" or "$65K–$95K"
    nums = re.findall(r"\$?([\d,]+)\s*[Kk]?", text)
    parsed: List[int] = []
    for n in nums[:2]:
        try:
            v = int(n.replace(",", ""))
            if "k" in text.lower() and v < 1000:
                v *= 1000
            parsed.append(v)
        except Exception:
            pass
    if not parsed:
        return None, None
    if len(parsed) == 1:
        return parsed[0], None
    return min(parsed), max(parsed)


def _classify_location_type(location: str, extensions: Dict[str, Any],
                            description: str = "") -> str:
    """Deep classifier: remote / hybrid / on_site / international / unknown."""
    ext_str = " ".join(str(v).lower() for v in extensions.values())
    desc = (description or "").lower()[:2000]
    combined = f"{(location or '').lower()} {ext_str} {desc}"
    # Explicit signals first
    if extensions.get("work_from_home") is True:
        return "remote"
    if any(k in combined for k in ("fully remote", "100% remote", "work from home",
                                    "work from anywhere", "remote-first",
                                    "remote position")):
        return "remote"
    if any(k in combined for k in ("hybrid", "2 days remote", "3 days in office",
                                    "partial remote", "flex remote")):
        return "hybrid"
    if any(k in combined for k in ("on-site", "onsite", "on site", "in-office",
                                    "must be located in", "relocation required")):
        return "on_site"
    if any(k in combined for k in ("international", "overseas", "field-based",
                                    "country office", "expat", "duty station")):
        return "international"
    # Only trust bare "remote" in location field
    if "remote" in (location or "").lower() or "anywhere" in (location or "").lower():
        return "remote"
    return "unknown"


def _employer_domain(employer: str, url: str = "") -> str:
    m = re.search(r"https?://(?:www\.)?([^/]+)", url or "")
    if m:
        return m.group(1)
    return re.sub(r"[^a-z0-9]", "", (employer or "").lower()) + ".com"


# ---------------------------------------------------------------------------
# SerpApi Google Jobs
# ---------------------------------------------------------------------------
async def _serpapi_google_jobs(client: httpx.AsyncClient, q: str,
                               location: Optional[str] = None,
                               freshness: str = "7d",
                               ) -> List[Dict[str, Any]]:
    key = os.getenv("SERPAPI_KEY", "").strip()
    if not key:
        return []
    params = {
        "engine": "google_jobs",
        "q": q,
        "hl": "en",
        "gl": "us",
        "api_key": key,
    }
    if location:
        params["location"] = location
    chips = []
    if freshness in ("24h", "3d"):
        chips.append("date_posted:today")
    elif freshness == "7d":
        chips.append("date_posted:week")
    elif freshness == "30d":
        chips.append("date_posted:month")
    chips.append("employment_type:FULLTIME")
    if chips:
        params["chips"] = ",".join(chips)
    try:
        r = await client.get(SERPAPI_URL, params=params, timeout=SEARCH_TIMEOUT)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        logger.warning("[jobs] Google Jobs err: %s", e)
        return []
    results = data.get("jobs_results") or []
    out: List[Dict[str, Any]] = []
    for j in results:
        ext = j.get("detected_extensions") or {}
        apply_options = j.get("apply_options") or []
        apply_url = ""
        if apply_options:
            apply_url = apply_options[0].get("link") or ""
        related = j.get("related_links") or []
        if not apply_url and related:
            apply_url = related[0].get("link") or ""
        posted_at = _parse_relative_time(ext.get("posted_at") or j.get("detected_extensions", {}).get("posted_at", ""))
        smin, smax = _parse_salary(ext.get("salary") or "")
        loc = j.get("location") or ""
        description = (j.get("description") or "")
        loc_type = _classify_location_type(loc, ext, description)
        out.append({
            "title": j.get("title") or "",
            "employer": j.get("company_name") or "",
            "location": loc,
            "location_type": loc_type,
            "location_type_raw": (ext.get("schedule_type") or "") + " | " + (loc or ""),
            "salary_min": smin, "salary_max": smax,
            "salary_display": ext.get("salary") or "",
            "posted_at": _iso(posted_at) if posted_at else None,
            "posted_display": ext.get("posted_at") or "",
            "description_full": (j.get("description") or "")[:8000],
            "description_highlights": {
                "qualifications": (j.get("job_highlights") or [{}])[0].get("items", []) if j.get("job_highlights") else [],
                "responsibilities": [],
                "benefits": [],
            },
            "apply_url": apply_url,
            "source_platform": "Google Jobs" if not apply_options else (apply_options[0].get("title") or "Google Jobs"),
            "source_url": j.get("share_link") or "",
            "thumbnail": j.get("thumbnail") or "",
            "raw_query": q,
        })
    return out


async def _serpapi_site_search(client: httpx.AsyncClient, site: str, q: str,
                               source_label: str) -> List[Dict[str, Any]]:
    """LinkedIn/Indeed/Glassdoor via `google` engine + site: filter."""
    key = os.getenv("SERPAPI_KEY", "").strip()
    if not key:
        return []
    try:
        r = await client.get(SERPAPI_URL, params={
            "engine": "google",
            "q": f"site:{site} {q}",
            "num": 15,
            "hl": "en",
            "api_key": key,
        }, timeout=SEARCH_TIMEOUT)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        logger.warning("[jobs] %s err: %s", source_label, e)
        return []
    out: List[Dict[str, Any]] = []
    for item in (data.get("organic_results") or [])[:15]:
        title = item.get("title") or ""
        # Try to split "Job Title - Company Name - LinkedIn" pattern
        parts = re.split(r"\s+[-–|]\s+", title)
        job_title = parts[0].strip() if parts else title
        employer = parts[1].strip() if len(parts) > 1 else ""
        snippet = item.get("snippet") or ""
        out.append({
            "title": job_title[:200],
            "employer": employer[:120],
            "location": "",
            "location_type": _classify_location_type(snippet, {}),
            "salary_min": None, "salary_max": None, "salary_display": "",
            "posted_at": None,
            "posted_display": "",
            "description_full": snippet,
            "description_highlights": {"qualifications": [], "responsibilities": [], "benefits": []},
            "apply_url": item.get("link") or "",
            "source_platform": source_label,
            "source_url": item.get("link") or "",
            "thumbnail": "",
            "raw_query": q,
        })
    return out


# ---------------------------------------------------------------------------
# Devex RSS
# ---------------------------------------------------------------------------
async def _devex_rss(client: httpx.AsyncClient) -> List[Dict[str, Any]]:
    try:
        r = await client.get(DEVEX_RSS, timeout=SEARCH_TIMEOUT,
                              headers={"User-Agent": "PLOS/1.0"})
        r.raise_for_status()
        root = ET.fromstring(r.text)
    except Exception as e:
        logger.warning("[jobs] Devex RSS err: %s", e)
        return []
    out: List[Dict[str, Any]] = []
    for item in root.findall(".//item")[:40]:
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        desc = (item.findtext("description") or "").strip()
        pub = item.findtext("pubDate") or ""
        posted_at = None
        try:
            posted_at = datetime.strptime(pub, "%a, %d %b %Y %H:%M:%S %z")
        except Exception:
            pass
        # Devex titles look like "Deputy Chief of Party - Chemonics - Washington, DC"
        parts = re.split(r"\s+-\s+", title)
        out.append({
            "title": parts[0][:200] if parts else title[:200],
            "employer": parts[1][:120] if len(parts) > 1 else "",
            "location": parts[2][:120] if len(parts) > 2 else "",
            "location_type": _classify_location_type(
                parts[2] if len(parts) > 2 else "", {}),
            "salary_min": None, "salary_max": None, "salary_display": "",
            "posted_at": _iso(posted_at) if posted_at else None,
            "posted_display": pub,
            "description_full": desc[:2000],
            "description_highlights": {"qualifications": [], "responsibilities": [], "benefits": []},
            "apply_url": link,
            "source_platform": "Devex",
            "source_url": link,
            "thumbnail": "",
            "raw_query": "devex_rss",
        })
    return out


# ---------------------------------------------------------------------------
# ReliefWeb v1 API
# ---------------------------------------------------------------------------
async def _reliefweb_jobs(client: httpx.AsyncClient,
                          categories: Optional[List[str]] = None
                          ) -> List[Dict[str, Any]]:
    params: Dict[str, Any] = {
        "appname": "plos",
        "fields[include][]": ["title", "body-html", "date", "source",
                              "url_alias", "career_categories"],
        "limit": 40,
        "sort[]": "date.created:desc",
    }
    if categories:
        params["filter[field]"] = "career_categories.name"
        params["filter[value][]"] = categories
    try:
        r = await client.get(RELIEFWEB_URL, params=params,
                              timeout=SEARCH_TIMEOUT,
                              headers={"User-Agent": "PLOS/1.0"})
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        logger.warning("[jobs] ReliefWeb err: %s", e)
        return []
    out: List[Dict[str, Any]] = []
    for item in data.get("data") or []:
        f = item.get("fields") or {}
        title = f.get("title") or ""
        url = f.get("url_alias") or item.get("href") or ""
        source_arr = f.get("source") or []
        employer = (source_arr[0].get("name") if source_arr else "") or ""
        date_field = f.get("date") or {}
        posted_at = _parse_iso(date_field.get("created"))
        body = re.sub("<[^>]+>", " ", f.get("body-html") or "")[:3000]
        out.append({
            "title": title[:200],
            "employer": employer[:120],
            "location": "",
            "location_type": "international",
            "salary_min": None, "salary_max": None, "salary_display": "",
            "posted_at": _iso(posted_at) if posted_at else None,
            "posted_display": date_field.get("created") or "",
            "description_full": body,
            "description_highlights": {"qualifications": [], "responsibilities": [], "benefits": []},
            "apply_url": url,
            "source_platform": "ReliefWeb",
            "source_url": url,
            "thumbnail": "",
            "raw_query": "reliefweb",
        })
    return out


# ---------------------------------------------------------------------------
# USAJobs (optional if key present)
# ---------------------------------------------------------------------------
async def _usajobs(client: httpx.AsyncClient, roles: List[str],
                   locations: List[str], user_email: str
                   ) -> List[Dict[str, Any]]:
    key = os.getenv("USAJOBS_API_KEY", "").strip()
    if not key or not roles:
        return []
    out: List[Dict[str, Any]] = []
    for role in roles[:3]:
        for loc in (locations[:2] or [None]):
            params: Dict[str, Any] = {
                "Keyword": role, "ResultsPerPage": 20,
                "SortField": "OpenDate", "SortDirection": "Desc",
            }
            if loc:
                params["LocationName"] = loc
            try:
                r = await client.get(USAJOBS_URL, params=params,
                                     timeout=SEARCH_TIMEOUT,
                                     headers={
                                         "Authorization-Key": key,
                                         "Host": "data.usajobs.gov",
                                         "User-Agent": user_email or "PLOS/1.0",
                                     })
                if r.status_code != 200:
                    continue
                data = r.json()
            except Exception as e:
                logger.warning("[jobs] USAJobs err: %s", e)
                continue
            search_result = (data.get("SearchResult") or {}).get("SearchResultItems") or []
            for it in search_result:
                d = it.get("MatchedObjectDescriptor") or {}
                pay = ((d.get("PositionRemuneration") or [{}])[0])
                smin = int(float(pay.get("MinimumRange") or 0) or 0) or None
                smax = int(float(pay.get("MaximumRange") or 0) or 0) or None
                out.append({
                    "title": (d.get("PositionTitle") or "")[:200],
                    "employer": (d.get("OrganizationName") or d.get("DepartmentName") or "")[:120],
                    "location": (d.get("PositionLocationDisplay") or "")[:120],
                    "location_type": "on_site",
                    "salary_min": smin, "salary_max": smax,
                    "salary_display": pay.get("Description") or "",
                    "posted_at": d.get("PublicationStartDate"),
                    "posted_display": d.get("PublicationStartDate") or "",
                    "description_full": ((d.get("UserArea") or {}).get("Details") or {}).get("JobSummary", "")[:3000],
                    "description_highlights": {"qualifications": [], "responsibilities": [], "benefits": []},
                    "apply_url": d.get("PositionURI") or d.get("ApplyURI", [""])[0] or "",
                    "source_platform": "USAJobs",
                    "source_url": d.get("PositionURI") or "",
                    "thumbnail": "",
                    "raw_query": f"usajobs::{role}",
                })
    return out


# ---------------------------------------------------------------------------
# Dedup + verify
# ---------------------------------------------------------------------------
def _dedup(jobs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen: Dict[str, Dict[str, Any]] = {}
    for j in jobs:
        key = f"{(j.get('title') or '').lower().strip()}|{(j.get('employer') or '').lower().strip()}"
        if not j.get("title"):
            continue
        existing = seen.get(key)
        if not existing:
            seen[key] = j
            continue
        # Prefer entry with an apply_url and a longer description
        if not existing.get("apply_url") and j.get("apply_url"):
            seen[key] = j
        elif len(j.get("description_full") or "") > len(existing.get("description_full") or ""):
            seen[key] = {**existing, "description_full": j["description_full"]}
    return list(seen.values())


async def _verify_link(client: httpx.AsyncClient, url: str
                       ) -> Tuple[int, str]:
    if not url:
        return 0, ""
    try:
        r = await client.head(url, timeout=VERIFY_TIMEOUT, follow_redirects=True,
                              headers={"User-Agent": "Mozilla/5.0 PLOS/1.0"})
        return r.status_code, str(r.url)
    except Exception:
        try:
            r = await client.get(url, timeout=VERIFY_TIMEOUT,
                                 follow_redirects=True,
                                 headers={"User-Agent": "Mozilla/5.0 PLOS/1.0"})
            return r.status_code, str(r.url)
        except Exception:
            return 0, url


def _score(job: Dict[str, Any], roles: List[str], keywords_excl: List[str],
           watch_list: List[str], sectors: List[str]) -> Dict[str, Any]:
    text = f"{job.get('title', '')} {job.get('employer', '')} {job.get('description_full', '')}".lower()
    excl_hits = sum(1 for k in keywords_excl if k.lower() in text)
    if excl_hits >= 2:
        return {"skip": True}
    role_hits = sum(1 for r in roles if r.lower() in text)
    sector_hits = sum(1 for s in sectors if any(w in text for w in s.lower().split()))
    watch_hit = any(w.lower() in (job.get("employer") or "").lower() for w in watch_list)
    # Freshness signal
    dt = _parse_iso(job.get("posted_at"))
    hours_old = None if not dt else max(0, (_now() - dt).total_seconds() / 3600)
    is_new = bool(hours_old is not None and hours_old <= 24)
    is_early = bool(hours_old is not None and hours_old <= 72)

    # Composite score (0-100)
    score = 50
    score += min(30, role_hits * 12)
    score += min(15, sector_hits * 5)
    if watch_hit:
        score += 15
    if is_new:
        score += 5
    if job.get("source_platform") in ("USAJobs", "Google Jobs", "Devex", "ReliefWeb"):
        score += 3
    score = max(0, min(100, score - excl_hits * 8))

    return {
        "skip": False,
        "match_score": score,
        "match_breakdown": {
            "role_hits": role_hits, "sector_hits": sector_hits,
            "watch_hit": bool(watch_hit),
            "excl_hits": excl_hits,
        },
        "is_new": is_new,
        "is_early": is_early,
        "watch_list_employer": bool(watch_hit),
    }


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
DC_METRO = {"washington", "dc", "arlington", "alexandria", "bethesda",
            "silver spring", "rockville", "mclean", "tysons", "reston",
            "falls church", "chevy chase", "gaithersburg"}
ATL_METRO = {"atlanta", "decatur", "stone mountain", "sandy springs",
             "marietta", "roswell", "alpharetta", "smyrna", "dunwoody",
             "brookhaven", "college park", "east point", "kennesaw"}
METRO_SETS = {"washington": DC_METRO, "dc": DC_METRO, "atlanta": ATL_METRO}


def _job_matches_locations(job_location: str, job_type: str,
                           accepted_locations: List[str]) -> Tuple[bool, str]:
    if not accepted_locations:
        return True, "no_locations_criteria"
    if not job_location:
        return True, "no_location_data"
    jl = job_location.lower()
    for loc in accepted_locations:
        low = (loc or "").lower().strip()
        if not low:
            continue
        if "remote" in low or "anywhere" in low:
            if job_type == "remote":
                return True, f"remote_matches_{low}"
            continue
        if low in jl or jl in low:
            return True, f"substring_{low}"
        for key, syns in METRO_SETS.items():
            if key in low:
                for s in syns:
                    if s in jl:
                        return True, f"metro_{key}_{s}"
        for country_kw, city_kws in (
            ("philippines", ("manila", "cebu", "davao")),
            ("belgium", ("brussels",)),
            ("france", ("paris",)),
            ("japan", ("tokyo",)),
            ("canada", ("toronto", "vancouver")),
        ):
            if country_kw in low and (country_kw in jl or any(c in jl for c in city_kws)):
                return True, f"country_{country_kw}"
    return False, "no_match"


def _work_type_matches(job_type: str, filter_val: str) -> bool:
    fv = (filter_val or "any").lower()
    if fv == "any":
        return True
    if fv == "remote":
        return job_type == "remote"
    if fv == "hybrid":
        return job_type == "hybrid"
    if fv == "on_site":
        return job_type in ("on_site", "unknown", "international")
    if fv == "on_site_hybrid":
        return job_type in ("on_site", "hybrid", "unknown", "international")
    return True


class DeepSearchBody(BaseModel):
    target_roles: List[str] = Field(default_factory=list)
    excluded_keywords: List[str] = Field(default_factory=list)
    industries: List[str] = Field(default_factory=list)
    locations: List[str] = Field(default_factory=list)
    min_salary: int = 0
    freshness: str = "7d"
    priority_employers: List[str] = Field(default_factory=list)
    work_type_filter: str = "any"


class IndustryBody(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    enabled: bool = True


def make_router(db, get_current_user_id):
    r = APIRouter(prefix="/jobs", tags=["jobs-deep-search"])

    # ---- indexes ----------------------------------------------------
    _idx_bootstrapped = {"done": False}

    async def _bootstrap_indexes():
        if _idx_bootstrapped["done"]:
            return
        try:
            await db.jobs_feed.create_index(
                [("title", "text"), ("employer", "text"),
                 ("description_full", "text")], name="jobs_feed_text",
            )
            await db.jobs_feed.create_index(
                "fetched_at", expireAfterSeconds=60 * 60 * 24 * 30,
                name="jobs_feed_ttl_30d",
            )
            await db.jobs_feed.create_index([("user_id", 1), ("rank_score", -1)])
        except Exception as e:  # pragma: no cover
            logger.info("[jobs] index create: %s", e)
        _idx_bootstrapped["done"] = True

    async def _ensure_industries(user_id: str):
        if await db.jobs_industries.count_documents({"user_id": user_id}):
            return
        for i, label in enumerate(DEFAULT_INDUSTRIES):
            await db.jobs_industries.insert_one({
                "user_id": user_id, "industry_id": f"ind_{i:03d}",
                "label": label, "enabled": True,
                "created_at": _iso(_now()),
            })

    # ---- industries CRUD -------------------------------------------
    @r.get("/industries")
    async def list_industries(user_id: str = Depends(get_current_user_id)):
        await _ensure_industries(user_id)
        rows = await db.jobs_industries.find(
            {"user_id": user_id}, {"_id": 0}
        ).sort("created_at", 1).to_list(200)
        return {"industries": rows}

    @r.post("/industries", status_code=201)
    async def add_industry(body: IndustryBody,
                           user_id: str = Depends(get_current_user_id)):
        doc = {
            "user_id": user_id,
            "industry_id": f"ind_{int(time.time() * 1000)}",
            "label": body.label.strip(), "enabled": bool(body.enabled),
            "created_at": _iso(_now()),
        }
        await db.jobs_industries.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @r.put("/industries/{industry_id}")
    async def update_industry(industry_id: str, body: IndustryBody,
                              user_id: str = Depends(get_current_user_id)):
        res = await db.jobs_industries.update_one(
            {"user_id": user_id, "industry_id": industry_id},
            {"$set": {"label": body.label.strip(), "enabled": bool(body.enabled)}},
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Industry not found")
        return {"ok": True}

    @r.delete("/industries/{industry_id}")
    async def delete_industry(industry_id: str,
                              user_id: str = Depends(get_current_user_id)):
        res = await db.jobs_industries.delete_one(
            {"user_id": user_id, "industry_id": industry_id},
        )
        if res.deleted_count == 0:
            raise HTTPException(404, "Industry not found")
        return {"ok": True}

    # ---- deep search + feed ----------------------------------------
    async def _fetch_all(body: DeepSearchBody, user_email: str,
                        ) -> Dict[str, Any]:
        roles = [r_ for r_ in body.target_roles if r_][:6] or ["financial management"]
        locations = body.locations[:5] or ["Atlanta, GA"]
        counts = {"google_jobs": 0, "linkedin": 0, "indeed": 0, "glassdoor": 0,
                  "devex": 0, "reliefweb": 0, "usajobs": 0}

        async with httpx.AsyncClient() as client:
            tasks: List[Any] = []
            plans: List[str] = []

            # Google Jobs: parallel role × location (skip literal "Remote" as location)
            valid_locations = [loc for loc in locations
                               if loc.lower() not in ("remote", "any", "anywhere")]
            for role in roles[:4]:
                for loc in valid_locations[:3]:
                    tasks.append(_serpapi_google_jobs(
                        client, q=role, location=loc, freshness=body.freshness))
                    plans.append("google_jobs")

            # Add one broader query per role WITHOUT hardcoded "remote"
            for role in roles[:2]:
                q = role
                if body.min_salary:
                    q += f" ${body.min_salary//1000}k"
                tasks.append(_serpapi_google_jobs(client, q=q, freshness=body.freshness))
                plans.append("google_jobs")

            # Site: searches
            role_expr = " OR ".join(f"\"{r_}\"" for r_ in roles[:3])
            tasks.append(_serpapi_site_search(client, "linkedin.com/jobs",
                                              role_expr, "LinkedIn"))
            plans.append("linkedin")
            tasks.append(_serpapi_site_search(client, "indeed.com",
                                              role_expr, "Indeed"))
            plans.append("indeed")
            tasks.append(_serpapi_site_search(client, "glassdoor.com/job-listing",
                                              role_expr, "Glassdoor"))
            plans.append("glassdoor")

            # Free sources
            tasks.append(_devex_rss(client))
            plans.append("devex")
            tasks.append(_reliefweb_jobs(client, categories=None))
            plans.append("reliefweb")

            # USAJobs (only if key present)
            tasks.append(_usajobs(client, roles, locations, user_email))
            plans.append("usajobs")

            results = await asyncio.gather(*tasks, return_exceptions=True)

            all_jobs: List[Dict[str, Any]] = []
            for src, res in zip(plans, results):
                if isinstance(res, Exception):
                    logger.warning("[jobs] %s failed: %s", src, res)
                    continue
                counts[src] = counts.get(src, 0) + len(res or [])
                all_jobs.extend(res or [])

            deduped = _dedup(all_jobs)

            # Freshness cutoff
            cutoff = _now() - timedelta(days=FRESHNESS_DAYS.get(body.freshness, 7))
            filtered = []
            for j in deduped:
                dt = _parse_iso(j.get("posted_at"))
                if dt:
                    # Ensure timezone-aware for comparison
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    if dt < cutoff:
                        continue
                filtered.append(j)

            # Score
            watch = body.priority_employers or []
            scored: List[Dict[str, Any]] = []
            for j in filtered:
                s = _score(j, roles=roles,
                          keywords_excl=body.excluded_keywords,
                          watch_list=watch, sectors=body.industries)
                if s.get("skip"):
                    continue
                j.update({k: v for k, v in s.items() if k != "skip"})
                scored.append(j)

            # Verify (parallel HEAD requests)
            verify_tasks = [_verify_link(client, j.get("apply_url", "")) for j in scored]
            statuses = await asyncio.gather(*verify_tasks, return_exceptions=True)
            verified: List[Dict[str, Any]] = []
            for j, st in zip(scored, statuses):
                if isinstance(st, Exception):
                    code, final = 0, j.get("apply_url", "")
                else:
                    code, final = st
                j["apply_url_status"] = code
                j["apply_url_final"] = final
                j["apply_url_verified_at"] = _iso(_now())
                j["is_active"] = code in (200, 301, 302, 0)  # keep unverified but flag it
                j["is_verified"] = code in (200, 301, 302)
                if code in (404, 410, 400, 403):
                    j["is_active"] = False
                verified.append(j)

            # Rank
            def _rank(j: Dict[str, Any]) -> int:
                s = j.get("match_score", 0)
                if j.get("watch_list_employer"):
                    s += 10
                if j.get("is_new"):
                    s += 3
                if j.get("is_verified"):
                    s += 3
                return -s
            verified.sort(key=_rank)

            # Location + work-type match — stored so verified-feed can filter fast
            for j in verified:
                is_loc, reason = _job_matches_locations(
                    j.get("location", ""), j.get("location_type", "unknown"),
                    body.locations,
                )
                j["is_location_match"] = is_loc
                j["location_match_reason"] = reason
                j["work_type_ok_default"] = _work_type_matches(
                    j.get("location_type", "unknown"), body.work_type_filter,
                )
            for i, j in enumerate(verified):
                j["rank_position"] = i + 1
                j["rank_score"] = -_rank(j)

        return {
            "jobs": verified,
            "counts": counts,
            "total_raw": len(all_jobs),
            "total_after_dedup": len(deduped),
            "total_after_freshness": len(filtered),
            "total_verified_active": sum(1 for j in verified if j.get("is_active")),
        }

    @r.post("/deep-search")
    async def deep_search(body: DeepSearchBody,
                          user_id: str = Depends(get_current_user_id)):
        await _bootstrap_indexes()
        await _ensure_industries(user_id)
        user = await db.users.find_one({"user_id": user_id}) or {}
        email = user.get("email") or "user@plos.app"
        started = time.time()
        payload = await _fetch_all(body, user_email=email)
        elapsed = time.time() - started

        # Persist to jobs_feed (upsert by (user_id, job_id))
        fetched_at = _iso(_now())
        for j in payload["jobs"]:
            j["job_id"] = _job_id(j["title"], j["employer"], j.get("apply_url", ""))
            j["user_id"] = user_id
            j["fetched_at"] = fetched_at
            j["employer_domain"] = _employer_domain(j.get("employer", ""),
                                                    j.get("apply_url", ""))
            await db.jobs_feed.update_one(
                {"user_id": user_id, "job_id": j["job_id"]},
                {"$set": j}, upsert=True,
            )
        return {
            **{k: v for k, v in payload.items() if k != "jobs"},
            "search_seconds": round(elapsed, 2),
            "jobs_count": len(payload["jobs"]),
            "top_job": (payload["jobs"][0] if payload["jobs"] else None),
        }

    @r.get("/verified-feed")
    async def verified_feed(freshness: str = Query("7d"),
                            sort: str = Query("best_match"),
                            min_score: int = Query(0, ge=0, le=100),
                            filter_new: bool = Query(False),
                            source: Optional[str] = Query(None),
                            work_type_filter: str = Query("any"),
                            require_location_match: bool = Query(True),
                            limit: int = Query(60, ge=1, le=200),
                            user_id: str = Depends(get_current_user_id)):
        q: Dict[str, Any] = {"user_id": user_id, "is_active": True}
        if min_score:
            q["match_score"] = {"$gte": min_score}
        if filter_new:
            q["is_new"] = True
        if source:
            q["source_platform"] = source
        # Work-type filter
        if work_type_filter and work_type_filter != "any":
            if work_type_filter == "remote":
                q["location_type"] = "remote"
            elif work_type_filter == "hybrid":
                q["location_type"] = "hybrid"
            elif work_type_filter == "on_site":
                q["location_type"] = {"$in": ["on_site", "unknown", "international"]}
            elif work_type_filter == "on_site_hybrid":
                q["location_type"] = {"$in": ["on_site", "hybrid", "unknown", "international"]}
        # Location match — exclude jobs that failed location matching
        if require_location_match:
            q["$or"] = [{"is_location_match": True},
                        {"is_location_match": {"$exists": False}}]
        cur = db.jobs_feed.find(q, {"_id": 0})
        if sort == "most_recent":
            cur = cur.sort("posted_at", -1)
        elif sort == "highest_salary":
            cur = cur.sort("salary_max", -1)
        else:
            cur = cur.sort([("rank_score", -1), ("match_score", -1)])
        jobs = await cur.to_list(limit)

        # Latest search metadata
        last = await db.jobs_feed.find_one(
            {"user_id": user_id}, sort=[("fetched_at", -1)],
            projection={"_id": 0, "fetched_at": 1},
        ) or {}
        # Aggregate counts
        pipeline = [
            {"$match": {"user_id": user_id, "is_active": True}},
            {"$group": {"_id": "$source_platform", "count": {"$sum": 1}}},
        ]
        by_source = {r_["_id"]: r_["count"] async for r_ in db.jobs_feed.aggregate(pipeline)}
        new_today = await db.jobs_feed.count_documents(
            {"user_id": user_id, "is_active": True, "is_new": True})
        return {
            "jobs": jobs, "count": len(jobs),
            "counts_by_source": by_source,
            "new_today": new_today,
            "last_fetched_at": last.get("fetched_at"),
        }

    @r.post("/refresh")
    async def refresh_feed(body: DeepSearchBody,
                           user_id: str = Depends(get_current_user_id)):
        return await deep_search(body, user_id=user_id)  # type: ignore

    return r
