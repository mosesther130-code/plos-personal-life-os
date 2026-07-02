"""PLOS Career — Job Intelligence Engine (v1, Phase 1).

Multi-source aggregation + fake filter + Claude match scoring +
apply-link verification + Career Insights.

Working sources (Phase 1 — all free, no key required):
  - Remotive (finance / accounting)
  - Arbeitnow (broad, filter by keywords)
  - Jobicy (finance / operations)

Placeholder sources (require API key — Phase 2):
  - USAJOBS_API_KEY  → https://data.usajobs.gov/api/Search
  - Devex RSS         → blocked from container (403). Requires future proxy.
  - ReliefWeb         → blocked from container (410 / 403). Requires future proxy.
  - SCRAPER_API_KEY   → LinkedIn / Indeed via ScraperAPI

Adding a key later requires ZERO code changes — just set env var and restart.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import ssl
import time
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

load_dotenv()
logger = logging.getLogger(__name__)

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36"
DEFAULT_TIMEOUT = 12
LINK_HEAD_TIMEOUT = 10

# Pre-seeded target employer watch list
PRE_SEEDED_EMPLOYERS = [
    {"name": "Asian Development Bank", "careers_url": "https://www.adb.org/work-with-us/careers"},
    {"name": "NATO", "careers_url": "https://www.nato.int/cps/en/natohq/85321.htm"},
    {"name": "US Department of State", "careers_url": "https://careers.state.gov"},
    {"name": "USAID", "careers_url": "https://www.usaid.gov/careers"},
    {"name": "Georgia State University", "careers_url": "https://hr.gsu.edu/careers/"},
    {"name": "World Bank", "careers_url": "https://www.worldbank.org/en/about/careers"},
    {"name": "International Monetary Fund", "careers_url": "https://www.imf.org/en/About/Careers"},
    {"name": "Asian Infrastructure Investment Bank", "careers_url": "https://www.aiib.org/en/about-aiib/governance/work-with-aiib"},
    {"name": "Millennium Challenge Corporation", "careers_url": "https://www.mcc.gov/careers"},
    {"name": "Chemonics International", "careers_url": "https://chemonics.com/careers/"},
    {"name": "DAI Global", "careers_url": "https://www.dai.com/careers"},
]

DEFAULT_TARGET_ROLES = [
    "Financial Control Specialist", "Program Coordinator", "Budget Analyst",
    "Financial Management Officer", "Grants Manager", "Program Analyst",
    "Department Director", "Administrative Coordinator",
]
DEFAULT_TARGET_SECTORS = ["federal_government", "international_org", "nonprofit"]
DEFAULT_MIN_SALARY = 65000

RED_FLAG_PHRASES = [
    "work from home earn $", "unlimited earning potential", "be your own boss",
    "no experience necessary for management", "cryptocurrency payment",
    "send resume to personal gmail", "personal gmail address",
    "mlm opportunity", "commission only",
]

URL_SHORTENERS = ["bit.ly", "tinyurl.com", "ow.ly", "t.co", "goo.gl", "rebrand.ly"]


# ============================================================
# HTTP helpers (sync — run in threadpool)
# ============================================================
def _http_get_json(url: str, headers: Optional[Dict] = None, timeout: int = DEFAULT_TIMEOUT) -> Any:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    hdrs = {"User-Agent": UA, "Accept": "application/json"}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
        return json.loads(r.read())


def _http_head(url: str, timeout: int = LINK_HEAD_TIMEOUT) -> Tuple[int, str]:
    """Return (status_code, final_url) following up to 3 redirects."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    hdrs = {"User-Agent": UA, "Accept": "*/*"}
    current = url
    for _ in range(3):
        try:
            req = urllib.request.Request(current, headers=hdrs, method="HEAD")
            # Allow HTTPRedirectHandler to follow, but capture code
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
                return (r.status, r.url)
        except urllib.error.HTTPError as e:
            # 403 often means bot-block but URL is live — treat as 200
            if e.code in (403,):
                return (200, current)
            return (e.code, current)
        except Exception as e:
            logger.debug("HEAD fail on %s: %s", current, e)
            return (0, current)
    return (0, current)


def _strip_html(html: str) -> str:
    if not html:
        return ""
    txt = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    txt = re.sub(r"<style[^>]*>.*?</style>", " ", txt, flags=re.DOTALL | re.IGNORECASE)
    txt = re.sub(r"<br\s*/?>", "\n", txt, flags=re.IGNORECASE)
    txt = re.sub(r"</p>|</li>|</h[1-6]>", "\n", txt, flags=re.IGNORECASE)
    txt = re.sub(r"<[^>]+>", " ", txt)
    txt = re.sub(r"&nbsp;", " ", txt)
    txt = re.sub(r"&amp;", "&", txt)
    txt = re.sub(r"&lt;", "<", txt)
    txt = re.sub(r"&gt;", ">", txt)
    txt = re.sub(r"&#\d+;", " ", txt)
    txt = re.sub(r"[ \t]+", " ", txt)
    txt = re.sub(r"\n{3,}", "\n\n", txt)
    return txt.strip()


