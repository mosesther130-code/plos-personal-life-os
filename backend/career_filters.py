"""PLOS Career — Job Filter Profiles, Watch List, Ranking Engine.

Extends job_intelligence.py with:
- 10-factor weighted ranking engine (rank_jobs)
- Multiple named filter profiles (3 pre-seeded)
- Fully editable target employer watch list (16 pre-seeded)
- Job source config CRUD (15 pre-configured)
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ============================================================
# Pre-seed data
# ============================================================
SEED_EMPLOYERS: List[Dict[str, Any]] = [
    {"name": "Asian Development Bank", "type": "international_org", "priority": "critical",
     "careers_url": "https://www.adb.org/work-with-us/careers",
     "keywords": ["financial control", "budget", "financial management", "IS-3"],
     "alert_on_any": True, "alert_high_match_only": False, "notes": ""},
    {"name": "NATO", "type": "international_org", "priority": "critical",
     "careers_url": "https://www.nato.int/cps/en/natohq/85321.htm",
     "keywords": ["financial", "staff assistant", "budget", "administration"],
     "alert_on_any": True, "alert_high_match_only": False,
     "notes": "HQ + Allied Commands"},
    {"name": "US Department of State", "type": "federal_government", "priority": "high",
     "careers_url": "https://careers.state.gov",
     "keywords": ["financial management officer", "budget officer", "foreign service"],
     "alert_on_any": True, "alert_high_match_only": False, "notes": ""},
    {"name": "USAID", "type": "federal_government", "priority": "high",
     "careers_url": "https://www.usajobs.gov/Search/Results?d=AF",
     "keywords": ["financial management", "controller", "grants", "program analyst"],
     "alert_on_any": True, "alert_high_match_only": False, "notes": ""},
    {"name": "World Bank Group", "type": "international_org", "priority": "high",
     "careers_url": "https://jobs.worldbank.org",
     "keywords": ["financial management specialist", "budget analyst", "operations officer"],
     "alert_on_any": True, "alert_high_match_only": False, "notes": ""},
    {"name": "International Monetary Fund", "type": "international_org", "priority": "high",
     "careers_url": "https://www.imf.org/en/About/Careers",
     "keywords": ["financial sector expert", "economist", "budget"],
     "alert_on_any": True, "alert_high_match_only": False, "notes": ""},
    {"name": "Georgia State University", "type": "higher_education", "priority": "medium",
     "careers_url": "https://careers.gsu.edu",
     "keywords": ["director", "dean", "associate provost", "financial officer",
                  "academic affairs"],
     "alert_on_any": True, "alert_high_match_only": False, "notes": ""},
    {"name": "Millennium Challenge Corporation", "type": "federal_government", "priority": "high",
     "careers_url": "https://www.mcc.gov/careers",
     "keywords": ["financial management", "compact", "program analyst"],
     "alert_on_any": True, "alert_high_match_only": False, "notes": ""},
    {"name": "Asian Infrastructure Investment Bank", "type": "international_org", "priority": "medium",
     "careers_url": "https://www.aiib.org/en/about-aiib/governance/work-with-aiib",
     "keywords": ["financial", "treasury", "investment", "budget"],
     "alert_on_any": True, "alert_high_match_only": False, "notes": ""},
    {"name": "Chemonics International", "type": "international_dev_consulting",
     "priority": "medium",
     "careers_url": "https://chemonics.com/careers",
     "keywords": ["financial management", "controller", "director of finance", "home office"],
     "alert_on_any": True, "alert_high_match_only": False, "notes": ""},
    {"name": "DAI Global", "type": "international_dev_consulting", "priority": "medium",
     "careers_url": "https://www.dai.com/careers",
     "keywords": ["financial management", "operations", "program management", "home office"],
     "alert_on_any": True, "alert_high_match_only": False, "notes": ""},
    {"name": "Inter-American Development Bank", "type": "international_org", "priority": "medium",
     "careers_url": "https://www.iadb.org/en/about-us/career-opportunities",
     "keywords": ["financial management", "operations analyst", "budget"],
     "alert_on_any": True, "alert_high_match_only": False,
     "notes": "Similar mandate to ADB, strong Latin America portfolio"},
    {"name": "United Nations Development Programme", "type": "international_org",
     "priority": "high",
     "careers_url": "https://jobs.undp.org",
     "keywords": ["finance specialist", "programme analyst", "operations manager"],
     "alert_on_any": True, "alert_high_match_only": False, "notes": ""},
    {"name": "African Development Bank", "type": "international_org", "priority": "medium",
     "careers_url": "https://www.afdb.org/en/about-us/careers",
     "keywords": ["financial control", "budget", "financial management"],
     "alert_on_any": True, "alert_high_match_only": False,
     "notes": "Strong match for Africa-facing FM roles"},
    {"name": "Office of Inspector General", "type": "federal_government", "priority": "medium",
     "careers_url": "https://www.usajobs.gov/Search/Results?k=inspector+general",
     "keywords": ["auditor", "financial auditor", "financial analyst", "OIG"],
     "alert_on_any": False, "alert_high_match_only": True,
     "notes": "High match for accounting and oversight background"},
    {"name": "United Nations", "type": "international_org", "priority": "high",
     "careers_url": "https://careers.un.org",
     "keywords": ["finance", "budget", "administration"],
     "alert_on_any": True, "alert_high_match_only": False, "notes": ""},
]

DEFAULT_RANKING_WEIGHTS = {
    "match_score": 10, "salary": 8, "employer_reputation": 8,
    "posted_date": 7, "location_match": 7, "work_type": 6,
    "sector_priority": 9, "watch_list": 10,
    "deadline_urgency": 5, "early_posting": 6,
}

DEFAULT_SECTORS = [
    {"name": "Federal Government", "id": "federal_government", "priority": "high", "enabled": True},
    {"name": "International Organizations", "id": "international_org", "priority": "high", "enabled": True},
    {"name": "International Development NGO", "id": "international_dev_ngo", "priority": "high", "enabled": True},
    {"name": "Higher Education Administration", "id": "higher_education", "priority": "medium", "enabled": True},
    {"name": "Nonprofit and Foundation", "id": "nonprofit", "priority": "medium", "enabled": True},
    {"name": "International Development Consulting", "id": "international_dev_consulting", "priority": "medium", "enabled": True},
    {"name": "State and Local Government", "id": "state_local_gov", "priority": "low", "enabled": True},
    {"name": "Private Sector Financial Services", "id": "private_finance", "priority": "low", "enabled": True},
    {"name": "Healthcare Administration", "id": "healthcare", "priority": "low", "enabled": False},
    {"name": "Technology", "id": "technology", "priority": "low", "enabled": False},
]

DEFAULT_LOCATIONS = [
    # High priority (established life & career geography)
    {"id": "loc_atlanta_ga", "label": "Atlanta, Georgia, USA", "type": "city",
     "priority": "high", "work_type_override": "any", "radius_miles": 30,
     "country_code": "US", "admin1": "GA", "city": "Atlanta", "zip": "",
     "lat": 33.7490, "lng": -84.3880,
     "is_special": False, "special_kind": None, "enabled": True, "can_delete": True},
    {"id": "loc_special_remote", "label": "Remote (Work from Anywhere)", "type": "special",
     "priority": "high", "work_type_override": "remote", "radius_miles": 0,
     "country_code": "", "admin1": "", "city": "", "zip": "",
     "lat": 0.0, "lng": 0.0,
     "is_special": True, "special_kind": "remote", "enabled": True, "can_delete": False},
    {"id": "loc_dc", "label": "Washington, DC, USA", "type": "city",
     "priority": "high", "work_type_override": "any", "radius_miles": 20,
     "country_code": "US", "admin1": "DC", "city": "Washington", "zip": "",
     "lat": 38.9072, "lng": -77.0369,
     "is_special": False, "special_kind": None, "enabled": True, "can_delete": True},
    {"id": "loc_zip_30083", "label": "Stone Mountain, GA 30083", "type": "zip",
     "priority": "high", "work_type_override": "on_site_hybrid", "radius_miles": 15,
     "country_code": "US", "admin1": "GA", "city": "Stone Mountain", "zip": "30083",
     "lat": 33.8081, "lng": -84.1702,
     "is_special": False, "special_kind": None, "enabled": True, "can_delete": True},
    # Medium priority
    {"id": "loc_state_ga", "label": "Georgia, USA", "type": "state",
     "priority": "medium", "work_type_override": "any", "radius_miles": 0,
     "country_code": "US", "admin1": "GA", "city": "", "zip": "",
     "lat": 32.1656, "lng": -82.9001,
     "is_special": False, "special_kind": None, "enabled": True, "can_delete": True},
    {"id": "loc_manila", "label": "Manila, Philippines", "type": "city",
     "priority": "medium", "work_type_override": "any", "radius_miles": 30,
     "country_code": "PH", "admin1": "NCR", "city": "Manila", "zip": "",
     "lat": 14.5995, "lng": 120.9842,
     "is_special": False, "special_kind": None, "enabled": True, "can_delete": True},
    {"id": "loc_ph", "label": "Philippines", "type": "country",
     "priority": "medium", "work_type_override": "any", "radius_miles": 0,
     "country_code": "PH", "admin1": "", "city": "", "zip": "",
     "lat": 12.8797, "lng": 121.7740,
     "is_special": False, "special_kind": None, "enabled": True, "can_delete": True},
    {"id": "loc_brussels", "label": "Brussels, Belgium", "type": "city",
     "priority": "medium", "work_type_override": "any", "radius_miles": 20,
     "country_code": "BE", "admin1": "Brussels-Capital", "city": "Brussels", "zip": "",
     "lat": 50.8503, "lng": 4.3517,
     "is_special": False, "special_kind": None, "enabled": True, "can_delete": True},
    {"id": "loc_dc_metro", "label": "Washington DC Metro Area", "type": "region",
     "priority": "medium", "work_type_override": "any", "radius_miles": 40,
     "country_code": "US", "admin1": "DC", "city": "Washington", "zip": "",
     "lat": 38.9072, "lng": -77.0369,
     "is_special": False, "special_kind": None, "enabled": True, "can_delete": True},
    # Low priority
    {"id": "loc_nyc", "label": "New York City, New York, USA", "type": "city",
     "priority": "low", "work_type_override": "hybrid_remote", "radius_miles": 25,
     "country_code": "US", "admin1": "NY", "city": "New York", "zip": "",
     "lat": 40.7128, "lng": -74.0060,
     "is_special": False, "special_kind": None, "enabled": True, "can_delete": True},
    {"id": "loc_southeast_us", "label": "Southeast USA", "type": "region",
     "priority": "low", "work_type_override": "any", "radius_miles": 0,
     "country_code": "US", "admin1": "GA,FL,AL,TN,SC,NC", "city": "", "zip": "",
     "lat": 0.0, "lng": 0.0,
     "is_special": False, "special_kind": None, "enabled": True, "can_delete": True},
    {"id": "loc_special_international", "label": "International Assignment", "type": "special",
     "priority": "high", "work_type_override": "any", "radius_miles": 0,
     "country_code": "", "admin1": "", "city": "", "zip": "",
     "lat": 0.0, "lng": 0.0, "min_salary_override": 90000,
     "is_special": True, "special_kind": "international", "enabled": True, "can_delete": False},
    {"id": "loc_special_flexible", "label": "Flexible or Negotiable", "type": "special",
     "priority": "high", "work_type_override": "any", "radius_miles": 0,
     "country_code": "", "admin1": "", "city": "", "zip": "",
     "lat": 0.0, "lng": 0.0,
     "is_special": True, "special_kind": "flexible", "enabled": True, "can_delete": False},
]

DEFAULT_ROLES = [
    "Financial Control Specialist", "Financial Management Officer",
    "Program Coordinator", "Budget Analyst", "Department Director",
    "Grants Management Specialist", "International Development Advisor",
    "Deputy Controller",
]

DEFAULT_EXCLUDED = [
    "sales commission", "MLM", "multi-level marketing",
    "unpaid internship", "volunteer only",
]

PRESEED_PROFILES = [
    {
        "profile_name": "International Development Track",
        "is_default": True, "is_active": True,
        "target_roles": DEFAULT_ROLES,
        "excluded_keywords": DEFAULT_EXCLUDED,
        "sectors": [{**s, "priority": "high" if s["id"] in
                    ("international_org", "international_dev_ngo") else s["priority"]}
                   for s in DEFAULT_SECTORS],
        "locations": [{**loc, "priority": "high" if loc["label"] in
                      ("Manila, Philippines", "Brussels, Belgium") else loc["priority"]}
                     for loc in DEFAULT_LOCATIONS],
        "work_types": ["remote", "hybrid", "on_site", "international"],
        "min_salary": 85000, "max_salary": None, "include_no_salary": True,
        "experience_levels": ["senior", "executive"],
        "education_requirement": "masters_preferred",
        "clearance_filter": "top_secret_eligible",
        "ranking_weights": DEFAULT_RANKING_WEIGHTS,
        "alert_min_match_score": 80, "alert_min_rank": 20,
        "alert_frequency_cap": 3,
        "quiet_hours_start": "22:00", "quiet_hours_end": "07:00",
    },
    {
        "profile_name": "Federal Government Track",
        "is_default": False, "is_active": False,
        "target_roles": DEFAULT_ROLES,
        "excluded_keywords": DEFAULT_EXCLUDED,
        "sectors": [{**s, "priority": "high" if s["id"] == "federal_government"
                    else "low" if s["id"] != "international_org" else s["priority"]}
                   for s in DEFAULT_SECTORS],
        "locations": [{**loc, "priority": "high" if loc["label"] in
                      ("Washington DC metro area", "Atlanta, Georgia USA") else loc["priority"]}
                     for loc in DEFAULT_LOCATIONS],
        "work_types": ["on_site", "hybrid", "remote"],
        "min_salary": 92000, "max_salary": None, "include_no_salary": True,
        "experience_levels": ["senior", "executive"],
        "education_requirement": "masters_preferred",
        "clearance_filter": "top_secret_eligible",
        "ranking_weights": DEFAULT_RANKING_WEIGHTS,
        "alert_min_match_score": 80, "alert_min_rank": 20,
        "alert_frequency_cap": 3,
        "quiet_hours_start": "22:00", "quiet_hours_end": "07:00",
    },
    {
        "profile_name": "Academic Administration Track",
        "is_default": False, "is_active": False,
        "target_roles": ["Director", "Associate Provost", "Financial Officer",
                         "Dean", "Academic Affairs Manager",
                         "Department Coordinator", "Assistant Vice President"],
        "excluded_keywords": DEFAULT_EXCLUDED,
        "sectors": [{**s, "priority": "high" if s["id"] == "higher_education"
                    else "low"} for s in DEFAULT_SECTORS],
        "locations": [{**loc, "priority": "high" if loc["label"] ==
                      "Atlanta, Georgia USA" else "low"}
                     for loc in DEFAULT_LOCATIONS],
        "work_types": ["on_site", "hybrid", "remote"],
        "min_salary": 65000, "max_salary": None, "include_no_salary": True,
        "experience_levels": ["senior", "executive"],
        "education_requirement": "masters_required",
        "clearance_filter": "no_requirement",
        "ranking_weights": DEFAULT_RANKING_WEIGHTS,
        "alert_min_match_score": 75, "alert_min_rank": 15,
        "alert_frequency_cap": 3,
        "quiet_hours_start": "22:00", "quiet_hours_end": "07:00",
    },
]

# 15 sources with honest phase-1 status
SEED_SOURCES: List[Dict[str, Any]] = [
    # Working now
    {"source_id": "remotive", "label": "Remotive (finance)", "kind": "api_public",
     "operational": True, "update_frequency_min": 60, "paused": False},
    {"source_id": "arbeitnow", "label": "Arbeitnow (global)", "kind": "api_public",
     "operational": True, "update_frequency_min": 60, "paused": False},
    {"source_id": "jobicy", "label": "Jobicy (remote finance)", "kind": "api_public",
     "operational": True, "update_frequency_min": 120, "paused": False},
    # Awaiting keys
    {"source_id": "usajobs", "label": "USAJobs.gov", "kind": "api_key_required",
     "operational": False, "update_frequency_min": 60, "paused": False,
     "requires_key": "USAJOBS_API_KEY"},
    {"source_id": "reliefweb", "label": "ReliefWeb Jobs", "kind": "api_public",
     "operational": False, "update_frequency_min": 120, "paused": False,
     "note": "Endpoint returns 403/410 from cloud container. Enable via HTTPS proxy in Phase 2."},
    {"source_id": "devex", "label": "Devex Jobs RSS", "kind": "rss",
     "operational": False, "update_frequency_min": 120, "paused": False,
     "note": "RSS returns 403 from cloud container. Enable via HTTPS proxy in Phase 2."},
    # Web-search based (Phase 2 — Claude web search integration required)
    {"source_id": "un_careers", "label": "UN Careers", "kind": "web_search",
     "operational": False, "update_frequency_min": 240, "paused": False,
     "note": "Requires Claude web-search tool integration — Phase 2."},
    {"source_id": "world_bank", "label": "World Bank Jobs", "kind": "web_search",
     "operational": False, "update_frequency_min": 240, "paused": False,
     "note": "Requires web-search integration — Phase 2."},
    {"source_id": "imf", "label": "IMF Careers", "kind": "web_search",
     "operational": False, "update_frequency_min": 240, "paused": False,
     "note": "Requires web-search integration — Phase 2."},
    {"source_id": "adb", "label": "ADB Careers", "kind": "web_search",
     "operational": False, "update_frequency_min": 120, "paused": False,
     "note": "Requires web-search integration — Phase 2. Highest priority employer."},
    {"source_id": "nato", "label": "NATO Civilian Careers", "kind": "web_search",
     "operational": False, "update_frequency_min": 240, "paused": False,
     "note": "Requires web-search integration — Phase 2."},
    {"source_id": "mcc", "label": "MCC Careers", "kind": "web_search",
     "operational": False, "update_frequency_min": 720, "paused": False,
     "note": "Requires web-search integration — Phase 2."},
    {"source_id": "chemonics", "label": "Chemonics International", "kind": "web_search",
     "operational": False, "update_frequency_min": 720, "paused": False,
     "note": "Requires web-search integration — Phase 2."},
    {"source_id": "dai_global", "label": "DAI Global", "kind": "web_search",
     "operational": False, "update_frequency_min": 720, "paused": False,
     "note": "Requires web-search integration — Phase 2."},
    {"source_id": "state_dept", "label": "State Department", "kind": "web_search",
     "operational": False, "update_frequency_min": 240, "paused": False,
     "note": "Requires web-search integration — Phase 2. Overlaps with USAJobs agency filter."},
    # Scraper-based
    {"source_id": "linkedin", "label": "LinkedIn Jobs", "kind": "scraper",
     "operational": False, "update_frequency_min": 60, "paused": False,
     "requires_key": "SCRAPER_API_KEY"},
    {"source_id": "indeed", "label": "Indeed", "kind": "scraper",
     "operational": False, "update_frequency_min": 60, "paused": False,
     "requires_key": "SCRAPER_API_KEY"},
    {"source_id": "glassdoor", "label": "Glassdoor", "kind": "scraper",
     "operational": False, "update_frequency_min": 240, "paused": False,
     "requires_key": "SCRAPER_API_KEY"},
]


# ============================================================
# Models
# ============================================================
class ProfileBody(BaseModel):
    profile_name: str = Field(..., min_length=1)
    is_default: bool = False
    target_roles: List[str] = []
    excluded_keywords: List[str] = []
    sectors: List[Dict[str, Any]] = []
    locations: List[Dict[str, Any]] = []
    work_types: List[str] = []
    min_salary: int = 65000
    max_salary: Optional[int] = None
    include_no_salary: bool = True
    experience_levels: List[str] = []
    education_requirement: str = "masters_preferred"
    clearance_filter: str = "top_secret_eligible"
    ranking_weights: Dict[str, int] = Field(default_factory=lambda: DEFAULT_RANKING_WEIGHTS)
    alert_min_match_score: int = 80
    alert_min_rank: int = 20
    alert_frequency_cap: int = 3
    quiet_hours_start: str = "22:00"
    quiet_hours_end: str = "07:00"


class EmployerBody(BaseModel):
    name: str
    type: str
    priority: str  # critical, high, medium, low
    careers_url: str
    keywords: List[str] = []
    alert_on_any: bool = True
    alert_high_match_only: bool = False
    notes: str = ""


class SourceUpdateBody(BaseModel):
    update_frequency_min: Optional[int] = None
    paused: Optional[bool] = None


class AutocompleteBody(BaseModel):
    query: str = Field(..., min_length=1)
    session_token: Optional[str] = None


class PlaceDetailsBody(BaseModel):
    place_id: str
    session_token: Optional[str] = None


# ============================================================
# Ranking Engine
# ============================================================
def _normalize(v: float, min_v: float, max_v: float) -> float:
    if max_v <= min_v:
        return 0.0
    return max(0.0, min(1.0, (v - min_v) / (max_v - min_v)))


async def rank_jobs(db, user_id: str, profile: Dict[str, Any]) -> Dict[str, Any]:
    """Weighted rank of all verified jobs for the given filter profile."""
    weights = profile.get("ranking_weights") or DEFAULT_RANKING_WEIGHTS
    min_salary = profile.get("min_salary", 0)
    include_no_salary = profile.get("include_no_salary", True)
    excluded = [k.lower() for k in (profile.get("excluded_keywords") or [])]
    enabled_sector_ids = {s["id"] for s in (profile.get("sectors") or []) if s.get("enabled")}
    sector_priority: Dict[str, str] = {s["id"]: s.get("priority", "low")
                                       for s in (profile.get("sectors") or [])}
    location_labels = [loc.get("label", "").lower() for loc in (profile.get("locations") or [])]
    location_prio = {loc.get("label", "").lower(): loc.get("priority", "low")
                     for loc in (profile.get("locations") or [])}
    # New v2 location entries — enabled only
    locations_v2 = [loc for loc in (profile.get("locations") or [])
                    if isinstance(loc, dict) and loc.get("enabled", True)]
    # Special entries
    has_special_remote = any(loc.get("special_kind") == "remote" for loc in locations_v2)
    has_special_intl = any(loc.get("special_kind") == "international" for loc in locations_v2)
    has_special_flexible = any(loc.get("special_kind") == "flexible" for loc in locations_v2)
    work_types = set(profile.get("work_types") or ["remote", "hybrid", "on_site"])

    # Watch list employer names (fuzzy)
    watch_docs = await db.target_employers.find(
        {"user_id": user_id}, {"_id": 0, "name": 1, "priority": 1}
    ).to_list(200)
    watch_names = {(d["name"] or "").lower(): d.get("priority", "medium") for d in watch_docs}

    # Default resume ID
    default = await db.resumes.find_one({"user_id": user_id, "is_default": True},
                                        {"resume_id": 1})
    rid = (default or {}).get("resume_id", "")

    docs = await db.jobs_feed.find(
        {"is_active": True, "apply_url_verified": True}, {"_id": 0}
    ).to_list(500)

    prio_val = {"critical": 1.0, "high": 0.85, "medium": 0.6, "low": 0.3}

    ranked: List[Dict[str, Any]] = []
    for d in docs:
        # Hard filters
        smax = d.get("salary_max") or 0
        smin_j = d.get("salary_min") or 0
        job_sal = max(smax, smin_j)
        if min_salary > 0 and job_sal:
            if job_sal < min_salary:
                continue
        elif min_salary > 0 and not include_no_salary and not job_sal:
            continue
        # Excluded keywords
        blob = (d.get("job_title", "") + " " + d.get("employer", "") + " " +
                (d.get("job_description_text", "") or "")[:500]).lower()
        if any(x in blob for x in excluded):
            continue
        # Sector filter
        et = d.get("employer_type", "private_sector")
        if enabled_sector_ids and et not in enabled_sector_ids and et != "private_sector":
            # still allow but downweight — private_sector isn't in DEFAULT enabled unless user set it
            pass

        # Factor values (all in [0, 1])
        score = ((d.get("match_scores") or {}).get(rid) or {})
        overall = score.get("overall_match_score", 0)
        f_match = overall / 100.0
        f_salary = _normalize(job_sal, 40000, 250000) if job_sal else 0.3
        f_employer_reputation = 0.9 if et in ("federal_government", "international_org") else \
                                0.7 if et in ("higher_education", "nonprofit") else 0.5
        days = d.get("days_since_posted") or 30
        f_posted = _normalize(30 - min(days, 30), 0, 30)
        f_location = 0.3
        job_loc = (d.get("location") or "").lower()
        job_lat = d.get("lat") or 0.0
        job_lng = d.get("lng") or 0.0
        # New v2 matching: radius + type + admin1
        best_prio_val = 0.0
        for loc in locations_v2:
            if loc.get("is_special"):
                continue
            lbl = (loc.get("label") or "").lower()
            prio = prio_val.get(loc.get("priority", "low"), 0.3)
            ltype = loc.get("type", "")
            matched = False
            # Radius match for city/zip when we have coordinates
            if ltype in ("city", "zip") and job_lat and job_lng and loc.get("lat") and loc.get("lng"):
                try:
                    from geo_data import haversine_miles  # local import
                    dist = haversine_miles(job_lat, job_lng, loc["lat"], loc["lng"])
                    if dist <= max(5, int(loc.get("radius_miles") or 25)):
                        matched = True
                except Exception:
                    pass
            # Label substring fallback (job_loc string match)
            if not matched and lbl and any(part.strip() and part.strip() in job_loc
                                           for part in lbl.split(",")):
                matched = True
            # Country / state / region: match code or name
            if not matched and ltype in ("country", "state", "region"):
                cc = (loc.get("country_code") or "").lower()
                a1 = (loc.get("admin1") or "").lower()
                if cc and cc in job_loc:
                    matched = True
                elif a1 and a1 in job_loc:
                    matched = True
                elif "southeast usa" in lbl and any(s in job_loc for s in
                                                    ("ga", "fl", "al", "tn", "sc", "nc",
                                                     "georgia", "florida", "alabama",
                                                     "tennessee", "carolina")):
                    matched = True
            if matched and prio > best_prio_val:
                best_prio_val = prio
        # Special entries
        loc_type_lower = (d.get("location_type") or "").lower()
        if has_special_remote and loc_type_lower == "remote":
            best_prio_val = max(best_prio_val, prio_val.get("high", 0.85))
        if has_special_intl and ("international" in job_loc or "various" in job_loc
                                 or loc_type_lower == "international"):
            best_prio_val = max(best_prio_val, prio_val.get("high", 0.85))
        if has_special_flexible and ("flexible" in job_loc or "negotiable" in job_loc):
            best_prio_val = max(best_prio_val, prio_val.get("high", 0.85))
        # Legacy fallback (string labels only)
        if best_prio_val == 0.0:
            for lbl in location_labels:
                if lbl and (lbl in job_loc or any(w in job_loc for w in lbl.split())):
                    best_prio_val = prio_val.get(location_prio.get(lbl, "low"), 0.3)
                    break
        f_location = best_prio_val if best_prio_val > 0 else 0.3
        outside_preferences = best_prio_val == 0.0
        if loc_type_lower == "remote" and "remote (work from anywhere)" in location_labels:
            f_location = max(f_location, prio_val.get(
                location_prio.get("remote (work from anywhere)", "low"), 0.3))
            outside_preferences = False
        f_work_type = 1.0 if d.get("location_type") in work_types else 0.3
        f_sector = prio_val.get(sector_priority.get(et, "low"), 0.3)
        emp_low = (d.get("employer") or "").lower()
        watch_hit = None
        for w_name, w_prio in watch_names.items():
            if w_name and (w_name in emp_low or emp_low in w_name):
                watch_hit = w_prio
                break
        f_watch = prio_val.get(watch_hit, 0.0) if watch_hit else 0.0
        f_deadline = 0.5  # deadline data not always present
        f_early = 1.0 if d.get("early_posting_flag") else 0.0

        # Composite
        rank_score = (
            f_match * weights.get("match_score", 10) +
            f_salary * weights.get("salary", 8) +
            f_employer_reputation * weights.get("employer_reputation", 8) +
            f_posted * weights.get("posted_date", 7) +
            f_location * weights.get("location_match", 7) +
            f_work_type * weights.get("work_type", 6) +
            f_sector * weights.get("sector_priority", 9) +
            f_watch * weights.get("watch_list", 10) +
            f_deadline * weights.get("deadline_urgency", 5) +
            f_early * weights.get("early_posting", 6)
        )
        d["rank_score"] = round(rank_score, 2)
        d["watch_list_hit"] = bool(watch_hit)
        d["watch_list_priority"] = watch_hit
        d["location_outside_preferences"] = outside_preferences
        d["rank_breakdown"] = {
            "match": round(f_match * weights.get("match_score", 10), 1),
            "salary": round(f_salary * weights.get("salary", 8), 1),
            "employer": round(f_employer_reputation * weights.get("employer_reputation", 8), 1),
            "posted": round(f_posted * weights.get("posted_date", 7), 1),
            "location": round(f_location * weights.get("location_match", 7), 1),
            "work_type": round(f_work_type * weights.get("work_type", 6), 1),
            "sector": round(f_sector * weights.get("sector_priority", 9), 1),
            "watch": round(f_watch * weights.get("watch_list", 10), 1),
            "early": round(f_early * weights.get("early_posting", 6), 1),
        }
        ranked.append(d)

    ranked.sort(key=lambda j: -j["rank_score"])
    for i, j in enumerate(ranked, 1):
        j["rank_position"] = i
        # Persist rank
        await db.jobs_feed.update_one(
            {"job_id": j["job_id"]},
            {"$set": {"rank_score": j["rank_score"], "rank_position": i,
                      "watch_list_hit": j["watch_list_hit"],
                      "location_outside_preferences": j.get("location_outside_preferences", False),
                      "rank_breakdown": j["rank_breakdown"]}},
        )

    return {"ranked_count": len(ranked), "total_feed": len(docs)}


# ============================================================
# Router
# ============================================================
def make_router(db, get_current_user_id):
    r = APIRouter(prefix="/api/career/preferences", tags=["career-preferences"])

    # ---------------- Profiles ----------------
    async def _ensure_seed_profiles(user_id: str):
        count = await db.job_filter_profiles.count_documents({"user_id": user_id})
        if count == 0:
            for p in PRESEED_PROFILES:
                await db.job_filter_profiles.insert_one({
                    **p, "user_id": user_id,
                    "profile_id": f"prof_{uuid.uuid4().hex[:10]}",
                    "created_at": _now_iso(), "last_modified": _now_iso(),
                    "last_applied": _now_iso() if p.get("is_active") else None,
                })
            return
        # Migration: upgrade legacy string-labeled locations to full location objects
        docs = await db.job_filter_profiles.find(
            {"user_id": user_id}, {"_id": 0, "profile_id": 1, "locations": 1}
        ).to_list(50)
        for d in docs:
            locs = d.get("locations") or []
            # Detect legacy: no "id" field OR missing new schema fields
            needs_migration = any(
                not isinstance(loc, dict) or "id" not in loc or "work_type_override" not in loc
                for loc in locs
            )
            if not needs_migration:
                continue
            # Replace with fresh seed of new DEFAULT_LOCATIONS
            await db.job_filter_profiles.update_one(
                {"user_id": user_id, "profile_id": d["profile_id"]},
                {"$set": {"locations": [dict(x) for x in DEFAULT_LOCATIONS],
                          "last_modified": _now_iso()}},
            )

    @r.get("/profiles")
    async def list_profiles(user_id: str = Depends(get_current_user_id)):
        await _ensure_seed_profiles(user_id)
        docs = await db.job_filter_profiles.find(
            {"user_id": user_id}, {"_id": 0}
        ).to_list(50)
        docs.sort(key=lambda d: (not d.get("is_active"), d.get("profile_name") or ""))
        return {"profiles": docs}

    @r.post("/profiles", status_code=201)
    async def create_profile(body: ProfileBody,
                             user_id: str = Depends(get_current_user_id)):
        pid = f"prof_{uuid.uuid4().hex[:10]}"
        doc = {**body.model_dump(), "profile_id": pid, "user_id": user_id,
               "is_active": False,
               "created_at": _now_iso(), "last_modified": _now_iso()}
        await db.job_filter_profiles.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @r.put("/profiles/{profile_id}")
    async def update_profile(profile_id: str, body: ProfileBody,
                             user_id: str = Depends(get_current_user_id)):
        update = {**body.model_dump(), "last_modified": _now_iso()}
        res = await db.job_filter_profiles.update_one(
            {"user_id": user_id, "profile_id": profile_id}, {"$set": update}
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Profile not found")
        return {"ok": True}

    @r.delete("/profiles/{profile_id}")
    async def delete_profile(profile_id: str,
                             user_id: str = Depends(get_current_user_id)):
        doc = await db.job_filter_profiles.find_one(
            {"user_id": user_id, "profile_id": profile_id}
        )
        if not doc:
            raise HTTPException(404, "Profile not found")
        if doc.get("is_active"):
            raise HTTPException(400, "Cannot delete active profile — activate another first")
        await db.job_filter_profiles.delete_one(
            {"user_id": user_id, "profile_id": profile_id}
        )
        return {"ok": True}

    @r.post("/profiles/{profile_id}/apply")
    async def apply_profile(profile_id: str,
                            user_id: str = Depends(get_current_user_id)):
        doc = await db.job_filter_profiles.find_one(
            {"user_id": user_id, "profile_id": profile_id}, {"_id": 0}
        )
        if not doc:
            raise HTTPException(404, "Profile not found")
        # Deactivate others, activate this
        await db.job_filter_profiles.update_many(
            {"user_id": user_id, "is_active": True}, {"$set": {"is_active": False}}
        )
        await db.job_filter_profiles.update_one(
            {"user_id": user_id, "profile_id": profile_id},
            {"$set": {"is_active": True, "last_applied": _now_iso()}}
        )
        # Trigger ranking
        result = await rank_jobs(db, user_id, doc)
        return {"ok": True, "profile_name": doc["profile_name"], **result}

    @r.get("/profiles/active")
    async def active_profile(user_id: str = Depends(get_current_user_id)):
        await _ensure_seed_profiles(user_id)
        doc = await db.job_filter_profiles.find_one(
            {"user_id": user_id, "is_active": True}, {"_id": 0}
        )
        if not doc:
            doc = await db.job_filter_profiles.find_one(
                {"user_id": user_id}, {"_id": 0}
            )
        return doc or {}

    # ---------------- Watch list employers ----------------
    async def _ensure_seed_employers(user_id: str):
        count = await db.target_employers.count_documents({"user_id": user_id})
        if count == 0:
            for e in SEED_EMPLOYERS:
                await db.target_employers.insert_one({
                    **e, "user_id": user_id,
                    "employer_id": f"emp_{uuid.uuid4().hex[:10]}",
                    "created_at": _now_iso(),
                })

    @r.get("/watch-list")
    async def list_watch(user_id: str = Depends(get_current_user_id)):
        await _ensure_seed_employers(user_id)
        docs = await db.target_employers.find(
            {"user_id": user_id}, {"_id": 0}
        ).to_list(200)
        prio_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        docs.sort(key=lambda d: (prio_order.get(d.get("priority", "low"), 3),
                                 d.get("name", "")))
        # Live active jobs count per employer (fuzzy match)
        for d in docs:
            name_low = (d["name"] or "").lower()
            n = await db.jobs_feed.count_documents({
                "is_active": True, "apply_url_verified": True,
                "employer": {"$regex": name_low[:20], "$options": "i"},
            })
            d["active_jobs_count"] = n
        return {"employers": docs}

    @r.post("/watch-list", status_code=201)
    async def add_watch(body: EmployerBody,
                        user_id: str = Depends(get_current_user_id)):
        eid = f"emp_{uuid.uuid4().hex[:10]}"
        doc = {**body.model_dump(), "employer_id": eid,
               "user_id": user_id, "created_at": _now_iso()}
        await db.target_employers.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @r.put("/watch-list/{employer_id}")
    async def update_watch(employer_id: str, body: EmployerBody,
                           user_id: str = Depends(get_current_user_id)):
        res = await db.target_employers.update_one(
            {"user_id": user_id, "employer_id": employer_id},
            {"$set": body.model_dump()}
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Employer not found")
        return {"ok": True}

    @r.delete("/watch-list/{employer_id}")
    async def delete_watch(employer_id: str,
                           user_id: str = Depends(get_current_user_id)):
        res = await db.target_employers.delete_one(
            {"user_id": user_id, "employer_id": employer_id}
        )
        if res.deleted_count == 0:
            raise HTTPException(404, "Employer not found")
        return {"ok": True}

    # ---------------- Sources config ----------------
    async def _ensure_seed_sources(user_id: str):
        count = await db.job_sources.count_documents({"user_id": user_id})
        if count == 0:
            for s in SEED_SOURCES:
                await db.job_sources.insert_one({
                    **s, "user_id": user_id,
                    "last_run_at": None, "last_result": None,
                    "created_at": _now_iso(),
                })

    @r.get("/sources")
    async def list_sources(user_id: str = Depends(get_current_user_id)):
        await _ensure_seed_sources(user_id)
        docs = await db.job_sources.find(
            {"user_id": user_id}, {"_id": 0}
        ).to_list(50)
        # Contribution counts
        import re as _re
        for d in docs:
            label = (d.get("label") or d.get("source_id") or "")[:12]
            pattern = _re.escape(label.split(" ")[0])
            n = await db.jobs_feed.count_documents({
                "is_active": True, "source": {"$regex": pattern, "$options": "i"},
            })
            d["contribution_count"] = n
        docs.sort(key=lambda x: (not x.get("operational"), x.get("label", "")))
        return {"sources": docs}

    @r.put("/sources/{source_id}")
    async def update_source(source_id: str, body: SourceUpdateBody,
                            user_id: str = Depends(get_current_user_id)):
        update: Dict[str, Any] = {}
        if body.update_frequency_min is not None:
            update["update_frequency_min"] = body.update_frequency_min
        if body.paused is not None:
            update["paused"] = body.paused
        if not update:
            raise HTTPException(400, "No fields to update")
        res = await db.job_sources.update_one(
            {"user_id": user_id, "source_id": source_id}, {"$set": update}
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Source not found")
        return {"ok": True}

    @r.get("/activity-log")
    async def activity_log(user_id: str = Depends(get_current_user_id)):
        docs = await db.job_intel_runs.find(
            {"user_id": user_id}, {"_id": 0}
        ).sort("ran_at", -1).limit(50).to_list(50)
        return {"log": docs}

    # ================================================================
    # GEO — Location autocomplete + Country reference
    # ================================================================
    from geo_data import (  # noqa: E402  (local import to keep module cohesive)
        COUNTRIES, REGION_LABELS, REGION_ORDER, group_countries, local_fuzzy_search,
    )
    import os  # noqa: E402
    import httpx  # noqa: E402

    GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

    @r.get("/geo/countries")
    async def geo_countries(user_id: str = Depends(get_current_user_id)):
        """Return all countries grouped by region."""
        _ = user_id  # auth-only
        return {
            "regions": REGION_ORDER,
            "region_labels": REGION_LABELS,
            "groups": group_countries(),
            "total": len(COUNTRIES),
        }

    @r.post("/geo/autocomplete")
    async def geo_autocomplete(body: AutocompleteBody = Body(...),
                               user_id: str = Depends(get_current_user_id)):
        """Google Places Autocomplete proxy — returns country/state/city/zip
        suggestions with structured metadata."""
        _ = user_id
        q = body.query.strip()
        if not q:
            return {"predictions": []}
        preds: List[Dict[str, Any]] = []
        google_error: Optional[str] = None
        # ---- Attempt 1: Google Places legacy autocomplete ----
        if GOOGLE_MAPS_API_KEY:
            url = "https://maps.googleapis.com/maps/api/place/autocomplete/json"
            params = {"input": q, "types": "geocode", "key": GOOGLE_MAPS_API_KEY}
            if body.session_token:
                params["sessiontoken"] = body.session_token
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(url, params=params)
                    data = resp.json()
                status = data.get("status", "")
                if status == "OK":
                    for p in data.get("predictions", []) or []:
                        types_list = p.get("types") or []
                        entry_type = "city"
                        if "country" in types_list:
                            entry_type = "country"
                        elif ("administrative_area_level_1" in types_list
                              or "administrative_area_level_2" in types_list) and "locality" not in types_list:
                            entry_type = "state"
                        elif "postal_code" in types_list:
                            entry_type = "zip"
                        elif "locality" in types_list:
                            entry_type = "city"
                        struct = p.get("structured_formatting") or {}
                        preds.append({
                            "place_id": p.get("place_id", ""),
                            "text": p.get("description", ""),
                            "main_text": struct.get("main_text", ""),
                            "secondary_text": struct.get("secondary_text", ""),
                            "types": types_list,
                            "entry_type": entry_type,
                            "source": "google",
                        })
                elif status not in ("ZERO_RESULTS",):
                    google_error = data.get("error_message") or status
                    logger.info("Google Places status=%s falling back to OSM", status)
            except Exception as e:
                google_error = str(e)
                logger.warning("Places autocomplete failed: %s", e)
        # ---- Fallback: Nominatim (OpenStreetMap) — free, no key required ----
        if not preds:
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(
                        "https://nominatim.openstreetmap.org/search",
                        params={
                            "q": q, "format": "json", "addressdetails": 1,
                            "limit": 10,
                        },
                        headers={"User-Agent": "PLOS-Career/1.0 (personal-life-os)"},
                    )
                    resp.raise_for_status()
                    items = resp.json() or []
                for it in items:
                    addr = it.get("address") or {}
                    otype = it.get("type") or it.get("class") or ""
                    entry_type = "city"
                    if otype in ("country",):
                        entry_type = "country"
                    elif otype in ("state", "region", "administrative"):
                        entry_type = "state"
                    elif otype in ("postcode",):
                        entry_type = "zip"
                    elif otype in ("city", "town", "village", "hamlet", "municipality"):
                        entry_type = "city"
                    # main_text / secondary_text approximations
                    main_text = (
                        addr.get("city") or addr.get("town") or addr.get("village")
                        or addr.get("state") or addr.get("country") or it.get("name") or ""
                    ) or it.get("display_name", "").split(",")[0]
                    display = it.get("display_name") or ""
                    secondary_text = ", ".join(display.split(",")[1:4]).strip()
                    preds.append({
                        "place_id": f"osm:{it.get('osm_type','')}:{it.get('osm_id','')}",
                        "text": display,
                        "main_text": main_text,
                        "secondary_text": secondary_text,
                        "types": [otype] if otype else [],
                        "entry_type": entry_type,
                        "source": "osm",
                        # Extra data so /place-details can be skipped
                        "lat": float(it.get("lat", 0.0) or 0.0),
                        "lng": float(it.get("lon", 0.0) or 0.0),
                        "country_code": (addr.get("country_code") or "").upper(),
                        "country_name": addr.get("country") or "",
                        "admin1": addr.get("state") or "",
                        "city": (addr.get("city") or addr.get("town")
                                 or addr.get("village") or ""),
                        "zip": addr.get("postcode") or "",
                    })
            except Exception as e:
                logger.warning("OSM autocomplete failed: %s", e)
        # ---- Final fallback: local fuzzy search over countries + states + major cities ----
        if not preds:
            for entry in local_fuzzy_search(q, limit=12):
                preds.append(entry)
        return {
            "predictions": preds,
            "google_error": google_error,
            "used_source": (preds[0]["source"] if preds else None),
        }

    class PlaceDetailsBody_local(BaseModel):  # noqa: N801 - not used at runtime
        place_id: str
        session_token: Optional[str] = None
    del PlaceDetailsBody_local

    @r.post("/geo/place-details")
    async def geo_place_details(body: PlaceDetailsBody = Body(...),
                                user_id: str = Depends(get_current_user_id)):
        """Resolve a place_id → structured location fields (name, country,
        admin1, city, zip, lat, lng)."""
        _ = user_id
        if not GOOGLE_MAPS_API_KEY:
            raise HTTPException(503, "GOOGLE_MAPS_API_KEY not configured")
        url = f"https://places.googleapis.com/v1/places/{body.place_id}"
        headers = {
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask": (
                "id,displayName,formattedAddress,addressComponents,"
                "location,types,shortFormattedAddress"
            ),
        }
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()
        except Exception as e:
            logger.warning("Places details failed: %s", e)
            raise HTTPException(502, f"Places details failed: {e}") from e
        # Parse address components
        country_code = ""
        country_name = ""
        admin1 = ""
        city = ""
        zip_code = ""
        for comp in data.get("addressComponents", []) or []:
            comp_types = comp.get("types") or []
            long_text = comp.get("longText", "")
            short_text = comp.get("shortText", "")
            if "country" in comp_types:
                country_name = long_text
                country_code = short_text
            elif "administrative_area_level_1" in comp_types:
                admin1 = short_text or long_text
            elif "locality" in comp_types and not city:
                city = long_text
            elif "administrative_area_level_2" in comp_types and not city:
                city = long_text
            elif "postal_code" in comp_types:
                zip_code = long_text
        loc = data.get("location") or {}
        types_list = data.get("types") or []
        entry_type = "city"
        if "country" in types_list:
            entry_type = "country"
        elif "administrative_area_level_1" in types_list:
            entry_type = "state"
        elif "postal_code" in types_list:
            entry_type = "zip"
        display = (data.get("displayName") or {}).get("text") or data.get("formattedAddress") or ""
        return {
            "place_id": data.get("id", body.place_id),
            "label": data.get("formattedAddress") or display,
            "display_name": display,
            "entry_type": entry_type,
            "country_code": country_code,
            "country_name": country_name,
            "admin1": admin1,
            "city": city,
            "zip": zip_code,
            "lat": loc.get("latitude", 0.0),
            "lng": loc.get("longitude", 0.0),
        }

    # ---------------- Explicit re-rank endpoint ----------------
    @r.post("/rank/refresh")
    async def rank_refresh(user_id: str = Depends(get_current_user_id)):
        profile = await db.job_filter_profiles.find_one(
            {"user_id": user_id, "is_active": True}, {"_id": 0}
        )
        if not profile:
            profile = await db.job_filter_profiles.find_one(
                {"user_id": user_id}, {"_id": 0}
            )
        if not profile:
            await _ensure_seed_profiles(user_id)
            profile = await db.job_filter_profiles.find_one(
                {"user_id": user_id}, {"_id": 0}
            )
        result = await rank_jobs(db, user_id, profile)
        return {"profile_name": profile.get("profile_name"), **result}

    return r
