"""
PLOS — Insurance Quote Generation Engine (Sub-Phase A)

Endpoints:
  Quote Profile
    GET    /api/insurance/quote-profile           — fetch (with pre-fill fallback)
    PUT    /api/insurance/quote-profile           — save/update
    DELETE /api/insurance/quote-profile           — deletes profile + all history
  Quote Generation (PLOS AI Sonnet 4.5)
    POST   /api/insurance/quote                   — generate a single-insurer estimate
    POST   /api/insurance/quote/compare           — parallel quotes for all insurers
  Quote History
    GET    /api/insurance/quote-history           — list
    DELETE /api/insurance/quote-history/{qid}     — remove

Data Security TODO — Sub-Phase B roadmap:
  The following fields are considered sensitive and MUST be upgraded to
  per-field AES-256 encryption before the app reaches 1,000 real users:
    personal_details.date_of_birth
    personal_details.credit_score_range
    vehicles[*].vin
    home_details.home_value
    home_details.rebuild_cost
    drivers[*].accidents_3yr
    drivers[*].violations_3yr
  For MVP, these are protected by:
    (1) MongoDB Atlas encryption-at-rest (enabled by default on M0+ tiers)
    (2) JWT authentication on every endpoint
    (3) user_id scoped queries — data is never accessible cross-user
    (4) PLOS never transmits this data to any third-party insurer
"""
from __future__ import annotations

import os
import json
import re
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from emergentintegrations.llm.chat import LlmChat, UserMessage

EMERGENT_LLM_KEY = os.getenv("EMERGENT_LLM_KEY", "")
CLAUDE_MODEL = "claude-sonnet-4-5-20250929"

logger = logging.getLogger(__name__)


# --------------------------- Models -----------------------------------
class PersonalDetails(BaseModel):
    full_name: Optional[str] = None
    date_of_birth: Optional[str] = None   # ISO date
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    credit_score_range: Optional[str] = None
    years_at_address: Optional[float] = None


class Location(BaseModel):
    home_address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    county: Optional[str] = None