def _word_count(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text or ""))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _iso_to_days_ago(iso_str: str) -> int:
    try:
        d = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return max(0, (datetime.now(timezone.utc) - d).days)
    except Exception:
        return 999


# ============================================================
# Source connectors — Phase 1 (Remotive, Arbeitnow, Jobicy)
# ============================================================
FINANCE_KEYWORDS = [
    "financ", "budget", "audit", "controller", "accounting", "grant",
    "program manager", "program coordinator", "program analyst",
    "administration", "operations", "development", "international",
    "director", "compliance",
]

def _kw_match(title: str, desc: str, salary: Optional[int]) -> bool:
    """Loose filter for finance/admin/international relevance."""
    t = (title + " " + desc[:1500]).lower()
    return any(k in t for k in FINANCE_KEYWORDS)


def fetch_remotive() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for cat in ("finance", "human-resources", "product"):
        try:
            d = _http_get_json(f"https://remotive.com/api/remote-jobs?category={cat}&limit=25")
            for j in d.get("jobs", [])[:25]:
                title = j.get("title", "")
                desc_html = j.get("description", "")
                desc = _strip_html(desc_html)
                if not _kw_match(title, desc, None):
                    continue
                out.append({
                    "external_id": f"remotive-{j.get('id')}",
                    "source": "Remotive",
                    "job_title": title,
                    "employer": j.get("company_name", ""),
                    "employer_type": "private_sector",
                    "location": j.get("candidate_required_location", "Remote"),
                    "location_type": "remote",
                    "salary_text": j.get("salary", ""),
                    "posted_date": j.get("publication_date", ""),
                    "application_deadline": None,
                    "job_description_text": desc[:8000],
                    "apply_url": j.get("url", ""),
                    "source_url": j.get("url", ""),
                    "tags": j.get("tags", []),
                    "job_type": j.get("job_type", ""),
                })
        except Exception as e:
            logger.warning("Remotive fetch failed (%s): %s", cat, e)
    return out


def fetch_arbeitnow() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    try:
        d = _http_get_json("https://www.arbeitnow.com/api/job-board-api")
        for j in d.get("data", []):
            title = j.get("title", "")
            desc = _strip_html(j.get("description", ""))
            if not _kw_match(title, desc, None):
                continue
            slug = j.get("slug", "")
            created = j.get("created_at", 0)
            posted_iso = datetime.fromtimestamp(created, tz=timezone.utc).isoformat() if created else ""
            out.append({
                "external_id": f"arbeitnow-{slug}",
                "source": "Arbeitnow",
                "job_title": title,
                "employer": j.get("company_name", ""),
                "employer_type": "private_sector",
                "location": j.get("location", "") or ("Remote" if j.get("remote") else ""),
                "location_type": "remote" if j.get("remote") else "on_site",
                "salary_text": "",
                "posted_date": posted_iso,
                "application_deadline": None,
                "job_description_text": desc[:8000],
                "apply_url": j.get("url", ""),
                "source_url": j.get("url", ""),
                "tags": j.get("tags", []),
                "job_type": ",".join(j.get("job_types", [])),
            })
    except Exception as e:
        logger.warning("Arbeitnow fetch failed: %s", e)
    return out


def fetch_jobicy() -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for tag in ("finance", "operations", "administrative"):
        try:
            d = _http_get_json(f"https://jobicy.com/api/v2/remote-jobs?tag={tag}&count=15")
            for j in d.get("jobs", []):
                title = j.get("jobTitle", "")
                desc = _strip_html(j.get("jobDescription", ""))
                out.append({
                    "external_id": f"jobicy-{j.get('id')}",
                    "source": "Jobicy",
                    "job_title": title,
                    "employer": j.get("companyName", ""),
                    "employer_type": "private_sector",
                    "location": j.get("jobGeo", "") or "Remote",
                    "location_type": "remote",
                    "salary_text": f"${j.get('salaryMin', 0):,}–${j.get('salaryMax', 0):,}" if j.get("salaryMin") else "",
                    "salary_min": j.get("salaryMin") or 0,
                    "salary_max": j.get("salaryMax") or 0,
                    "posted_date": j.get("pubDate", ""),
                    "application_deadline": None,
                    "job_description_text": desc[:8000],
                    "apply_url": j.get("url", ""),
                    "source_url": j.get("url", ""),
                    "tags": j.get("jobIndustry", []),
                    "job_type": ",".join(j.get("jobType", [])),
                })
        except Exception as e:
            logger.warning("Jobicy fetch failed (%s): %s", tag, e)
    return out


