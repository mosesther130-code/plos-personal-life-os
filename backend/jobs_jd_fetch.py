"""PLOS Jobs — live full-text JD fetcher.

Endpoint: POST /api/jobs/{job_id}/fetch-full-description

Fetches the full job description directly from the source URL (USAJobs, LinkedIn,
Indeed, Devex, ReliefWeb, employer career pages), extracts main body content with
site-specific selectors when known, falls back to generic content extraction, then
persists it back into `jobs_feed.description_full` for reuse.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)

FETCH_TIMEOUT = 15.0
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 12_0) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 PLOS/1.0")

# Site-specific selectors (order matters — try each until we get >200 chars)
SITE_SELECTORS: Dict[str, list[Tuple[str, str]]] = {
    "usajobs.gov": [
        ("div", "usajobs-joa-summary"),
        ("div", "usajobs-joa-duties"),
        ("div", "usajobs-joa-qualifications"),
        ("main", None),
    ],
    "linkedin.com": [
        ("div", "description__text"),
        ("div", "show-more-less-html__markup"),
        ("section", "description"),
    ],
    "indeed.com": [
        ("div", "jobDescriptionText"),
        ("div", "job_description"),
    ],
    "devex.com": [
        ("div", "job-description"),
        ("article", None),
        ("main", None),
    ],
    "reliefweb.int": [
        ("div", "body-content"),
        ("div", "field--name-body"),
        ("article", None),
    ],
    "adb.org": [("main", None), ("div", "content")],
    "worldbank.org": [("main", None), ("article", None)],
    "state.gov": [("main", None), ("div", "entry-content")],
    "usaid.gov": [("main", None), ("div", "field--name-body")],
    "glassdoor.com": [("div", "jobDescriptionContent"), ("div", "desc")],
}


def _clean(text: str) -> str:
    text = re.sub(r"\s+", " ", text or "")
    return text.strip()


def _extract_with_selectors(soup: BeautifulSoup, host: str) -> Optional[str]:
    for host_key, selectors in SITE_SELECTORS.items():
        if host_key not in host:
            continue
        for tag, cls in selectors:
            node = soup.find(tag, class_=cls) if cls else soup.find(tag)
            if node:
                txt = _clean(node.get_text(" ", strip=True))
                if len(txt) > 200:
                    return txt
    return None


def _extract_generic(soup: BeautifulSoup) -> Optional[str]:
    """Fallback: find the largest block of contiguous paragraph/list text."""
    # Strip common non-content
    for tag in soup(["script", "style", "nav", "header", "footer",
                     "aside", "form", "button", "iframe", "noscript"]):
        tag.decompose()
    candidates: list[Tuple[int, str]] = []
    for node in soup.find_all(["main", "article", "section", "div"]):
        txt = _clean(node.get_text(" ", strip=True))
        if 400 < len(txt) < 30000:
            candidates.append((len(txt), txt))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


def _word_count(s: str) -> int:
    return len(re.findall(r"\w+", s or ""))


async def fetch_job_description(url: str) -> Tuple[Optional[str], str]:
    """Returns (text, source_kind) where source_kind is 'live_fetched' or reason."""
    if not url or not url.startswith("http"):
        return None, "no_url"
    try:
        async with httpx.AsyncClient(follow_redirects=True,
                                     timeout=FETCH_TIMEOUT,
                                     headers={"User-Agent": UA,
                                              "Accept": "text/html,application/xhtml+xml"}) as client:
            r = await client.get(url)
            if r.status_code >= 400:
                return None, f"http_{r.status_code}"
            html = r.text or ""
    except Exception as e:
        logger.info("[jd-fetch] err %s -> %s", url[:60], e)
        return None, f"error_{type(e).__name__}"
    if not html:
        return None, "empty"
    soup = BeautifulSoup(html, "lxml")
    host = re.sub(r"^https?://(?:www\.)?", "", url).split("/")[0].lower()
    # Try site-specific first
    text = _extract_with_selectors(soup, host)
    if not text or len(text) < 200:
        text = _extract_generic(soup)
    if not text or len(text) < 200:
        return None, "no_content"
    # Cap huge dumps
    if len(text) > 15000:
        text = text[:15000]
    return text, "live_fetched"


def make_router(db, get_current_user_id):
    r = APIRouter(prefix="/jobs", tags=["jobs-jd-fetch"])

    @r.post("/{job_id}/fetch-full-description")
    async def refresh_description(job_id: str,
                                  user_id: str = Depends(get_current_user_id)):
        job = await db.jobs_feed.find_one({"user_id": user_id, "job_id": job_id})
        if not job:
            raise HTTPException(404, "Job not found")
        existing = job.get("description_full") or ""
        wc = _word_count(existing)
        # If already >800 words, use as-is
        if wc >= 800 and job.get("description_source") != "aggregated_short":
            return {
                "job_id": job_id,
                "description_source": job.get("description_source") or "stored",
                "word_count": wc,
                "description_full": existing,
                "fetched": False,
            }
        # Try live-fetch
        url = job.get("apply_url_final") or job.get("apply_url") or job.get("source_url")
        text, kind = await fetch_job_description(url)
        new_wc = _word_count(text or "")
        if text and new_wc > wc:
            await db.jobs_feed.update_one(
                {"user_id": user_id, "job_id": job_id},
                {"$set": {
                    "description_full": text,
                    "description_source": kind,
                    "description_word_count": new_wc,
                    "description_fetched_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            return {"job_id": job_id, "description_source": kind,
                    "word_count": new_wc, "description_full": text,
                    "fetched": True}
        # Failed live-fetch — return stored (mark source)
        await db.jobs_feed.update_one(
            {"user_id": user_id, "job_id": job_id},
            {"$set": {"description_source": "aggregated_short",
                      "description_word_count": wc,
                      "description_fetch_error": kind}},
        )
        return {"job_id": job_id,
                "description_source": "aggregated_short",
                "word_count": wc, "description_full": existing,
                "fetched": False, "fetch_error": kind}

    return r