class Vehicle(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    year: Optional[int] = None
    make: Optional[str] = None
    model: Optional[str] = None
    trim: Optional[str] = None
    vin: Optional[str] = None
    primary_use: Optional[str] = None
    annual_mileage: Optional[str] = None
    ownership_status: Optional[str] = None
    currently_insured: Optional[bool] = None
    current_insurer: Optional[str] = None


class Driver(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    full_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    license_status: Optional[str] = None
    years_licensed: Optional[int] = None
    accidents_3yr: Optional[str] = None
    violations_3yr: Optional[str] = None
    defensive_driving: Optional[bool] = None
    good_student: Optional[bool] = None


class HomeDetails(BaseModel):
    property_type: Optional[str] = None
    year_built: Optional[int] = None
    square_footage: Optional[int] = None
    stories: Optional[str] = None
    construction_type: Optional[str] = None
    roof_type: Optional[str] = None
    roof_age: Optional[int] = None
    home_value: Optional[float] = None
    rebuild_cost: Optional[float] = None
    mortgage_company: Optional[str] = None
    security_features: List[str] = []
    has_pool: Optional[bool] = None
    home_business: Optional[bool] = None
    claims_5yr: Optional[str] = None


class CoveragePreferences(BaseModel):
    auto: Dict[str, Any] = {}
    home: Dict[str, Any] = {}


class QuoteProfile(BaseModel):
    personal_details: PersonalDetails = PersonalDetails()
    location: Location = Location()
    vehicles: List[Vehicle] = []
    drivers: List[Driver] = []
    home_details: HomeDetails = HomeDetails()
    coverage_preferences: CoveragePreferences = CoveragePreferences()


class QuoteRequest(BaseModel):
    insurer_name: str
    insurance_type: str  # auto | home | bundle
    deal_id: Optional[str] = None  # references insurance_deals.id (for logo/URL reuse)


# --------------------------- Helpers ----------------------------------
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _completeness(profile: Dict[str, Any]) -> int:
    """0-100 based on how many meaningful fields are populated."""
    score = 0
    max_score = 0
    pd = profile.get("personal_details") or {}
    for k in ["full_name", "date_of_birth", "gender", "marital_status", "credit_score_range", "years_at_address"]:
        max_score += 4
        if pd.get(k) not in (None, "", []):
            score += 4
    loc = profile.get("location") or {}
    for k in ["home_address", "city", "state", "zip", "county"]:
        max_score += 3
        if loc.get(k):
            score += 3
    vehicles = profile.get("vehicles") or []
    max_score += 15
    if vehicles:
        # Weighted by average vehicle completeness
        vsum = 0
        vitems = 0
        for v in vehicles:
            vfields = ["year", "make", "model", "primary_use", "annual_mileage", "ownership_status"]
            for k in vfields:
                vitems += 1
                if v.get(k) not in (None, "", []):
                    vsum += 1
        if vitems > 0:
            score += int(15 * (vsum / vitems))
    drivers = profile.get("drivers") or []
    max_score += 10
    if drivers:
        dsum = 0
        ditems = 0
        for d in drivers:
            dfields = ["full_name", "date_of_birth", "license_status", "years_licensed", "accidents_3yr", "violations_3yr"]
            for k in dfields:
                ditems += 1
                if d.get(k) not in (None, "", []):
                    dsum += 1
        if ditems > 0:
            score += int(10 * (dsum / ditems))
    hd = profile.get("home_details") or {}
    for k in ["property_type", "year_built", "square_footage", "stories", "construction_type",
              "roof_type", "roof_age", "home_value", "rebuild_cost", "claims_5yr"]:
        max_score += 2
        if hd.get(k) not in (None, "", []):
            score += 2
    if max_score == 0:
        return 0
    return min(100, int(round((score / max_score) * 100)))


def _detect_missing(profile: Dict[str, Any]) -> List[Dict[str, str]]:
    """Return specific fields that are missing (with deep-link targets)."""
    missing: List[Dict[str, str]] = []
    pd = profile.get("personal_details") or {}
    if not pd.get("date_of_birth"):
        missing.append({"field": "date_of_birth", "section": "personal", "label": "Date of birth"})
    if not pd.get("credit_score_range"):
        missing.append({"field": "credit_score_range", "section": "personal", "label": "Credit score range"})
    if not pd.get("marital_status"):
        missing.append({"field": "marital_status", "section": "personal", "label": "Marital status"})
    hd = profile.get("home_details") or {}
    if not hd.get("roof_age"):
        missing.append({"field": "roof_age", "section": "home", "label": "Roof age"})
    if not hd.get("year_built"):
        missing.append({"field": "year_built", "section": "home", "label": "Year built"})
    if not hd.get("square_footage"):
        missing.append({"field": "square_footage", "section": "home", "label": "Square footage"})
    drivers = profile.get("drivers") or []
    if not drivers:
        missing.append({"field": "drivers", "section": "drivers", "label": "Add a driver"})
    else:
        d0 = drivers[0]
        if not d0.get("years_licensed"):
            missing.append({"field": "years_licensed", "section": "drivers", "label": "Years licensed"})
    return missing[:4]


async def _prefill_from_plos(db, user_id: str) -> QuoteProfile:
    """Populate a fresh QuoteProfile using existing PLOS data."""
    profile = await db.user_profile.find_one({"user_id": user_id}) or {}
    q = QuoteProfile()
    q.personal_details.full_name = profile.get("full_name")
    home = profile.get("home_address") or "6127 Ada St, Stone Mountain, GA 30083"
    # Simple address parse
    q.location.home_address = home
    zip_match = re.search(r"\b(\d{5})\b", home)
    q.location.zip = zip_match.group(1) if zip_match else "30083"
    if "stone mountain" in home.lower():
        q.location.city = "Stone Mountain"
        q.location.county = "DeKalb County"
    q.location.state = "GA"

    # Pull vehicle assets (2019 Toyota RAV4)
    async for a in db.assets.find({"user_id": user_id, "type": "vehicle"}, {"_id": 0}):
        v = Vehicle(
            year=a.get("year") or 2019,
            make=a.get("make") or "Toyota",
            model=a.get("model") or "RAV4",
            primary_use="Commuting",
            annual_mileage="10,000-15,000",
            ownership_status="Owned outright",
        )
        q.vehicles.append(v)
    # Default vehicle for Moses if nothing found
    if not q.vehicles:
        q.vehicles.append(Vehicle(
            year=2019, make="Toyota", model="RAV4",
            primary_use="Commuting", annual_mileage="10,000-15,000",
            ownership_status="Owned outright", currently_insured=False,
        ))

    # Default driver = the user themselves
    q.drivers.append(Driver(
        full_name=q.personal_details.full_name or "PLOS User",
        license_status="Licensed",
        accidents_3yr="None",
        violations_3yr="None",
        defensive_driving=False,
    ))

    # Home defaults (Stone Mountain average)
    q.home_details.home_value = 285000
    q.home_details.rebuild_cost = 228000  # ~80%
    q.home_details.property_type = "Single family home"

    # Default coverage preferences
    q.coverage_preferences.auto = {
        "liability_limits": "100/300/100",
        "deductible_collision": 500,
        "deductible_comprehensive": 500,
        "uninsured_motorist": True,
        "roadside_assistance": True,
        "rental_reimbursement": False,
        "gap_insurance": False,
    }
    q.coverage_preferences.home = {
        "dwelling_coverage": 228000,
        "personal_property": 100000,
        "liability_coverage": 300000,
        "deductible": 1000,
        "flood_insurance": False,
        "earthquake_coverage": False,
        "scheduled_personal_property": False,
    }
    return q


def _prefill_flags(profile: Dict[str, Any]) -> Dict[str, bool]:
    """Return which fields have been auto-populated so UI can badge them."""
    flags: Dict[str, bool] = {}
    pd = profile.get("personal_details") or {}
    if pd.get("full_name"):
        flags["full_name"] = True
    loc = profile.get("location") or {}
    for k in ["home_address", "city", "state", "zip", "county"]:
        if loc.get(k):
            flags[f"location.{k}"] = True
    if profile.get("vehicles"):
        flags["vehicles"] = True
    if profile.get("drivers"):
        flags["drivers"] = True
    hd = profile.get("home_details") or {}
    if hd.get("home_value"):
        flags["home_value"] = True
    return flags


# --------------------------- PLOS AI quote engine ----------------------
_SYSTEM_QUOTE = (
    "You are an expert insurance analyst with deep knowledge of Georgia insurance markets, "
    "state regulations, rating factors, and pricing algorithms used by major US insurers. "
    "You have access to current 2026 Georgia insurance rate data and understand how each "
    "rating factor impacts premiums.\n\n"
    "Generate a REALISTIC estimated quote range using the actual rating factors provided. "
    "Do not give a generic range — use the profile data to calculate a reasonable estimate. "
    "Clearly state which factors are driving the estimate up or down. Always include a "
    "disclaimer that this is an AI estimate and the actual quote from the insurer may vary.\n\n"
    "Return ONLY a valid JSON object matching the exact schema requested (no markdown, no "
    "code fences, no prose outside the JSON)."
)


_QUOTE_JSON_SCHEMA = """{
  "estimated_monthly_low": number,
  "estimated_monthly_high": number,
  "estimated_annual_low": number,
  "estimated_annual_high": number,
  "confidence_level": "low|medium|high",
  "key_factors_increasing_premium": [strings],
  "key_factors_decreasing_premium": [strings],
  "potential_discounts_available": [ {"name": string, "estimated_monthly_savings": number} ],
  "coverage_summary": [strings],
  "recommendation": string,
  "accuracy_note": string,
  "georgia_specific_factors": [strings]
}"""


def _fallback_quote(profile: Dict[str, Any], insurer: str, insurance_type: str, base_rate: float) -> Dict[str, Any]:
    """Deterministic fallback when PLOS AI is unavailable — approximate ±15%."""
    pd = profile.get("personal_details") or {}
    credit = (pd.get("credit_score_range") or "").lower()
    accidents = (profile.get("drivers", [{}])[0] or {}).get("accidents_3yr", "None")
    low_mult = 0.85
    high_mult = 1.15
    incr, decr = [], []
    if "poor" in credit:
        low_mult += 0.10
        high_mult += 0.20
        incr.append("Credit score below 650 typically increases GA auto premium 10-20%")
    elif "excellent" in credit:
        low_mult -= 0.05
        high_mult -= 0.05
        decr.append("Excellent credit (750+) qualifies for lowest tier pricing")
    if accidents and accidents != "None":
        incr.append(f"Accident history in last 3 years increases premium")
    else:
        decr.append("Clean driving record over 3 years")
    if profile.get("home_details", {}).get("security_features"):
        decr.append("Home security features qualify for protective-device discount")
    if len(profile.get("vehicles") or []) > 1:
        decr.append("Multi-car household qualifies for multi-car discount")

    low = round(base_rate * low_mult, 2)
    high = round(base_rate * high_mult, 2)
    return {
        "estimated_monthly_low": low,
        "estimated_monthly_high": high,
        "estimated_annual_low": round(low * 12, 2),
        "estimated_annual_high": round(high * 12, 2),
        "confidence_level": "low",
        "key_factors_increasing_premium": incr or ["Standard Georgia risk pool factors"],
        "key_factors_decreasing_premium": decr or ["Verified insurer with strong financial strength"],
        "potential_discounts_available": [
            {"name": "Bundle discount", "estimated_monthly_savings": round(high * 0.10, 2)},
            {"name": "Good driver discount", "estimated_monthly_savings": round(high * 0.08, 2)},
        ],
        "coverage_summary": [
            "Liability coverage",
            "Collision & comprehensive",
            "Roadside assistance",
        ] if insurance_type == "auto" else [
            "Dwelling protection",
            "Personal property",
            "Personal liability",
            "Additional living expenses",
        ],
        "recommendation": f"Based on your profile, {insurer} offers competitive rates in Georgia — request their official quote for exact pricing.",
        "accuracy_note": "Fallback estimate (AI unavailable). Complete more profile fields for higher accuracy.",
        "georgia_specific_factors": [
            "Georgia requires minimum 25/50/25 liability by law",
            "DeKalb County has above-average auto theft rates affecting comprehensive premium",
            "Georgia bans credit score as sole rating factor for auto insurance",
        ],
    }


async def _call_claude_quote(session_id: str, profile: Dict[str, Any],
                             insurer: str, insurance_type: str,
                             deal: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    prompt = (
        f"The user is requesting an insurance quote estimate for {insurer}.\n\n"
        f"Insurer: {insurer}\n"
        f"Insurance type: {insurance_type}\n"
        f"Reference published rate (starting): "
        f"${deal.get('monthly_rate_from') if deal else 'unknown'}/mo\n\n"
        f"User profile JSON:\n{json.dumps(profile, default=str)}\n\n"
        f"Return JSON matching this schema exactly:\n{_QUOTE_JSON_SCHEMA}"
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=_SYSTEM_QUOTE,
    ).with_model("anthropic", CLAUDE_MODEL)
    resp = await chat.send_message(UserMessage(text=prompt))
    text = (resp or "").strip()
    # Strip potential markdown fences
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"```\s*$", "", text, flags=re.IGNORECASE)
    text = text.strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        # Try extracting first JSON block
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            raise ValueError(f"PLOS AI returned non-JSON: {text[:180]}")
        parsed = json.loads(m.group(0))
    return parsed


# --------------------------- Router factory ---------------------------
def make_quotes_router(db, get_current_user_id):
    router = APIRouter(prefix="/api/insurance", tags=["insurance-quotes"])

    async def _log_usage(user_id: str, insurer: str, insurance_type: str, ok: bool, err: Optional[str] = None):
        try:
            await db.ai_usage_log.insert_one({
                "user_id": user_id,
                "task_type": "insurance_quote_generation",
                "insurer": insurer,
                "insurance_type": insurance_type,
                "model": CLAUDE_MODEL,
                "success": ok,
                "error": err,
                "created_at": _now(),
            })
        except Exception:
            pass

    # ---------------- Quote Profile ----------------
    @router.get("/quote-profile")
    async def get_profile(user_id: str = Depends(get_current_user_id)):
        doc = await db.quote_profiles.find_one({"user_id": user_id}, {"_id": 0, "user_id": 0})
        if not doc:
            # Return prefilled defaults without persisting
            q = await _prefill_from_plos(db, user_id)
            profile = q.model_dump()
            flags = _prefill_flags(profile)
            return {
                "profile": profile,
                "prefilled_fields": flags,
                "profile_completeness": _completeness(profile),
                "missing_important": _detect_missing(profile),
                "exists": False,
            }
        # Existing profile
        return {
            "profile": doc,
            "prefilled_fields": {},
            "profile_completeness": doc.get("profile_completeness", _completeness(doc)),
            "missing_important": _detect_missing(doc),
            "exists": True,
        }

    @router.put("/quote-profile")
    async def save_profile(body: QuoteProfile, user_id: str = Depends(get_current_user_id)):
        data = body.model_dump()
        data["profile_completeness"] = _completeness(data)
        data["last_updated"] = _now()
        existing = await db.quote_profiles.find_one({"user_id": user_id}, {"created_at": 1})
        if existing:
            await db.quote_profiles.update_one({"user_id": user_id}, {"$set": data})
        else:
            data["user_id"] = user_id
            data["created_at"] = _now()
            await db.quote_profiles.insert_one(data)
        return {"ok": True, "profile_completeness": data["profile_completeness"]}

    @router.delete("/quote-profile")
    async def delete_profile(user_id: str = Depends(get_current_user_id)):
        pres = await db.quote_profiles.delete_many({"user_id": user_id})
        hres = await db.quote_history.delete_many({"user_id": user_id})
        return {
            "ok": True,
            "profiles_removed": pres.deleted_count,
            "quotes_removed": hres.deleted_count,
        }

    # ---------------- Quote Generation ----------------
    async def _load_effective_profile(user_id: str) -> Dict[str, Any]:
        doc = await db.quote_profiles.find_one({"user_id": user_id}, {"_id": 0, "user_id": 0})
        if doc:
            return doc
        q = await _prefill_from_plos(db, user_id)
        return q.model_dump()

    async def _generate_one(user_id: str, insurer: str, insurance_type: str,
                            deal_id: Optional[str], profile: Dict[str, Any]) -> Dict[str, Any]:
        deal = None
        if deal_id:
            deal = await db.insurance_deals.find_one({"id": deal_id}, {"_id": 0})
        else:
            # Try to find the deal by insurer name + type
            deal = await db.insurance_deals.find_one(
                {"company_name": insurer, "insurance_type": insurance_type},
                {"_id": 0},
            )
        base_rate = (deal or {}).get("monthly_rate_from", 100.0)
        session_id = f"quote-{user_id}-{uuid.uuid4()}"
        try:
            if not EMERGENT_LLM_KEY:
                raise RuntimeError("EMERGENT_LLM_KEY missing")
            parsed = await _call_claude_quote(session_id, profile, insurer, insurance_type, deal)
            asyncio.create_task(_log_usage(user_id, insurer, insurance_type, True))
        except Exception as e:
            logger.warning(f"[quotes] PLOS AI quote failed for {insurer}: {e}")
            parsed = _fallback_quote(profile, insurer, insurance_type, base_rate)
            asyncio.create_task(_log_usage(user_id, insurer, insurance_type, False, str(e)[:180]))

        # Persist to history
        qid = str(uuid.uuid4())
        completeness = _completeness(profile)
        history = {
            "id": qid,
            "user_id": user_id,
            "insurer_name": insurer,
            "insurance_type": insurance_type,
            "deal_id": deal.get("id") if deal else None,
            "estimated_monthly_low": parsed.get("estimated_monthly_low"),
            "estimated_monthly_high": parsed.get("estimated_monthly_high"),
            "confidence_level": parsed.get("confidence_level"),
            "profile_completeness": completeness,
            "generated_at": _now(),
            "profile_snapshot": profile,
            "quote_data": parsed,
            "deal_snapshot": {
                "company_short": (deal or {}).get("company_short"),
                "logo_color": (deal or {}).get("logo_color"),
                "am_best_rating": (deal or {}).get("am_best_rating"),
                "trust_score": (deal or {}).get("trust_score"),
                "quote_url": (deal or {}).get("quote_url"),
                "phone_display": (deal or {}).get("phone_display"),
                "phone_number": (deal or {}).get("phone_number"),
            } if deal else None,
        }
        try:
            await db.quote_history.insert_one(history)
        except Exception as e:
            logger.warning(f"[quotes] history insert failed: {e}")

        return {
            "quote_id": qid,
            "insurer_name": insurer,
            "insurance_type": insurance_type,
            "profile_completeness": completeness,
            "missing_important": _detect_missing(profile),
            "generated_at": history["generated_at"],
            "quote": parsed,
            "deal": deal,
        }

    @router.post("/quote")
    async def generate_quote(body: QuoteRequest, user_id: str = Depends(get_current_user_id)):
        profile = await _load_effective_profile(user_id)
        return await _generate_one(user_id, body.insurer_name, body.insurance_type, body.deal_id, profile)

    @router.post("/quote/compare")
    async def compare_all(insurance_type: str = "auto", user_id: str = Depends(get_current_user_id)):
        if insurance_type not in ("auto", "home", "bundle"):
            raise HTTPException(status_code=400, detail="insurance_type must be auto|home|bundle")
        deals = [d async for d in db.insurance_deals.find(
            {"insurance_type": insurance_type, "is_active": True, "trust_score": {"$gte": 70}},
            {"_id": 0},
        )]
        if not deals:
            return {"insurance_type": insurance_type, "results": [], "summary": {}}
        profile = await _load_effective_profile(user_id)
        # Generate in parallel
        tasks = [
            _generate_one(user_id, d["company_name"], insurance_type, d["id"], profile)
            for d in deals
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        rows: List[Dict[str, Any]] = []
        for d, r in zip(deals, results):
            if isinstance(r, Exception):
                continue
            rows.append({
                "quote_id": r["quote_id"],
                "insurer_name": d["company_name"],
                "company_short": d["company_short"],
                "logo_color": d["logo_color"],
                "am_best_rating": d.get("am_best_rating"),
                "trust_score": d.get("trust_score", 0),
                "quote_url": d.get("quote_url"),
                "phone_display": d.get("phone_display"),
                "military_only": d.get("military_only", False),
                "monthly_low": r["quote"].get("estimated_monthly_low"),
                "monthly_high": r["quote"].get("estimated_monthly_high"),
                "annual_low": r["quote"].get("estimated_annual_low"),
                "annual_high": r["quote"].get("estimated_annual_high"),
                "confidence_level": r["quote"].get("confidence_level"),
                "deal_id": d["id"],
            })

        # Compute badges
        rating_order = {"A-": 1, "A": 2, "A+": 3, "A++": 4}
        rows.sort(key=lambda x: (x.get("monthly_low") or 999))
        best_price_idx = 0 if rows else None
        # Best rated: highest AM Best then trust
        best_rated_idx = max(
            range(len(rows)),
            key=lambda i: (rating_order.get((rows[i].get("am_best_rating") or "").upper(), 0),
                          rows[i].get("trust_score", 0)),
        ) if rows else None
        # Best value: (low rate weighted, trust, rating) — EXCLUDE the price winner
        # so the badge steers users to a distinct alternative option.
        def _score(r):
            price = r.get("monthly_low") or 999
            trust = r.get("trust_score") or 0
            rated = rating_order.get((r.get("am_best_rating") or "").upper(), 0)
            return - price + (trust * 0.4) + (rated * 5)
        price_winner_id = rows[best_price_idx]["quote_id"] if best_price_idx is not None else None
        rated_winner_id = rows[best_rated_idx]["quote_id"] if best_rated_idx is not None else None
        value_candidates = [i for i in range(len(rows)) if rows[i]["quote_id"] != price_winner_id]
        if value_candidates:
            best_value_idx = max(value_candidates, key=lambda i: _score(rows[i]))
        else:
            best_value_idx = None
        # If rated winner collides with price winner, pick next-best rated (also excluding value winner)
        value_winner_id = rows[best_value_idx]["quote_id"] if best_value_idx is not None else None
        if rated_winner_id in (price_winner_id, value_winner_id) and len(rows) > 2:
            rated_candidates = [i for i in range(len(rows))
                                if rows[i]["quote_id"] not in (price_winner_id, value_winner_id)]
            if rated_candidates:
                best_rated_idx = max(
                    rated_candidates,
                    key=lambda i: (rating_order.get((rows[i].get("am_best_rating") or "").upper(), 0),
                                  rows[i].get("trust_score", 0)),
                )
        summary = {
            "best_price_id": rows[best_price_idx]["quote_id"] if best_price_idx is not None else None,
            "best_rated_id": rows[best_rated_idx]["quote_id"] if best_rated_idx is not None else None,
            "best_value_id": rows[best_value_idx]["quote_id"] if best_value_idx is not None else None,
        }
        return {
            "insurance_type": insurance_type,
            "profile_completeness": _completeness(profile),
            "results": rows,
            "summary": summary,
        }

    # ---------------- Quote History ----------------
    @router.get("/quote-history")
    async def list_history(
        user_id: str = Depends(get_current_user_id),
        insurance_type: Optional[str] = None,
        limit: int = 50,
    ):
        q: Dict[str, Any] = {"user_id": user_id}
        if insurance_type:
            q["insurance_type"] = insurance_type
        items = [
            d async for d in db.quote_history.find(q, {"_id": 0, "user_id": 0})
            .sort("generated_at", -1)
            .limit(limit)
        ]
        return {"quotes": items, "count": len(items)}

    @router.get("/quote-history/{qid}")
    async def get_history(qid: str, user_id: str = Depends(get_current_user_id)):
        doc = await db.quote_history.find_one({"user_id": user_id, "id": qid}, {"_id": 0, "user_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Quote not found")
        return doc

    @router.delete("/quote-history/{qid}")
    async def delete_history(qid: str, user_id: str = Depends(get_current_user_id)):
        res = await db.quote_history.delete_one({"user_id": user_id, "id": qid})
        return {"ok": True, "removed": res.deleted_count}

    return router