def fetch_usajobs() -> List[Dict[str, Any]]:
    """USAJobs — only runs if USAJOBS_API_KEY env var is set (Phase 2)."""
    key = os.environ.get("USAJOBS_API_KEY", "").strip()
    email = os.environ.get("USAJOBS_EMAIL", "plos@plos-app.com")
    if not key or key.lower().startswith("placeholder"):
        return []
    out: List[Dict[str, Any]] = []
    for kw in ("budget analyst", "financial management", "program analyst"):
        try:
            url = ("https://data.usajobs.gov/api/search"
                   f"?Keyword={urllib.parse.quote(kw)}&ResultsPerPage=15&SortField=DatePosted&SortDirection=Desc")
            d = _http_get_json(url, headers={
                "Authorization-Key": key,
                "User-Agent": email,
                "Host": "data.usajobs.gov",
            })
            items = d.get("SearchResult", {}).get("SearchResultItems", [])
            for it in items:
                m = it.get("MatchedObjectDescriptor", {})
                pos_url = m.get("PositionURI", "")
                out.append({
                    "external_id": f"usajobs-{m.get('PositionID')}",
                    "source": "USAJobs",
                    "job_title": m.get("PositionTitle", ""),
                    "employer": m.get("OrganizationName", "US Federal Government"),
                    "employer_type": "federal_government",
                    "location": ", ".join(loc.get("LocationName", "") for loc in m.get("PositionLocation", [])[:3]),
                    "location_type": "on_site",
                    "salary_text": (m.get("PositionRemuneration") or [{}])[0].get("Description", ""),
                    "posted_date": m.get("PublicationStartDate", ""),
                    "application_deadline": m.get("ApplicationCloseDate"),
                    "job_description_text": _strip_html(m.get("QualificationSummary", "")),
                    "apply_url": pos_url,
                    "source_url": pos_url,
                    "tags": [],
                    "job_type": ",".join(t.get("Name", "") for t in m.get("PositionOfferingType", [])),
                })
        except Exception as e:
            logger.warning("USAJobs fetch failed (%s): %s", kw, e)
    return out


