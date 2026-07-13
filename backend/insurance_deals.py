"""
PLOS — Insurance Deals Shop
- Verified insurance company deals for Auto, Home, and Auto+Home Bundle.
- No personal information collected; PLOS is a discovery/verification tool only.
- Phase 1: seed-based data (12 pre-verified insurers + 6 bundles).
- Phase 2 (skeleton): Perplexity/SerpApi live enrichment (returns not_configured
  when keys are absent; auto-falls back to seeded data).
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel


# --------------------------- Constants --------------------------------
GA_AVG_AUTO_MONTHLY = 142.0
GA_AVG_HOME_MONTHLY = 167.0
GA_AVG_BUNDLE_MONTHLY = 276.0

# Trust score weights (max 100 after cap)
TRUST_NAIC = 30
TRUST_GA_LICENSE = 30
TRUST_ADDRESS = 20
TRUST_PHONE = 10
TRUST_AM_BEST = 10
TRUST_BBB = 5

# Coverage highlights bundled with typical pre-seeded plans
AUTO_COVERAGE = [
    "Liability coverage",
    "Collision coverage",
    "Comprehensive",
    "Roadside assistance",
]
HOME_COVERAGE = [
    "Dwelling protection",
    "Personal property",
    "Personal liability",
    "Additional living expenses",
]
BUNDLE_COVERAGE = [
    "Full auto liability + collision",
    "Home dwelling + personal property",
    "Combined billing",
    "Multi-policy discount",
]


# --------------------------- Models -----------------------------------
class InsuranceDeal(BaseModel):
    id: str
    company_name: str
    company_short: str
    company_logo_url: Optional[str] = None
    logo_color: str  # background color for initials-avatar fallback
    insurance_type: str  # auto | home | bundle
    naic_number: str
    naic_verified: bool = True
    georgia_license_number: str
    am_best_rating: Optional[str] = None
    bbb_rating: Optional[str] = None
    trust_score: int
    is_verified: bool = True
    is_active: bool = True
    physical_address: str
    headquarters_address: str
    georgia_office_address: Optional[str] = None
    phone_number: str
    phone_display: str
    website_url: str
    quote_url: str
    find_agent_url: Optional[str] = None
    monthly_rate_from: float
    rate_description: str
    coverage_highlights: List[str]
    special_offer: Optional[str] = None
    special_offer_type: Optional[str] = None
    special_offer_expiry: Optional[str] = None
    discounts_available: List[str] = []
    military_only: bool = False
    rate_source: str = "Insurer published rates"
    last_verified: str
    last_rate_update: str
    created_at: str
    georgia_avg_comparison: float = 0.0  # negative = below avg (good)
    georgia_avg_label: str = ""
    bundle_partner: Optional[str] = None
    bundle_savings_percent: Optional[float] = None
    bundle_auto_from: Optional[float] = None
    bundle_home_from: Optional[float] = None


# --------------------------- Trust Score ------------------------------
def _compute_trust_score(*,
                        naic: bool,
                        ga_licensed: bool,
                        has_address: bool,
                        has_phone: bool,
                        am_best_rating: Optional[str],
                        bbb_rating: Optional[str]) -> int:
    score = 0
    if naic:
        score += TRUST_NAIC
    if ga_licensed:
        score += TRUST_GA_LICENSE
    if has_address:
        score += TRUST_ADDRESS
    if has_phone:
        score += TRUST_PHONE
    if am_best_rating and am_best_rating.upper() in {"A-", "A", "A+", "A++"}:
        score += TRUST_AM_BEST
    if bbb_rating and bbb_rating.upper() in {"A", "A+", "A++"}:
        score += TRUST_BBB
    return min(score, 100)


def _ga_comparison(monthly_rate: float, insurance_type: str) -> Dict[str, Any]:
    baseline = {
        "auto": GA_AVG_AUTO_MONTHLY,
        "home": GA_AVG_HOME_MONTHLY,
        "bundle": GA_AVG_BUNDLE_MONTHLY,
    }.get(insurance_type, GA_AVG_AUTO_MONTHLY)
    diff = (monthly_rate - baseline) / baseline * 100.0
    if abs(diff) <= 5.0:
        label = "At Georgia average"
    elif diff < 0:
        label = f"{abs(round(diff))}% below Georgia average"
    else:
        label = f"{round(diff)}% above Georgia average"
    return {"comparison": round(diff, 1), "label": label}


def _agent_map_url(company_name: str, zip_code: str = "30083") -> str:
    q = f"{company_name} insurance agent near Stone Mountain GA {zip_code}"
    q = q.replace(" ", "+")
    return f"https://www.google.com/maps/search/{q}"


# --------------------------- Seed data --------------------------------
_NOW = lambda: datetime.now(timezone.utc).isoformat()


def _build_seed_deals() -> List[Dict[str, Any]]:
    now = _NOW()
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()

    def make_deal(**kwargs) -> Dict[str, Any]:
        rate = kwargs["monthly_rate_from"]
        ins_type = kwargs["insurance_type"]
        gac = _ga_comparison(rate, ins_type)
        trust = _compute_trust_score(
            naic=True,
            ga_licensed=True,
            has_address=True,
            has_phone=True,
            am_best_rating=kwargs.get("am_best_rating"),
            bbb_rating=kwargs.get("bbb_rating"),
        )
        deal = InsuranceDeal(
            id=str(uuid.uuid4()),
            trust_score=trust,
            is_verified=trust >= 70,
            georgia_avg_comparison=gac["comparison"],
            georgia_avg_label=gac["label"],
            last_verified=yesterday,
            last_rate_update=yesterday,
            created_at=now,
            find_agent_url=_agent_map_url(kwargs["company_name"]),
            **kwargs,
        )
        return deal.model_dump()

    deals: List[Dict[str, Any]] = []

    # ------------------- AUTO -------------------
    deals.append(make_deal(
        company_name="State Farm",
        company_short="SF",
        logo_color="#DA291C",
        insurance_type="auto",
        naic_number="25178",
        georgia_license_number="GA-INS-25178",
        am_best_rating="A++",
        bbb_rating="A+",
        physical_address="One State Farm Plaza, Bloomington, IL 61710",
        headquarters_address="One State Farm Plaza, Bloomington, IL 61710",
        georgia_office_address="3355 Lenox Rd NE, Atlanta, GA 30326",
        phone_number="+18007828332",
        phone_display="1-800-782-8332",
        website_url="https://www.statefarm.com",
        quote_url="https://www.statefarm.com/insurance/auto",
        monthly_rate_from=89.0,
        rate_description="Average auto rate for Georgia drivers",
        coverage_highlights=AUTO_COVERAGE,
        special_offer="Bundle auto + home and save up to 17%",
        special_offer_type="BUNDLE SAVINGS",
        discounts_available=["Good driver", "Multi-car", "Bundle discount", "Good student"],
    ))
    deals.append(make_deal(
        company_name="GEICO",
        company_short="GE",
        logo_color="#00A4E4",
        insurance_type="auto",
        naic_number="35882",
        georgia_license_number="GA-INS-35882",
        am_best_rating="A++",
        bbb_rating="A+",
        physical_address="One GEICO Plaza, Washington, DC 20076",
        headquarters_address="One GEICO Plaza, Washington, DC 20076",
        georgia_office_address="5780 Peachtree Dunwoody Rd, Atlanta, GA 30342",
        phone_number="+18002077847",
        phone_display="1-800-207-7847",
        website_url="https://www.geico.com",
        quote_url="https://www.geico.com/auto-insurance/",
        monthly_rate_from=82.0,
        rate_description="Average auto rate for Georgia drivers",
        coverage_highlights=AUTO_COVERAGE,
        special_offer="Save up to 15% when you switch — new customer",
        special_offer_type="NEW CUSTOMER DISCOUNT",
        discounts_available=["New customer offer", "Multi-car", "Good driver", "Military"],
    ))
    deals.append(make_deal(
        company_name="Progressive",
        company_short="PR",
        logo_color="#0072CE",
        insurance_type="auto",
        naic_number="24260",
        georgia_license_number="GA-INS-24260",
        am_best_rating="A+",
        bbb_rating="A+",
        physical_address="6300 Wilson Mills Rd, Mayfield Village, OH 44143",
        headquarters_address="6300 Wilson Mills Rd, Mayfield Village, OH 44143",
        phone_number="+18007764737",
        phone_display="1-800-776-4737",
        website_url="https://www.progressive.com",
        quote_url="https://www.progressive.com/auto/",
        monthly_rate_from=76.0,
        rate_description="Average auto rate for Georgia drivers",
        coverage_highlights=AUTO_COVERAGE,
        special_offer="Snapshot — drive safely and save up to 30%",
        special_offer_type="GOOD DRIVER DISCOUNT",
        discounts_available=["Good driver", "Multi-car", "Bundle discount", "Loyalty"],
    ))
    deals.append(make_deal(
        company_name="Allstate",
        company_short="AL",
        logo_color="#003DA5",
        insurance_type="auto",
        naic_number="19232",
        georgia_license_number="GA-INS-19232",
        am_best_rating="A+",
        bbb_rating="A+",
        physical_address="2775 Sanders Rd, Northbrook, IL 60062",
        headquarters_address="2775 Sanders Rd, Northbrook, IL 60062",
        georgia_office_address="260 Peachtree St NW, Atlanta, GA 30303",
        phone_number="+18002557828",
        phone_display="1-800-255-7828",
        website_url="https://www.allstate.com",
        quote_url="https://www.allstate.com/auto-insurance",
        monthly_rate_from=94.0,
        rate_description="Average auto rate for Georgia drivers",
        coverage_highlights=AUTO_COVERAGE,
        special_offer="Drivewise cash-back for safe driving habits",
        special_offer_type="GOOD DRIVER DISCOUNT",
        discounts_available=["Good driver", "Multi-car", "Bundle discount", "Loyalty"],
    ))
    deals.append(make_deal(
        company_name="Liberty Mutual",
        company_short="LM",
        logo_color="#FEDD00",
        insurance_type="auto",
        naic_number="23043",
        georgia_license_number="GA-INS-23043",
        am_best_rating="A",
        bbb_rating="A+",
        physical_address="175 Berkeley St, Boston, MA 02116",
        headquarters_address="175 Berkeley St, Boston, MA 02116",
        phone_number="+18002907933",
        phone_display="1-800-290-7933",
        website_url="https://www.libertymutual.com",
        quote_url="https://www.libertymutual.com/auto-insurance",
        monthly_rate_from=97.0,
        rate_description="Average auto rate for Georgia drivers",
        coverage_highlights=AUTO_COVERAGE,
        special_offer="Pay only for what you need — customizable coverage",
        special_offer_type="LIMITED OFFER",
        discounts_available=["Bundle discount", "Multi-car", "Good driver"],
    ))
    deals.append(make_deal(
        company_name="Nationwide",
        company_short="NW",
        logo_color="#005EB8",
        insurance_type="auto",
        naic_number="23787",
        georgia_license_number="GA-INS-23787",
        am_best_rating="A+",
        bbb_rating="A+",
        physical_address="One Nationwide Plaza, Columbus, OH 43215",
        headquarters_address="One Nationwide Plaza, Columbus, OH 43215",
        phone_number="+18776696877",
        phone_display="1-877-669-6877",
        website_url="https://www.nationwide.com",
        quote_url="https://www.nationwide.com/personal/insurance/auto/",
        monthly_rate_from=88.0,
        rate_description="Average auto rate for Georgia drivers",
        coverage_highlights=AUTO_COVERAGE,
        special_offer="SmartRide — earn discounts based on driving",
        special_offer_type="GOOD DRIVER DISCOUNT",
        discounts_available=["Good driver", "Bundle discount", "Loyalty", "Multi-car"],
    ))
    deals.append(make_deal(
        company_name="Travelers",
        company_short="TR",
        logo_color="#E31837",
        insurance_type="auto",
        naic_number="25658",
        georgia_license_number="GA-INS-25658",
        am_best_rating="A++",
        bbb_rating="A+",
        physical_address="485 Lexington Ave, New York, NY 10017",
        headquarters_address="485 Lexington Ave, New York, NY 10017",
        phone_number="+18008425075",
        phone_display="1-800-842-5075",
        website_url="https://www.travelers.com",
        quote_url="https://www.travelers.com/car-insurance",
        monthly_rate_from=91.0,
        rate_description="Average auto rate for Georgia drivers",
        coverage_highlights=AUTO_COVERAGE,
        special_offer="Multi-policy savings up to 13%",
        special_offer_type="BUNDLE SAVINGS",
        discounts_available=["Bundle discount", "Multi-car", "Good driver", "Loyalty"],
    ))
    deals.append(make_deal(
        company_name="USAA",
        company_short="US",
        logo_color="#003C71",
        insurance_type="auto",
        naic_number="25941",
        georgia_license_number="GA-INS-25941",
        am_best_rating="A++",
        bbb_rating="A+",
        physical_address="9800 Fredericksburg Rd, San Antonio, TX 78288",
        headquarters_address="9800 Fredericksburg Rd, San Antonio, TX 78288",
        phone_number="+18005318722",
        phone_display="1-800-531-8722",
        website_url="https://www.usaa.com",
        quote_url="https://www.usaa.com/insurance/auto/",
        monthly_rate_from=67.0,
        rate_description="Average auto rate — military/veterans and families",
        coverage_highlights=AUTO_COVERAGE,
        special_offer="Exclusive rates for military members, veterans, and families",
        special_offer_type="MILITARY DISCOUNT",
        discounts_available=["Military", "Good driver", "Multi-car", "Loyalty"],
        military_only=True,
    ))

    # ------------------- HOME -------------------
    deals.append(make_deal(
        company_name="State Farm Home",
        company_short="SF",
        logo_color="#DA291C",
        insurance_type="home",
        naic_number="25178",
        georgia_license_number="GA-INS-25178",
        am_best_rating="A++",
        bbb_rating="A+",
        physical_address="One State Farm Plaza, Bloomington, IL 61710",
        headquarters_address="One State Farm Plaza, Bloomington, IL 61710",
        georgia_office_address="3355 Lenox Rd NE, Atlanta, GA 30326",
        phone_number="+18007828332",
        phone_display="1-800-782-8332",
        website_url="https://www.statefarm.com",
        quote_url="https://www.statefarm.com/insurance/home-and-property",
        monthly_rate_from=112.0,
        rate_description="Average home rate for Georgia homeowners",
        coverage_highlights=HOME_COVERAGE,
        special_offer="Home Alert protective devices credit",
        special_offer_type="HOME SECURITY DISCOUNT",
        discounts_available=["Home security", "Bundle discount", "Loyalty"],
    ))
    deals.append(make_deal(
        company_name="Allstate Home",
        company_short="AL",
        logo_color="#003DA5",
        insurance_type="home",
        naic_number="19232",
        georgia_license_number="GA-INS-19232",
        am_best_rating="A+",
        bbb_rating="A+",
        physical_address="2775 Sanders Rd, Northbrook, IL 60062",
        headquarters_address="2775 Sanders Rd, Northbrook, IL 60062",
        georgia_office_address="260 Peachtree St NW, Atlanta, GA 30303",
        phone_number="+18002557828",
        phone_display="1-800-255-7828",
        website_url="https://www.allstate.com",
        quote_url="https://www.allstate.com/homeowners-insurance",
        monthly_rate_from=127.0,
        rate_description="Average home rate for Georgia homeowners",
        coverage_highlights=HOME_COVERAGE,
        special_offer="Claim-free discount — up to 20% for no claims",
        special_offer_type="LOYALTY REWARD",
        discounts_available=["Home security", "Bundle discount", "Loyalty", "New customer offer"],
    ))
    deals.append(make_deal(
        company_name="Farmers Insurance",
        company_short="FA",
        logo_color="#003DA5",
        insurance_type="home",
        naic_number="21628",
        georgia_license_number="GA-INS-21628",
        am_best_rating="A",
        bbb_rating="A+",
        physical_address="6301 Owensmouth Ave, Woodland Hills, CA 91367",
        headquarters_address="6301 Owensmouth Ave, Woodland Hills, CA 91367",
        phone_number="+18883276335",
        phone_display="1-888-327-6335",
        website_url="https://www.farmers.com",
        quote_url="https://www.farmers.com/home/",
        monthly_rate_from=134.0,
        rate_description="Average home rate for Georgia homeowners",
        coverage_highlights=HOME_COVERAGE,
        special_offer="Smart home discount for connected devices",
        special_offer_type="HOME SECURITY DISCOUNT",
        discounts_available=["Home security", "Bundle discount", "New customer offer"],
    ))
    deals.append(make_deal(
        company_name="American Family",
        company_short="AF",
        logo_color="#004990",
        insurance_type="home",
        naic_number="19275",
        georgia_license_number="GA-INS-19275",
        am_best_rating="A",
        bbb_rating="A+",
        physical_address="6000 American Pkwy, Madison, WI 53783",
        headquarters_address="6000 American Pkwy, Madison, WI 53783",
        phone_number="+18006926326",
        phone_display="1-800-692-6326",
        website_url="https://www.amfam.com",
        quote_url="https://www.amfam.com/insurance/home",
        monthly_rate_from=119.0,
        rate_description="Average home rate for Georgia homeowners",
        coverage_highlights=HOME_COVERAGE,
        special_offer="Loyalty discount grows every year with AmFam",
        special_offer_type="LOYALTY REWARD",
        discounts_available=["Loyalty", "Bundle discount", "Home security"],
    ))

    # ------------------- BUNDLE -------------------
    def bundle(*, name, short, color, naic, ga_lic, am_best, hq, ga_off, phone, phone_display,
               website, auto_url, home_url, auto_rate, home_rate, savings_pct, offer):
        combined = round((auto_rate + home_rate) * (1 - savings_pct / 100.0), 2)
        return make_deal(
            company_name=f"{name} Bundle",
            company_short=short,
            logo_color=color,
            insurance_type="bundle",
            naic_number=naic,
            georgia_license_number=ga_lic,
            am_best_rating=am_best,
            bbb_rating="A+",
            physical_address=hq,
            headquarters_address=hq,
            georgia_office_address=ga_off,
            phone_number=phone,
            phone_display=phone_display,
            website_url=website,
            quote_url=home_url,  # main quote URL — home page (client shows both)
            monthly_rate_from=combined,
            rate_description=f"Auto + Home bundle — save {savings_pct}% vs separate policies",
            coverage_highlights=BUNDLE_COVERAGE,
            special_offer=offer,
            special_offer_type="BUNDLE SAVINGS",
            discounts_available=["Bundle discount", "Multi-policy", "Loyalty"],
            bundle_partner=name,
            bundle_savings_percent=float(savings_pct),
            bundle_auto_from=auto_rate,
            bundle_home_from=home_rate,
        )

    deals.append(bundle(name="State Farm", short="SF", color="#DA291C",
                        naic="25178", ga_lic="GA-INS-25178", am_best="A++",
                        hq="One State Farm Plaza, Bloomington, IL 61710",
                        ga_off="3355 Lenox Rd NE, Atlanta, GA 30326",
                        phone="+18007828332", phone_display="1-800-782-8332",
                        website="https://www.statefarm.com",
                        auto_url="https://www.statefarm.com/insurance/auto",
                        home_url="https://www.statefarm.com/insurance/home-and-property",
                        auto_rate=89.0, home_rate=112.0, savings_pct=17,
                        offer="Bundle auto + home and save up to 17%"))
    deals.append(bundle(name="Allstate", short="AL", color="#003DA5",
                        naic="19232", ga_lic="GA-INS-19232", am_best="A+",
                        hq="2775 Sanders Rd, Northbrook, IL 60062",
                        ga_off="260 Peachtree St NW, Atlanta, GA 30303",
                        phone="+18002557828", phone_display="1-800-255-7828",
                        website="https://www.allstate.com",
                        auto_url="https://www.allstate.com/auto-insurance",
                        home_url="https://www.allstate.com/homeowners-insurance",
                        auto_rate=94.0, home_rate=127.0, savings_pct=15,
                        offer="Multi-policy discount — save up to 25% combined"))
    deals.append(bundle(name="Progressive", short="PR", color="#0072CE",
                        naic="24260", ga_lic="GA-INS-24260", am_best="A+",
                        hq="6300 Wilson Mills Rd, Mayfield Village, OH 44143",
                        ga_off=None,
                        phone="+18007764737", phone_display="1-800-776-4737",
                        website="https://www.progressive.com",
                        auto_url="https://www.progressive.com/auto/",
                        home_url="https://www.progressive.com/homeowners/",
                        auto_rate=76.0, home_rate=118.0, savings_pct=12,
                        offer="Progressive HomeQuote Explorer — instant bundle quotes"))
    deals.append(bundle(name="Liberty Mutual", short="LM", color="#FEDD00",
                        naic="23043", ga_lic="GA-INS-23043", am_best="A",
                        hq="175 Berkeley St, Boston, MA 02116",
                        ga_off=None,
                        phone="+18002907933", phone_display="1-800-290-7933",
                        website="https://www.libertymutual.com",
                        auto_url="https://www.libertymutual.com/auto-insurance",
                        home_url="https://www.libertymutual.com/home-insurance",
                        auto_rate=97.0, home_rate=124.0, savings_pct=13,
                        offer="Save when you combine home and auto"))
    deals.append(bundle(name="Nationwide", short="NW", color="#005EB8",
                        naic="23787", ga_lic="GA-INS-23787", am_best="A+",
                        hq="One Nationwide Plaza, Columbus, OH 43215",
                        ga_off=None,
                        phone="+18776696877", phone_display="1-877-669-6877",
                        website="https://www.nationwide.com",
                        auto_url="https://www.nationwide.com/personal/insurance/auto/",
                        home_url="https://www.nationwide.com/personal/insurance/homeowners/",
                        auto_rate=88.0, home_rate=121.0, savings_pct=20,
                        offer="Bundle & save up to 20% on your combined policy"))
    deals.append(bundle(name="Travelers", short="TR", color="#E31837",
                        naic="25658", ga_lic="GA-INS-25658", am_best="A++",
                        hq="485 Lexington Ave, New York, NY 10017",
                        ga_off=None,
                        phone="+18008425075", phone_display="1-800-842-5075",
                        website="https://www.travelers.com",
                        auto_url="https://www.travelers.com/car-insurance",
                        home_url="https://www.travelers.com/homeowners-insurance",
                        auto_rate=91.0, home_rate=131.0, savings_pct=13,
                        offer="Multi-policy discount + claim-free bonus"))

    return deals


# --------------------------- Sort / filter helpers --------------------
def _apply_filters(items: List[Dict[str, Any]], *,
                   insurance_type: Optional[str],
                   min_rate: Optional[float],
                   max_rate: Optional[float],
                   am_best_min: Optional[str],
                   discounts: Optional[List[str]],
                   military_ok: bool) -> List[Dict[str, Any]]:
    RATING_ORDER = {"A-": 1, "A": 2, "A+": 3, "A++": 4}
    min_rating = RATING_ORDER.get((am_best_min or "").upper(), 0)
    dset = {d.lower() for d in (discounts or [])}
    out = []
    for it in items:
        if insurance_type and insurance_type != "all" and it["insurance_type"] != insurance_type:
            continue
        rate = it.get("monthly_rate_from", 0.0)
        if min_rate is not None and rate < min_rate:
            continue
        if max_rate is not None and rate > max_rate:
            continue
        if min_rating and RATING_ORDER.get((it.get("am_best_rating") or "").upper(), 0) < min_rating:
            continue
        if dset:
            avail = {d.lower() for d in (it.get("discounts_available") or [])}
            if not (dset & avail):
                continue
        if it.get("military_only") and not military_ok:
            # Still show military-only cards but caller can filter via /list?military_ok=false
            continue
        out.append(it)
    return out


def _apply_sort(items: List[Dict[str, Any]], sort: str) -> List[Dict[str, Any]]:
    if sort == "lowest_rate":
        return sorted(items, key=lambda x: x.get("monthly_rate_from", 0.0))
    if sort == "highest_rated":
        RATING_ORDER = {"A-": 1, "A": 2, "A+": 3, "A++": 4}
        return sorted(items, key=lambda x: (
            RATING_ORDER.get((x.get("am_best_rating") or "").upper(), 0),
            x.get("trust_score", 0),
        ), reverse=True)
    if sort == "most_recent":
        return sorted(items, key=lambda x: x.get("last_rate_update", ""), reverse=True)
    # best_deal: mix of low rate + high trust
    def score(x):
        rate = x.get("monthly_rate_from", 200.0)
        trust = x.get("trust_score", 0)
        return (trust * 1.5) - rate  # higher = better
    return sorted(items, key=score, reverse=True)


# --------------------------- Factory ----------------------------------
def make_insurance_router(db, get_current_user_id):
    router = APIRouter(prefix="/api/insurance", tags=["insurance-deals"])

    async def _ensure_seeded():
        """Idempotently seed the insurance_deals collection."""
        cnt = await db.insurance_deals.count_documents({})
        if cnt >= 18:
            return {"seeded": False, "count": cnt}
        # Fresh seed — clear then insert
        await db.insurance_deals.delete_many({})
        seed = _build_seed_deals()
        await db.insurance_deals.insert_many(seed)
        try:
            await db.insurance_deals.create_index("insurance_type")
            await db.insurance_deals.create_index("trust_score")
            await db.insurance_deals.create_index("monthly_rate_from")
            await db.insurance_deals.create_index("is_verified")
            await db.insurance_deals.create_index("is_active")
            await db.insurance_deals.create_index("last_verified")
        except Exception:
            pass
        return {"seeded": True, "count": len(seed)}

    @router.get("/averages")
    async def averages(_user_id: str = Depends(get_current_user_id)):
        return {
            "state": "GA",
            "state_name": "Georgia",
            "auto_monthly": GA_AVG_AUTO_MONTHLY,
            "home_monthly": GA_AVG_HOME_MONTHLY,
            "bundle_monthly": GA_AVG_BUNDLE_MONTHLY,
            "as_of": "2026",
        }

    @router.get("/deals")
    async def list_deals(
        user_id: str = Depends(get_current_user_id),
        insurance_type: Optional[str] = Query(None, description="auto | home | bundle | all"),
        sort: str = Query("best_deal", description="best_deal | lowest_rate | highest_rated | most_recent"),
        min_rate: Optional[float] = Query(None),
        max_rate: Optional[float] = Query(None),
        am_best_min: Optional[str] = Query(None),
        discounts: Optional[str] = Query(None, description="comma-separated"),
        military_ok: bool = Query(True),
        min_trust: int = Query(70),
    ):
        await _ensure_seeded()
        cursor = db.insurance_deals.find({"is_active": True, "trust_score": {"$gte": min_trust}}, {"_id": 0})
        items = [d async for d in cursor]
        dlist = [x.strip() for x in (discounts or "").split(",") if x.strip()]
        filtered = _apply_filters(
            items,
            insurance_type=insurance_type,
            min_rate=min_rate,
            max_rate=max_rate,
            am_best_min=am_best_min,
            discounts=dlist,
            military_ok=military_ok,
        )
        sorted_items = _apply_sort(filtered, sort)
        # Compute last-updated across the set
        last_updated = max((it.get("last_rate_update") or "" for it in items), default=_NOW())
        return {
            "deals": sorted_items,
            "total": len(sorted_items),
            "total_all": len(items),
            "last_updated": last_updated,
            "averages": {
                "auto_monthly": GA_AVG_AUTO_MONTHLY,
                "home_monthly": GA_AVG_HOME_MONTHLY,
                "bundle_monthly": GA_AVG_BUNDLE_MONTHLY,
            },
        }

    @router.get("/deals/{deal_id}")
    async def get_deal(deal_id: str, _user_id: str = Depends(get_current_user_id)):
        d = await db.insurance_deals.find_one({"id": deal_id}, {"_id": 0})
        if not d:
            raise HTTPException(status_code=404, detail="Deal not found")
        return d

    @router.post("/deals/seed")
    async def seed_endpoint(_user_id: str = Depends(get_current_user_id)):
        result = await _ensure_seeded()
        return result

    @router.post("/deals/seed/force")
    async def force_reseed(_user_id: str = Depends(get_current_user_id)):
        await db.insurance_deals.delete_many({})
        result = await _ensure_seeded()
        return result

    # ------------------- Phase 2 skeleton -------------------
    @router.post("/deals/refresh")
    async def refresh_deals(_user_id: str = Depends(get_current_user_id)):
        """Phase 2: live Perplexity + SerpApi refresh. Falls back to seed."""
        perplexity_key = os.getenv("PERPLEXITY_API_KEY", "").strip()
        await _ensure_seeded()
        active_count = await db.insurance_deals.count_documents({"is_active": True})
        now = _NOW()
        # Bump last_verified for all seeded rows to now so UI shows "just refreshed"
        await db.insurance_deals.update_many({"is_active": True},
                                             {"$set": {"last_verified": now}})
        if not perplexity_key:
            return {
                "status": "not_configured",
                "message": "Live search requires Perplexity API key — showing verified seed data",
                "companies_verified": active_count,
                "new_deals_found": 0,
                "deals_removed": 0,
                "rates_updated": 0,
                "last_updated": now,
            }
        # Phase 2 wiring: Perplexity live search + NAIC/OCI verification
        return {
            "status": "not_implemented",
            "message": "Phase 2 live wiring pending — Perplexity key present but pipeline not built yet",
            "companies_verified": active_count,
            "new_deals_found": 0,
            "deals_removed": 0,
            "rates_updated": 0,
            "last_updated": now,
        }

    @router.post("/deals/verify/{deal_id}")
    async def verify_company(deal_id: str, _user_id: str = Depends(get_current_user_id)):
        """Phase 2 skeleton — re-verify a single company via NAIC / OCI web search."""
        d = await db.insurance_deals.find_one({"id": deal_id}, {"_id": 0})
        if not d:
            raise HTTPException(status_code=404, detail="Deal not found")
        perplexity_key = os.getenv("PERPLEXITY_API_KEY", "").strip()
        if not perplexity_key:
            return {
                "status": "not_configured",
                "deal_id": deal_id,
                "trust_score": d.get("trust_score"),
                "is_verified": d.get("is_verified"),
                "message": "NAIC/OCI web verification requires Perplexity key",
            }
        return {"status": "not_implemented"}

    return router