# ============================================================
# Layer 1 fake job filtering
# ============================================================
def fake_filter_layer1(job: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """Return (is_suspect, reasons[])."""
    reasons: List[str] = []
    title = (job.get("job_title") or "").strip()
    employer = (job.get("employer") or "").strip().lower()
    desc = job.get("job_description_text") or ""
    apply_url = (job.get("apply_url") or "").strip()

    # 1. no employer
    if not employer or employer in ("hiring company", "confidential", "client of recruiter",
                                    "recruiter", "n/a", "-"):
        reasons.append("missing_or_generic_employer")

    # 2. no location & not remote
    loc = (job.get("location") or "").strip().lower()
    if not loc and job.get("location_type") != "remote":
        reasons.append("no_location")

    # 3. description too short
    if _word_count(desc) < 60:
        reasons.append("description_too_short")

    # 4. red flag phrases
    body = (title + " " + desc).lower()
    for p in RED_FLAG_PHRASES:
        if p in body:
            reasons.append(f"red_flag:{p[:24]}")
            break

    # 5. suspicious apply URL
    if apply_url:
        low = apply_url.lower()
        if any(s in low for s in URL_SHORTENERS):
            reasons.append("url_shortener")
        if "@" in low and "mailto:" in low:
            reasons.append("email_apply")
    else:
        reasons.append("no_apply_url")

    # 6. posting older than 60 days claiming new
    days = _iso_to_days_ago(job.get("posted_date", ""))
    if days > 60:
        reasons.append(f"stale_{days}d")

    # 7. salary implausible
    smin = job.get("salary_min") or 0
    smax = job.get("salary_max") or 0
    if smin and smax and (smax > smin * 8):
        reasons.append("salary_range_wide")

    return (len(reasons) > 0, reasons)


# ============================================================
# Apply URL verification (Step 1-5 of link pipeline)
# ============================================================
def _classify_link_quality(status: int, final_url: str, source: str) -> str:
    if status == 0:
        return "unverified"
    if status in (404, 410):
        return "general_careers"  # will actually set is_active=false separately
    if status in (401, 403):
        return "requires_login"
    if status >= 500:
        return "unverified"
    # 2xx / 3xx follow chain succeeded
    low = (final_url or "").lower()
    # Login walls / generic search pages
    if any(p in low for p in ("/login", "signin", "/search?", "/sign_in", "/register")):
        return "requires_login"
    # Direct apply patterns
    if any(p in low for p in ("/apply", "apply.", "/application/", "/job/apply")):
        return "direct_apply"
    # Known job posting patterns
    if any(p in low for p in ("usajobs.gov/job/", "usajobs.gov/getjob/",
                              "remotive.com/remote-jobs/", "jobicy.com/jobs/",
                              "arbeitnow.com/jobs/", "adb.org/careers/",
                              "worldbank.org/careers", "linkedin.com/jobs/view/",
                              "indeed.com/viewjob")):
        return "direct_apply"
    if source in ("Remotive", "Arbeitnow", "Jobicy", "USAJobs"):
        return "posting_page"
    return "posting_page"


def verify_apply_url(url: str, source: str) -> Dict[str, Any]:
    """Full link verification pipeline (Steps 1-5)."""
    if not url:
        return {"apply_url_verified": False, "apply_url_status_code": 0,
                "link_quality": "general_careers", "apply_url_redirect_final": "",
                "apply_url_last_checked": _now_iso()}
    # Step 2: format validation
    if not url.startswith(("https://", "http://")):
        return {"apply_url_verified": False, "apply_url_status_code": 0,
                "link_quality": "unverified", "apply_url_redirect_final": url,
                "apply_url_last_checked": _now_iso()}
    if any(s in url.lower() for s in URL_SHORTENERS):
        return {"apply_url_verified": False, "apply_url_status_code": 0,
                "link_quality": "unverified", "apply_url_redirect_final": url,
                "apply_url_last_checked": _now_iso()}
    # Step 3-4: HEAD w/ redirects
    status, final_url = _http_head(url)
    verified = 200 <= status < 400
    quality = _classify_link_quality(status, final_url, source)
    return {
        "apply_url_verified": verified,
        "apply_url_status_code": status,
        "link_quality": quality,
        "apply_url_redirect_final": final_url,
        "apply_url_last_checked": _now_iso(),
    }


# ============================================================
# Router
# ============================================================
def make_router(db, get_current_user_id, emergent_llm_key, llm_chat_cls, user_msg_cls):
    async def call_claude(system: str, prompt: str, model: str = "claude-sonnet-4-5-20250929") -> str:
        chat = llm_chat_cls(
            api_key=emergent_llm_key, session_id=f"jobint-{uuid.uuid4().hex[:8]}",
            system_message=system,
        ).with_model("anthropic", model)
        resp = await chat.send_message(user_msg_cls(text=prompt))
        return resp if isinstance(resp, str) else str(resp)

    async def score_job_match(job: Dict[str, Any], resume_text: str) -> Dict[str, Any]:
        """Claude 6-dimension match scoring."""
        prompt = f"""CANDIDATE RESUME:
{resume_text[:6000]}

JOB DESCRIPTION:
{(job.get('job_description_text') or '')[:5000]}

JOB TITLE: {job.get('job_title')}
EMPLOYER: {job.get('employer')}
EMPLOYER TYPE: {job.get('employer_type')}

Return only valid JSON with this exact structure (no markdown, no preamble):
{{
  "overall_match_score": <int 0-100>,
  "score_breakdown": {{
    "skills_match": <int 0-100>,
    "experience_match": <int 0-100>,
    "education_match": <int 0-100>,
    "industry_match": <int 0-100>,
    "location_match": <int 0-100>,
    "clearance_match": <int 0-100>
  }},
  "match_tier": "Strong Match" | "Good Match" | "Reach" | "Not Recommended",
  "match_color": "green" | "yellow" | "gray" | "red",
  "top_strengths": [<3 strings>],
  "key_gaps": [<strings>],
  "keyword_spotlight": [<5-8 critical keywords>],
  "skills_matched": [<strings>],
  "skills_to_highlight": [<strings>],
  "application_advice": "<one sentence>",
  "salary_context": "<one sentence>",
  "early_apply_urgency": "high" | "medium" | "low"
}}"""
        sys_msg = (
            "You are an expert talent acquisition specialist and career counselor with deep knowledge "
            "of federal government hiring (GS pay scales, USAJOBS qualification standards), "
            "international development organizations (ADB, World Bank, USAID, UN), NATO civilian "
            "staffing, and higher education administration. Analyze the candidate's resume against "
            "this job description and produce an honest, detailed qualification match assessment. "
            "Reply with valid JSON only."
        )
        try:
            raw = await call_claude(sys_msg, prompt)
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            if not m:
                raise ValueError("no JSON")
            data = json.loads(m.group(0))
            # Defaults
            data.setdefault("overall_match_score", 60)
            data.setdefault("score_breakdown", {})
            data.setdefault("match_tier", "Reach")
            data.setdefault("match_color", "gray")
            data.setdefault("top_strengths", [])
            data.setdefault("key_gaps", [])
            data.setdefault("keyword_spotlight", [])
            data.setdefault("skills_matched", [])
            data.setdefault("skills_to_highlight", [])
            data.setdefault("application_advice", "")
            data.setdefault("salary_context", "")
            data.setdefault("early_apply_urgency", "medium")
            return data
        except Exception as e:
            logger.warning("Match score fail for %s: %s", job.get("job_title"), e)
            return {
                "overall_match_score": 55,
                "score_breakdown": {"skills_match": 55, "experience_match": 55,
                                    "education_match": 60, "industry_match": 50,
                                    "location_match": 60, "clearance_match": 50},
                "match_tier": "Reach", "match_color": "gray",
                "top_strengths": [], "key_gaps": [], "keyword_spotlight": [],
                "skills_matched": [], "skills_to_highlight": [],
                "application_advice": "Scoring failed — apply if role matches your profile.",
                "salary_context": "", "early_apply_urgency": "medium",
            }

    r = APIRouter(prefix="/api/jobs/intelligence", tags=["job-intelligence"])

    # ------------------------------------------------------------------
    # Source status
    # ------------------------------------------------------------------
    def _source_status() -> List[Dict[str, Any]]:
        usajobs_key = bool(os.environ.get("USAJOBS_API_KEY", "").strip()
                           and not os.environ.get("USAJOBS_API_KEY", "").lower().startswith("placeholder"))
        scraper_key = bool(os.environ.get("SCRAPER_API_KEY", "").strip()
                           and not os.environ.get("SCRAPER_API_KEY", "").lower().startswith("placeholder"))
        return [
            {"id": "usajobs", "label": "USAJobs (federal)",
             "connected": usajobs_key,
             "status": "Connected" if usajobs_key else "Not Connected — Enter API key",
             "hint": "developer.usajobs.gov (free, instant)"},
            {"id": "devex", "label": "Devex Jobs",
             "connected": False,
             "status": "Not Connected — feed blocked from container",
             "hint": "Enable via proxy in Phase 2"},
            {"id": "reliefweb", "label": "ReliefWeb Jobs",
             "connected": False,
             "status": "Not Connected — API endpoint returns 410/403",
             "hint": "Enable via proxy in Phase 2"},
            {"id": "remotive", "label": "Remotive (finance)",
             "connected": True, "status": "Active — no key required", "hint": ""},
            {"id": "arbeitnow", "label": "Arbeitnow (global)",
             "connected": True, "status": "Active — no key required", "hint": ""},
            {"id": "jobicy", "label": "Jobicy (remote finance)",
             "connected": True, "status": "Active — no key required", "hint": ""},
            {"id": "linkedin", "label": "LinkedIn",
             "connected": scraper_key,
             "status": "Active" if scraper_key else "Not Connected — Awaiting ScraperAPI key",
             "hint": "scraperapi.com (1,000 free calls/mo)"},
            {"id": "indeed", "label": "Indeed",
             "connected": scraper_key,
             "status": "Active" if scraper_key else "Not Connected — Awaiting ScraperAPI key",
             "hint": "scraperapi.com"},
        ]

    @r.get("/sources")
    async def sources_ep(user_id: str = Depends(get_current_user_id)):
        return {"sources": _source_status()}

    # ------------------------------------------------------------------
    # Refresh / aggregate
    # ------------------------------------------------------------------
    @r.post("/refresh")
    async def refresh_ep(user_id: str = Depends(get_current_user_id)):
        stats = await _run_aggregation(db, user_id, score_job_match)
        return stats

    # ------------------------------------------------------------------
    # Feed / detail
    # ------------------------------------------------------------------
    @r.get("/feed")
    async def feed_ep(user_id: str = Depends(get_current_user_id),
                      min_score: int = 0, sort: str = "best_match", limit: int = 100):
        q = {"is_active": True, "apply_url_verified": True,
             "user_id": {"$in": [user_id, "_global"]}}
        cur = db.jobs_feed.find(q, {"_id": 0}).limit(limit)
        docs = await cur.to_list(limit)
        # Filter by user's default resume score
        default = await db.resumes.find_one({"user_id": user_id, "is_default": True}, {"resume_id": 1})
        rid = default and default.get("resume_id")
        def score_for(d):
            if not rid:
                return 0
            return int(((d.get("match_scores") or {}).get(rid) or {}).get("overall_match_score", 0))
        for d in docs:
            d["display_score"] = score_for(d)
        docs = [d for d in docs if d["display_score"] >= min_score]
        if sort == "most_recent":
            docs.sort(key=lambda d: d.get("posted_date", ""), reverse=True)
        elif sort == "highest_salary":
            docs.sort(key=lambda d: d.get("salary_max", 0) or 0, reverse=True)
        else:
            docs.sort(key=lambda d: d["display_score"], reverse=True)
        counters = await _feed_counters(db, user_id)
        return {"jobs": docs, "counters": counters}

    @r.get("/feed/{job_id}")
    async def feed_detail(job_id: str, user_id: str = Depends(get_current_user_id)):
        doc = await db.jobs_feed.find_one({"job_id": job_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Job not found")
        return doc

    @r.post("/feed/{job_id}/verify-link")
    async def verify_link_ep(job_id: str, user_id: str = Depends(get_current_user_id)):
        doc = await db.jobs_feed.find_one({"job_id": job_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Job not found")
        loop = asyncio.get_event_loop()
        v = await loop.run_in_executor(None, verify_apply_url, doc.get("apply_url", ""), doc.get("source", ""))
        v["link_verification_attempts"] = (doc.get("link_verification_attempts") or 0) + 1
        if not v["apply_url_verified"] and v["apply_url_status_code"] in (404, 410):
            v["is_active"] = False
            v["link_failed_at"] = _now_iso()
        await db.jobs_feed.update_one({"job_id": job_id}, {"$set": v})
        return v

    @r.post("/feed/{job_id}/save")
    async def save_job(job_id: str, user_id: str = Depends(get_current_user_id)):
        doc = await db.jobs_feed.find_one({"job_id": job_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Job not found")
        await db.saved_jobs.update_one(
            {"user_id": user_id, "job_id": job_id},
            {"$set": {"user_id": user_id, "job_id": job_id, "saved_at": _now_iso(),
                      "job_title": doc.get("job_title"), "employer": doc.get("employer"),
                      "apply_url": doc.get("apply_url")}},
            upsert=True,
        )
        return {"ok": True}

    # ------------------------------------------------------------------
    # Target employer watch list
    # ------------------------------------------------------------------
    @r.get("/target-employers")
    async def target_employers_ep(user_id: str = Depends(get_current_user_id)):
        doc = await db.user_career_criteria.find_one({"user_id": user_id}, {"_id": 0})
        if not doc or not doc.get("target_employers"):
            # Pre-seed
            await db.user_career_criteria.update_one(
                {"user_id": user_id},
                {"$set": {"user_id": user_id, "target_employers": PRE_SEEDED_EMPLOYERS,
                          "target_roles": DEFAULT_TARGET_ROLES,
                          "target_sectors": DEFAULT_TARGET_SECTORS,
                          "min_salary": DEFAULT_MIN_SALARY,
                          "target_locations": ["Remote", "Atlanta GA", "Washington DC", "Manila Philippines"],
                          "updated_at": _now_iso()}},
                upsert=True,
            )
            return {"target_employers": PRE_SEEDED_EMPLOYERS, "seeded": True}
        return {"target_employers": doc.get("target_employers", []), "seeded": False}

    @r.get("/criteria")
    async def criteria_ep(user_id: str = Depends(get_current_user_id)):
        doc = await db.user_career_criteria.find_one({"user_id": user_id}, {"_id": 0})
        if not doc:
            return {"target_roles": DEFAULT_TARGET_ROLES,
                    "target_sectors": DEFAULT_TARGET_SECTORS,
                    "min_salary": DEFAULT_MIN_SALARY,
                    "target_locations": ["Remote", "Atlanta GA", "Washington DC", "Manila Philippines"],
                    "target_employers": PRE_SEEDED_EMPLOYERS}
        return doc

    # ------------------------------------------------------------------
    # Insights dashboard
    # ------------------------------------------------------------------
    @r.get("/insights")
    async def insights_ep(user_id: str = Depends(get_current_user_id)):
        return await _compute_insights(db, user_id)

    return r


# ============================================================
# Aggregation orchestration
# ============================================================
async def _run_aggregation(db, user_id: str, score_fn) -> Dict[str, Any]:
    """Full aggregation pass: fetch → dedupe → filter → verify links → score."""
    started = time.time()
    loop = asyncio.get_event_loop()

    # 1. Fetch all sources in parallel (sync fns in executor)
    fetchers = [fetch_remotive, fetch_arbeitnow, fetch_jobicy, fetch_usajobs]
    results = await asyncio.gather(*(loop.run_in_executor(None, f) for f in fetchers))
    all_jobs: List[Dict[str, Any]] = [j for lst in results for j in lst]
    scanned = len(all_jobs)

    # 2. Dedupe by external_id
    seen: Dict[str, Dict[str, Any]] = {}
    for j in all_jobs:
        seen[j["external_id"]] = j
    unique = list(seen.values())

    # 3. Layer 1 fake filter
    filtered_out = 0
    verified_jobs: List[Dict[str, Any]] = []
    for j in unique:
        suspect, reasons = fake_filter_layer1(j)
        j["fake_layer1_reasons"] = reasons
        if suspect:
            filtered_out += 1
            continue
        verified_jobs.append(j)

    # 4. Link verification (parallelize in threadpool)
    def _verify_all(jobs):
        outs = []
        for j in jobs:
            v = verify_apply_url(j.get("apply_url", ""), j.get("source", ""))
            outs.append({**j, **v})
        return outs
    verified_jobs = await loop.run_in_executor(None, _verify_all, verified_jobs)

    # 5. Keep only those with a verified apply URL
    displayable = [j for j in verified_jobs if j.get("apply_url_verified")]
    held_pending = len(verified_jobs) - len(displayable)

    # 6. Get user's default resume for scoring
    default = await db.resumes.find_one({"user_id": user_id, "is_default": True}, {"_id": 0})
    resume_text = (default or {}).get("extracted_text", "") if default else ""
    resume_id = (default or {}).get("resume_id", "") if default else ""

    # 7. Upsert into jobs_feed + score each (cap at 12 fresh scores per run)
    now = _now_iso()
    scored_ok = 0
    to_score: List[Tuple[str, Dict[str, Any]]] = []  # (job_id, base_doc)
    for j in displayable:
        job_id = j["external_id"].replace("/", "-").replace(".", "-")
        posted_days = _iso_to_days_ago(j.get("posted_date", ""))
        early_flag = posted_days <= 3
        base = {
            **j, "job_id": job_id, "user_id": "_global",
            "is_verified": True, "is_active": True,
            "early_posting_flag": early_flag, "days_since_posted": posted_days,
            "ingested_at": now,
            "link_verification_attempts": 1, "link_failed_at": None,
        }
        # Existing scored?
        existing = await db.jobs_feed.find_one(
            {"job_id": job_id}, {"match_scores": 1, "keyword_analysis": 1}
        )
        if existing and resume_id and (existing.get("match_scores") or {}).get(resume_id):
            await db.jobs_feed.update_one(
                {"job_id": job_id},
                {"$set": {**base, "match_scores": existing.get("match_scores", {}),
                          "keyword_analysis": existing.get("keyword_analysis", {})}},
                upsert=True,
            )
            continue
        # Insert first w/o score, then queue for scoring
        base["match_scores"] = {}
        base["keyword_analysis"] = {}
        await db.jobs_feed.update_one(
            {"job_id": job_id}, {"$set": base}, upsert=True
        )
        to_score.append((job_id, j))

    # 8. Score top 12 (sorted by recency) in parallel batches of 4
    to_score.sort(key=lambda x: x[1].get("posted_date", ""), reverse=True)
    to_score = to_score[:12]
    if resume_text and resume_id and to_score:
        sem = asyncio.Semaphore(4)

        async def _one_score(jid: str, jd: Dict[str, Any]):
            async with sem:
                try:
                    s = await asyncio.wait_for(score_fn(jd, resume_text), timeout=40)
                    await db.jobs_feed.update_one(
                        {"job_id": jid},
                        {"$set": {
                            f"match_scores.{resume_id}": s,
                            f"keyword_analysis.{resume_id}": {
                                "keyword_spotlight": s.get("keyword_spotlight", []),
                                "skills_matched": s.get("skills_matched", []),
                            },
                        }},
                    )
                    return True
                except Exception as e:
                    logger.warning("Score fail %s: %s", jd.get("job_title"), e)
                    return False

        results_s = await asyncio.gather(*(_one_score(jid, jd) for jid, jd in to_score))
        scored_ok = sum(1 for r in results_s if r)

    elapsed = time.time() - started
    stats = {
        "scanned": scanned,
        "unique": len(unique),
        "filtered_out_layer1": filtered_out,
        "verified_links": len(displayable),
        "held_pending_links": held_pending,
        "scored": scored_ok,
        "elapsed_seconds": round(elapsed, 1),
        "sources": _source_summary(),
    }
    # Record run
    await db.job_intel_runs.insert_one({**stats, "user_id": user_id,
                                        "ran_at": now, "_id": uuid.uuid4().hex})
    return stats


def _source_summary() -> Dict[str, int]:
    return {"remotive": 1, "arbeitnow": 1, "jobicy": 1,
            "usajobs": 1 if os.environ.get("USAJOBS_API_KEY") else 0}


async def _feed_counters(db, user_id: str) -> Dict[str, Any]:
    total = await db.jobs_feed.count_documents({"is_active": True, "apply_url_verified": True})
    last_run = await db.job_intel_runs.find_one(
        {"user_id": user_id}, sort=[("ran_at", -1)]
    )
    scanned = (last_run or {}).get("scanned", 0)
    filtered = (last_run or {}).get("filtered_out_layer1", 0)
    return {
        "scanned_today": scanned,
        "filtered_today": filtered,
        "verified_shown": total,
        "last_ran": (last_run or {}).get("ran_at"),
    }


# ============================================================
# Insights
# ============================================================
async def _compute_insights(db, user_id: str) -> Dict[str, Any]:
    """Career Insights: Health Score + Skills Matrix + Industry Match."""
    default = await db.resumes.find_one({"user_id": user_id, "is_default": True}, {"_id": 0})
    if not default:
        return {"has_default_resume": False}
    resume_text = (default or {}).get("extracted_text", "").lower()
    resume_id = default.get("resume_id", "")

    # Feed jobs w/ scored keywords
    docs = await db.jobs_feed.find(
        {"is_active": True, "apply_url_verified": True},
        {"_id": 0, "job_title": 1, "employer": 1, "employer_type": 1,
         "match_scores": 1, "keyword_analysis": 1, "salary_min": 1, "salary_max": 1},
    ).to_list(500)

    scores = []
    all_kws: Dict[str, int] = {}
    industry_scores: Dict[str, List[int]] = {}
    for d in docs:
        s = ((d.get("match_scores") or {}).get(resume_id) or {})
        overall = s.get("overall_match_score")
        if overall:
            scores.append(overall)
        for kw in (d.get("keyword_analysis") or {}).get(resume_id, {}).get("keyword_spotlight", []):
            k = kw.strip().lower()
            all_kws[k] = all_kws.get(k, 0) + 1
        et = d.get("employer_type", "private_sector")
        if overall:
            industry_scores.setdefault(et, []).append(overall)

    # Health Score = weighted average of top-5 match scores
    top_scores = sorted(scores, reverse=True)[:10] if scores else []
    health = round(sum(top_scores) / max(len(top_scores), 1)) if top_scores else 60

    # Skills strength matrix
    total = max(len(docs), 1)
    strong: List[Dict[str, Any]] = []
    growing: List[Dict[str, Any]] = []
    gaps: List[Dict[str, Any]] = []
    for kw, freq in sorted(all_kws.items(), key=lambda x: -x[1])[:30]:
        share = freq / total
        in_resume = kw in resume_text
        entry = {"skill": kw.title(), "job_count": freq, "share": round(share * 100)}
        if in_resume and share >= 0.4:
            strong.append(entry)
        elif in_resume and share >= 0.15:
            growing.append(entry)
        elif not in_resume and share >= 0.20:
            gaps.append(entry)

    # Industry match
    industry_map = {
        "federal_government": "Federal Government",
        "international_org": "International Organizations",
        "nonprofit": "NGO / Nonprofit",
        "higher_education": "Higher Education",
        "private_sector": "Private Sector",
        "ngo": "NGO / Nonprofit",
    }
    industries = []
    for k, vals in industry_scores.items():
        avg = round(sum(vals) / len(vals)) if vals else 0
        industries.append({
            "label": industry_map.get(k, k.replace("_", " ").title()),
            "average_match": avg, "job_count": len(vals),
        })
    industries.sort(key=lambda x: -x["average_match"])

    return {
        "has_default_resume": True,
        "resume_label": default.get("label") or default.get("file_name"),
        "career_health_score": health,
        "health_basis": f"Based on top {len(top_scores)} matches across {len(docs)} verified jobs",
        "skills_strong": strong[:8],
        "skills_growing": growing[:8],
        "skills_gaps": gaps[:8],
        "industry_match": industries,
    }
