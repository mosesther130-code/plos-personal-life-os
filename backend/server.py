"""
PLOS — Personal Life Operating System Backend
FastAPI + MongoDB + JWT Auth + Claude Sonnet 4.5 AI integration
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
import time
import json
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt as pyjwt
from emergentintegrations.llm.chat import LlmChat, UserMessage
import httpx

# Load env
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_DAYS = int(os.environ.get("JWT_EXPIRE_DAYS", "30"))

# Mongo
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="PLOS API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ----------------------------- Helpers ---------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_jwt(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user_id(
    creds: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    try:
        payload = pyjwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def clean_doc(doc: Optional[dict]) -> Optional[dict]:
    """Remove _id from MongoDB doc."""
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


# ----------------------------- Models ----------------------------------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    user_id: str
    email: str
    full_name: str


class UserProfile(BaseModel):
    user_id: str
    email: str
    full_name: str
    date_of_birth: Optional[str] = None
    location_primary: Optional[str] = None
    financial_health_score: int = 0
    net_worth_usd: float = 0.0
    last_updated: str


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    location_primary: Optional[str] = None
    financial_health_score: Optional[int] = None
    net_worth_usd: Optional[float] = None


class IncomeSource(BaseModel):
    income_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_name: str
    type: str  # salary/benefits/side
    gross_monthly: float
    net_monthly: float
    frequency: str = "monthly"
    is_active: bool = True


class IncomeSourceCreate(BaseModel):
    source_name: str
    type: str
    gross_monthly: float
    net_monthly: float
    frequency: str = "monthly"
    is_active: bool = True


class Expense(BaseModel):
    expense_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: str
    vendor: str
    monthly_amount: float
    due_day_of_month: int = 1
    auto_pay: bool = False
    deal_watch_enabled: bool = False


class ExpenseCreate(BaseModel):
    category: str
    vendor: str
    monthly_amount: float
    due_day_of_month: int = 1
    auto_pay: bool = False
    deal_watch_enabled: bool = False


class Debt(BaseModel):
    debt_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    debt_type: str  # credit_card/student_loan/mortgage/auto
    lender: str
    balance: float
    apr: float
    minimum_payment: float
    payoff_strategy: str = "avalanche"  # avalanche/snowball
    projected_payoff_date: Optional[str] = None


class DebtCreate(BaseModel):
    debt_type: str
    lender: str
    balance: float
    apr: float
    minimum_payment: float
    payoff_strategy: str = "avalanche"
    projected_payoff_date: Optional[str] = None


class Asset(BaseModel):
    asset_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    asset_type: str  # real_estate/vehicle/investment
    name: str
    current_value: float
    purchase_value: float
    location: Optional[str] = None
    notes: Optional[str] = None


class AssetCreate(BaseModel):
    asset_type: str
    name: str
    current_value: float
    purchase_value: float
    location: Optional[str] = None
    notes: Optional[str] = None


class Investment(BaseModel):
    investment_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str  # TSP/social_security/life_insurance/IRA/brokerage/pension/cash/savings
    balance: float
    contribution_monthly: float = 0
    employer_match_pct: float = 0
    projected_at_65: float = 0
    # Extended PLOS fields
    nickname: Optional[str] = None
    institution: Optional[str] = None
    growth_rate_override: Optional[float] = None  # decimal e.g. 0.07
    beneficiary_name: Optional[str] = None
    notes: Optional[str] = None


class InvestmentCreate(BaseModel):
    type: str
    balance: float
    contribution_monthly: float = 0
    employer_match_pct: float = 0
    projected_at_65: float = 0
    nickname: Optional[str] = None
    institution: Optional[str] = None
    growth_rate_override: Optional[float] = None
    beneficiary_name: Optional[str] = None
    notes: Optional[str] = None


class InvestmentUpdate(BaseModel):
    type: Optional[str] = None
    balance: Optional[float] = None
    contribution_monthly: Optional[float] = None
    employer_match_pct: Optional[float] = None
    nickname: Optional[str] = None
    institution: Optional[str] = None
    growth_rate_override: Optional[float] = None
    beneficiary_name: Optional[str] = None
    notes: Optional[str] = None


# =================== Identity & Security Models ===================
class SecurityAlert(BaseModel):
    alert_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    severity: str  # critical | warning | notice | resolved
    title: str
    description: str
    action_type: Optional[str] = None  # opt_out | dispute | review | freeze | change_pw
    action_payload: Optional[Dict[str, Any]] = None
    related_id: Optional[str] = None  # broker_id, breach_id, etc.
    created_at: str
    resolved_at: Optional[str] = None


class DataBroker(BaseModel):
    broker_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    domain: str
    status: str  # clear | scanning | pii_found | opt_out_pending | removed
    data_exposed: List[str] = []
    opt_out_available: bool = True
    opt_out_submitted_at: Optional[str] = None
    removal_confirmed_at: Optional[str] = None
    last_scanned_at: Optional[str] = None
    next_rescan_at: Optional[str] = None
    opt_out_url: Optional[str] = None
    notes: Optional[str] = None


class CreditScore(BaseModel):
    bureau: str  # equifax | transunion | experian
    current_score: int
    previous_score: int
    last_updated: str
    is_demo: bool = True


class CreditScoresUpdate(BaseModel):
    equifax: Optional[int] = None
    transunion: Optional[int] = None
    experian: Optional[int] = None


class BureauScoreHistory(BaseModel):
    bureau: str
    score: int
    month: str  # YYYY-MM


class HardInquiry(BaseModel):
    inquiry_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    bureau: str
    creditor: str
    inquired_at: str
    expected_drop_off: Optional[str] = None


class BreachRecord(BaseModel):
    breach_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    breach_name: str
    breach_date: str
    data_types_exposed: List[str] = []
    recommended_action: str
    status: str = "active"  # active | mitigated | resolved
    is_demo: bool = True


class IdentityTheftStep(BaseModel):
    step_id: str
    title: str
    description: str
    links: List[Dict[str, str]] = []
    completed: bool = False
    completed_at: Optional[str] = None


class HIBPKeyUpdate(BaseModel):
    hibp_api_key: Optional[str] = None


# =================== Local Intelligence & Safety Models ===================
class FamilyMember(BaseModel):
    member_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    initials: str
    color: str
    last_lat: Optional[float] = None
    last_lon: Optional[float] = None
    last_address: Optional[str] = None
    last_seen: Optional[str] = None
    is_paused: bool = False
    avatar_url: Optional[str] = None


class SavedVehicle(BaseModel):
    vehicle_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    year: int
    make: str
    model: str
    vin: Optional[str] = None
    nickname: Optional[str] = None


class SOSEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    lat: float
    lon: float
    triggered_at: str
    test_mode: bool = False
    notified_contacts: List[str] = []


class CuisineUpdate(BaseModel):
    cuisine_preference: Optional[str] = None
    google_places_api_key: Optional[str] = None


class VehicleRecallQuery(BaseModel):
    year: int
    make: str
    model: str
    vin: Optional[str] = None


# =================== Global Tools (Translator + Currency) ===================
class TranslateRequest(BaseModel):
    text: str
    source_language: Optional[str] = None  # may be "auto"
    target_language: str


class DetectLanguageRequest(BaseModel):
    text: str


class TranslationRecord(BaseModel):
    translation_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_language: str
    target_language: str
    source_text: str
    translated_text: str
    detected_language: Optional[str] = None
    created_at: str


class RateAlert(BaseModel):
    alert_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    base: str
    target: str
    rate_target: float
    direction: str = "above"  # above | below
    label: Optional[str] = None
    enabled: bool = True
    status: str = "watching"  # watching | triggered
    triggered_at: Optional[str] = None
    created_at: str


class RateAlertCreate(BaseModel):
    base: str
    target: str
    rate_target: float
    direction: str = "above"
    label: Optional[str] = None
# =================== End Global Tools ===================
# =================== End Local Intelligence ===================


# =================== End Identity & Security ===================


class CareerProfile(BaseModel):
    career_id: str
    current_title: Optional[str] = None
    current_employer: Optional[str] = None
    resume_master_text: Optional[str] = None
    ats_score: int = 0
    target_roles: List[str] = []
    target_locations: List[str] = []
    min_salary: float = 0
    work_type_pref: Optional[str] = "remote"  # remote/hybrid/onsite/any
    auto_apply_enabled: bool = False
    auto_apply_review_first: bool = True
    auto_cover_letter: bool = True


class CareerProfileUpdate(BaseModel):
    current_title: Optional[str] = None
    current_employer: Optional[str] = None
    resume_master_text: Optional[str] = None
    ats_score: Optional[int] = None
    target_roles: Optional[List[str]] = None
    target_locations: Optional[List[str]] = None
    work_type_pref: Optional[str] = None
    auto_apply_review_first: Optional[bool] = None
    auto_cover_letter: Optional[bool] = None
    min_salary: Optional[float] = None
    auto_apply_enabled: Optional[bool] = None


class JobApplication(BaseModel):
    application_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    employer: str
    role_title: str
    match_score: int = 0
    status: str = "matched"  # matched/applied/screening/interview/offer/rejected
    resume_version_used: Optional[str] = None
    cover_letter_used: Optional[str] = None
    applied_date: Optional[str] = None
    location: Optional[str] = None
    work_type: Optional[str] = None  # remote/hybrid/onsite
    salary_range: Optional[str] = None
    badges: List[str] = []
    notes: Optional[str] = None
    follow_up_date: Optional[str] = None
    job_description: Optional[str] = None
    generated_resume: Optional[str] = None
    generated_cover_letter: Optional[str] = None


class JobApplicationCreate(BaseModel):
    employer: str
    role_title: str
    match_score: int = 0
    status: str = "matched"
    resume_version_used: Optional[str] = None
    cover_letter_used: Optional[str] = None
    applied_date: Optional[str] = None
    location: Optional[str] = None
    work_type: Optional[str] = None
    salary_range: Optional[str] = None
    badges: List[str] = []
    notes: Optional[str] = None
    follow_up_date: Optional[str] = None
    job_description: Optional[str] = None


class JobApplicationUpdate(BaseModel):
    employer: Optional[str] = None
    role_title: Optional[str] = None
    match_score: Optional[int] = None
    status: Optional[str] = None
    resume_version_used: Optional[str] = None
    cover_letter_used: Optional[str] = None
    applied_date: Optional[str] = None
    location: Optional[str] = None
    work_type: Optional[str] = None
    salary_range: Optional[str] = None
    badges: Optional[List[str]] = None
    notes: Optional[str] = None
    follow_up_date: Optional[str] = None
    job_description: Optional[str] = None
    generated_resume: Optional[str] = None
    generated_cover_letter: Optional[str] = None


class HealthProfile(BaseModel):
    health_id: str
    insurance_type: Optional[str] = None
    coverage_renewal_date: Optional[str] = None
    income_eligibility_threshold: Optional[float] = None
    medical_report_notes: Optional[str] = None
    wellness_checkin_score: int = 5


class HealthProfileUpdate(BaseModel):
    insurance_type: Optional[str] = None
    coverage_renewal_date: Optional[str] = None
    income_eligibility_threshold: Optional[float] = None
    medical_report_notes: Optional[str] = None
    wellness_checkin_score: Optional[int] = None


class AIDecision(BaseModel):
    decision_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    module: str
    advice_text: str
    priority: str  # urgent/action/info
    was_acted_on: bool = False
    generated_at: str = Field(default_factory=lambda: iso(now_utc()))


class AIAdviceRequest(BaseModel):
    module: str  # finance/career/health/dashboard/etc
    context_hint: Optional[str] = None


class ChatMessage(BaseModel):
    role: str  # user/assistant
    content: str
    created_at: str = Field(default_factory=lambda: iso(now_utc()))


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    mode: Optional[str] = None  # general | legal | financial | career | travel


class ChatResponse(BaseModel):
    response: str
    session_id: str


# ----------------------------- Auth Endpoints --------------------------
@api_router.post("/auth/register", response_model=AuthResponse)
async def register(payload: RegisterRequest):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    user_doc = {
        "user_id": user_id,
        "email": payload.email.lower(),
        "password_hash": hash_password(payload.password),
        "full_name": payload.full_name,
        "created_at": iso(now_utc()),
    }
    await db.users.insert_one(user_doc)

    # Create user_profile
    profile = {
        "user_id": user_id,
        "email": payload.email.lower(),
        "full_name": payload.full_name,
        "date_of_birth": None,
        "location_primary": None,
        "financial_health_score": 0,
        "net_worth_usd": 0.0,
        "last_updated": iso(now_utc()),
    }
    await db.user_profile.insert_one(profile)

    # Career & Health placeholders
    await db.career_profile.insert_one({
        "user_id": user_id,
        "career_id": str(uuid.uuid4()),
        "current_title": None,
        "current_employer": None,
        "resume_master_text": None,
        "ats_score": 0,
        "target_roles": [],
        "target_locations": [],
        "min_salary": 0,
        "auto_apply_enabled": False,
    })
    await db.health_profile.insert_one({
        "user_id": user_id,
        "health_id": str(uuid.uuid4()),
        "insurance_type": None,
        "coverage_renewal_date": None,
        "income_eligibility_threshold": None,
        "medical_report_notes": None,
        "wellness_checkin_score": 5,
    })

    token = create_jwt(user_id)
    return AuthResponse(
        token=token, user_id=user_id, email=payload.email.lower(), full_name=payload.full_name
    )


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(payload: LoginRequest):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_jwt(user["user_id"])
    return AuthResponse(
        token=token,
        user_id=user["user_id"],
        email=user["email"],
        full_name=user["full_name"],
    )


@api_router.get("/auth/me", response_model=UserProfile)
async def me(user_id: str = Depends(get_current_user_id)):
    profile = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return UserProfile(**profile)


# ----------------------------- User Profile ----------------------------
@api_router.put("/profile", response_model=UserProfile)
async def update_profile(
    payload: UserProfileUpdate, user_id: str = Depends(get_current_user_id)
):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    update["last_updated"] = iso(now_utc())
    await db.user_profile.update_one({"user_id": user_id}, {"$set": update})
    profile = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0})
    return UserProfile(**profile)


# ----------------------------- Income Sources --------------------------
@api_router.get("/income", response_model=List[IncomeSource])
async def list_income(user_id: str = Depends(get_current_user_id)):
    items = await db.income_sources.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).to_list(1000)
    return [IncomeSource(**i) for i in items]


@api_router.post("/income", response_model=IncomeSource)
async def create_income(
    payload: IncomeSourceCreate, user_id: str = Depends(get_current_user_id)
):
    obj = IncomeSource(**payload.dict())
    doc = obj.dict()
    doc["user_id"] = user_id
    await db.income_sources.insert_one(doc)
    return obj


@api_router.delete("/income/{income_id}")
async def delete_income(income_id: str, user_id: str = Depends(get_current_user_id)):
    await db.income_sources.delete_one({"income_id": income_id, "user_id": user_id})
    return {"ok": True}


@api_router.put("/income/{income_id}", response_model=IncomeSource)
async def update_income(
    income_id: str,
    payload: IncomeSourceCreate,
    user_id: str = Depends(get_current_user_id),
):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    res = await db.income_sources.update_one(
        {"income_id": income_id, "user_id": user_id}, {"$set": update}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Income source not found")
    doc = await db.income_sources.find_one(
        {"income_id": income_id, "user_id": user_id}, {"_id": 0, "user_id": 0}
    )
    return IncomeSource(**doc)


# ----------------------------- Expenses --------------------------------
@api_router.get("/expenses", response_model=List[Expense])
async def list_expenses(user_id: str = Depends(get_current_user_id)):
    items = await db.expenses.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).to_list(1000)
    return [Expense(**i) for i in items]


@api_router.post("/expenses", response_model=Expense)
async def create_expense(payload: ExpenseCreate, user_id: str = Depends(get_current_user_id)):
    obj = Expense(**payload.dict())
    doc = obj.dict()
    doc["user_id"] = user_id
    await db.expenses.insert_one(doc)
    return obj


@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user_id: str = Depends(get_current_user_id)):
    await db.expenses.delete_one({"expense_id": expense_id, "user_id": user_id})
    return {"ok": True}


@api_router.put("/expenses/{expense_id}", response_model=Expense)
async def update_expense(
    expense_id: str,
    payload: ExpenseCreate,
    user_id: str = Depends(get_current_user_id),
):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    res = await db.expenses.update_one(
        {"expense_id": expense_id, "user_id": user_id}, {"$set": update}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    doc = await db.expenses.find_one(
        {"expense_id": expense_id, "user_id": user_id}, {"_id": 0, "user_id": 0}
    )
    return Expense(**doc)


# ----------------------------- Debts -----------------------------------
@api_router.get("/debts", response_model=List[Debt])
async def list_debts(user_id: str = Depends(get_current_user_id)):
    items = await db.debts.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).to_list(1000)
    return [Debt(**i) for i in items]


@api_router.post("/debts", response_model=Debt)
async def create_debt(payload: DebtCreate, user_id: str = Depends(get_current_user_id)):
    obj = Debt(**payload.dict())
    doc = obj.dict()
    doc["user_id"] = user_id
    await db.debts.insert_one(doc)
    return obj


@api_router.delete("/debts/{debt_id}")
async def delete_debt(debt_id: str, user_id: str = Depends(get_current_user_id)):
    await db.debts.delete_one({"debt_id": debt_id, "user_id": user_id})
    return {"ok": True}


@api_router.put("/debts/{debt_id}", response_model=Debt)
async def update_debt(
    debt_id: str,
    payload: DebtCreate,
    user_id: str = Depends(get_current_user_id),
):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    res = await db.debts.update_one(
        {"debt_id": debt_id, "user_id": user_id}, {"$set": update}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Debt not found")
    doc = await db.debts.find_one(
        {"debt_id": debt_id, "user_id": user_id}, {"_id": 0, "user_id": 0}
    )
    return Debt(**doc)


# ----------------------------- Debt analysis ---------------------------
def _months_to_payoff(balance: float, apr: float, monthly_payment: float) -> Optional[int]:
    """Return months to pay off a debt; None if payment doesn't cover interest."""
    if balance <= 0:
        return 0
    monthly_rate = (apr / 100.0) / 12.0
    if monthly_payment <= balance * monthly_rate:
        return None
    if monthly_rate == 0:
        return int((balance / monthly_payment) + 0.999)
    import math
    n = -math.log(1 - (balance * monthly_rate) / monthly_payment) / math.log(1 + monthly_rate)
    return int(n + 0.999)


def _simulate_payoff(
    debts: List[Dict[str, Any]], strategy: str, extra_monthly: float = 0
) -> Dict[str, Any]:
    """Simulate month-by-month payoff. Returns total_interest, months, schedule (per month focus)."""
    # Deep copy state
    state = [
        {
            "debt_id": d["debt_id"],
            "lender": d["lender"],
            "balance": float(d["balance"]),
            "apr": float(d["apr"]),
            "min_pay": float(d["minimum_payment"]),
        }
        for d in debts
    ]
    total_interest = 0.0
    schedule: List[Dict[str, Any]] = []
    month = 0
    while any(d["balance"] > 0.01 for d in state) and month < 600:
        month += 1
        # Apply interest
        for d in state:
            if d["balance"] > 0:
                d["balance"] += d["balance"] * (d["apr"] / 100.0 / 12.0)
                total_interest += d["balance"] - (d["balance"] / (1 + d["apr"] / 100.0 / 12.0))
        # Choose focus debt
        active = [d for d in state if d["balance"] > 0]
        if not active:
            break
        if strategy == "snowball":
            active.sort(key=lambda x: x["balance"])
        else:
            active.sort(key=lambda x: -x["apr"])
        focus = active[0]

        # Pay minimums on others first
        for d in state:
            if d["balance"] > 0 and d["debt_id"] != focus["debt_id"]:
                pay = min(d["min_pay"], d["balance"])
                d["balance"] -= pay
        # Pay focus debt: min + all extra + freed-up payments? Keep simple: min + extra.
        focus_pay = min(focus["balance"], focus["min_pay"] + extra_monthly)
        focus["balance"] -= focus_pay

        schedule.append({
            "month": month,
            "focus_debt": focus["lender"],
            "focus_debt_id": focus["debt_id"],
            "focus_balance_after": round(focus["balance"], 2),
            "total_remaining": round(sum(d["balance"] for d in state if d["balance"] > 0), 2),
        })

    return {
        "total_interest": round(total_interest, 2),
        "months": month,
        "schedule": schedule,
    }


class PayoffPlanRequest(BaseModel):
    strategy: str = "avalanche"  # avalanche/snowball
    extra_monthly: float = 0


@api_router.post("/finance/payoff-plan")
async def payoff_plan(
    payload: PayoffPlanRequest, user_id: str = Depends(get_current_user_id)
):
    debts = await db.debts.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).to_list(50)
    if not debts:
        return {"strategy": payload.strategy, "total_interest": 0, "months": 0, "schedule": []}

    base = _simulate_payoff(debts, payload.strategy, 0)
    plan = _simulate_payoff(debts, payload.strategy, payload.extra_monthly)
    interest_saved = round(max(0, base["total_interest"] - plan["total_interest"]), 2)

    # Per-debt payoff months (at minimum payment alone)
    per_debt = []
    for d in debts:
        m = _months_to_payoff(d["balance"], d["apr"], d["minimum_payment"])
        per_debt.append({
            "debt_id": d["debt_id"],
            "lender": d["lender"],
            "payoff_months_min_only": m,
        })

    return {
        "strategy": payload.strategy,
        "extra_monthly": payload.extra_monthly,
        "total_interest": plan["total_interest"],
        "baseline_interest": base["total_interest"],
        "interest_saved": interest_saved,
        "months": plan["months"],
        "schedule": plan["schedule"],
        "per_debt": per_debt,
    }


class DebtStrategyRequest(BaseModel):
    strategy: str = "avalanche"
    extra_monthly: float = 200


@api_router.post("/ai/debt-strategy")
async def ai_debt_strategy(
    payload: DebtStrategyRequest, user_id: str = Depends(get_current_user_id)
):
    """Claude generates a debt strategy recommendation with payment order + extra
    payment suggestion."""
    debts = await db.debts.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).to_list(50)
    if not debts:
        return {"summary": "No debts on file.", "payment_order": [], "recommended_extra": 0, "interest_saved": 0}

    plan = _simulate_payoff(debts, payload.strategy, payload.extra_monthly)
    base = _simulate_payoff(debts, payload.strategy, 0)
    interest_saved = round(max(0, base["total_interest"] - plan["total_interest"]), 2)

    # payment order = order debts will be killed in
    order = []
    seen = set()
    for s in plan["schedule"]:
        if s["focus_balance_after"] <= 0.01 and s["focus_debt_id"] not in seen:
            order.append(s["focus_debt"])
            seen.add(s["focus_debt_id"])

    ctx = await gather_user_context(user_id)
    prompt = f"""User selected '{payload.strategy}' debt payoff strategy with ${payload.extra_monthly}/month extra.

Debts: {debts}
Monthly income (net): ${sum(i.get('net_monthly',0) for i in ctx['income_sources'] or [] if i.get('is_active'))}
Monthly expenses: ${sum(e.get('monthly_amount',0) for e in ctx['expenses'] or [])}

Simulated plan: {plan['months']} months, ${plan['total_interest']:.0f} interest, ${interest_saved:.0f} saved vs minimums.
Kill order: {order}

Write a 3-4 sentence recommendation that says:
1. Whether '{payload.strategy}' is the right strategy for THIS user
2. Specific extra amount recommendation (could differ from ${payload.extra_monthly})
3. One sharp next-action tip

JSON only:
{{"recommendation": "<3-4 sentences>", "recommended_extra": <number>}}
"""
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"debt-{user_id}",
        system_message=PLOS_SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    response = await chat.send_message(UserMessage(text=prompt))
    text = response if isinstance(response, str) else str(response)
    import json
    import re
    m = re.search(r"\{.*\}", text, re.DOTALL)
    parsed = {}
    if m:
        try:
            parsed = json.loads(m.group(0))
        except Exception:
            parsed = {}

    return {
        "strategy": payload.strategy,
        "extra_monthly": payload.extra_monthly,
        "recommendation": parsed.get("recommendation", text[:400]),
        "recommended_extra": parsed.get("recommended_extra", payload.extra_monthly),
        "total_interest": plan["total_interest"],
        "interest_saved": interest_saved,
        "months_to_debt_free": plan["months"],
        "payment_order": order,
    }


# ----------------------------- Mortgage Analyzer -----------------------
def _amortize(balance: float, apr: float, monthly_payment: float) -> Dict[str, float]:
    """Standard amortization until balance <= 0."""
    monthly_rate = (apr / 100.0) / 12.0
    bal = balance
    total_interest = 0.0
    months = 0
    while bal > 0.01 and months < 600:
        interest = bal * monthly_rate
        principal = monthly_payment - interest
        if principal <= 0:
            return {"months": -1, "total_interest": -1, "monthly_payment": monthly_payment}
        if principal >= bal:
            total_interest += interest
            bal = 0
            months += 1
            break
        bal -= principal
        total_interest += interest
        months += 1
    return {
        "months": months,
        "total_interest": round(total_interest, 2),
        "monthly_payment": round(monthly_payment, 2),
    }


def _payment_for_term(balance: float, apr: float, months: int) -> float:
    monthly_rate = (apr / 100.0) / 12.0
    if monthly_rate == 0:
        return balance / months
    return balance * monthly_rate / (1 - (1 + monthly_rate) ** (-months))


class MortgageScenarioRequest(BaseModel):
    debt_id: Optional[str] = None
    extra_payment: float = 200
    refinance_apr: Optional[float] = None  # if None, suggest current market rate
    refinance_term_months: int = 360


@api_router.post("/finance/mortgage-scenarios")
async def mortgage_scenarios(
    payload: MortgageScenarioRequest, user_id: str = Depends(get_current_user_id)
):
    # Find user's mortgage
    query: Dict[str, Any] = {"user_id": user_id}
    if payload.debt_id:
        query["debt_id"] = payload.debt_id
    else:
        query["debt_type"] = "mortgage"
    mortgage = await db.debts.find_one(query, {"_id": 0, "user_id": 0})
    if not mortgage:
        raise HTTPException(status_code=404, detail="No mortgage found")

    balance = mortgage["balance"]
    apr = mortgage["apr"]
    min_pay = mortgage["minimum_payment"]

    s1 = _amortize(balance, apr, min_pay)
    s2 = _amortize(balance, apr, min_pay + payload.extra_payment)
    refi_apr = payload.refinance_apr if payload.refinance_apr is not None else max(5.0, apr - 1.0)
    refi_payment = _payment_for_term(balance, refi_apr, payload.refinance_term_months)
    s3 = _amortize(balance, refi_apr, refi_payment)

    scenarios = [
        {
            "name": "Pay Minimum",
            "apr": apr,
            "monthly_payment": round(min_pay, 2),
            "months": s1["months"],
            "total_interest": s1["total_interest"],
        },
        {
            "name": f"Extra ${int(payload.extra_payment)}/mo",
            "apr": apr,
            "monthly_payment": round(min_pay + payload.extra_payment, 2),
            "months": s2["months"],
            "total_interest": s2["total_interest"],
        },
        {
            "name": f"Refi @ {refi_apr:.2f}%",
            "apr": refi_apr,
            "monthly_payment": round(refi_payment, 2),
            "months": s3["months"],
            "total_interest": s3["total_interest"],
        },
    ]

    # AI recommendation
    ctx = await gather_user_context(user_id)
    prompt = f"""Mortgage scenarios analysis:
{scenarios}

User financial context: monthly income ${sum(i.get('net_monthly',0) for i in ctx['income_sources'] or [] if i.get('is_active'))}, monthly expenses ${sum(e.get('monthly_amount',0) for e in ctx['expenses'] or [])}, other debts: {[d for d in ctx['debts'] if d['debt_type']!='mortgage']}

Pick the best scenario and explain in 2-3 sentences why. Consider opportunity cost (could the extra payment go to higher-rate debt instead?). JSON only:
{{"best_scenario": "<name from list>", "reasoning": "<2-3 sentences>"}}
"""
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"mortgage-{user_id}",
        system_message=PLOS_SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    response = await chat.send_message(UserMessage(text=prompt))
    text = response if isinstance(response, str) else str(response)
    import json
    import re
    m = re.search(r"\{.*\}", text, re.DOTALL)
    parsed = {}
    if m:
        try:
            parsed = json.loads(m.group(0))
        except Exception:
            parsed = {}

    return {
        "mortgage": {
            "lender": mortgage["lender"],
            "balance": balance,
            "apr": apr,
            "monthly_payment": min_pay,
        },
        "scenarios": scenarios,
        "ai_best_scenario": parsed.get("best_scenario", scenarios[1]["name"]),
        "ai_reasoning": parsed.get("reasoning", text[:400]),
    }


# ----------------------------- Assets ----------------------------------
@api_router.get("/assets", response_model=List[Asset])
async def list_assets(user_id: str = Depends(get_current_user_id)):
    items = await db.assets.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).to_list(1000)
    return [Asset(**i) for i in items]


@api_router.post("/assets", response_model=Asset)
async def create_asset(payload: AssetCreate, user_id: str = Depends(get_current_user_id)):
    obj = Asset(**payload.dict())
    doc = obj.dict()
    doc["user_id"] = user_id
    await db.assets.insert_one(doc)
    return obj


@api_router.delete("/assets/{asset_id}")
async def delete_asset(asset_id: str, user_id: str = Depends(get_current_user_id)):
    await db.assets.delete_one({"asset_id": asset_id, "user_id": user_id})
    return {"ok": True}


# ----------------------------- Investments -----------------------------
@api_router.get("/investments", response_model=List[Investment])
async def list_investments(user_id: str = Depends(get_current_user_id)):
    items = await db.investments.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).to_list(1000)
    return [Investment(**i) for i in items]


@api_router.post("/investments", response_model=Investment)
async def create_investment(
    payload: InvestmentCreate, user_id: str = Depends(get_current_user_id)
):
    if payload.balance < 0:
        raise HTTPException(status_code=400, detail="Balance cannot be negative")
    if payload.contribution_monthly < 0:
        raise HTTPException(
            status_code=400, detail="Monthly contribution cannot be negative"
        )
    obj = Investment(**payload.dict())
    doc = obj.dict()
    doc["user_id"] = user_id
    await db.investments.insert_one(doc)
    return obj


@api_router.put("/investments/{investment_id}", response_model=Investment)
async def update_investment(
    investment_id: str,
    payload: InvestmentUpdate,
    user_id: str = Depends(get_current_user_id),
):
    existing = await db.investments.find_one(
        {"investment_id": investment_id, "user_id": user_id}, {"_id": 0, "user_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Investment not found")
    updates = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None or k in {"nickname", "institution", "growth_rate_override", "beneficiary_name", "notes"}}
    # Validate non-negatives
    if "balance" in updates and updates["balance"] is not None and updates["balance"] < 0:
        raise HTTPException(status_code=400, detail="Balance cannot be negative")
    if (
        "contribution_monthly" in updates
        and updates["contribution_monthly"] is not None
        and updates["contribution_monthly"] < 0
    ):
        raise HTTPException(
            status_code=400, detail="Monthly contribution cannot be negative"
        )
    await db.investments.update_one(
        {"investment_id": investment_id, "user_id": user_id}, {"$set": updates}
    )
    merged = {**existing, **updates}
    return Investment(**merged)


@api_router.delete("/investments/{investment_id}")
async def delete_investment(
    investment_id: str, user_id: str = Depends(get_current_user_id)
):
    await db.investments.delete_one({"investment_id": investment_id, "user_id": user_id})
    return {"ok": True}


# ----------------------------- Investment Analytics --------------------
ACCOUNT_GROWTH_RATE: Dict[str, float] = {
    "TSP": 0.07,
    "IRA": 0.07,
    "brokerage": 0.08,
    "social_security": 0.0,
    "life_insurance": 0.03,
    "cash": 0.045,
    "savings": 0.045,
    "pension": 0.0,
}


def _project_at_65(
    current_balance: float,
    monthly_contribution: float,
    annual_rate: float,
    years: int,
) -> float:
    if years <= 0:
        return current_balance + monthly_contribution * 12 * max(0, years)
    monthly_rate = annual_rate / 12.0
    months = years * 12
    if monthly_rate == 0:
        return current_balance + monthly_contribution * months
    fv_balance = current_balance * ((1 + monthly_rate) ** months)
    fv_contrib = monthly_contribution * (((1 + monthly_rate) ** months - 1) / monthly_rate)
    return fv_balance + fv_contrib


def _years_to_65(dob_iso: Optional[str]) -> int:
    if not dob_iso:
        return 30  # fallback
    try:
        dob = datetime.fromisoformat(dob_iso.replace("Z", "")).replace(tzinfo=None)
        age = (datetime.now() - dob).days / 365.25
        return max(0, int(65 - age))
    except Exception:
        return 30


@api_router.get("/investments/portfolio")
async def investment_portfolio(user_id: str = Depends(get_current_user_id)):
    investments = await db.investments.find(
        {"user_id": user_id}, {"_id": 0, "user_id": 0}
    ).to_list(100)
    profile = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0}) or {}
    incomes = await db.income_sources.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    annual_income = sum(i.get("net_monthly", 0) for i in incomes if i.get("is_active")) * 12

    years = _years_to_65(profile.get("date_of_birth"))
    enriched = []
    total_balance = 0.0
    total_projected = 0.0
    total_monthly_contrib = 0.0
    for inv in investments:
        kind = str(inv.get("type", ""))
        override = inv.get("growth_rate_override")
        rate = float(override) if override is not None else ACCOUNT_GROWTH_RATE.get(kind, 0.06)
        proj = _project_at_65(
            inv.get("balance", 0), inv.get("contribution_monthly", 0), rate, years
        )
        # if backend already had projected_at_65 stored, prefer computed
        inv["projected_at_65"] = round(proj, 2)
        inv["annual_growth_rate"] = rate
        # Simple performance trend: assume +YTD% = growth_rate * (months elapsed)/12
        ytd_months = (datetime.now().month - 1) or 1
        trend_pct = round(rate * (ytd_months / 12.0) * 100, 1)
        inv["trend_pct"] = trend_pct
        total_balance += inv.get("balance", 0)
        total_projected += proj
        total_monthly_contrib += inv.get("contribution_monthly", 0)
        enriched.append(inv)

    # Retirement readiness: 80% income replacement → needed corpus via 4% rule
    needed_annual_at_retirement = annual_income * 0.80
    needed_corpus = needed_annual_at_retirement * 25
    score = 0
    if needed_corpus > 0:
        score = int(min(100, max(0, total_projected / needed_corpus * 100)))

    # Extra monthly needed to close gap
    gap = max(0, needed_corpus - total_projected)
    extra_needed_monthly = 0
    if gap > 0 and years > 0:
        # solve for additional monthly given 7% return
        r = 0.07 / 12
        n = years * 12
        if r > 0:
            extra_needed_monthly = round(gap / (((1 + r) ** n - 1) / r), 2)

    return {
        "total_balance": round(total_balance, 2),
        "total_projected_at_65": round(total_projected, 2),
        "total_monthly_contribution": round(total_monthly_contrib, 2),
        "years_to_65": years,
        "needed_corpus": round(needed_corpus, 2),
        "retirement_readiness_score": score,
        "on_track": score >= 75,
        "monthly_gap": extra_needed_monthly,
        "annual_income": round(annual_income, 2),
        "investments": enriched,
    }


@api_router.get("/investments/summary")
async def investment_summary(user_id: str = Depends(get_current_user_id)):
    """Compact summary suitable for the Home dashboard.

    Fields:
      - total_portfolio_value
      - total_monthly_contributions
      - projected_total_at_65
      - retirement_readiness_score (0-100)
      - monthly_surplus_available_to_invest
    """
    portfolio = await investment_portfolio(user_id)
    incomes = await db.income_sources.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    expenses = await db.expenses.find({"user_id": user_id}, {"_id": 0}).to_list(200)
    monthly_income = sum(i.get("net_monthly", 0) for i in incomes if i.get("is_active"))
    monthly_expenses = sum(e.get("monthly_amount", 0) for e in expenses)
    monthly_surplus = max(0.0, monthly_income - monthly_expenses)
    already_contributing = portfolio.get("total_monthly_contribution", 0)
    available_to_invest = max(0.0, monthly_surplus - already_contributing)

    return {
        "total_portfolio_value": portfolio.get("total_balance", 0),
        "total_monthly_contributions": already_contributing,
        "projected_total_at_65": portfolio.get("total_projected_at_65", 0),
        "retirement_readiness_score": portfolio.get("retirement_readiness_score", 0),
        "monthly_surplus_available_to_invest": round(available_to_invest, 2),
    }


@api_router.post("/investments/contribution-optimizer")
async def contribution_optimizer(user_id: str = Depends(get_current_user_id)):
    portfolio = await investment_portfolio(user_id)
    ctx = await gather_user_context(user_id)
    prompt = f"""User retirement portfolio analysis. Recommend whether to increase
contributions and which account/allocation to favor.

Portfolio: {portfolio}

User financial context:
- Monthly income: ${sum(i.get('net_monthly',0) for i in ctx['income_sources'] or [] if i.get('is_active'))}
- Monthly expenses: ${sum(e.get('monthly_amount',0) for e in ctx['expenses'] or [])}
- High-APR debts: {[d for d in ctx['debts'] if d.get('apr',0) >= 12]}

Return JSON ONLY (no markdown):
{{
  "recommendation": "<2-3 sentences specific to user>",
  "suggested_extra_monthly": <number>,
  "target_account": "<TSP/IRA/brokerage/etc>",
  "allocation_advice": "<1-2 sentences on fund allocation, e.g. G Fund vs C Fund>",
  "employer_match_status": "<one-line on whether match is maxed>"
}}
"""
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"contrib-{user_id}",
        system_message=PLOS_SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    response = await chat.send_message(UserMessage(text=prompt))
    text = response if isinstance(response, str) else str(response)
    import json
    import re
    m = re.search(r"\{.*\}", text, re.DOTALL)
    parsed: Dict[str, Any] = {}
    if m:
        try:
            parsed = json.loads(m.group(0))
        except Exception:
            parsed = {}
    return parsed or {"recommendation": text[:300]}


def _user_finance_snapshot(ctx: Dict[str, Any]) -> Dict[str, float]:
    income = sum(i.get("net_monthly", 0) for i in ctx["income_sources"] or [] if i.get("is_active"))
    expenses = sum(e.get("monthly_amount", 0) for e in ctx["expenses"] or [])
    debt_total = sum(d.get("balance", 0) for d in ctx["debts"] or [])
    high_apr_debt = sum(d.get("balance", 0) for d in ctx["debts"] or [] if d.get("apr", 0) >= 12)
    cc_debt = sum(
        d.get("balance", 0) for d in ctx["debts"] or []
        if d.get("debt_type") == "credit_card"
    )
    liquid = sum(
        inv.get("balance", 0) for inv in ctx["investments"] or []
        if str(inv.get("type", "")).lower() in {"brokerage", "cash", "savings"}
    )
    liquid += sum(
        a.get("current_value", 0) for a in ctx["assets"] or []
        if str(a.get("asset_type", "")).lower() in {"cash", "savings"}
    )
    months_covered = liquid / expenses if expenses > 0 else 0
    surplus = income - expenses
    return {
        "monthly_income": income,
        "monthly_expenses": expenses,
        "monthly_surplus": surplus,
        "total_debt": debt_total,
        "high_apr_debt": high_apr_debt,
        "credit_card_debt": cc_debt,
        "emergency_fund": liquid,
        "emergency_months": months_covered,
    }


@api_router.get("/investments/readiness-gate")
async def readiness_gate(user_id: str = Depends(get_current_user_id)):
    ctx = await gather_user_context(user_id)
    snap = _user_finance_snapshot(ctx)

    # Deterministic checklist
    items = []
    # 1. Emergency fund ≥ 3 months
    items.append({
        "key": "emergency_fund",
        "label": "Emergency fund ≥ 3 months of expenses",
        "ready": snap["emergency_months"] >= 3,
        "detail": f"{snap['emergency_months']:.1f} mo covered (need {3 - snap['emergency_months']:.1f} more)" if snap["emergency_months"] < 3 else "Met",
    })
    # 2. CC debt < $2000
    items.append({
        "key": "cc_debt",
        "label": "Credit card debt below $2,000",
        "ready": snap["credit_card_debt"] < 2000,
        "detail": f"${snap['credit_card_debt']:,.0f} current — pay down ${snap['credit_card_debt']-2000:,.0f} more" if snap["credit_card_debt"] >= 2000 else "Met",
    })
    # 3. Positive monthly surplus
    items.append({
        "key": "surplus",
        "label": "Positive monthly cashflow",
        "ready": snap["monthly_surplus"] > 0,
        "detail": f"${snap['monthly_surplus']:,.0f}/mo" if snap["monthly_surplus"] != 0 else "Trim expenses",
    })

    em_ready = snap["emergency_months"] >= 3
    cc_ready = snap["credit_card_debt"] < 2000
    surplus_ok = snap["monthly_surplus"] > 0

    # Tiered opportunities
    ready_now = []
    blocked = []

    ready_now.append({"name": "Increase TSP contribution", "type": "retirement", "min_to_start": 0})
    ready_now.append({"name": "High-Yield Savings (HYSA, ~4.5% APY)", "type": "cash", "min_to_start": 1})
    ready_now.append({"name": "Series I-Bonds", "type": "bonds", "min_to_start": 25})

    if em_ready and cc_ready:
        ready_now.append({"name": "Conservative index ETFs (VTI/VOO)", "type": "etf", "min_to_start": 1})
    else:
        blocked.append({
            "name": "Stock index ETFs (VTI/VOO)",
            "prerequisites": [
                "Emergency fund ≥ 3 months" if not em_ready else None,
                "Credit card debt < $2,000" if not cc_ready else None,
            ],
        })

    if em_ready and cc_ready and snap["emergency_months"] >= 6 and snap["monthly_surplus"] >= 500:
        ready_now.append({"name": "Individual stocks / sector ETFs", "type": "stock", "min_to_start": 100})
    else:
        blocked.append({
            "name": "Individual stocks",
            "prerequisites": [
                "Emergency fund ≥ 6 months",
                "Monthly surplus ≥ $500",
                "No high-APR debt above $5K",
            ],
        })

    if em_ready and cc_ready and snap["emergency_months"] >= 6 and snap["monthly_surplus"] >= 1000 and snap["high_apr_debt"] < 1000:
        ready_now.append({"name": "Crypto (≤ 5% allocation)", "type": "crypto", "min_to_start": 100})
    else:
        blocked.append({
            "name": "Crypto",
            "prerequisites": [
                "Emergency fund ≥ 6 months",
                "High-APR debt < $1,000",
                "Monthly surplus ≥ $1,000",
            ],
        })

    # Clean None prerequisites
    for b in blocked:
        b["prerequisites"] = [p for p in b["prerequisites"] if p]

    # Re-assessment date: when cc_debt projected to clear at min payment
    reassess_months = 12
    if not cc_ready and snap["credit_card_debt"] > 0:
        # crude estimate
        min_pay = sum(
            d.get("minimum_payment", 0) for d in ctx["debts"] or [] if d.get("debt_type") == "credit_card"
        )
        if min_pay > 0:
            reassess_months = int(min((snap["credit_card_debt"] - 2000) / min_pay + 1, 36))

    return {
        "snapshot": snap,
        "checklist": items,
        "ready_now": ready_now,
        "blocked": blocked,
        "reassessment_in_months": max(1, reassess_months),
        "all_prereqs_met": em_ready and cc_ready and surplus_ok,
    }


@api_router.post("/investments/opportunities")
async def safe_opportunities(user_id: str = Depends(get_current_user_id)):
    ctx = await gather_user_context(user_id)
    snap = _user_finance_snapshot(ctx)
    gate = await readiness_gate(user_id)

    # Static safe opportunities ranked by user surplus + readiness
    base = [
        {
            "name": "Vanguard VOO (S&P 500 ETF)",
            "type": "etf",
            "risk": "low-medium",
            "est_return_annual_pct": 8.0,
            "min_to_start": 100,
            "match_score": 90,
            "instructions": [
                "Open or use existing brokerage (Fidelity, Schwab, Vanguard)",
                "Transfer at least $100",
                "Buy VOO with a market order",
                "Set up monthly recurring buy",
            ],
            "prereqs_met": gate["all_prereqs_met"],
        },
        {
            "name": "Series I Savings Bonds",
            "type": "bonds",
            "risk": "very low",
            "est_return_annual_pct": 4.3,
            "min_to_start": 25,
            "match_score": 85,
            "instructions": [
                "Visit treasurydirect.gov",
                "Create account with SSN",
                "Buy I-Bonds up to $10K/year",
                "Hold ≥ 5 years to avoid interest penalty",
            ],
            "prereqs_met": True,
        },
        {
            "name": "Marcus HYSA (high-yield savings)",
            "type": "cash",
            "risk": "minimal",
            "est_return_annual_pct": 4.5,
            "min_to_start": 1,
            "match_score": 95 if snap["emergency_months"] < 6 else 70,
            "instructions": [
                "Open HYSA at Marcus, Ally, or Wealthfront",
                "Transfer emergency fund here",
                "Automate monthly deposit",
            ],
            "prereqs_met": True,
        },
        {
            "name": "Increase TSP to employer-match max",
            "type": "retirement",
            "risk": "low",
            "est_return_annual_pct": 7.0,
            "min_to_start": 0,
            "match_score": 100,  # always optimal — free money
            "instructions": [
                "Log into TSP.gov",
                "Increase contribution to at least 5% (full match)",
                "Confirm L-Fund or C-Fund allocation matches age horizon",
            ],
            "prereqs_met": True,
        },
        {
            "name": "Backdoor Roth IRA",
            "type": "retirement",
            "risk": "low",
            "est_return_annual_pct": 7.0,
            "min_to_start": 100,
            "match_score": 80 if gate["all_prereqs_met"] else 50,
            "instructions": [
                "Open Traditional + Roth IRA at Fidelity",
                "Contribute $7K to Traditional",
                "Immediately convert to Roth (zero tax owed)",
            ],
            "prereqs_met": gate["all_prereqs_met"],
        },
    ]
    base.sort(key=lambda x: -x["match_score"])
    return {"opportunities": base, "snapshot": snap}


@api_router.get("/investments/market-readiness")
async def market_readiness(user_id: str = Depends(get_current_user_id)):
    ctx = await gather_user_context(user_id)
    snap = _user_finance_snapshot(ctx)
    profile = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0}) or {}
    risk = int(profile.get("risk_tolerance", 5))

    # Stock readiness
    stock_ready = (
        snap["emergency_months"] >= 3
        and snap["credit_card_debt"] < 2000
        and snap["monthly_surplus"] > 0
    )
    # Crypto readiness
    crypto_ready = (
        stock_ready
        and snap["emergency_months"] >= 6
        and snap["monthly_surplus"] >= 1000
        and snap["high_apr_debt"] < 1000
        and risk >= 7
    )

    conditions: List[str] = []
    if not stock_ready:
        if snap["emergency_months"] < 3:
            conditions.append(f"Build emergency fund to 3 months (currently {snap['emergency_months']:.1f})")
        if snap["credit_card_debt"] >= 2000:
            conditions.append(f"Pay credit card debt below $2K (currently ${snap['credit_card_debt']:,.0f})")
        if snap["monthly_surplus"] <= 0:
            conditions.append("Achieve positive monthly cashflow")

    crypto_conditions: List[str] = []
    if not crypto_ready:
        if snap["emergency_months"] < 6:
            crypto_conditions.append(f"Emergency fund to 6 months (currently {snap['emergency_months']:.1f})")
        if snap["monthly_surplus"] < 1000:
            crypto_conditions.append(f"Monthly surplus ≥ $1,000 (currently ${snap['monthly_surplus']:,.0f})")
        if snap["high_apr_debt"] >= 1000:
            crypto_conditions.append(f"Reduce high-APR debt below $1K (currently ${snap['high_apr_debt']:,.0f})")
        if risk < 7:
            crypto_conditions.append(f"Risk tolerance ≥ 7/10 (currently {risk})")

    # Allocation guidance for ready users
    allocation = None
    if stock_ready:
        equity_pct = 60 + (risk - 5) * 5
        equity_pct = max(40, min(85, equity_pct))
        bonds_pct = 100 - equity_pct - (5 if crypto_ready else 0)
        crypto_pct = 5 if crypto_ready else 0
        allocation = {
            "equity_pct": equity_pct,
            "bonds_pct": bonds_pct,
            "crypto_pct": crypto_pct,
        }

    return {
        "stock_ready": stock_ready,
        "crypto_ready": crypto_ready,
        "risk_tolerance": risk,
        "snapshot": snap,
        "stock_conditions_to_meet": conditions,
        "crypto_conditions_to_meet": crypto_conditions,
        "allocation": allocation,
    }


class SocialSecurityRequest(BaseModel):
    current_age: int
    current_salary: float
    years_of_contributions: int
    life_expectancy: int = 85


@api_router.post("/investments/social-security")
async def social_security_estimator(
    payload: SocialSecurityRequest, user_id: str = Depends(get_current_user_id)
):
    # Simplified PIA: ~32% of annual salary at FRA (67), capped at SSA max
    monthly_salary = payload.current_salary / 12.0
    base_pia = min(monthly_salary * 0.32, 3822.0)
    # Penalty for years short of 35
    years_factor = min(1.0, payload.years_of_contributions / 35.0)
    pia = base_pia * (0.6 + 0.4 * years_factor)

    # Adjustments by claim age
    at_62 = pia * 0.70
    at_67 = pia
    at_70 = pia * 1.24

    # Lifetime totals to life_expectancy
    def lifetime(monthly: float, start_age: int) -> float:
        months = max(0, (payload.life_expectancy - start_age) * 12)
        return monthly * months

    lt_62 = lifetime(at_62, 62)
    lt_67 = lifetime(at_67, 67)
    lt_70 = lifetime(at_70, 70)

    # Break-even ages — find when lifetime totals cross over
    # Break-even 62 vs 67: solve for X where 62-X cumulative = 67-X cumulative
    # at age X (>= 67): at_62*(X-62)*12 = at_67*(X-67)*12 → X = (67*at_67 - 62*at_62)/(at_67-at_62)
    be_62_vs_67 = (
        (67 * at_67 - 62 * at_62) / (at_67 - at_62) if at_67 != at_62 else 80
    )
    be_67_vs_70 = (
        (70 * at_70 - 67 * at_67) / (at_70 - at_67) if at_70 != at_67 else 82
    )

    # Recommend optimal age based on life expectancy
    options = [(62, lt_62), (67, lt_67), (70, lt_70)]
    best_age = max(options, key=lambda x: x[1])[0]

    return {
        "monthly_at_62": round(at_62, 2),
        "monthly_at_67": round(at_67, 2),
        "monthly_at_70": round(at_70, 2),
        "lifetime_at_62": round(lt_62, 2),
        "lifetime_at_67": round(lt_67, 2),
        "lifetime_at_70": round(lt_70, 2),
        "break_even_62_vs_67_age": round(be_62_vs_67, 1),
        "break_even_67_vs_70_age": round(be_67_vs_70, 1),
        "recommended_claim_age": best_age,
        "reasoning": (
            f"Given life expectancy of {payload.life_expectancy}, claiming at "
            f"{best_age} maximizes lifetime benefits."
        ),
    }


class RiskToleranceUpdate(BaseModel):
    risk_tolerance: int  # 1-10


@api_router.put("/profile/risk-tolerance")
async def set_risk_tolerance(
    payload: RiskToleranceUpdate, user_id: str = Depends(get_current_user_id)
):
    val = max(1, min(10, payload.risk_tolerance))
    await db.user_profile.update_one(
        {"user_id": user_id}, {"$set": {"risk_tolerance": val}}
    )
    return {"risk_tolerance": val}


# ----------------------------- Career ----------------------------------
@api_router.get("/career", response_model=CareerProfile)
async def get_career(user_id: str = Depends(get_current_user_id)):
    doc = await db.career_profile.find_one({"user_id": user_id}, {"_id": 0, "user_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Career profile not found")
    return CareerProfile(**doc)


@api_router.put("/career", response_model=CareerProfile)
async def update_career(
    payload: CareerProfileUpdate, user_id: str = Depends(get_current_user_id)
):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    await db.career_profile.update_one({"user_id": user_id}, {"$set": update})
    doc = await db.career_profile.find_one({"user_id": user_id}, {"_id": 0, "user_id": 0})
    return CareerProfile(**doc)


@api_router.get("/job-applications", response_model=List[JobApplication])
async def list_applications(user_id: str = Depends(get_current_user_id)):
    items = await db.job_applications.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).to_list(1000)
    return [JobApplication(**i) for i in items]


@api_router.post("/job-applications", response_model=JobApplication)
async def create_application(
    payload: JobApplicationCreate, user_id: str = Depends(get_current_user_id)
):
    obj = JobApplication(**payload.dict())
    doc = obj.dict()
    doc["user_id"] = user_id
    await db.job_applications.insert_one(doc)
    return obj


@api_router.delete("/job-applications/{application_id}")
async def delete_application(
    application_id: str, user_id: str = Depends(get_current_user_id)
):
    await db.job_applications.delete_one(
        {"application_id": application_id, "user_id": user_id}
    )
    return {"ok": True}


@api_router.put("/job-applications/{application_id}", response_model=JobApplication)
async def update_application(
    application_id: str,
    payload: JobApplicationUpdate,
    user_id: str = Depends(get_current_user_id),
):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    res = await db.job_applications.update_one(
        {"application_id": application_id, "user_id": user_id}, {"$set": update}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Application not found")
    doc = await db.job_applications.find_one(
        {"application_id": application_id, "user_id": user_id},
        {"_id": 0, "user_id": 0},
    )
    return JobApplication(**doc)


# ----------------------------- Career AI ------------------------------
class ResumeAnalyzeRequest(BaseModel):
    resume_text: Optional[str] = None  # if None, use stored master


@api_router.post("/career/resume-analyze")
async def resume_analyze(
    payload: ResumeAnalyzeRequest = ResumeAnalyzeRequest(),
    user_id: str = Depends(get_current_user_id),
):
    """Claude analyzes resume → returns ats_score, strengths[], gaps[], improvements[]."""
    career = await db.career_profile.find_one(
        {"user_id": user_id}, {"_id": 0, "user_id": 0}
    )
    resume = payload.resume_text or (career or {}).get("resume_master_text") or ""
    if not resume.strip():
        return {
            "ats_score": 0,
            "strengths": [],
            "gaps": ["No resume on file. Add your resume to get an analysis."],
            "improvements": [],
        }

    target_roles = (career or {}).get("target_roles", [])
    prompt = f"""Analyze this resume for ATS optimization and quality.
Target roles: {target_roles}

Resume:
\"\"\"{resume[:8000]}\"\"\"

Return JSON ONLY (no markdown):
{{
  "ats_score": <0-100 int>,
  "strengths": ["<strength1>", "<strength2>", "<strength3>"],
  "gaps": ["<gap1>", "<gap2>", "<gap3>"],
  "improvements": ["<specific improvement 1>", "<2>", "<3>", "<4>"]
}}
"""
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"resume-{user_id}",
        system_message=PLOS_SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    response = await chat.send_message(UserMessage(text=prompt))
    text = response if isinstance(response, str) else str(response)
    import json
    import re
    m = re.search(r"\{.*\}", text, re.DOTALL)
    parsed: Dict[str, Any] = {}
    if m:
        try:
            parsed = json.loads(m.group(0))
        except Exception:
            parsed = {}

    ats = int(parsed.get("ats_score", 0))
    # persist
    await db.career_profile.update_one(
        {"user_id": user_id}, {"$set": {"ats_score": ats}}
    )
    return {
        "ats_score": ats,
        "strengths": parsed.get("strengths", []),
        "gaps": parsed.get("gaps", []),
        "improvements": parsed.get("improvements", []),
    }


class GenerateApplicationRequest(BaseModel):
    application_id: Optional[str] = None
    role_title: str
    employer: str
    job_description: str


@api_router.post("/career/generate")
async def generate_application(
    payload: GenerateApplicationRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Generates ATS-optimized resume + cover letter for a specific job + keyword
    match analysis."""
    career = await db.career_profile.find_one(
        {"user_id": user_id}, {"_id": 0, "user_id": 0}
    )
    master = (career or {}).get("resume_master_text") or ""

    prompt = f"""Tailor an ATS-optimized resume and cover letter for this job.

ROLE: {payload.role_title} at {payload.employer}

JOB DESCRIPTION:
\"\"\"{payload.job_description[:5000]}\"\"\"

CANDIDATE MASTER RESUME:
\"\"\"{master[:5000]}\"\"\"

CANDIDATE CONTEXT:
- Current role: {(career or {}).get('current_title')}
- Current employer: {(career or {}).get('current_employer')}
- Target roles: {(career or {}).get('target_roles')}

Return JSON ONLY (no markdown):
{{
  "resume": "<full ATS-optimized resume text, copy-paste ready, plain text>",
  "cover_letter": "<3-paragraph cover letter, personalized to this employer>",
  "keywords_present": ["<keyword1>", "<keyword2>"],
  "keywords_missing": ["<missing1>", "<missing2>"],
  "match_score": <0-100 int>
}}
"""
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"gen-{user_id}-{uuid.uuid4()}",
        system_message=PLOS_SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    response = await chat.send_message(UserMessage(text=prompt))
    text = response if isinstance(response, str) else str(response)
    import json
    import re
    m = re.search(r"\{.*\}", text, re.DOTALL)
    parsed: Dict[str, Any] = {}
    if m:
        try:
            parsed = json.loads(m.group(0))
        except Exception:
            parsed = {}

    result = {
        "resume": parsed.get("resume", ""),
        "cover_letter": parsed.get("cover_letter", ""),
        "keywords_present": parsed.get("keywords_present", []),
        "keywords_missing": parsed.get("keywords_missing", []),
        "match_score": int(parsed.get("match_score", 0)),
    }

    # Persist to application if id provided
    if payload.application_id:
        await db.job_applications.update_one(
            {
                "application_id": payload.application_id,
                "user_id": user_id,
            },
            {
                "$set": {
                    "generated_resume": result["resume"],
                    "generated_cover_letter": result["cover_letter"],
                    "match_score": result["match_score"],
                    "job_description": payload.job_description,
                }
            },
        )
    return result


@api_router.post("/career/path-advisor")
async def path_advisor(user_id: str = Depends(get_current_user_id)):
    """Claude proposes 3 career paths with cert/courses/timeline/salary."""
    career = await db.career_profile.find_one(
        {"user_id": user_id}, {"_id": 0, "user_id": 0}
    )
    if not career:
        raise HTTPException(status_code=404, detail="Career profile not found")

    prompt = f"""Based on this candidate, propose 3 distinct career path options.

CANDIDATE:
{career}

For each path:
- name (concise)
- description (1-2 sentences)
- timeline (e.g. "6-12 months")
- target_salary_range (USD)
- required_skills (array of 3-5)
- certifications (array of 2-3 with name + provider like Coursera/LinkedIn/AWS)
- next_action (1 sentence)

Return JSON ONLY:
{{"paths": [{{"name":"","description":"","timeline":"","target_salary_range":"","required_skills":[],"certifications":[{{"name":"","provider":""}}],"next_action":""}}, ...]}}
"""
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"path-{user_id}",
        system_message=PLOS_SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    response = await chat.send_message(UserMessage(text=prompt))
    text = response if isinstance(response, str) else str(response)
    import json
    import re
    m = re.search(r"\{.*\}", text, re.DOTALL)
    parsed: Dict[str, Any] = {}
    if m:
        try:
            parsed = json.loads(m.group(0))
        except Exception:
            parsed = {}
    return {"paths": parsed.get("paths", [])}


# ----------------------------- Pipeline -------------------------------
@api_router.get("/career/pipeline")
async def career_pipeline(user_id: str = Depends(get_current_user_id)):
    """Return application counts by stage + interviews_pending + new_matches counts."""
    stages = ["matched", "applied", "screening", "interview", "offer", "rejected"]
    counts: Dict[str, int] = {}
    for s in stages:
        counts[s] = await db.job_applications.count_documents(
            {"user_id": user_id, "status": s}
        )
    return {
        "counts": counts,
        "new_matches": counts.get("matched", 0),
        "applications_sent": counts.get("applied", 0)
        + counts.get("screening", 0)
        + counts.get("interview", 0)
        + counts.get("offer", 0),
        "interviews_pending": counts.get("interview", 0),
    }


# ----------------------------- Health ----------------------------------
@api_router.get("/health-profile", response_model=HealthProfile)
async def get_health(user_id: str = Depends(get_current_user_id)):
    doc = await db.health_profile.find_one({"user_id": user_id}, {"_id": 0, "user_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Health profile not found")
    return HealthProfile(**doc)


@api_router.put("/health-profile", response_model=HealthProfile)
async def update_health(
    payload: HealthProfileUpdate, user_id: str = Depends(get_current_user_id)
):
    update = {k: v for k, v in payload.dict().items() if v is not None}
    await db.health_profile.update_one({"user_id": user_id}, {"$set": update})
    doc = await db.health_profile.find_one({"user_id": user_id}, {"_id": 0, "user_id": 0})
    return HealthProfile(**doc)


# ----------------------------- AI Decisions Log ------------------------
@api_router.get("/ai-decisions", response_model=List[AIDecision])
async def list_decisions(user_id: str = Depends(get_current_user_id)):
    items = (
        await db.ai_decisions_log.find({"user_id": user_id}, {"_id": 0, "user_id": 0})
        .sort("generated_at", -1)
        .to_list(100)
    )
    return [AIDecision(**i) for i in items]


@api_router.post("/ai-decisions/{decision_id}/ack")
async def ack_decision(decision_id: str, user_id: str = Depends(get_current_user_id)):
    await db.ai_decisions_log.update_one(
        {"decision_id": decision_id, "user_id": user_id},
        {"$set": {"was_acted_on": True}},
    )
    return {"ok": True}


# ----------------------------- AI Helpers ------------------------------
async def gather_user_context(user_id: str) -> Dict[str, Any]:
    """Collect comprehensive user data for AI context."""
    profile = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0})
    income = await db.income_sources.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).to_list(100)
    expenses = await db.expenses.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).to_list(100)
    debts = await db.debts.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).to_list(100)
    assets = await db.assets.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).to_list(100)
    investments = await db.investments.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).to_list(100)
    career = await db.career_profile.find_one({"user_id": user_id}, {"_id": 0, "user_id": 0})
    health = await db.health_profile.find_one({"user_id": user_id}, {"_id": 0, "user_id": 0})

    return {
        "profile": profile,
        "income_sources": income,
        "expenses": expenses,
        "debts": debts,
        "assets": assets,
        "investments": investments,
        "career": career,
        "health": health,
    }


PLOS_SYSTEM_PROMPT = """You are PLOS, the Personal Life Operating System — a calm, brilliant, no-nonsense personal CFO and life strategist.

You manage every dimension of the user's life: finance, career, safety, investments, health, and beyond.
You receive the user's complete data context and give SHARP, ACTIONABLE, PERSONALIZED advice.

Style rules:
- Be concise. 2-4 sentences max for advice cards. Longer only when the user explicitly asks.
- Use dollar amounts, percentages, dates. Be specific, not generic.
- Prioritize by impact: emergencies first, then high-leverage moves, then optimizations.
- Never be preachy. Sound like a trusted friend who happens to be a Goldman MD + life coach.
"""


@api_router.post("/ai/advice", response_model=AIDecision)
async def generate_advice(
    payload: AIAdviceRequest, user_id: str = Depends(get_current_user_id)
):
    """Generate a single AI advice card for a given module using full user context."""
    context = await gather_user_context(user_id)

    prompt = f"""User module: {payload.module}
Extra hint: {payload.context_hint or "general daily advice"}

User context (JSON):
{context}

Respond with EXACTLY this JSON format (no markdown, no preamble):
{{"priority": "urgent|action|info", "advice": "<2-4 sentence advice>"}}
"""

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"advice-{user_id}-{payload.module}",
        system_message=PLOS_SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    try:
        response = await chat.send_message(UserMessage(text=prompt))
        text = response.strip() if isinstance(response, str) else str(response).strip()

        # Try to parse JSON
        import json
        import re

        json_match = re.search(r"\{.*\}", text, re.DOTALL)
        priority = "info"
        advice = text
        if json_match:
            try:
                parsed = json.loads(json_match.group(0))
                priority = parsed.get("priority", "info")
                advice = parsed.get("advice", text)
            except Exception:
                pass

        if priority not in ("urgent", "action", "info"):
            priority = "info"

        decision = AIDecision(
            module=payload.module,
            advice_text=advice,
            priority=priority,
            was_acted_on=False,
        )
        doc = decision.dict()
        doc["user_id"] = user_id
        await db.ai_decisions_log.insert_one(doc)
        return decision
    except Exception as e:
        logger.exception("AI advice generation failed")
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")


# ----------------------------- Chatbot ---------------------------------
MODE_OVERLAYS: Dict[str, str] = {
    "legal": (
        "MODE: LEGAL ADVISOR. Focus on US legal frameworks for the user's situation "
        "(GA tenant law, employment/at-will doctrine, debt collection / FDCPA, immigration). "
        "ALWAYS end your response with: '⚖️ This is general legal information, not legal advice. "
        "For specific matters, consult a licensed attorney in your jurisdiction.'"
    ),
    "financial": (
        "MODE: FINANCIAL PLANNER. Provide concrete numerical analysis using the user's real data. "
        "Show calculations (interest, amortization, IRR/NPV) step-by-step. Use tables/bullets. "
        "Prefer Roth IRA / 457(b) / index-fund recommendations consistent with the user's risk profile."
    ),
    "career": (
        "MODE: CAREER COACH. Focus on resume optimization, interview prep, salary negotiation, "
        "and career trajectory. Tailor advice to USAID / GSU Perimeter / LearnWise background and "
        "target roles. Offer to draft resume bullets, cover letters, or LinkedIn copy."
    ),
    "travel": (
        "MODE: TRAVEL PLANNER. Help with destination research, visa requirements, packing lists, "
        "and itinerary building. Be specific about US passport rules and country-by-country entry. "
        "Reference the user's saved trips when relevant."
    ),
}


def _conversation_title(text: str) -> str:
    t = (text or "").strip().splitlines()[0]
    return (t[:60] + "…") if len(t) > 60 else (t or "New conversation")


@api_router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, user_id: str = Depends(get_current_user_id)):
    session_id = payload.session_id or f"chat-{user_id}-{uuid.uuid4()}"
    context = await gather_user_context(user_id)
    mode = (payload.mode or "general").lower()
    overlay = MODE_OVERLAYS.get(mode, "")

    # persist user message
    await db.chat_messages.insert_one({
        "user_id": user_id,
        "session_id": session_id,
        "role": "user",
        "content": payload.message,
        "mode": mode,
        "created_at": iso(now_utc()),
    })

    # Upsert conversation metadata
    title_doc = await db.chat_conversations.find_one({"user_id": user_id, "session_id": session_id})
    if not title_doc:
        await db.chat_conversations.insert_one({
            "user_id": user_id,
            "session_id": session_id,
            "title": _conversation_title(payload.message),
            "mode": mode,
            "created_at": iso(now_utc()),
            "last_message_at": iso(now_utc()),
        })
    else:
        await db.chat_conversations.update_one(
            {"user_id": user_id, "session_id": session_id},
            {"$set": {"last_message_at": iso(now_utc()), "mode": mode}},
        )

    system = PLOS_SYSTEM_PROMPT
    if overlay:
        system = system + "\n\n" + overlay
    system = system + f"\n\nThe user's full data context (use it to answer):\n{context}"

    chat_client = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    try:
        response = await chat_client.send_message(UserMessage(text=payload.message))
        response_text = response if isinstance(response, str) else str(response)
    except Exception as e:
        logger.exception("Chat failed")
        raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)}")

    await db.chat_messages.insert_one({
        "user_id": user_id,
        "session_id": session_id,
        "role": "assistant",
        "content": response_text,
        "mode": mode,
        "created_at": iso(now_utc()),
    })

    await db.chat_conversations.update_one(
        {"user_id": user_id, "session_id": session_id},
        {"$set": {"last_message_at": iso(now_utc())}},
    )

    return ChatResponse(response=response_text, session_id=session_id)


@api_router.get("/chatbot/conversations")
async def list_conversations(user_id: str = Depends(get_current_user_id)):
    # Backfill: ensure any orphan chat_messages have a corresponding conversation row
    distinct_sessions = await db.chat_messages.distinct("session_id", {"user_id": user_id})
    known = {c["session_id"] async for c in db.chat_conversations.find({"user_id": user_id}, {"session_id": 1})}
    for sid in distinct_sessions:
        if sid not in known:
            first = await db.chat_messages.find_one(
                {"user_id": user_id, "session_id": sid, "role": "user"},
                sort=[("created_at", 1)],
            )
            last = await db.chat_messages.find_one(
                {"user_id": user_id, "session_id": sid},
                sort=[("created_at", -1)],
            )
            await db.chat_conversations.insert_one({
                "user_id": user_id,
                "session_id": sid,
                "title": _conversation_title((first or {}).get("content", "")),
                "mode": (first or {}).get("mode", "general"),
                "created_at": (first or {}).get("created_at", iso(now_utc())),
                "last_message_at": (last or {}).get("created_at", iso(now_utc())),
            })

    rows = await db.chat_conversations.find(
        {"user_id": user_id}, {"_id": 0, "user_id": 0}
    ).sort("last_message_at", -1).to_list(50)
    # Add message_count
    out = []
    for r in rows:
        count = await db.chat_messages.count_documents({"user_id": user_id, "session_id": r["session_id"]})
        r["message_count"] = count
        out.append(r)
    return {"conversations": out}


@api_router.delete("/chatbot/conversations/{session_id}")
async def delete_conversation(session_id: str, user_id: str = Depends(get_current_user_id)):
    await db.chat_messages.delete_many({"user_id": user_id, "session_id": session_id})
    await db.chat_conversations.delete_one({"user_id": user_id, "session_id": session_id})
    return {"ok": True}


@api_router.delete("/chatbot/conversations")
async def clear_all_conversations(user_id: str = Depends(get_current_user_id)):
    msg_r = await db.chat_messages.delete_many({"user_id": user_id})
    conv_r = await db.chat_conversations.delete_many({"user_id": user_id})
    return {"ok": True, "messages_deleted": msg_r.deleted_count, "conversations_deleted": conv_r.deleted_count}


@api_router.get("/chatbot/search")
async def search_messages(q: str, user_id: str = Depends(get_current_user_id)):
    if not q or len(q.strip()) < 2:
        return {"results": []}
    # Case-insensitive regex search across content
    import re as _re
    pattern = _re.escape(q.strip())
    cursor = db.chat_messages.find(
        {"user_id": user_id, "content": {"$regex": pattern, "$options": "i"}},
        {"_id": 0, "user_id": 0},
    ).sort("created_at", -1).limit(50)
    items = await cursor.to_list(50)
    return {"results": items}


@api_router.get("/chatbot/quick-actions")
async def quick_actions():
    return {"prompts": [
        "Analyze my finances today",
        "Am I on track for retirement?",
        "Should I refinance my mortgage?",
        "What job should I apply to next?",
        "How do I improve my credit score?",
        "What business should I start?",
        "Is my debt payoff plan optimal?",
        "Review my investment strategy",
    ]}


@api_router.get("/chat/history")
async def chat_history(
    session_id: Optional[str] = None, user_id: str = Depends(get_current_user_id)
):
    query: Dict[str, Any] = {"user_id": user_id}
    if session_id:
        query["session_id"] = session_id
    items = (
        await db.chat_messages.find(query, {"_id": 0, "user_id": 0})
        .sort("created_at", 1)
        .to_list(500)
    )
    return items


# ----------------------------- Dashboard Summary -----------------------
def compute_financial_health(
    monthly_income: float,
    monthly_expenses: float,
    total_debt: float,
    emergency_fund: float,
    monthly_contributions: float,
) -> Dict[str, Any]:
    """Weighted financial health score.
    surplus 25%, dti 25%, emergency 20%, credit_est 15%, investment_rate 15%."""
    # Surplus ratio (0..1) — full credit at 30%+ savings rate
    if monthly_income > 0:
        surplus_ratio = max(0, (monthly_income - monthly_expenses) / monthly_income)
        surplus_score = min(1.0, surplus_ratio / 0.30)
    else:
        surplus_score = 0

    # Debt-to-income ratio — annual income vs total debt balance. <50% = good
    if monthly_income > 0:
        annual_income = monthly_income * 12
        dti = total_debt / annual_income if annual_income > 0 else 99
        # full credit if dti <= 0.5, zero if dti >= 4
        dti_score = max(0, min(1.0, 1.0 - max(0, dti - 0.5) / 3.5))
    else:
        dti_score = 0

    # Emergency fund coverage — months
    if monthly_expenses > 0:
        months_covered = emergency_fund / monthly_expenses
    else:
        months_covered = 0
    ef_score = min(1.0, months_covered / 6.0)

    # Credit score estimate — heuristic: assume 720 baseline, penalize if debt high
    if monthly_income > 0:
        dti_for_credit = (total_debt / 12) / monthly_income if monthly_income else 1
        credit_est = max(580, 800 - int(dti_for_credit * 200))
    else:
        credit_est = 650
    credit_score_norm = max(0, min(1.0, (credit_est - 580) / (850 - 580)))

    # Investment contribution rate
    if monthly_income > 0:
        inv_rate = monthly_contributions / monthly_income
        inv_score = min(1.0, inv_rate / 0.15)  # 15% target
    else:
        inv_score = 0

    weighted = (
        surplus_score * 25
        + dti_score * 25
        + ef_score * 20
        + credit_score_norm * 15
        + inv_score * 15
    )
    score = max(0, min(100, round(weighted)))

    return {
        "score": score,
        "components": {
            "surplus": round(surplus_score * 100),
            "debt_to_income": round(dti_score * 100),
            "emergency_fund": round(ef_score * 100),
            "credit_estimate": credit_est,
            "investment_rate": round(inv_score * 100),
        },
        "emergency_months": round(months_covered, 1),
    }


@api_router.get("/dashboard")
async def dashboard(user_id: str = Depends(get_current_user_id)):
    ctx = await gather_user_context(user_id)
    income = ctx["income_sources"] or []
    expenses = ctx["expenses"] or []
    debts = ctx["debts"] or []
    assets = ctx["assets"] or []
    investments = ctx["investments"] or []

    monthly_income = sum(i.get("net_monthly", 0) for i in income if i.get("is_active"))
    monthly_expenses = sum(e.get("monthly_amount", 0) for e in expenses)
    total_debt = sum(d.get("balance", 0) for d in debts)
    total_assets = sum(a.get("current_value", 0) for a in assets)
    total_investments = sum(inv.get("balance", 0) for inv in investments)
    net_worth = total_assets + total_investments - total_debt

    # Emergency fund = liquid assets (brokerage + any asset type "cash")
    liquid_types = {"brokerage", "cash", "savings"}
    emergency_fund = sum(
        inv.get("balance", 0)
        for inv in investments
        if str(inv.get("type", "")).lower() in liquid_types
    )
    emergency_fund += sum(
        a.get("current_value", 0)
        for a in assets
        if str(a.get("asset_type", "")).lower() in liquid_types
    )

    monthly_contributions = sum(
        inv.get("contribution_monthly", 0) for inv in investments
    )

    health = compute_financial_health(
        monthly_income,
        monthly_expenses,
        total_debt,
        emergency_fund,
        monthly_contributions,
    )
    score = health["score"]
    cashflow = monthly_income - monthly_expenses

    # persist score + net worth
    await db.user_profile.update_one(
        {"user_id": user_id},
        {"$set": {
            "financial_health_score": score,
            "net_worth_usd": net_worth,
            "last_updated": iso(now_utc()),
        }},
    )

    recent_decisions = (
        await db.ai_decisions_log.find({"user_id": user_id}, {"_id": 0, "user_id": 0})
        .sort("generated_at", -1)
        .to_list(5)
    )

    return {
        "monthly_income": monthly_income,
        "monthly_expenses": monthly_expenses,
        "monthly_cashflow": cashflow,
        "monthly_surplus": cashflow,
        "total_debt": total_debt,
        "total_assets": total_assets,
        "total_investments": total_investments,
        "total_liabilities": total_debt,
        "net_worth": net_worth,
        "financial_health_score": score,
        "score_components": health["components"],
        "emergency_fund": emergency_fund,
        "emergency_months": health["emergency_months"],
        "emergency_target_months": 6,
        "monthly_investment_contribution": monthly_contributions,
        "income_count": len(income),
        "expense_count": len(expenses),
        "debt_count": len(debts),
        "asset_count": len(assets),
        "investment_count": len(investments),
        "recent_ai_decisions": recent_decisions,
    }


# ----------------------------- Alerts ---------------------------------
@api_router.get("/alerts")
async def get_alerts(user_id: str = Depends(get_current_user_id)):
    """Generate dynamic alerts from user data: due payments, high-APR debts,
    new job matches, low wellness."""
    ctx = await gather_user_context(user_id)
    today = now_utc()
    alerts: List[Dict[str, Any]] = []

    # Upcoming expenses due within 7 days
    for e in ctx["expenses"] or []:
        due = e.get("due_day_of_month", 1)
        # next occurrence
        next_month = today.month if today.day <= due else (today.month % 12) + 1
        next_year = today.year if today.day <= due else (
            today.year + (1 if today.month == 12 else 0)
        )
        try:
            next_due = datetime(next_year, next_month, min(due, 28), tzinfo=timezone.utc)
            days = (next_due - today).days
        except Exception:
            continue
        if 0 <= days <= 7 and not e.get("auto_pay"):
            alerts.append({
                "id": f"exp-{e.get('expense_id')}",
                "severity": "warning",
                "icon": "credit-card",
                "title": f"{e.get('vendor')} due in {days}d",
                "subtitle": f"${e.get('monthly_amount'):,.0f} · {e.get('category')}",
                "route": "/(tabs)/finance",
                "time_label": f"{days}d",
            })

    # High-APR debts (>15%)
    for d in ctx["debts"] or []:
        if d.get("apr", 0) >= 15:
            alerts.append({
                "id": f"debt-{d.get('debt_id')}",
                "severity": "urgent",
                "icon": "alert-triangle",
                "title": f"{d.get('lender')} APR is {d.get('apr')}%",
                "subtitle": f"Balance ${d.get('balance'):,.0f} — prioritize payoff",
                "route": "/(tabs)/finance",
                "time_label": "now",
            })

    # New job matches (status=matched)
    job_apps = await db.job_applications.find(
        {"user_id": user_id, "status": "matched"}, {"_id": 0, "user_id": 0}
    ).to_list(20)
    for j in job_apps[:3]:
        alerts.append({
            "id": f"job-{j.get('application_id')}",
            "severity": "info",
            "icon": "briefcase",
            "title": f"New match: {j.get('role_title')}",
            "subtitle": f"{j.get('employer')} · {j.get('match_score')}% match",
            "route": "/(tabs)/career",
            "time_label": "new",
        })

    # Upcoming interviews (status=interview)
    interview_apps = await db.job_applications.find(
        {"user_id": user_id, "status": "interview"}, {"_id": 0, "user_id": 0}
    ).to_list(10)
    for j in interview_apps:
        alerts.append({
            "id": f"intv-{j.get('application_id')}",
            "severity": "urgent",
            "icon": "phone",
            "title": f"Interview: {j.get('employer')}",
            "subtitle": f"{j.get('role_title')} — prep required",
            "route": "/(tabs)/career",
            "time_label": "soon",
        })

    # Wellness low
    health = ctx.get("health") or {}
    wscore = health.get("wellness_checkin_score", 5)
    if wscore <= 4:
        alerts.append({
            "id": "wellness-low",
            "severity": "warning",
            "icon": "heart-pulse",
            "title": f"Wellness check-in low ({wscore}/10)",
            "subtitle": "Schedule a self-care break this week",
            "route": "/module/health",
            "time_label": "today",
        })

    # Insurance renewal soon (within 60 days)
    renewal = health.get("coverage_renewal_date")
    if renewal:
        try:
            rd = datetime.fromisoformat(renewal.replace("Z", ""))
            if rd.tzinfo is None:
                rd = rd.replace(tzinfo=timezone.utc)
            days = (rd - today).days
            if 0 <= days <= 60:
                alerts.append({
                    "id": "insurance-renewal",
                    "severity": "info",
                    "icon": "shield",
                    "title": f"Insurance renews in {days}d",
                    "subtitle": health.get("insurance_type") or "Review coverage",
                    "route": "/module/health",
                    "time_label": f"{days}d",
                })
        except Exception:
            pass

    # Positive: cashflow good
    income = sum(i.get("net_monthly", 0) for i in ctx["income_sources"] or [] if i.get("is_active"))
    expenses_total = sum(e.get("monthly_amount", 0) for e in ctx["expenses"] or [])
    if income > 0 and (income - expenses_total) / income > 0.30:
        alerts.append({
            "id": "savings-strong",
            "severity": "good",
            "icon": "trending-up",
            "title": "Savings rate above 30%",
            "subtitle": f"+${income - expenses_total:,.0f}/mo surplus",
            "route": "/(tabs)/finance",
            "time_label": "good",
        })

    # sort by severity
    sev_order = {"urgent": 0, "warning": 1, "info": 2, "good": 3}
    alerts.sort(key=lambda a: sev_order.get(a["severity"], 9))
    return {"alerts": alerts, "count": len(alerts)}


# ----------------------------- Daily Advice ---------------------------
class DailyAdviceRequest(BaseModel):
    force: bool = False
    deep: bool = False


@api_router.post("/ai/daily-advice")
async def daily_advice(
    payload: DailyAdviceRequest = DailyAdviceRequest(),
    user_id: str = Depends(get_current_user_id),
):
    """Returns today's AI Daily Advice (cached once per day, refreshes after 6 AM).
    Returns 2-3 specific actionable bullets. If deep=True, returns longer analysis."""
    today = now_utc().date().isoformat()
    cache_key = f"daily-{user_id}-{today}-{'deep' if payload.deep else 'short'}"

    if not payload.force:
        cached = await db.daily_advice_cache.find_one({"key": cache_key}, {"_id": 0})
        if cached:
            return cached["payload"]

    context = await gather_user_context(user_id)

    if payload.deep:
        instruction = (
            "Provide a DEEP analysis (5-8 sentences) covering: top financial risk, "
            "highest-leverage action, one career insight, one health/safety nudge. "
            "Cite specific dollar amounts and percentages from the data."
        )
        prompt = f"""Today is {today}. {instruction}

User context (JSON):
{context}

Respond with EXACTLY this JSON (no markdown):
{{"summary": "<one-line headline>", "items": ["<bullet1>", "<bullet2>", "<bullet3>"], "deep_analysis": "<5-8 sentences>"}}
"""
    else:
        prompt = f"""Today is {today}. Give 2-3 specific, actionable pieces of advice for TODAY.
Each item must reference real numbers from the user's data and feel custom — not generic.

User context (JSON):
{context}

Respond with EXACTLY this JSON (no markdown):
{{"summary": "<one-line headline summarizing the day>", "items": ["<advice1>", "<advice2>", "<advice3>"]}}
"""

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"daily-{user_id}-{today}",
        system_message=PLOS_SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    response = await chat.send_message(UserMessage(text=prompt))
    text = response.strip() if isinstance(response, str) else str(response).strip()

    import json
    import re

    json_match = re.search(r"\{.*\}", text, re.DOTALL)
    parsed: Dict[str, Any] = {}
    if json_match:
        try:
            parsed = json.loads(json_match.group(0))
        except Exception:
            parsed = {}

    result = {
        "summary": parsed.get("summary", "Stay on plan today."),
        "items": parsed.get("items", [text[:240]]) if not parsed.get("items") else parsed.get("items"),
        "deep_analysis": parsed.get("deep_analysis"),
        "generated_at": iso(now_utc()),
        "date": today,
    }

    await db.daily_advice_cache.update_one(
        {"key": cache_key},
        {"$set": {"key": cache_key, "user_id": user_id, "payload": result}},
        upsert=True,
    )
    return result


# =====================================================================
# Identity & Security Module
# =====================================================================
SECURITY_BROKERS_LIST = [
    "Spokeo", "Intelius", "WhitePages", "BeenVerified", "Radaris",
    "PeopleFinder", "MyLife", "Truthfinder", "Checkr", "ZabaSearch",
    "PeopleLooker",
]


def _security_health_score(
    brokers: List[dict],
    breaches: List[dict],
    inquiries: List[dict],
    scores: List[dict],
) -> int:
    """Compute security health (0-100). See PRD formula."""
    score = 100
    pii_found = sum(1 for b in brokers if b.get("status") == "pii_found")
    score -= 15 * pii_found
    active_breaches = sum(1 for b in breaches if b.get("status") == "active")
    score -= 20 * active_breaches
    # Hard inquiries in the last 30 days
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    recent_inq = sum(1 for i in inquiries if (i.get("inquired_at") or "") >= cutoff)
    score -= 10 * recent_inq
    if any((s.get("current_score") or 0) < 670 for s in scores):
        score -= 15
    removed = sum(1 for b in brokers if b.get("status") == "removed")
    score += 10 * removed
    return max(0, min(100, score))


def _threat_score(
    brokers: List[dict],
    breaches: List[dict],
    inquiries: List[dict],
    scores: List[dict],
) -> float:
    """0-10 scale (higher = worse)."""
    t = 0.0
    t += sum(1 for b in brokers if b.get("status") == "pii_found")
    t += sum(1 for b in breaches if b.get("status") == "active")
    if any((s.get("current_score") or 0) < 670 for s in scores):
        t += 1
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    t += 0.5 * sum(1 for i in inquiries if (i.get("inquired_at") or "") >= cutoff)
    return round(min(10.0, t), 1)


async def _get_user_address(user_id: str) -> Dict[str, str]:
    profile = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0}) or {}
    return {
        "full_name": profile.get("full_name", "PLOS User"),
        "email": profile.get("email", ""),
        "location_primary": profile.get("location_primary", "United States"),
    }


def _opt_out_letter(broker_name: str, user: Dict[str, str]) -> str:
    """Generate a formal opt-out / removal request letter for a broker."""
    today = datetime.now(timezone.utc).strftime("%B %d, %Y")
    return f"""{today}

To: {broker_name} Privacy Team
Subject: Personal Information Removal Request (CCPA / Right to Delete)

To Whom It May Concern,

Pursuant to applicable consumer privacy laws (CCPA, CPRA, and similar state
statutes), I am formally requesting that {broker_name} remove all personal
information associated with the following individual from your databases,
public search results, and any third-party syndication partners:

   Full Name:  {user.get("full_name", "")}
   Email:      {user.get("email", "")}
   Location:   {user.get("location_primary", "")}

This request applies to any and all listings indexed under variations of
the above name and address, including associated phone numbers, relatives,
employment data, and historical addresses.

Please confirm completion in writing within 45 days. If my information
reappears on any partner or syndicated site, I expect proactive remediation
under your stated privacy policy.

Thank you,
{user.get("full_name", "")}
"""


# ----------------------------- Security Overview ---------------------
@api_router.get("/security/overview")
async def security_overview(user_id: str = Depends(get_current_user_id)):
    brokers = await db.data_brokers.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    breaches = await db.breach_records.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    scores = await db.credit_scores.find({"user_id": user_id}, {"_id": 0}).to_list(10)
    inquiries = await db.hard_inquiries.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    alerts = (
        await db.security_alerts.find({"user_id": user_id}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(50)
    )
    active_alerts = [
        a for a in alerts if a.get("severity") in ("critical", "warning")
    ]

    stats = {
        "brokers_with_data": sum(1 for b in brokers if b.get("status") == "pii_found"),
        "opt_outs_pending": sum(
            1 for b in brokers if b.get("status") == "opt_out_pending"
        ),
        "confirmed_removals": sum(1 for b in brokers if b.get("status") == "removed"),
        "active_breaches": sum(1 for b in breaches if b.get("status") == "active"),
    }
    return {
        "threat_score": _threat_score(brokers, breaches, inquiries, scores),
        "security_health_score": _security_health_score(brokers, breaches, inquiries, scores),
        "active_threats_count": len(active_alerts),
        "stats": stats,
        "alerts": alerts[:15],
        "top_brokers": brokers[:6],
    }


# ----------------------------- Data Brokers --------------------------
@api_router.get("/security/brokers")
async def list_brokers(user_id: str = Depends(get_current_user_id)):
    items = await db.data_brokers.find({"user_id": user_id}, {"_id": 0}).to_list(200)
    return {"brokers": items}


@api_router.post("/security/brokers/rescan")
async def rescan_brokers(user_id: str = Depends(get_current_user_id)):
    """
    Demo: bumps last_scanned_at for all brokers; resolves any 'scanning' rows
    by leaving them in their seeded state. (Optery integration is a future TODO.)
    """
    # TODO: Replace seeded scan results with Optery API
    # (https://optery.com/api) or DeleteMe integration — $129/yr plan
    now = datetime.now(timezone.utc).isoformat()
    res = await db.data_brokers.update_many(
        {"user_id": user_id}, {"$set": {"last_scanned_at": now}}
    )
    return {"ok": True, "scanned": res.modified_count, "scanned_at": now}


@api_router.post("/security/brokers/{broker_id}/opt-out")
async def submit_opt_out(broker_id: str, user_id: str = Depends(get_current_user_id)):
    broker = await db.data_brokers.find_one(
        {"broker_id": broker_id, "user_id": user_id}, {"_id": 0}
    )
    if not broker:
        raise HTTPException(status_code=404, detail="Broker not found")
    if not broker.get("opt_out_available"):
        raise HTTPException(status_code=400, detail="Opt-out not available for this broker")
    user = await _get_user_address(user_id)
    letter = _opt_out_letter(broker["name"], user)
    now = datetime.now(timezone.utc).isoformat()
    await db.data_brokers.update_one(
        {"broker_id": broker_id, "user_id": user_id},
        {"$set": {"status": "opt_out_pending", "opt_out_submitted_at": now}},
    )
    # Log security alert
    alert = SecurityAlert(
        severity="notice",
        title=f"Opt-out submitted to {broker['name']}",
        description="Removal request sent. Expect confirmation in 3-10 business days.",
        action_type="review",
        related_id=broker_id,
        created_at=now,
    ).dict()
    alert["user_id"] = user_id
    await db.security_alerts.insert_one(alert)
    return {"ok": True, "broker_id": broker_id, "letter": letter, "submitted_at": now}


@api_router.get("/security/brokers/{broker_id}/opt-out-letter")
async def get_opt_out_letter(broker_id: str, user_id: str = Depends(get_current_user_id)):
    broker = await db.data_brokers.find_one(
        {"broker_id": broker_id, "user_id": user_id}, {"_id": 0}
    )
    if not broker:
        raise HTTPException(status_code=404, detail="Broker not found")
    user = await _get_user_address(user_id)
    return {"broker": broker["name"], "letter": _opt_out_letter(broker["name"], user)}


# ----------------------------- Credit Monitoring ---------------------
@api_router.get("/security/credit")
async def get_credit(user_id: str = Depends(get_current_user_id)):
    scores = await db.credit_scores.find({"user_id": user_id}, {"_id": 0}).to_list(10)
    history = (
        await db.credit_history.find({"user_id": user_id}, {"_id": 0})
        .sort("month", 1)
        .to_list(200)
    )
    inquiries = (
        await db.hard_inquiries.find({"user_id": user_id}, {"_id": 0})
        .sort("inquired_at", -1)
        .to_list(50)
    )
    tip_doc = await db.credit_tips.find_one({"user_id": user_id}, {"_id": 0})
    is_demo = any(s.get("is_demo") for s in scores)
    return {
        "scores": scores,
        "history": history,
        "hard_inquiries": inquiries,
        "tip": tip_doc.get("tip") if tip_doc else None,
        "tip_generated_at": tip_doc.get("generated_at") if tip_doc else None,
        "is_demo": is_demo,
    }


@api_router.put("/security/credit")
async def update_credit(
    payload: CreditScoresUpdate, user_id: str = Depends(get_current_user_id)
):
    """Manual entry: lets the user replace seed scores with real ones."""
    now = datetime.now(timezone.utc).isoformat()
    updated = []
    for bureau, score in [
        ("equifax", payload.equifax),
        ("transunion", payload.transunion),
        ("experian", payload.experian),
    ]:
        if score is None:
            continue
        if score < 300 or score > 850:
            raise HTTPException(
                status_code=400, detail=f"{bureau} score must be 300-850"
            )
        existing = await db.credit_scores.find_one(
            {"user_id": user_id, "bureau": bureau}, {"_id": 0}
        )
        prev = existing.get("current_score") if existing else score
        await db.credit_scores.update_one(
            {"user_id": user_id, "bureau": bureau},
            {
                "$set": {
                    "bureau": bureau,
                    "current_score": int(score),
                    "previous_score": int(prev),
                    "last_updated": now,
                    "is_demo": False,
                    "user_id": user_id,
                }
            },
            upsert=True,
        )
        updated.append(bureau)
    return {"ok": True, "updated": updated}


@api_router.post("/security/credit/refresh-tip")
async def refresh_credit_tip(user_id: str = Depends(get_current_user_id)):
    """Generate a Claude-powered, data-grounded improvement tip."""
    scores = await db.credit_scores.find({"user_id": user_id}, {"_id": 0}).to_list(10)
    debts = await db.debts.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    if not scores:
        raise HTTPException(status_code=400, detail="No credit scores on file")

    cc_debts = [d for d in debts if d.get("debt_type") == "credit_card"]
    total_balance = sum(d.get("balance", 0) for d in cc_debts)
    # Utilization estimate using minimum_payment * 28 as a proxy for credit limit
    est_limit = sum((d.get("minimum_payment", 0) or 0) * 28 for d in cc_debts) or 1
    utilization = (total_balance / est_limit) * 100

    prompt = f"""You are PLOS, a financial co-pilot. Given the user's credit data,
return ONE specific, actionable tip to raise their score the most THIS MONTH.

Current scores:
{chr(10).join(f"- {s['bureau'].title()}: {s['current_score']} (was {s['previous_score']})" for s in scores)}

Credit cards:
{chr(10).join(f"- {d.get('lender')}: balance ${d.get('balance')}, APR {d.get('apr')}%, min ${d.get('minimum_payment')}" for d in cc_debts) or "- (no CC data)"}

Estimated overall utilization: {utilization:.1f}%

Reply ONLY with JSON:
{{"tip": "<2-3 sentence specific action with a dollar amount and an expected point gain range>",
  "target_lender": "<lender name or null>",
  "expected_gain_points": "<like 22-35>"
}}
"""
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"credit-tip-{user_id}",
        system_message=PLOS_SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    response = await chat.send_message(UserMessage(text=prompt))
    text = response if isinstance(response, str) else str(response)
    import json as _json
    import re as _re
    m = _re.search(r"\{.*\}", text, _re.DOTALL)
    parsed: Dict[str, Any] = {}
    if m:
        try:
            parsed = _json.loads(m.group(0))
        except Exception:
            parsed = {"tip": text[:400]}
    else:
        parsed = {"tip": text[:400]}
    now = datetime.now(timezone.utc).isoformat()
    await db.credit_tips.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "tip": parsed, "generated_at": now}},
        upsert=True,
    )
    return {"ok": True, "tip": parsed, "generated_at": now}


# ----------------------------- Breach Monitoring ---------------------
@api_router.get("/security/breach")
async def list_breaches(user_id: str = Depends(get_current_user_id)):
    items = await db.breach_records.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    profile = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0}) or {}
    has_hibp_key = bool((profile.get("hibp_api_key") or "").strip())
    is_demo = any(b.get("is_demo") for b in items) and not has_hibp_key
    return {
        "breaches": items,
        "is_demo": is_demo,
        "has_hibp_key": has_hibp_key,
        "checked_email": profile.get("email"),
    }


@api_router.post("/security/breach/scan")
async def scan_breach(user_id: str = Depends(get_current_user_id)):
    """
    DEMO MODE: returns seeded breach data. When the user adds an HIBP API key
    via PUT /api/profile/hibp-key the endpoint switches to a live HIBP lookup.
    """
    profile = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0}) or {}
    has_hibp_key = bool((profile.get("hibp_api_key") or "").strip())
    if has_hibp_key:
        # TODO: Implement live HIBP call when has_hibp_key is true.
        pass
    return await list_breaches(user_id)


@api_router.post("/security/breach/{breach_id}/resolve")
async def resolve_breach(
    breach_id: str, user_id: str = Depends(get_current_user_id)
):
    res = await db.breach_records.update_one(
        {"breach_id": breach_id, "user_id": user_id},
        {"$set": {"status": "resolved"}},
    )
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Breach not found")
    return {"ok": True}


@api_router.put("/profile/hibp-key")
async def set_hibp_key(
    payload: HIBPKeyUpdate, user_id: str = Depends(get_current_user_id)
):
    await db.user_profile.update_one(
        {"user_id": user_id},
        {"$set": {"hibp_api_key": (payload.hibp_api_key or "").strip() or None}},
    )
    return {"ok": True, "has_key": bool(payload.hibp_api_key)}


# ----------------------------- Identity Theft Guide -----------------
def _default_identity_theft_steps(lenders: List[str]) -> List[Dict[str, Any]]:
    lender_links = (
        ", ".join(lenders[:4]) if lenders else "your bank, credit card, and lender"
    )
    return [
        {
            "step_id": "freeze_credit",
            "title": "Freeze your credit at all 3 bureaus",
            "description": "Place a security freeze with Equifax, TransUnion, and Experian. This is free and the single most powerful action.",
            "links": [
                {"label": "Equifax Freeze", "url": "https://www.equifax.com/personal/credit-report-services/credit-freeze/"},
                {"label": "TransUnion Freeze", "url": "https://www.transunion.com/credit-freeze"},
                {"label": "Experian Freeze", "url": "https://www.experian.com/freeze/center.html"},
            ],
        },
        {
            "step_id": "ftc_report",
            "title": "File an FTC Identity Theft report",
            "description": "IdentityTheft.gov walks you through filing and generates an official recovery plan + affidavit.",
            "links": [{"label": "IdentityTheft.gov", "url": "https://www.identitytheft.gov/"}],
        },
        {
            "step_id": "police_report",
            "title": "File a local police report",
            "description": "Visit your local precinct (e.g. DeKalb County Police Department in DeKalb County, GA) with: photo ID, FTC affidavit, proof of address, and evidence of fraud.",
            "links": [
                {"label": "DeKalb County Police", "url": "https://www.dekalbcountyga.gov/police"}
            ],
        },
        {
            "step_id": "contact_financial",
            "title": "Contact your financial institutions",
            "description": f"Call the fraud department on {lender_links}. Freeze affected accounts and request new card numbers.",
            "links": [],
        },
        {
            "step_id": "change_passwords",
            "title": "Change passwords on all breached accounts",
            "description": "Use a password manager. Rotate any account that uses a breached email, starting with primary email + financial logins.",
            "links": [{"label": "Open Breach Monitor", "url": "plos://security/breach"}],
        },
        {
            "step_id": "fraud_alert",
            "title": "Place a fraud alert",
            "description": "A fraud alert (free, lasts 1 year) requires lenders to verify your identity before opening credit. Unlike a freeze, it doesn't block applications — useful if you still need new credit yourself.",
            "links": [{"label": "What's the difference?", "url": "https://www.consumer.ftc.gov/articles/what-do-if-youre-victim-identity-theft"}],
        },
    ]


@api_router.get("/security/identity-theft-guide")
async def get_identity_theft_guide(user_id: str = Depends(get_current_user_id)):
    debts = await db.debts.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    lenders = list({d.get("lender") for d in debts if d.get("lender")})
    steps = _default_identity_theft_steps(lenders)
    state = await db.identity_theft_checklist.find_one(
        {"user_id": user_id}, {"_id": 0}
    ) or {"completed": {}}
    completed_map: Dict[str, str] = state.get("completed", {})
    for s in steps:
        if s["step_id"] in completed_map:
            s["completed"] = True
            s["completed_at"] = completed_map[s["step_id"]]
    return {"steps": steps}


@api_router.post("/security/identity-theft-guide/check")
async def check_identity_theft_step(
    body: Dict[str, Any], user_id: str = Depends(get_current_user_id)
):
    step_id = body.get("step_id")
    completed = bool(body.get("completed", True))
    if not step_id:
        raise HTTPException(status_code=400, detail="step_id required")
    state = await db.identity_theft_checklist.find_one(
        {"user_id": user_id}, {"_id": 0}
    ) or {"completed": {}}
    completed_map: Dict[str, str] = state.get("completed", {})
    if completed:
        completed_map[step_id] = datetime.now(timezone.utc).isoformat()
    else:
        completed_map.pop(step_id, None)
    await db.identity_theft_checklist.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "completed": completed_map}},
        upsert=True,
    )
    return {"ok": True, "completed": completed}


# =====================================================================
# Local Intelligence & Safety Module
# =====================================================================
DEFAULT_LAT = 33.7490
DEFAULT_LON = -84.3880

NWS_USER_AGENT = "PLOS (Personal Life OS, contact: support@plos.app)"


async def _http_get_json(url: str, headers: Optional[Dict[str, str]] = None, timeout: float = 8.0):
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        r = await client.get(url, headers=headers or {})
        r.raise_for_status()
        return r.json()


# ----------------------------- Weather (NWS) -------------------------
def _icon_from_short(short: str) -> str:
    s = (short or "").lower()
    if "thunder" in s or "storm" in s:
        return "thunderstorm"
    if "snow" in s:
        return "snow"
    if "rain" in s or "shower" in s:
        return "rain"
    if "cloud" in s and "partly" in s:
        return "partly-cloudy"
    if "cloud" in s:
        return "cloudy"
    if "fog" in s or "mist" in s:
        return "fog"
    if "wind" in s:
        return "wind"
    return "sun"


@api_router.get("/local/weather")
async def get_weather(
    lat: float = DEFAULT_LAT,
    lon: float = DEFAULT_LON,
    user_id: str = Depends(get_current_user_id),
):
    """NWS real API: returns current observation + 7-day forecast + active alerts."""
    headers = {"User-Agent": NWS_USER_AGENT, "Accept": "application/geo+json"}
    using_default = lat == DEFAULT_LAT and lon == DEFAULT_LON
    try:
        points = await _http_get_json(
            f"https://api.weather.gov/points/{lat:.4f},{lon:.4f}", headers
        )
        props = points.get("properties", {})
        forecast_url = props.get("forecast")
        hourly_url = props.get("forecastHourly")
        relative = props.get("relativeLocation", {}).get("properties", {})
        location_name = (
            f"{relative.get('city','')}, {relative.get('state','')}"
            if relative else "Atlanta, GA"
        )
        # Forecast (12-hour periods)
        forecast = await _http_get_json(forecast_url, headers) if forecast_url else {}
        periods = forecast.get("properties", {}).get("periods", [])

        # Current = first hourly period if available
        current = {}
        if hourly_url:
            try:
                hourly = await _http_get_json(hourly_url, headers)
                h = hourly.get("properties", {}).get("periods", [])
                if h:
                    p0 = h[0]
                    current = {
                        "temperature": p0.get("temperature"),
                        "unit": p0.get("temperatureUnit", "F"),
                        "short_forecast": p0.get("shortForecast"),
                        "icon": _icon_from_short(p0.get("shortForecast", "")),
                        "wind_speed": p0.get("windSpeed"),
                        "wind_direction": p0.get("windDirection"),
                        "humidity": (p0.get("relativeHumidity") or {}).get("value"),
                        "updated": p0.get("startTime"),
                    }
            except Exception:
                pass

        if not current and periods:
            p0 = periods[0]
            current = {
                "temperature": p0.get("temperature"),
                "unit": p0.get("temperatureUnit", "F"),
                "short_forecast": p0.get("shortForecast"),
                "icon": _icon_from_short(p0.get("shortForecast", "")),
                "wind_speed": p0.get("windSpeed"),
                "wind_direction": p0.get("windDirection"),
                "updated": p0.get("startTime"),
                "humidity": None,
            }

        # 7-day forecast: pair day+night periods
        daily = []
        seen_days = set()
        for p in periods:
            day_name = p.get("name", "")
            base = day_name.replace(" Night", "").strip()
            if base in seen_days or not base or "Night" in day_name:
                # Update prior with night low
                if base in seen_days and "Night" in day_name:
                    for d in daily:
                        if d["day"] == base:
                            d["low"] = p.get("temperature")
                continue
            seen_days.add(base)
            daily.append({
                "day": base,
                "high": p.get("temperature"),
                "low": p.get("temperature"),
                "icon": _icon_from_short(p.get("shortForecast", "")),
                "short_forecast": p.get("shortForecast"),
                "precipitation_pct": (p.get("probabilityOfPrecipitation") or {}).get("value", 0),
            })
            if len(daily) >= 7:
                break

        # Active alerts
        alerts: List[Dict[str, Any]] = []
        try:
            a = await _http_get_json(
                f"https://api.weather.gov/alerts/active?point={lat:.4f},{lon:.4f}",
                headers,
            )
            for f in a.get("features", []):
                ap = f.get("properties", {})
                alerts.append({
                    "id": ap.get("id"),
                    "event": ap.get("event"),
                    "severity": ap.get("severity"),
                    "headline": ap.get("headline"),
                    "description": (ap.get("description") or "")[:300],
                    "expires": ap.get("expires"),
                })
        except Exception:
            pass

        return {
            "location": location_name,
            "lat": lat,
            "lon": lon,
            "using_default_location": using_default,
            "current": current,
            "forecast": daily,
            "alerts": alerts,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        return {
            "location": "Atlanta, GA",
            "lat": lat,
            "lon": lon,
            "using_default_location": using_default,
            "error": str(e)[:200],
            "current": {},
            "forecast": [],
            "alerts": [],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }


# ----------------------------- Nearby Services (MOCKED) --------------
@api_router.get("/local/nearby")
async def get_nearby(user_id: str = Depends(get_current_user_id)):
    profile = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0}) or {}
    cuisine = (profile.get("cuisine_preference") or "Filipino").lower()
    has_places_key = bool((profile.get("google_places_api_key") or "").strip())
    # TODO: Replace with Google Places Nearby Search when has_places_key.
    restaurants = [
        {
            "name": "Grill City Filipino BBQ",
            "type": "restaurant",
            "cuisine": "Filipino",
            "distance_miles": 4.2,
            "address": "Lithonia, GA",
            "open_now": True,
            "phone": None,
        },
    ] if "filipino" in cuisine else [
        {
            "name": f"Top-rated {cuisine.title()} spot",
            "type": "restaurant",
            "cuisine": cuisine,
            "distance_miles": 1.6,
            "address": "Decatur, GA",
            "open_now": True,
        }
    ]
    return {
        "is_mocked": not has_places_key,
        "has_places_key": has_places_key,
        "hospitals": [
            {
                "name": "Grady Memorial Hospital",
                "address": "80 Jesse Hill Jr Dr SE, Atlanta GA",
                "distance_miles": 2.4,
                "emergency_dept_open": True,
                "phone": "404-616-1000",
                "lat": 33.7490, "lon": -84.3859,
            },
            {
                "name": "Emory Decatur Hospital",
                "address": "2701 N Decatur Rd, Decatur GA",
                "distance_miles": 3.1,
                "emergency_dept_open": True,
                "phone": "404-501-1000",
                "lat": 33.7748, "lon": -84.2962,
            },
        ],
        "police": [
            {
                "name": "DeKalb County Police Department Zone 6",
                "distance_miles": 1.1,
                "non_emergency_phone": "770-724-7710",
            },
            {
                "name": "Stone Mountain Police Department",
                "distance_miles": 0.8,
                "non_emergency_phone": "770-498-8871",
            },
        ],
        "restaurants": restaurants,
        "parks": [
            {
                "name": "Stone Mountain Park",
                "distance_miles": 1.2,
                "notes": "Free entry on foot. Open 5 AM - midnight.",
            }
        ],
        "traffic": [
            {
                "name": "I-285 East near Covington Hwy",
                "severity": "moderate",
                "summary": "Moderate congestion · 12 min delay",
                "updated_min_ago": 5,
            }
        ],
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


@api_router.put("/local/preferences")
async def update_local_prefs(
    payload: CuisineUpdate, user_id: str = Depends(get_current_user_id)
):
    updates: Dict[str, Any] = {}
    if payload.cuisine_preference is not None:
        updates["cuisine_preference"] = payload.cuisine_preference.strip() or "Filipino"
    if payload.google_places_api_key is not None:
        updates["google_places_api_key"] = (
            payload.google_places_api_key.strip() or None
        )
    if updates:
        await db.user_profile.update_one({"user_id": user_id}, {"$set": updates})
    return {"ok": True, "updated": list(updates.keys())}


# ----------------------------- Gas Prices (MOCKED) -------------------
@api_router.get("/local/gas")
async def get_gas(user_id: str = Depends(get_current_user_id)):
    # TODO: Replace seeded prices with GasBuddy API partnership.
    return {
        "is_mocked": True,
        "fuel_grade": "Regular Unleaded",
        "stations": [
            {
                "name": "Murphy Express",
                "address": "1938 Rockbridge Rd, Stone Mountain GA",
                "price_per_gallon": 2.89,
                "distance_miles": 0.8,
                "brand": "Murphy",
            },
            {
                "name": "QuikTrip",
                "address": "1234 Memorial Dr, Decatur GA",
                "price_per_gallon": 2.94,
                "distance_miles": 1.2,
                "brand": "QuikTrip",
            },
            {
                "name": "RaceTrac",
                "address": "5678 Covington Hwy, Decatur GA",
                "price_per_gallon": 2.97,
                "distance_miles": 1.6,
                "brand": "RaceTrac",
            },
        ],
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


# ----------------------------- Recalls (REAL APIs) -------------------
@api_router.get("/local/recalls/food")
async def get_food_recalls(user_id: str = Depends(get_current_user_id)):
    try:
        data = await _http_get_json(
            "https://api.fda.gov/food/enforcement.json?search=status:%22Ongoing%22&limit=5",
            timeout=10.0,
        )
        items = []
        for r in data.get("results", []):
            items.append({
                "recall_number": r.get("recall_number"),
                "product_description": r.get("product_description"),
                "reason_for_recall": r.get("reason_for_recall"),
                "recalling_firm": r.get("recalling_firm"),
                "recall_date": r.get("recall_initiation_date"),
                "classification": r.get("classification"),
                "status": r.get("status"),
            })
        return {"is_live": True, "source": "openFDA", "recalls": items}
    except Exception as e:
        return {"is_live": False, "source": "openFDA", "error": str(e)[:200], "recalls": []}


@api_router.get("/local/recalls/products")
async def get_product_recalls(user_id: str = Depends(get_current_user_id)):
    try:
        data = await _http_get_json(
            "https://www.saferproducts.gov/RestWebServices/Recall?format=json",
            timeout=10.0,
        )
        items = []
        rows = data if isinstance(data, list) else data.get("Recalls", [])
        for r in rows[:5]:
            items.append({
                "recall_id": r.get("RecallID") or r.get("RecallNumber"),
                "title": r.get("Title"),
                "description": (r.get("Description") or "")[:300],
                "hazards": ", ".join([h.get("Name", "") for h in (r.get("Hazards") or [])]),
                "manufacturers": ", ".join(
                    [m.get("Name", "") for m in (r.get("Manufacturers") or [])]
                ),
                "recall_date": r.get("RecallDate"),
                "url": r.get("URL"),
            })
        return {"is_live": True, "source": "CPSC SaferProducts", "recalls": items}
    except Exception as e:
        return {"is_live": False, "source": "CPSC", "error": str(e)[:200], "recalls": []}


@api_router.post("/local/recalls/vehicle")
async def get_vehicle_recalls(
    payload: VehicleRecallQuery, user_id: str = Depends(get_current_user_id)
):
    try:
        url = (
            "https://api.nhtsa.gov/recalls/recallsByVehicle"
            f"?make={payload.make}&model={payload.model}&modelYear={payload.year}"
        )
        data = await _http_get_json(url, timeout=10.0)
        results = data.get("results") or []
        recalls = []
        for r in results:
            recalls.append({
                "campaign": r.get("NHTSACampaignNumber"),
                "component": r.get("Component"),
                "consequence": r.get("Consequence"),
                "remedy": r.get("Remedy"),
                "report_date": r.get("ReportReceivedDate"),
                "summary": r.get("Summary"),
            })
        # Persist last query on the saved vehicle (if any matches)
        if payload.vin:
            await db.saved_vehicles.update_one(
                {"user_id": user_id, "year": payload.year, "make": payload.make, "model": payload.model},
                {"$set": {"vin": payload.vin}},
                upsert=False,
            )
        return {
            "is_live": True,
            "source": "NHTSA",
            "vehicle": {
                "year": payload.year,
                "make": payload.make,
                "model": payload.model,
                "vin": payload.vin,
            },
            "recall_count": len(recalls),
            "recalls": recalls,
        }
    except Exception as e:
        return {
            "is_live": False,
            "source": "NHTSA",
            "error": str(e)[:200],
            "recalls": [],
        }


@api_router.get("/local/vehicles")
async def list_vehicles(user_id: str = Depends(get_current_user_id)):
    items = await db.saved_vehicles.find({"user_id": user_id}, {"_id": 0}).to_list(20)
    return {"vehicles": items}


# ----------------------------- Family Tracking (MOCKED) --------------
@api_router.get("/local/family")
async def get_family(user_id: str = Depends(get_current_user_id)):
    members = await db.family_members.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    profile = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0}) or {}
    return {
        "is_mocked": True,
        "self_paused": bool(profile.get("location_paused")),
        "members": members,
    }


@api_router.post("/local/family/invite")
async def invite_family(
    body: Dict[str, Any], user_id: str = Depends(get_current_user_id)
):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    invite_token = str(uuid.uuid4())[:8]
    return {
        "ok": True,
        "invite_link": f"https://plos.app/invite/{invite_token}",
        "name": name,
        "expires_in": "7 days",
    }


@api_router.put("/local/family/pause")
async def pause_my_location(
    body: Dict[str, Any], user_id: str = Depends(get_current_user_id)
):
    paused = bool(body.get("paused"))
    await db.user_profile.update_one(
        {"user_id": user_id}, {"$set": {"location_paused": paused}}
    )
    return {"ok": True, "paused": paused}


# ----------------------------- Satellite Status ---------------------
@api_router.get("/local/satellite-status")
async def satellite_status(user_id: str = Depends(get_current_user_id)):
    members = await db.family_members.count_documents({"user_id": user_id})
    return {
        "gps_satellites_acquired": 9,
        "gps_satellites_total": 12,
        "gps_lock": True,
        "offline_maps": {
            "downloaded_regions": ["Georgia, USA", "Bulacan, Philippines"],
            "all_synced": True,
        },
        "satellite_messaging": {
            "configured": False,
            "service": None,  # "garmin_inreach" | "iphone_emergency_sos"
        },
        "emergency_contacts_loaded": members,
    }


@api_router.get("/local/offline-maps")
async def offline_maps(user_id: str = Depends(get_current_user_id)):
    return {
        "is_mocked": True,
        "regions": [
            {
                "id": "ga_usa",
                "name": "Georgia, USA",
                "size_mb": 180,
                "status": "downloaded",
                "last_updated": datetime.now(timezone.utc).isoformat(),
            },
            {
                "id": "bulacan_ph",
                "name": "Bulacan Province, Philippines",
                "size_mb": 45,
                "status": "downloaded",
                "last_updated": datetime.now(timezone.utc).isoformat(),
            },
        ],
    }


# ----------------------------- SOS Event ----------------------------
@api_router.post("/local/sos")
async def log_sos(
    body: Dict[str, Any], user_id: str = Depends(get_current_user_id)
):
    lat = float(body.get("lat") or 0)
    lon = float(body.get("lon") or 0)
    test_mode = bool(body.get("test_mode"))
    members = await db.family_members.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    contacts = [m["name"] for m in members]
    event = SOSEvent(
        lat=lat,
        lon=lon,
        triggered_at=datetime.now(timezone.utc).isoformat(),
        test_mode=test_mode,
        notified_contacts=contacts,
    ).dict()
    event["user_id"] = user_id
    await db.sos_events.insert_one(event)
    return {
        "ok": True,
        "event_id": event["event_id"],
        "test_mode": test_mode,
        "notified_count": len(contacts),
        "contacts": contacts,
    }


@api_router.get("/local/sos/history")
async def list_sos(user_id: str = Depends(get_current_user_id)):
    items = (
        await db.sos_events.find({"user_id": user_id}, {"_id": 0})
        .sort("triggered_at", -1)
        .to_list(20)
    )
    return {"events": items}


# =====================================================================
# Global Tools — Translator + Currency
# =====================================================================
TRANSLATOR_SYS = (
    "You are a precise language translator. Translate the user's text "
    "accurately and naturally into the target language. Return only the "
    "translated text with no explanation, no preamble, and no quotation "
    "marks. Preserve formatting, line breaks, and tone from the original."
)

SUPPORTED_LANGUAGES = [
    "English", "Filipino", "French", "Spanish", "Japanese",
    "Chinese Simplified", "Arabic", "German", "Korean",
    "Hindi", "Portuguese", "Swahili",
]

QUICK_PHRASES = [
    "Hello, how are you?",
    "Where is the hospital?",
    "How much does this cost?",
    "I need help",
    "Please call the police",
    "Do you speak English?",
    "Thank you very much",
    "I am lost",
    "Where is the nearest hotel?",
    "I have a medical emergency",
]

PHRASE_BOOK: Dict[str, List[Dict[str, str]]] = {
    "Emergency": [
        {"English": "Help", "Filipino": "Tulong", "French": "Au secours",  "Spanish": "Ayuda"},
        {"English": "Call an ambulance", "Filipino": "Tumawag ng ambulansya", "French": "Appelez une ambulance", "Spanish": "Llame a una ambulancia"},
        {"English": "Call the police",   "Filipino": "Tumawag ng pulis",      "French": "Appelez la police",       "Spanish": "Llame a la policía"},
        {"English": "I am injured",       "Filipino": "Nasaktan ako",          "French": "Je suis blessé",          "Spanish": "Estoy herido"},
        {"English": "Fire",                "Filipino": "Sunog",                 "French": "Au feu",                  "Spanish": "Fuego"},
        {"English": "I need a doctor",    "Filipino": "Kailangan ko ng doktor","French": "J'ai besoin d'un médecin","Spanish": "Necesito un médico"},
        {"English": "I am having a heart attack", "Filipino": "Atake ako sa puso", "French": "Je fais une crise cardiaque", "Spanish": "Estoy teniendo un ataque al corazón"},
        {"English": "I am allergic to this medication", "Filipino": "Allergic ako sa gamot na ito", "French": "Je suis allergique à ce médicament", "Spanish": "Soy alérgico a este medicamento"},
    ],
    "Travel": [
        {"English": "Where is the airport?",      "Filipino": "Nasaan ang paliparan?",  "French": "Où est l'aéroport ?",     "Spanish": "¿Dónde está el aeropuerto?"},
        {"English": "I need a taxi",               "Filipino": "Kailangan ko ng taksi",  "French": "J'ai besoin d'un taxi",   "Spanish": "Necesito un taxi"},
        {"English": "Where is the bus station?",   "Filipino": "Nasaan ang istasyon ng bus?", "French": "Où est la gare routière ?", "Spanish": "¿Dónde está la estación de autobuses?"},
        {"English": "I am lost",                    "Filipino": "Nawawala ako",            "French": "Je suis perdu",            "Spanish": "Estoy perdido"},
        {"English": "How do I get to the hotel?", "Filipino": "Paano pumunta sa hotel?", "French": "Comment aller à l'hôtel ?", "Spanish": "¿Cómo llego al hotel?"},
    ],
    "Food": [
        {"English": "I am vegetarian",   "Filipino": "Hindi ako kumakain ng karne","French": "Je suis végétarien",       "Spanish": "Soy vegetariano"},
        {"English": "The check, please", "Filipino": "Yung bill, paki",              "French": "L'addition, s'il vous plaît","Spanish": "La cuenta, por favor"},
        {"English": "Water, please",     "Filipino": "Tubig, paki",                  "French": "De l'eau, s'il vous plaît",   "Spanish": "Agua, por favor"},
        {"English": "Spicy",              "Filipino": "Maanghang",                    "French": "Épicé",                       "Spanish": "Picante"},
        {"English": "Delicious",          "Filipino": "Masarap",                       "French": "Délicieux",                   "Spanish": "Delicioso"},
    ],
    "Money": [
        {"English": "How much does this cost?",   "Filipino": "Magkano ito?",          "French": "Combien ça coûte ?",       "Spanish": "¿Cuánto cuesta esto?"},
        {"English": "Do you accept US dollars?",   "Filipino": "Tumatanggap kayo ng US dollars?", "French": "Acceptez-vous les dollars américains ?", "Spanish": "¿Aceptan dólares estadounidenses?"},
        {"English": "Where is the nearest ATM?",  "Filipino": "Saan ang pinakamalapit na ATM?", "French": "Où est le distributeur le plus proche ?", "Spanish": "¿Dónde está el cajero más cercano?"},
        {"English": "I need a receipt",            "Filipino": "Kailangan ko ng resibo",  "French": "J'ai besoin d'un reçu",     "Spanish": "Necesito un recibo"},
        {"English": "That is too expensive",       "Filipino": "Masyadong mahal yan",     "French": "C'est trop cher",           "Spanish": "Eso es demasiado caro"},
    ],
    "Health": [
        {"English": "I feel sick",        "Filipino": "Masama ang pakiramdam ko", "French": "Je me sens malade",         "Spanish": "Me siento enfermo"},
        {"English": "I have a headache", "Filipino": "Sumasakit ang ulo ko",     "French": "J'ai mal à la tête",        "Spanish": "Tengo dolor de cabeza"},
        {"English": "Where is the pharmacy?", "Filipino": "Nasaan ang botika?", "French": "Où est la pharmacie ?", "Spanish": "¿Dónde está la farmacia?"},
        {"English": "I am pregnant",      "Filipino": "Buntis ako",                "French": "Je suis enceinte",         "Spanish": "Estoy embarazada"},
        {"English": "I need water",       "Filipino": "Kailangan ko ng tubig",     "French": "J'ai besoin d'eau",         "Spanish": "Necesito agua"},
    ],
}

SUPPORTED_CURRENCIES = [
    {"code": "USD", "name": "US Dollar",        "flag": "🇺🇸"},
    {"code": "PHP", "name": "Philippine Peso",  "flag": "🇵🇭"},
    {"code": "EUR", "name": "Euro",              "flag": "🇪🇺"},
    {"code": "GBP", "name": "British Pound",     "flag": "🇬🇧"},
    {"code": "JPY", "name": "Japanese Yen",       "flag": "🇯🇵"},
    {"code": "CAD", "name": "Canadian Dollar",    "flag": "🇨🇦"},
    {"code": "AUD", "name": "Australian Dollar",  "flag": "🇦🇺"},
    {"code": "CHF", "name": "Swiss Franc",        "flag": "🇨🇭"},
    {"code": "CNY", "name": "Chinese Yuan",       "flag": "🇨🇳"},
    {"code": "KRW", "name": "South Korean Won",   "flag": "🇰🇷"},
    {"code": "NGN", "name": "Nigerian Naira",     "flag": "🇳🇬"},
    {"code": "XAF", "name": "CFA Franc",          "flag": "🌍"},
    {"code": "SGD", "name": "Singapore Dollar",   "flag": "🇸🇬"},
]

STATIC_MONEY_TIPS = [
    "Use Wise or Remitly to send USD to PHP — rates are 3-5% better than bank wire and 8-12% better than Western Union. Current Wise rate for $1,000: ~₱57,100 after fees.",
    "Use a Charles Schwab High Yield Investor Checking debit card or SoFi debit card for international ATM withdrawals — both reimburse all foreign ATM fees and use mid-market exchange rates with no markup.",
    "Never exchange currency at airport kiosks — rates are typically 10-15% worse than mid-market. Use a local bank or accredited money changer in Bulacan instead.",
    "USD to PHP rates have historically been strongest on Tuesdays and Wednesdays. Check your rate alert before transferring funds for the Eden Heights project.",
    "Your Chase Amazon card has no foreign transaction fee — use it for hotel and restaurant purchases when traveling internationally to avoid the typical 3% foreign transaction fee charged by most cards.",
]


# ----------------------------- Translator ---------------------------
@api_router.post("/global/translate")
async def translate(
    payload: TranslateRequest, user_id: str = Depends(get_current_user_id)
):
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    if payload.target_language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail="Unsupported target language")

    source = payload.source_language or "auto"
    if source != "auto" and source not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail="Unsupported source language")

    detected: Optional[str] = None
    if source == "auto":
        try:
            det_chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"detect-{user_id}",
                system_message="Identify the language of the following text. Return only the language name in English, nothing else.",
            ).with_model("anthropic", "claude-sonnet-4-5-20250929")
            d = await det_chat.send_message(UserMessage(text=payload.text[:500]))
            detected = (d if isinstance(d, str) else str(d)).strip().splitlines()[0][:40]
        except Exception:
            detected = None
        effective_source = detected or "Auto"
    else:
        effective_source = source

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"translate-{user_id}",
        system_message=TRANSLATOR_SYS,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    prompt = (
        f"Translate from {effective_source} to {payload.target_language}.\n\n"
        f"Text:\n{payload.text}"
    )
    response = await chat.send_message(UserMessage(text=prompt))
    translated = (response if isinstance(response, str) else str(response)).strip()
    # Strip surrounding quotes if Claude wrapped output
    if translated.startswith(("'", '"')) and translated.endswith(("'", '"')):
        translated = translated[1:-1]

    rec = TranslationRecord(
        source_language=effective_source,
        target_language=payload.target_language,
        source_text=payload.text,
        translated_text=translated,
        detected_language=detected,
        created_at=datetime.now(timezone.utc).isoformat(),
    ).dict()
    rec["user_id"] = user_id
    await db.translations.insert_one(rec)
    # Keep only last 20 per user (oldest beyond drops out of UI naturally; keep DB lean)
    count = await db.translations.count_documents({"user_id": user_id})
    if count > 50:
        oldest = (
            await db.translations.find({"user_id": user_id}, {"_id": 1})
            .sort("created_at", 1)
            .to_list(count - 50)
        )
        await db.translations.delete_many({"_id": {"$in": [o["_id"] for o in oldest]}})

    rec.pop("_id", None)
    rec.pop("user_id", None)
    return rec


@api_router.post("/global/detect-language")
async def detect_language(
    payload: DetectLanguageRequest, user_id: str = Depends(get_current_user_id)
):
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"detect-{user_id}",
            system_message="Identify the language of the following text. Return only the language name in English, nothing else.",
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        r = await chat.send_message(UserMessage(text=payload.text[:500]))
        lang = (r if isinstance(r, str) else str(r)).strip().splitlines()[0][:40]
        return {"language": lang}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Detect failed: {str(e)[:100]}")


@api_router.get("/global/translations")
async def list_translations(user_id: str = Depends(get_current_user_id)):
    items = (
        await db.translations.find({"user_id": user_id}, {"_id": 0, "user_id": 0})
        .sort("created_at", -1)
        .to_list(20)
    )
    return {"translations": items}


@api_router.delete("/global/translations")
async def clear_translations(user_id: str = Depends(get_current_user_id)):
    res = await db.translations.delete_many({"user_id": user_id})
    return {"ok": True, "deleted": res.deleted_count}


@api_router.get("/global/languages")
async def list_languages():
    return {"languages": SUPPORTED_LANGUAGES, "quick_phrases": QUICK_PHRASES}


@api_router.get("/global/phrase-book")
async def phrase_book():
    return {"categories": list(PHRASE_BOOK.keys()), "phrase_book": PHRASE_BOOK}


# ----------------------------- Currency -----------------------------
@api_router.get("/global/currencies")
async def list_currencies():
    return {"currencies": SUPPORTED_CURRENCIES}


@api_router.get("/global/rates")
async def get_rates(user_id: str = Depends(get_current_user_id)):
    """Fetch live rates from ExchangeRate-API (open access, no key)."""
    cached = await db.cached_rates.find_one({"_id": "usd"}, {"_id": 0})
    try:
        data = await _http_get_json("https://open.er-api.com/v6/latest/USD", timeout=8.0)
        rates = data.get("rates") or {}
        last_updated = data.get("time_last_update_utc") or datetime.now(timezone.utc).isoformat()
        # Cache
        await db.cached_rates.update_one(
            {"_id": "usd"},
            {"$set": {"rates": rates, "last_updated": last_updated, "is_live": True}},
            upsert=True,
        )
        return {
            "base": "USD",
            "rates": rates,
            "last_updated": last_updated,
            "is_live": True,
            "is_cached": False,
        }
    except Exception as e:
        if cached:
            return {
                "base": "USD",
                "rates": cached.get("rates", {}),
                "last_updated": cached.get("last_updated"),
                "is_live": False,
                "is_cached": True,
                "error": str(e)[:120],
            }
        # Fallback to a small seed
        return {
            "base": "USD",
            "rates": {"PHP": 57.32, "EUR": 0.93, "GBP": 0.78, "JPY": 156.0,
                      "CAD": 1.36, "AUD": 1.50, "CHF": 0.89, "CNY": 7.24,
                      "KRW": 1370.0, "NGN": 1550.0, "XAF": 612.0, "SGD": 1.34,
                      "USD": 1.0},
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "is_live": False,
            "is_cached": False,
            "error": str(e)[:120],
        }


@api_router.get("/global/rate-history")
async def rate_history(
    base: str = "USD", target: str = "PHP", user_id: str = Depends(get_current_user_id)
):
    rows = (
        await db.currency_history.find(
            {"user_id": user_id, "base": base.upper(), "target": target.upper()},
            {"_id": 0},
        )
        .sort("day", 1)
        .to_list(60)
    )
    if not rows:
        return {"base": base.upper(), "target": target.upper(), "series": []}
    vals = [r["rate"] for r in rows]
    return {
        "base": base.upper(),
        "target": target.upper(),
        "series": rows,
        "low": round(min(vals), 4),
        "high": round(max(vals), 4),
        "avg": round(sum(vals) / len(vals), 4),
        "current": vals[-1],
    }


# ----------------------------- Rate Alerts --------------------------
@api_router.get("/global/alerts")
async def list_rate_alerts(user_id: str = Depends(get_current_user_id)):
    items = (
        await db.rate_alerts.find({"user_id": user_id}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(50)
    )
    return {"alerts": items}


@api_router.post("/global/alerts")
async def create_rate_alert(
    payload: RateAlertCreate, user_id: str = Depends(get_current_user_id)
):
    if payload.direction not in ("above", "below"):
        raise HTTPException(status_code=400, detail="direction must be above or below")
    if payload.rate_target <= 0:
        raise HTTPException(status_code=400, detail="rate_target must be positive")
    obj = RateAlert(
        base=payload.base.upper(),
        target=payload.target.upper(),
        rate_target=float(payload.rate_target),
        direction=payload.direction,
        label=payload.label,
        created_at=datetime.now(timezone.utc).isoformat(),
    ).dict()
    obj["user_id"] = user_id
    await db.rate_alerts.insert_one(obj)
    obj.pop("_id", None)
    obj.pop("user_id", None)
    return obj


@api_router.put("/global/alerts/{alert_id}")
async def update_rate_alert(
    alert_id: str,
    body: Dict[str, Any],
    user_id: str = Depends(get_current_user_id),
):
    updates: Dict[str, Any] = {}
    for k in ("enabled", "rate_target", "label", "direction"):
        if k in body:
            updates[k] = body[k]
    res = await db.rate_alerts.update_one(
        {"alert_id": alert_id, "user_id": user_id}, {"$set": updates}
    )
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"ok": True}


@api_router.delete("/global/alerts/{alert_id}")
async def delete_rate_alert(
    alert_id: str, user_id: str = Depends(get_current_user_id)
):
    res = await db.rate_alerts.delete_one(
        {"alert_id": alert_id, "user_id": user_id}
    )
    return {"ok": True, "deleted": res.deleted_count}


@api_router.post("/global/alerts/check")
async def check_rate_alerts(user_id: str = Depends(get_current_user_id)):
    rates_doc = await get_rates(user_id)
    rates: Dict[str, float] = rates_doc.get("rates", {}) or {}
    alerts = await db.rate_alerts.find(
        {"user_id": user_id, "enabled": True}, {"_id": 0}
    ).to_list(50)
    triggered: List[Dict[str, Any]] = []
    for a in alerts:
        if a.get("status") == "triggered":
            continue
        base = a["base"]
        target = a["target"]
        rate = None
        if base == "USD":
            rate = rates.get(target)
        elif target == "USD" and rates.get(base):
            rate = 1.0 / rates[base]
        elif base in rates and target in rates:
            rate = rates[target] / rates[base]
        if rate is None:
            continue
        dir_match = (
            (a["direction"] == "above" and rate >= a["rate_target"]) or
            (a["direction"] == "below" and rate <= a["rate_target"])
        )
        if dir_match:
            now = datetime.now(timezone.utc).isoformat()
            await db.rate_alerts.update_one(
                {"alert_id": a["alert_id"], "user_id": user_id},
                {"$set": {"status": "triggered", "triggered_at": now}},
            )
            # Log decision
            decision = AIDecision(
                module="global_tools",
                priority="action",
                advice_text=(
                    f"Rate Alert: {base}/{target} reached {rate:.2f} — "
                    f"{a.get('label') or 'Rate target reached'} "
                    f"(direction={a['direction']} target={a['rate_target']})"
                ),
            ).dict()
            decision["user_id"] = user_id
            await db.ai_decisions_log.insert_one(decision)
            triggered.append({**a, "current_rate": round(rate, 4)})
    return {"checked": len(alerts), "triggered": triggered, "current_rates": rates_doc}


# ----------------------------- Money Tips ---------------------------
@api_router.get("/global/money-tips")
async def get_money_tips(user_id: str = Depends(get_current_user_id)):
    custom = await db.money_tips.find_one({"user_id": user_id}, {"_id": 0})
    if custom and custom.get("tips"):
        return {
            "tips": custom["tips"],
            "is_custom": True,
            "generated_at": custom.get("generated_at"),
        }
    return {"tips": STATIC_MONEY_TIPS, "is_custom": False}


@api_router.post("/global/money-tips/refresh")
async def refresh_money_tips(user_id: str = Depends(get_current_user_id)):
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"money-tips-{user_id}",
        system_message=PLOS_SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    prompt = (
        "The user is a US-based professional with ties to the Philippines where "
        "they are developing an eco-resort property. They regularly send money "
        "from USD to PHP. They also travel to Europe and Southeast Asia for work. "
        "Based on current currency market conditions, provide 5 specific, "
        "actionable money transfer and currency management tips. Be specific "
        "about services, fees, and strategies. Return only the 5 tips as a "
        "numbered list (1. ... 2. ... etc) with no preamble."
    )
    response = await chat.send_message(UserMessage(text=prompt))
    text = response if isinstance(response, str) else str(response)
    import re as _re
    tips: List[str] = []
    for line in text.splitlines():
        m = _re.match(r"^\s*\d+[.)]\s*(.+)$", line)
        if m:
            tips.append(m.group(1).strip())
    if not tips:
        tips = STATIC_MONEY_TIPS
    tips = tips[:5]
    now = datetime.now(timezone.utc).isoformat()
    await db.money_tips.update_one(
        {"user_id": user_id},
        {"$set": {"user_id": user_id, "tips": tips, "generated_at": now}},
        upsert=True,
    )
    return {"tips": tips, "is_custom": True, "generated_at": now}


# =====================================================================
# Business Ideas Advisor + Shopping & Deals Engine
# =====================================================================
SEED_BUSINESS_IDEAS = [
    {
        "idea_id": "seed-1",
        "business_name": "Educational Consulting & Assessment Services",
        "timeline_tag": "Start Now",
        "risk_level": "Low",
        "description": "Leverage your LearnWise platform and Georgia Milestones assessment expertise to consult for districts, charter schools, and ed-tech vendors needing curriculum-aligned assessment design.",
        "startup_cost_range": "$0 – $500",
        "estimated_monthly_revenue_range": "$800 – $3,000",
        "time_to_first_revenue": "30 – 60 days",
        "next_steps": [
            "List 10 GA charter schools + 5 ed-tech vendors as outreach targets",
            "Package LearnWise → 1-page service sheet (formative + summative)",
            "Post a $99 'Standards Alignment Audit' on LinkedIn",
            "Apply for state vendor registration",
        ],
        "is_seed": True,
    },
    {
        "idea_id": "seed-2",
        "business_name": "International Financial Management Consulting",
        "timeline_tag": "3-6 Months",
        "risk_level": "Low",
        "description": "Productize your USAID Deputy Controller and multi-country portfolio expertise into fractional CFO + grant-compliance services for nonprofits and impact funds operating across Asia-Pacific.",
        "startup_cost_range": "$500 – $2,000",
        "estimated_monthly_revenue_range": "$3,500 – $6,000 per engagement",
        "time_to_first_revenue": "60 – 120 days",
        "next_steps": [
            "Define 3 service tiers (Audit Prep / Grant Compliance / Fractional CFO)",
            "Register LLC in GA + DUNS/SAM.gov",
            "Reach out to 20 alumni from USAID network",
            "Publish a case study on Asia-Pacific portfolio management",
        ],
        "is_seed": True,
    },
    {
        "idea_id": "seed-3",
        "business_name": "Eden Heights Sanctuary Resort",
        "timeline_tag": "Long-Term",
        "risk_level": "Moderate",
        "description": "Eco-tourism development on your 4-hectare Bulacan property — glamping, agritourism programs, retreats, and a long-cycle agarwood (lapnisan) revenue stream.",
        "startup_cost_range": "$8,000 – $20,000 (Phase 1)",
        "estimated_monthly_revenue_range": "$3,300 – $7,500/mo at Year 3",
        "time_to_first_revenue": "18 – 36 months",
        "next_steps": [
            "Complete boundary marking + access road (Phase 1)",
            "File DOT accreditation + DENR ECC",
            "Plant first 200 agarwood seedlings",
            "Build pre-launch waitlist via Instagram/YouTube",
        ],
        "is_seed": True,
    },
]

DEFAULT_DOT_CHECKLIST = [
    "Register with Philippine Department of Tourism (DOT) for accreditation",
    "Apply for DENR Environmental Compliance Certificate (ECC)",
    "Register with Bureau of Internal Revenue (BIR) as tourism enterprise",
    "Apply for Local Government Unit (LGU) business permit in Bulacan",
    "Explore BOI incentives for tourism enterprises under the Omnibus Investments Code",
    "Check eligibility for Land Bank of the Philippines OFW investment loan",
    "Register with Department of Agriculture for agritourism designation",
    "Apply for TESDA accreditation for hospitality training programs (future staff)",
]

DEFAULT_EDEN_HEIGHTS = {
    "name": "Eden Heights Sanctuary Resort",
    "location": "Bulacan Province, Philippines",
    "municipality": "",
    "size_hectares": 4.0,
    "size_sqm": 40000,
    "current_value_usd": 12000,
    "concept": "Eco-resort and nature sanctuary with glamping, agritourism, and retreat experiences. Secondary revenue: agarwood (lapnisan) cultivation.",
    "phases": [
        {"id": "p1", "name": "Phase 1: Land Preparation", "summary": "Boundary marking, access road, basic utilities", "status": "in_progress", "target_months": 12, "cost_range": "$8,000 – $12,000"},
        {"id": "p2", "name": "Phase 2: Eco-Resort Build", "summary": "Glamping tents, common areas, basic guest facilities", "status": "not_started", "target_months": 24, "cost_range": "$15,000 – $30,000"},
        {"id": "p3", "name": "Phase 3: Operations & Agritourism", "summary": "Marketing launch, agritourism programs, agarwood harvest cycle", "status": "not_started", "target_months": 36, "cost_range": "$10,000 – $20,000"},
    ],
    "roi_series": [
        {"year": 0, "investment_cum": 0, "revenue": 0},
        {"year": 1, "investment_cum": 20000, "revenue": 0},
        {"year": 2, "investment_cum": 45000, "revenue": 8000},
        {"year": 3, "investment_cum": 60000, "revenue": 40000},
        {"year": 4, "investment_cum": 65000, "revenue": 65000},
        {"year": 5, "investment_cum": 70000, "revenue": 90000},
    ],
    "breakeven_year": 4,
    "checklist": [{"item": item, "checked": False} for item in DEFAULT_DOT_CHECKLIST],
}

SEED_DEALS = [
    {"deal_id": "d1", "title": "T-Mobile Magenta Plan", "description": "Switch from AT&T 2 lines", "provider": "T-Mobile", "category": "wireless", "savings_usd": 45, "savings_label": "Save $35–$55/month vs AT&T", "expires_in_days": 30},
    {"deal_id": "d2", "title": "Costco Gas — Regular Unleaded", "description": "Costco Wholesale, 3650 Venture Dr, Duluth GA", "provider": "Costco", "category": "gas", "savings_usd": 20, "savings_label": "$2.74/gal · save $0.15–$0.23 vs nearby (membership req.)", "expires_in_days": None, "distance_miles": 8.2},
    {"deal_id": "d3", "title": "Kroger Weekly Filipino Pantry Sale", "description": "Jasmine rice 25lb $18.99 (reg $24.99), Datu Puti vinegar, Silver Swan soy", "provider": "Kroger Decatur", "category": "groceries", "savings_usd": 25.95, "savings_label": "Up to 24% off", "expires_in_days": 5},
    {"deal_id": "d4", "title": "Toyota of Decatur — Synthetic Oil Change + Inspection", "description": "Valid for 2015 RAV4 · $89.95 (reg $129.95)", "provider": "Toyota of Decatur", "category": "auto_service", "savings_usd": 40, "savings_label": "Save $40", "expires_in_days": 14},
    {"deal_id": "d5", "title": "Georgia Power Budget Billing", "description": "Level monthly payments to avoid seasonal spikes", "provider": "Georgia Power", "category": "utility", "savings_usd": 0, "savings_label": "Est. $15–$30/mo savings in summer peak", "expires_in_days": None},
]

SEED_UTILITIES = [
    {"id": "ga_power", "provider": "Georgia Power", "category": "electricity", "current_plan": "Standard Rate Schedule", "current_rate": "$0.1265/kWh", "last_bill": 145.00, "claude_prompt": "Compare Georgia Power residential electricity rates and programs available in DeKalb County Georgia. Suggest the best rate schedule or program for a household with average monthly usage of approximately 1,147 kWh and a monthly bill of $145. Include Budget Billing, Time of Use rates, and any available bill assistance programs. Return specific estimated annual savings for each option."},
    {"id": "att_wireless", "provider": "AT&T Wireless", "category": "wireless", "current_plan": "AT&T Unlimited Starter (2 lines)", "current_rate": "$120/month", "last_bill": 128.00, "claude_prompt": "Compare wireless plans for 2 lines in Atlanta Georgia as of 2026. The user currently pays $120/month on AT&T Unlimited Starter. Compare T-Mobile, Verizon, Mint Mobile, Visible, and Cricket Wireless for 2-line plans with similar or better coverage. Return the top 3 alternatives with monthly cost, contract terms, and estimated annual savings."},
    {"id": "att_internet", "provider": "AT&T Internet", "category": "internet", "current_plan": "AT&T Fiber 300", "current_rate": "$75/month", "last_bill": 75.00, "claude_prompt": "Compare home internet providers available in Stone Mountain Georgia 30087 zip code. User currently pays $75/month for AT&T Fiber 300 Mbps. Compare Xfinity, Google Fiber, Comcast, and any other available providers. Return alternatives with speed, price, contract terms, and estimated annual savings."},
    {"id": "dekalb_water", "provider": "DeKalb County Water", "category": "water", "current_plan": "Residential Metered", "current_rate": "$60/month avg", "last_bill": 67.00, "claude_prompt": "DeKalb County water is a municipal utility with no alternative providers. Suggest specific water conservation measures and programs available through DeKalb County Water and Sewer that could reduce a residential water bill from $60/month. Include leak detection advice, conservation rebates, and low-income assistance programs."},
]


# ----------------------------- Business Ideas -----------------------
@api_router.get("/business/ideas")
async def list_ideas(user_id: str = Depends(get_current_user_id)):
    items = await db.business_ideas.find({"user_id": user_id}, {"_id": 0}).sort([("order", 1), ("created_at", 1)]).to_list(50)
    if not items:
        # First read for this user: persist seed ideas so they become user-editable.
        now = datetime.now(timezone.utc).isoformat()
        seeded: List[Dict[str, Any]] = []
        for i, seed in enumerate(SEED_BUSINESS_IDEAS):
            doc = {
                **seed,
                "idea_id": str(uuid.uuid4()),
                "user_id": user_id,
                "created_at": now,
                "updated_at": now,
                "order": i,
                "source": "seed",
            }
            await db.business_ideas.insert_one(doc)
            seeded.append({k: v for k, v in doc.items() if k not in ("user_id", "_id")})
        return {"ideas": seeded, "is_seed": True}
    return {"ideas": items, "is_seed": False}


class BusinessIdeaIn(BaseModel):
    business_name: str
    timeline_tag: str = "Start Now"
    risk_level: str = "Moderate"
    description: str = ""
    startup_cost_range: str = ""
    estimated_monthly_revenue_range: str = ""
    time_to_first_revenue: str = ""
    next_steps: List[str] = []


@api_router.post("/business/ideas")
async def create_idea(body: BusinessIdeaIn, user_id: str = Depends(get_current_user_id)):
    now = datetime.now(timezone.utc).isoformat()
    cnt = await db.business_ideas.count_documents({"user_id": user_id})
    doc = {
        **body.dict(),
        "idea_id": str(uuid.uuid4()),
        "user_id": user_id,
        "created_at": now,
        "updated_at": now,
        "order": cnt,
        "source": "custom",
    }
    await db.business_ideas.insert_one(doc)
    return {k: v for k, v in doc.items() if k not in ("user_id", "_id")}


@api_router.put("/business/ideas/{idea_id}")
async def update_idea(idea_id: str, body: BusinessIdeaIn, user_id: str = Depends(get_current_user_id)):
    existing = await db.business_ideas.find_one({"idea_id": idea_id, "user_id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Idea not found")
    update_fields = {**body.dict(), "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.business_ideas.update_one({"idea_id": idea_id, "user_id": user_id}, {"$set": update_fields})
    merged = {**existing, **update_fields}
    return {k: v for k, v in merged.items() if k not in ("user_id", "_id")}


@api_router.delete("/business/ideas/{idea_id}")
async def delete_idea(idea_id: str, user_id: str = Depends(get_current_user_id)):
    r = await db.business_ideas.delete_one({"idea_id": idea_id, "user_id": user_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Idea not found")
    return {"ok": True}


@api_router.post("/business/ideas/generate")
async def generate_ideas(user_id: str = Depends(get_current_user_id)):
    profile = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0}) or {}
    career = await db.career_profile.find_one({"user_id": user_id}, {"_id": 0}) or {}
    debts = await db.debts.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    cc = sum(d.get("balance", 0) for d in debts if d.get("debt_type") == "credit_card")
    sl = sum(d.get("balance", 0) for d in debts if d.get("debt_type") == "student_loan")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"biz-ideas-{user_id}",
        system_message="You are a business strategist. Return only valid JSON arrays.",
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    prompt = (
        f"The user is {profile.get('full_name','Moses Ndifon')}, a {career.get('current_title','Department Coordinator')} "
        f"at {career.get('current_employer','Georgia State University Perimeter College')} with a background as USAID Deputy Controller "
        "managing multi-country foreign assistance portfolios across Asia-Pacific. MBA (West Georgia), BBA Accounting (Morehead State). "
        f"Monthly surplus ~$920. Credit card debt ~${cc:.0f} (4 cards), student loans ~${sl:.0f}. "
        "Owns a 4-hectare eco-resort property in Bulacan Philippines valued ~$12,000 USD. Built LearnWise K-12 assessment platform. "
        "Generate 5 personalized business ideas leveraging his skills, assets, situation. "
        "For each return: business_name, timeline_tag (Start Now / 3-6 Months / Long-Term), risk_level (Low / Moderate / High), "
        "description (2-3 sentences), startup_cost_range, estimated_monthly_revenue_range, time_to_first_revenue, "
        "next_steps (array of 4 specific immediate actions). Return as valid JSON array only with no preamble."
    )
    response = await chat.send_message(UserMessage(text=prompt))
    text = response if isinstance(response, str) else str(response)
    import json as _json
    import re as _re
    m = _re.search(r"\[.*\]", text, _re.DOTALL)
    ideas: List[Dict[str, Any]] = []
    if m:
        try:
            ideas = _json.loads(m.group(0))
        except Exception:
            ideas = []
    if not ideas:
        ideas = [{**i, "is_seed": False} for i in SEED_BUSINESS_IDEAS]
    now = datetime.now(timezone.utc).isoformat()
    await db.business_ideas.delete_many({"user_id": user_id})
    for i, idea in enumerate(ideas[:5]):
        doc = {**idea, "idea_id": str(uuid.uuid4()), "user_id": user_id, "created_at": now, "updated_at": now, "order": i, "is_seed": False, "source": "ai"}
        await db.business_ideas.insert_one(doc)
    return {"ideas": ideas[:5], "is_seed": False, "generated_at": now}


@api_router.post("/business/ideas/{idea_id}/plan")
async def build_plan(idea_id: str, user_id: str = Depends(get_current_user_id)):
    idea = await db.business_ideas.find_one({"idea_id": idea_id, "user_id": user_id}, {"_id": 0})
    if not idea:
        # Try seed
        idea = next((i for i in SEED_BUSINESS_IDEAS if i["idea_id"] == idea_id), None)
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"biz-plan-{user_id}-{idea_id[:6]}",
        system_message=PLOS_SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    prompt = (
        f"Write a concise business plan (UNDER 1500 words total) for {idea.get('business_name')} tailored to Moses Ndifon "
        "(GSU Perimeter College employee, USAID financial mgmt background, MBA, Stone Mountain GA, $920/mo surplus, ties to PH). "
        "Use these markdown sections, kept TIGHT and ACTIONABLE (no fluff): "
        "## Executive Summary (3 sentences). ## Market & Target Customers (3 bullets). "
        "## Operations Plan (4 bullets). ## Financial Projections (Year 1 / Year 2 / Year 3 revenue + net, one line each). "
        "## Startup Cost Breakdown (table-style, 4-6 line items totaling under $5k where possible). "
        "## Risks & Mitigation (3 bullets). ## First 30 Days (5 specific actions with week numbers). "
        "Be specific with dollar amounts and dates. Skip preamble. Be brief."
    )
    r = await chat.send_message(UserMessage(text=prompt))
    plan_text = r if isinstance(r, str) else str(r)
    return {"idea_id": idea_id, "business_name": idea.get("business_name"), "plan": plan_text}


# ----------------------------- Eden Heights -------------------------
@api_router.get("/business/eden-heights")
async def get_eden_heights(user_id: str = Depends(get_current_user_id)):
    doc = await db.eden_heights.find_one({"user_id": user_id}, {"_id": 0})
    if not doc:
        return DEFAULT_EDEN_HEIGHTS
    return doc


@api_router.put("/business/eden-heights")
async def update_eden_heights(body: Dict[str, Any], user_id: str = Depends(get_current_user_id)):
    existing = await db.eden_heights.find_one({"user_id": user_id}, {"_id": 0}) or {**DEFAULT_EDEN_HEIGHTS}
    for k in ("municipality", "size_hectares", "current_value_usd", "concept", "phases", "checklist", "name", "location", "breakeven_year"):
        if k in body:
            existing[k] = body[k]
    existing["user_id"] = user_id
    await db.eden_heights.update_one({"user_id": user_id}, {"$set": existing}, upsert=True)
    return {"ok": True}


@api_router.delete("/business/eden-heights")
async def delete_eden_heights(user_id: str = Depends(get_current_user_id)):
    await db.eden_heights.delete_one({"user_id": user_id})
    return {"ok": True}


# ----------------------------- Shopping -----------------------------
DEFAULT_SHOPPING_PREFS = {
    "utility_monitors": {"georgia_power": True, "att_wireless": True, "att_internet": True, "dekalb_water": True},
    "groceries": ["Kroger", "Costco", "Aldi"],
    "gas_threshold": 2.85,
    "categories": ["wireless", "groceries", "gas", "auto_service", "utility"],
    "frequency": "daily_digest",
}


@api_router.get("/shopping/deals")
async def list_deals(user_id: str = Depends(get_current_user_id)):
    dismissed = await db.dismissed_deals.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    dismissed_ids = {d["deal_id"] for d in dismissed}
    active = [d for d in SEED_DEALS if d["deal_id"] not in dismissed_ids]
    total_savings = sum(float(d.get("savings_usd") or 0) for d in active)
    return {"deals": active, "total_savings_this_month": round(total_savings, 2), "dismissed_count": len(dismissed_ids)}


@api_router.post("/shopping/deals/{deal_id}/dismiss")
async def dismiss_deal(deal_id: str, user_id: str = Depends(get_current_user_id)):
    await db.dismissed_deals.update_one(
        {"user_id": user_id, "deal_id": deal_id},
        {"$set": {"user_id": user_id, "deal_id": deal_id, "dismissed_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@api_router.get("/shopping/preferences")
async def get_shopping_prefs(user_id: str = Depends(get_current_user_id)):
    doc = await db.shopping_prefs.find_one({"user_id": user_id}, {"_id": 0, "user_id": 0})
    return doc or DEFAULT_SHOPPING_PREFS


@api_router.put("/shopping/preferences")
async def update_shopping_prefs(body: Dict[str, Any], user_id: str = Depends(get_current_user_id)):
    await db.shopping_prefs.update_one({"user_id": user_id}, {"$set": {**body, "user_id": user_id}}, upsert=True)
    return {"ok": True}


@api_router.get("/shopping/utilities")
async def list_utilities(user_id: str = Depends(get_current_user_id)):
    return {"utilities": SEED_UTILITIES}


@api_router.post("/shopping/utilities/{utility_id}/find-better")
async def find_better_rate(utility_id: str, user_id: str = Depends(get_current_user_id)):
    u = next((x for x in SEED_UTILITIES if x["id"] == utility_id), None)
    if not u:
        raise HTTPException(status_code=404, detail="Utility not found")
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"util-{user_id}-{utility_id}",
        system_message=PLOS_SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    r = await chat.send_message(UserMessage(text=u["claude_prompt"] + "\n\nIMPORTANT: Be CONCISE. Limit response to UNDER 500 words. Use bullet points only. Skip preamble."))
    text = r if isinstance(r, str) else str(r)
    return {"utility_id": utility_id, "provider": u["provider"], "recommendation": text}


@api_router.get("/shopping/registered-products")
async def list_registered(user_id: str = Depends(get_current_user_id)):
    items = await db.registered_products.find({"user_id": user_id}, {"_id": 0}).to_list(50)
    return {"products": items}


@api_router.post("/shopping/registered-products")
async def register_product(body: Dict[str, Any], user_id: str = Depends(get_current_user_id)):
    if not body.get("name"):
        raise HTTPException(status_code=400, detail="name required")
    obj = {
        "product_id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": body["name"],
        "category": body.get("category", "other"),
        "brand": body.get("brand"),
        "model": body.get("model"),
        "registered_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.registered_products.insert_one(obj)
    obj.pop("_id", None)
    return obj


@api_router.delete("/shopping/registered-products/{product_id}")
async def unregister_product(product_id: str, user_id: str = Depends(get_current_user_id)):
    await db.registered_products.delete_one({"product_id": product_id, "user_id": user_id})
    return {"ok": True}


# ----------------------------- Seed Demo Data --------------------------
@api_router.post("/seed-demo")
async def seed_demo(user_id: str = Depends(get_current_user_id)):
    """Seeds sample data for the logged-in user. Idempotent: clears + reseeds."""
    # clear existing user data (except profile + credentials)
    for col in [
        "income_sources",
        "expenses",
        "debts",
        "assets",
        "investments",
        "job_applications",
        "ai_decisions_log",
        "data_brokers",
        "security_alerts",
        "credit_scores",
        "credit_history",
        "credit_tips",
        "hard_inquiries",
        "breach_records",
        "identity_theft_checklist",
        "family_members",
        "saved_vehicles",
        "sos_events",
        "translations",
        "rate_alerts",
        "currency_history",
        "money_tips",
    ]:
        await db[col].delete_many({"user_id": user_id})

    # Income
    incomes = [
        {"source_name": "Primary Salary", "type": "salary", "gross_monthly": 8500, "net_monthly": 6200, "frequency": "monthly", "is_active": True},
        {"source_name": "Freelance Design", "type": "side", "gross_monthly": 1800, "net_monthly": 1500, "frequency": "monthly", "is_active": True},
        {"source_name": "VA Benefits", "type": "benefits", "gross_monthly": 1200, "net_monthly": 1200, "frequency": "monthly", "is_active": True},
    ]
    for i in incomes:
        obj = IncomeSource(**i).dict()
        obj["user_id"] = user_id
        await db.income_sources.insert_one(obj)

    # Expenses
    expenses = [
        {"category": "Housing", "vendor": "Wells Fargo Mortgage", "monthly_amount": 2350, "due_day_of_month": 1, "auto_pay": True, "deal_watch_enabled": False},
        {"category": "Utilities", "vendor": "ConEd", "monthly_amount": 180, "due_day_of_month": 15, "auto_pay": True, "deal_watch_enabled": False},
        {"category": "Streaming", "vendor": "Netflix", "monthly_amount": 23, "due_day_of_month": 7, "auto_pay": True, "deal_watch_enabled": True},
        {"category": "Insurance", "vendor": "Geico Auto", "monthly_amount": 142, "due_day_of_month": 20, "auto_pay": True, "deal_watch_enabled": True},
        {"category": "Groceries", "vendor": "Trader Joe's", "monthly_amount": 620, "due_day_of_month": 1, "auto_pay": False, "deal_watch_enabled": False},
        {"category": "Phone", "vendor": "Verizon", "monthly_amount": 95, "due_day_of_month": 12, "auto_pay": True, "deal_watch_enabled": True},
    ]
    for e in expenses:
        obj = Expense(**e).dict()
        obj["user_id"] = user_id
        await db.expenses.insert_one(obj)

    # Debts
    debts = [
        {"debt_type": "credit_card", "lender": "Chase Sapphire", "balance": 4200, "apr": 22.99, "minimum_payment": 145, "payoff_strategy": "avalanche", "projected_payoff_date": "2026-08-01"},
        {"debt_type": "student_loan", "lender": "Nelnet", "balance": 28500, "apr": 5.5, "minimum_payment": 320, "payoff_strategy": "avalanche", "projected_payoff_date": "2031-05-01"},
        {"debt_type": "mortgage", "lender": "Wells Fargo", "balance": 312000, "apr": 6.25, "minimum_payment": 2350, "payoff_strategy": "avalanche", "projected_payoff_date": "2049-01-01"},
        {"debt_type": "auto", "lender": "Toyota Financial", "balance": 18400, "apr": 4.2, "minimum_payment": 410, "payoff_strategy": "avalanche", "projected_payoff_date": "2028-06-01"},
    ]
    for d in debts:
        obj = Debt(**d).dict()
        obj["user_id"] = user_id
        await db.debts.insert_one(obj)

    # Assets
    assets = [
        {"asset_type": "real_estate", "name": "Primary Residence", "current_value": 485000, "purchase_value": 380000, "location": "Austin, TX", "notes": "Purchased 2020"},
        {"asset_type": "vehicle", "name": "2022 Toyota RAV4", "current_value": 24500, "purchase_value": 32000, "location": "Garage", "notes": "Paid through 2028"},
        {"asset_type": "cash", "name": "Emergency Savings (HYSA)", "current_value": 18500, "purchase_value": 18500, "location": "Marcus by Goldman Sachs", "notes": "4.5% APY"},
    ]
    for a in assets:
        obj = Asset(**a).dict()
        obj["user_id"] = user_id
        await db.assets.insert_one(obj)

    # Investments
    investments = [
        {"type": "TSP", "balance": 78200, "contribution_monthly": 850, "employer_match_pct": 5, "projected_at_65": 425000},
        {"type": "IRA", "balance": 24500, "contribution_monthly": 500, "employer_match_pct": 0, "projected_at_65": 180000},
        {"type": "brokerage", "balance": 12800, "contribution_monthly": 250, "employer_match_pct": 0, "projected_at_65": 65000},
        {"type": "social_security", "balance": 0, "contribution_monthly": 0, "employer_match_pct": 0, "projected_at_65": 2400},
        {"type": "life_insurance", "balance": 250000, "contribution_monthly": 45, "employer_match_pct": 0, "projected_at_65": 250000},
    ]
    for inv in investments:
        obj = Investment(**inv).dict()
        obj["user_id"] = user_id
        await db.investments.insert_one(obj)

    # Job Applications
    apps = [
        {"employer": "Anthropic", "role_title": "Senior Product Engineer", "match_score": 87, "status": "interview", "resume_version_used": "v3-tech", "cover_letter_used": "anthropic-cover", "applied_date": "2026-01-18", "location": "San Francisco, CA", "work_type": "remote", "salary_range": "$220K-$280K", "badges": ["Top Match", "Lateral Move"]},
        {"employer": "Stripe", "role_title": "Staff Engineer, Payments", "match_score": 78, "status": "applied", "resume_version_used": "v3-tech", "cover_letter_used": None, "applied_date": "2026-02-02", "location": "Remote (US)", "work_type": "remote", "salary_range": "$240K-$310K", "badges": ["New"]},
        {"employer": "Linear", "role_title": "Engineering Manager", "match_score": 72, "status": "matched", "resume_version_used": None, "cover_letter_used": None, "applied_date": None, "location": "Remote", "work_type": "remote", "salary_range": "$200K-$260K", "badges": ["New"]},
        {"employer": "Vercel", "role_title": "Senior Full-Stack Engineer", "match_score": 91, "status": "matched", "resume_version_used": None, "cover_letter_used": None, "applied_date": None, "location": "Remote", "work_type": "remote", "salary_range": "$210K-$270K", "badges": ["Top Match", "New"]},
        {"employer": "Notion", "role_title": "Senior Software Engineer", "match_score": 83, "status": "screening", "resume_version_used": "v3-tech", "cover_letter_used": None, "applied_date": "2026-01-25", "location": "New York, NY", "work_type": "hybrid", "salary_range": "$195K-$250K", "badges": []},
    ]
    for a in apps:
        obj = JobApplication(**a).dict()
        obj["user_id"] = user_id
        await db.job_applications.insert_one(obj)

    # Career
    await db.career_profile.update_one(
        {"user_id": user_id},
        {"$set": {
            "current_title": "Senior Software Engineer",
            "current_employer": "Acme Corp",
            "ats_score": 82,
            "target_roles": ["Senior Engineer", "Staff Engineer", "Engineering Manager"],
            "target_locations": ["Remote", "Austin, TX", "New York, NY"],
            "min_salary": 165000,
            "work_type_pref": "remote",
            "auto_apply_enabled": False,
            "auto_apply_review_first": True,
            "auto_cover_letter": True,
            "resume_master_text": """JOHN DOE — Senior Software Engineer
Austin, TX · john.doe@example.com · linkedin.com/in/johndoe

SUMMARY
Senior software engineer with 8+ years of experience building scalable web applications and leading cross-functional teams. Specialized in TypeScript, React, Node.js, and distributed systems on AWS. Shipped products at Series-B and public companies serving 10M+ users.

EXPERIENCE
Acme Corp — Senior Software Engineer (2022 — Present)
• Led migration of monolithic Rails app to Next.js + Postgres + Redis, improving p95 latency 47%.
• Built feature-flag system in TypeScript used by 4 product teams, 200+ active flags.
• Mentored 3 junior engineers through formal program.

PayFlow (Series B Fintech) — Software Engineer (2019 — 2022)
• Designed event-driven payments pipeline (Kafka, Go) processing $2B/yr.
• Implemented PCI-DSS and SOC2 controls for production data access.

OpenStack Labs — Software Engineer (2017 — 2019)
• Contributed to open-source SDKs in Python and JavaScript (3k+ stars).
• Built CLI tool adopted by 12 partner companies.

EDUCATION
B.S. Computer Science, UT Austin, 2017

SKILLS
TypeScript, React, Next.js, Node.js, Python, Go, PostgreSQL, Redis, AWS (ECS, RDS, S3), Docker, Kubernetes, Terraform, CI/CD, system design, mentoring."""
        }},
    )

    # Health
    await db.health_profile.update_one(
        {"user_id": user_id},
        {"$set": {
            "insurance_type": "Employer PPO + VA",
            "coverage_renewal_date": "2026-12-31",
            "income_eligibility_threshold": 95000,
            "medical_report_notes": "Annual physical clear. BP slightly elevated.",
            "wellness_checkin_score": 7,
        }},
    )

    # Profile location
    await db.user_profile.update_one(
        {"user_id": user_id},
        {"$set": {"location_primary": "Austin, TX", "date_of_birth": "1989-04-12"}},
    )

    # AI decisions seed
    decisions = [
        {"module": "finance", "advice_text": "Pay an extra $250/mo on Chase Sapphire (22.99% APR). Saves ~$680 in interest and clears it 7 months sooner.", "priority": "action"},
        {"module": "career", "advice_text": "Anthropic interview is your highest match (87%). Prep system design + their recent product launches.", "priority": "urgent"},
        {"module": "health", "advice_text": "BP flagged in last physical. Wellness score is 7/10 — consider a 20-min daily walk this week.", "priority": "info"},
    ]
    for d in decisions:
        obj = AIDecision(**d).dict()
        obj["user_id"] = user_id
        await db.ai_decisions_log.insert_one(obj)

    # =========================================================
    # Identity & Security seed
    # =========================================================
    now_dt = datetime.now(timezone.utc)
    now_iso = now_dt.isoformat()

    def days_ago(n: int) -> str:
        return (now_dt - timedelta(days=n)).isoformat()

    # 1) Data brokers — exact seed per PRD
    brokers_seed = [
        {"name": "Spokeo", "domain": "spokeo.com", "status": "pii_found",
         "data_exposed": ["full name", "current address", "phone number", "employer"],
         "opt_out_available": True,
         "opt_out_url": "https://www.spokeo.com/optout",
         "last_scanned_at": days_ago(2)},
        {"name": "Intelius", "domain": "intelius.com", "status": "pii_found",
         "data_exposed": ["phone number", "previous addresses", "relatives"],
         "opt_out_available": True,
         "opt_out_url": "https://suppression.peopleconnect.us/login",
         "last_scanned_at": days_ago(2)},
        {"name": "WhitePages", "domain": "whitepages.com", "status": "opt_out_pending",
         "data_exposed": ["name", "address", "phone"],
         "opt_out_available": True,
         "opt_out_submitted_at": days_ago(8),
         "notes": "Expected removal: 3-10 business days",
         "last_scanned_at": days_ago(2)},
        {"name": "BeenVerified", "domain": "beenverified.com", "status": "removed",
         "data_exposed": [], "opt_out_available": True,
         "removal_confirmed_at": days_ago(15),
         "next_rescan_at": days_ago(-30),
         "last_scanned_at": days_ago(15)},
        {"name": "Radaris", "domain": "radaris.com", "status": "removed",
         "data_exposed": [], "opt_out_available": True,
         "removal_confirmed_at": days_ago(20),
         "last_scanned_at": days_ago(20)},
        {"name": "PeopleFinder", "domain": "peoplefinder.com", "status": "scanning",
         "data_exposed": [], "opt_out_available": True,
         "last_scanned_at": now_iso},
        {"name": "MyLife", "domain": "mylife.com", "status": "pii_found",
         "data_exposed": ["name", "age", "address", "possible associates"],
         "opt_out_available": True,
         "opt_out_url": "https://www.mylife.com/ccpa",
         "last_scanned_at": days_ago(2)},
        {"name": "Truthfinder", "domain": "truthfinder.com", "status": "pii_found",
         "data_exposed": ["name", "address history", "phone"],
         "opt_out_available": True,
         "opt_out_url": "https://www.truthfinder.com/opt-out/",
         "last_scanned_at": days_ago(2)},
        {"name": "Checkr", "domain": "checkr.com", "status": "clear",
         "data_exposed": [], "opt_out_available": True,
         "last_scanned_at": days_ago(2)},
        {"name": "ZabaSearch", "domain": "zabasearch.com", "status": "clear",
         "data_exposed": [], "opt_out_available": True,
         "last_scanned_at": days_ago(2)},
        {"name": "PeopleLooker", "domain": "peoplelooker.com", "status": "scanning",
         "data_exposed": [], "opt_out_available": True,
         "last_scanned_at": now_iso},
    ]
    for b in brokers_seed:
        obj = DataBroker(**b).dict()
        obj["user_id"] = user_id
        await db.data_brokers.insert_one(obj)

    # 2) Credit scores (demo)
    credit_seed = [
        {"bureau": "equifax", "current_score": 672, "previous_score": 680, "is_demo": True},
        {"bureau": "transunion", "current_score": 681, "previous_score": 678, "is_demo": True},
        {"bureau": "experian", "current_score": 668, "previous_score": 668, "is_demo": True},
    ]
    for c in credit_seed:
        obj = {**c, "user_id": user_id, "last_updated": now_iso}
        await db.credit_scores.insert_one(obj)

    # 3) Credit history (6 months, gradual climb 645 → current per bureau)
    # Simulated upward trajectory
    history_traj = {
        "equifax":     [645, 651, 658, 665, 680, 672],
        "transunion":  [648, 655, 662, 670, 678, 681],
        "experian":    [642, 649, 655, 661, 668, 668],
    }
    for bureau, trail in history_traj.items():
        for offset, score in enumerate(reversed(trail)):
            month_dt = now_dt.replace(day=1) - timedelta(days=30 * offset)
            await db.credit_history.insert_one({
                "user_id": user_id,
                "bureau": bureau,
                "score": score,
                "month": month_dt.strftime("%Y-%m"),
            })

    # 4) Hard inquiry — recent Chase Sapphire inquiry (correlates with -8 on Equifax)
    await db.hard_inquiries.insert_one({
        "inquiry_id": str(uuid.uuid4()),
        "user_id": user_id,
        "bureau": "equifax",
        "creditor": "Chase Sapphire",
        "inquired_at": days_ago(12),
        "expected_drop_off": days_ago(-(365 * 2)),
    })

    # 5) Breach records (DEMO)
    profile = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0}) or {}
    email = profile.get("email") or "user@example.com"
    breaches_seed = [
        {"email": email, "breach_name": "LinkedIn 2021",
         "breach_date": "2021-06-22",
         "data_types_exposed": ["passwords", "emails"],
         "recommended_action": "Change LinkedIn password and any reused passwords.",
         "status": "active", "is_demo": True},
        {"email": email, "breach_name": "Canva 2019",
         "breach_date": "2019-05-24",
         "data_types_exposed": ["emails", "names"],
         "recommended_action": "Rotate password if you used Canva.",
         "status": "active", "is_demo": True},
        {"email": email, "breach_name": "Adobe 2013",
         "breach_date": "2013-10-04",
         "data_types_exposed": ["emails", "passwords", "security questions"],
         "recommended_action": "Update Adobe password + change security questions everywhere they were reused.",
         "status": "active", "is_demo": True},
    ]
    for br in breaches_seed:
        obj = BreachRecord(**br).dict()
        obj["user_id"] = user_id
        await db.breach_records.insert_one(obj)

    # 6) Security alerts (live feed)
    alerts_seed = [
        {"severity": "critical", "title": "Spokeo: PII listing detected",
         "description": "Name, address, phone, and employer found on spokeo.com. Send opt-out now.",
         "action_type": "opt_out",
         "related_id": None,
         "created_at": days_ago(1)},
        {"severity": "warning", "title": "Equifax dropped 8 points",
         "description": "New hard inquiry from Chase Sapphire detected on Equifax.",
         "action_type": "dispute",
         "created_at": days_ago(2)},
        {"severity": "critical", "title": "Email in LinkedIn 2021 breach",
         "description": "Your email appeared in the LinkedIn 2021 password leak. Update reused passwords.",
         "action_type": "change_pw",
         "created_at": days_ago(3)},
        {"severity": "warning", "title": "MyLife: PII listing detected",
         "description": "Name, age, address, and associates listed publicly.",
         "action_type": "opt_out",
         "created_at": days_ago(4)},
        {"severity": "resolved", "title": "BeenVerified removal confirmed",
         "description": "Your listing was removed successfully.",
         "action_type": "review",
         "created_at": days_ago(15)},
    ]
    for a in alerts_seed:
        obj = SecurityAlert(**a).dict()
        obj["user_id"] = user_id
        await db.security_alerts.insert_one(obj)

    # =========================================================
    # Local Intelligence & Safety seed
    # =========================================================
    # Family members
    family_seed = [
        {
            "name": "Isaac",
            "initials": "IS",
            "color": "#A855F7",  # purple
            "last_lat": 33.7396,
            "last_lon": -84.2419,
            "last_address": "Oak View Elementary School, 4355 Flat Shoals Pkwy, Decatur GA",
            "last_seen": (now_dt - timedelta(minutes=6)).isoformat(),
        },
        {
            "name": "Ken",
            "initials": "KN",
            "color": "#14B8A6",  # teal
            "last_lat": 33.7396,
            "last_lon": -84.2419,
            "last_address": "Oak View Elementary School, 4355 Flat Shoals Pkwy, Decatur GA",
            "last_seen": (now_dt - timedelta(minutes=6)).isoformat(),
        },
    ]
    for f in family_seed:
        obj = FamilyMember(**f).dict()
        obj["user_id"] = user_id
        await db.family_members.insert_one(obj)

    # Saved vehicle (NHTSA real recall query target)
    await db.saved_vehicles.insert_one(
        {
            **SavedVehicle(year=2015, make="Toyota", model="RAV4", vin=None).dict(),
            "user_id": user_id,
        }
    )

    # User profile defaults for local module
    await db.user_profile.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "cuisine_preference": "Filipino",
                "location_paused": False,
            }
        },
    )

    # =========================================================
    # Global Tools seed (rate alerts + 30-day currency history)
    # =========================================================
    alerts_seed_2 = [
        {
            "base": "USD", "target": "PHP", "rate_target": 58.0,
            "direction": "above", "label": "Eden Heights Transfer Trigger",
            "enabled": True, "status": "watching",
            "created_at": days_ago(7),
        },
        {
            "base": "USD", "target": "EUR", "rate_target": 0.95,
            "direction": "above", "label": "Travel to Europe",
            "enabled": True, "status": "watching",
            "created_at": days_ago(5),
        },
    ]
    for a in alerts_seed_2:
        obj = RateAlert(**a).dict()
        obj["user_id"] = user_id
        await db.rate_alerts.insert_one(obj)

    # 30-day USD/PHP trajectory: 56.40 -> 57.80 (day 15) -> 57.20 (day 22) -> 57.32 (day 30)
    php_trail = [
        56.40, 56.55, 56.70, 56.85, 56.95, 57.05, 57.10, 57.20, 57.30, 57.40,
        57.50, 57.60, 57.70, 57.75, 57.80, 57.78, 57.70, 57.60, 57.50, 57.40,
        57.30, 57.20, 57.18, 57.20, 57.22, 57.25, 57.28, 57.30, 57.31, 57.32,
    ]
    eur_trail = [
        0.918, 0.920, 0.922, 0.921, 0.923, 0.925, 0.927, 0.929, 0.930, 0.931,
        0.932, 0.933, 0.934, 0.935, 0.937, 0.938, 0.936, 0.934, 0.933, 0.932,
        0.931, 0.930, 0.929, 0.929, 0.930, 0.931, 0.931, 0.930, 0.930, 0.930,
    ]
    ngn_trail = [
        1480, 1490, 1500, 1510, 1515, 1520, 1525, 1530, 1535, 1540,
        1545, 1548, 1550, 1552, 1555, 1556, 1554, 1552, 1550, 1548,
        1546, 1545, 1544, 1544, 1545, 1546, 1547, 1548, 1549, 1550,
    ]
    for target, trail in [("PHP", php_trail), ("EUR", eur_trail), ("NGN", ngn_trail)]:
        for i, rate in enumerate(trail):
            d = (now_dt - timedelta(days=29 - i))
            await db.currency_history.insert_one({
                "user_id": user_id,
                "base": "USD",
                "target": target,
                "day": d.strftime("%Y-%m-%d"),
                "rate": rate,
            })

    return {"ok": True, "message": "Demo data seeded"}


# ====================================================================
# TRAVEL ADVISOR MODULE
# ====================================================================
COUNTRY_FLAG = {
    "PH": "🇵🇭", "JP": "🇯🇵", "FR": "🇫🇷", "DE": "🇩🇪", "BE": "🇧🇪",
    "KR": "🇰🇷", "TH": "🇹🇭", "VN": "🇻🇳", "AU": "🇦🇺", "CA": "🇨🇦",
    "GB": "🇬🇧", "IT": "🇮🇹", "ES": "🇪🇸", "MX": "🇲🇽", "CH": "🇨🇭",
    "NL": "🇳🇱", "SE": "🇸🇪", "SG": "🇸🇬", "ID": "🇮🇩", "IN": "🇮🇳",
    "CN": "🇨🇳", "RU": "🇷🇺", "UA": "🇺🇦", "BR": "🇧🇷", "ZA": "🇿🇦",
    "KE": "🇰🇪", "NG": "🇳🇬", "CM": "🇨🇲", "AE": "🇦🇪", "IL": "🇮🇱",
    "US": "🇺🇸",
}

TRAVEL_ADVISORIES: List[Dict[str, Any]] = [
    {"country": "Philippines", "country_code": "PH", "level": 2, "summary": "Exercise Increased Caution", "notes": "Exercise increased caution in Mindanao (especially Sulu Archipelago and Marawi City) due to crime, terrorism, civil unrest, and kidnapping."},
    {"country": "Japan", "country_code": "JP", "level": 1, "summary": "Exercise Normal Precautions", "notes": "Standard precautions for transit hubs and crowded areas."},
    {"country": "France", "country_code": "FR", "level": 2, "summary": "Exercise Increased Caution", "notes": "Pickpocket activity high in Paris tourist areas (Metro, Champs-Élysées, Louvre)."},
    {"country": "Germany", "country_code": "DE", "level": 2, "summary": "Exercise Increased Caution", "notes": "Threat of terrorism in major cities and transit hubs."},
    {"country": "Belgium", "country_code": "BE", "level": 2, "summary": "Exercise Increased Caution", "notes": "Brussels — additional security around EU/NATO areas."},
    {"country": "South Korea", "country_code": "KR", "level": 1, "summary": "Exercise Normal Precautions", "notes": "Stay alert near DMZ; otherwise low risk."},
    {"country": "Thailand", "country_code": "TH", "level": 1, "summary": "Exercise Normal Precautions", "notes": "Higher caution in southern provinces near Malaysia border."},
    {"country": "Vietnam", "country_code": "VN", "level": 1, "summary": "Exercise Normal Precautions", "notes": "Watch petty theft in tourist hot spots."},
    {"country": "Australia", "country_code": "AU", "level": 1, "summary": "Exercise Normal Precautions", "notes": "Bushfire risk in dry seasons."},
    {"country": "Canada", "country_code": "CA", "level": 1, "summary": "Exercise Normal Precautions", "notes": "Wildfire/smoke advisories during summer."},
    {"country": "United Kingdom", "country_code": "GB", "level": 2, "summary": "Exercise Increased Caution", "notes": "Terrorism risk in metropolitan London."},
    {"country": "Italy", "country_code": "IT", "level": 2, "summary": "Exercise Increased Caution", "notes": "Pickpocketing in Rome/Milan; terrorism risk in transit hubs."},
    {"country": "Spain", "country_code": "ES", "level": 2, "summary": "Exercise Increased Caution", "notes": "Pickpocketing especially in Barcelona, Madrid."},
    {"country": "Mexico", "country_code": "MX", "level": 2, "summary": "Exercise Increased Caution", "notes": "State-level advisories: avoid Tamaulipas, Colima, Guerrero, Michoacán, Sinaloa, Zacatecas (Level 4)."},
    {"country": "Switzerland", "country_code": "CH", "level": 1, "summary": "Exercise Normal Precautions", "notes": "Generally very safe."},
    {"country": "Netherlands", "country_code": "NL", "level": 2, "summary": "Exercise Increased Caution", "notes": "Petty theft and bicycle-related incidents in central Amsterdam."},
    {"country": "Sweden", "country_code": "SE", "level": 2, "summary": "Exercise Increased Caution", "notes": "Recent uptick in gang-related violence in Stockholm suburbs."},
    {"country": "Singapore", "country_code": "SG", "level": 1, "summary": "Exercise Normal Precautions", "notes": "Strict local laws — follow them carefully."},
    {"country": "Indonesia", "country_code": "ID", "level": 2, "summary": "Exercise Increased Caution", "notes": "Terrorism, natural disasters, civil unrest in Papua."},
    {"country": "India", "country_code": "IN", "level": 2, "summary": "Exercise Increased Caution", "notes": "Avoid Jammu and Kashmir, India-Pakistan border, Manipur (Level 4)."},
    {"country": "China", "country_code": "CN", "level": 3, "summary": "Reconsider Travel", "notes": "Arbitrary enforcement of local laws, exit bans, wrongful detentions."},
    {"country": "Russia", "country_code": "RU", "level": 4, "summary": "Do Not Travel", "notes": "Ongoing war, harassment of US citizens, terrorism, mobilization."},
    {"country": "Ukraine", "country_code": "UA", "level": 4, "summary": "Do Not Travel", "notes": "Active armed conflict and Russian invasion."},
    {"country": "Brazil", "country_code": "BR", "level": 2, "summary": "Exercise Increased Caution", "notes": "Crime in major cities; avoid favelas."},
    {"country": "South Africa", "country_code": "ZA", "level": 2, "summary": "Exercise Increased Caution", "notes": "Violent crime in urban centers; civil unrest possible."},
    {"country": "Kenya", "country_code": "KE", "level": 2, "summary": "Exercise Increased Caution", "notes": "Avoid northeastern counties (Level 3)."},
    {"country": "Nigeria", "country_code": "NG", "level": 3, "summary": "Reconsider Travel", "notes": "Crime, terrorism, kidnapping, maritime crime."},
    {"country": "Cameroon", "country_code": "CM", "level": 2, "summary": "Exercise Increased Caution", "notes": "Avoid Northwest/Southwest regions and Far North (Level 4)."},
    {"country": "United Arab Emirates", "country_code": "AE", "level": 1, "summary": "Exercise Normal Precautions", "notes": "Be aware of regional missile activity."},
    {"country": "Israel", "country_code": "IL", "level": 4, "summary": "Do Not Travel", "notes": "Armed conflict and terrorism throughout the region."},
]
ADVISORY_BY_CODE = {a["country_code"]: a for a in TRAVEL_ADVISORIES}

ATL_MNL_FLIGHTS = [
    {"flight_id": "ke-cheapest", "label": "Cheapest", "airline": "Korean Air", "route": "ATL → ICN → MNL", "stops": 1,
     "duration": "22h 40m", "price_usd": 687, "departs": "11:30 PM",
     "deeplink": "https://www.google.com/flights?hl=en#flt=ATL.MNL"},
    {"flight_id": "jl-fastest", "label": "Fastest", "airline": "Japan Airlines", "route": "ATL → NRT → MNL", "stops": 1,
     "duration": "19h 55m", "price_usd": 894, "departs": "12:25 PM",
     "deeplink": "https://www.google.com/flights?hl=en#flt=ATL.MNL"},
    {"flight_id": "pr-bestvalue", "label": "Best Value", "airline": "Philippine Airlines", "route": "ATL → LAX → MNL", "stops": 1,
     "duration": "23h 15m", "price_usd": 742, "departs": "07:50 AM", "extras": "Checked bag included",
     "deeplink": "https://www.google.com/flights?hl=en#flt=ATL.MNL"},
]

MANILA_HOTELS = [
    {"hotel_id": "marriott-mnl", "name": "Marriott Manila", "area": "Pasay City — near MNL Airport",
     "price_per_night_usd": 89, "stars": 4, "perks": "Free airport shuttle · business center",
     "deeplink": "https://www.booking.com/searchresults.html?ss=Manila"},
    {"hotel_id": "seda-vertis", "name": "Seda Vertis North", "area": "Quezon City — Business district",
     "price_per_night_usd": 65, "stars": 4, "perks": "Business facilities · gym",
     "deeplink": "https://www.booking.com/searchresults.html?ss=Manila"},
    {"hotel_id": "redplanet-mal", "name": "Red Planet Manila", "area": "Malate — Historic district",
     "price_per_night_usd": 38, "stars": 3, "perks": "Budget · walking distance to old town",
     "deeplink": "https://www.booking.com/searchresults.html?ss=Manila"},
]

TRAVEL_DEALS_SEED = [
    {"deal_id": "deal-atl-mnl", "type": "price_drop", "origin_code": "ATL", "destination_code": "MNL",
     "destination_name": "Manila, Philippines", "country_code": "PH",
     "current_price_usd": 687, "average_price_usd": 838, "discount_pct": 18,
     "expires_in_days": 3, "tag": "Good time to book",
     "deeplink": "https://www.google.com/flights?hl=en#flt=ATL.MNL"},
    {"deal_id": "deal-atl-cdg", "type": "flight", "origin_code": "ATL", "destination_code": "CDG",
     "destination_name": "Paris, France", "country_code": "FR",
     "current_price_usd": 542, "average_price_usd": 720, "discount_pct": 25,
     "expires_in_days": 9, "tag": "NATO / Europe corridor",
     "deeplink": "https://www.google.com/flights?hl=en#flt=ATL.CDG"},
    {"deal_id": "deal-atl-nrt", "type": "flight", "origin_code": "ATL", "destination_code": "NRT",
     "destination_name": "Tokyo, Japan", "country_code": "JP",
     "current_price_usd": 698, "average_price_usd": 905, "discount_pct": 23,
     "expires_in_days": 14, "tag": "ADB Manila via Tokyo routing",
     "deeplink": "https://www.google.com/flights?hl=en#flt=ATL.NRT"},
]

DEFAULT_CHECKLIST_ITEMS = [
    {"key": "passport_valid", "label": "Passport valid for at least 6 months beyond travel dates", "auto": True},
    {"key": "visa", "label": "Visa obtained or confirmed not required", "auto": False},
    {"key": "insurance", "label": "Travel insurance purchased", "auto": False, "note_label": "Policy #"},
    {"key": "vaccinations", "label": "Vaccinations up to date", "auto": False},
    {"key": "hotel", "label": "Hotel confirmed", "auto": False, "note_label": "Confirmation #"},
    {"key": "flights", "label": "Flights booked", "auto": False, "note_label": "Booking ref"},
    {"key": "airport_transit", "label": "Transportation from airport arranged", "auto": False},
    {"key": "phone_plan", "label": "Local SIM or international phone plan", "auto": False, "note_label": "Plan"},
    {"key": "currency", "label": "Currency / ATM plan confirmed", "auto": False},
    {"key": "family_notified", "label": "Emergency contacts notified of itinerary", "auto": False},
    {"key": "docs_cloud", "label": "Important documents photographed & stored in cloud", "auto": False},
    {"key": "meds", "label": "Medications packed with prescriptions", "auto": False},
    {"key": "offline_maps", "label": "PLOS offline maps downloaded for destination", "auto": False},
]

EDEN_CHECKLIST_ITEM = {"key": "eden_review", "label": "Eden Heights project tasks reviewed", "auto": False}

PH_CACHED_INSIGHTS = {
    "best_time_to_visit": "December through March is the dry, cooler season — ideal for outdoor work at Eden Heights. Avoid June–October (typhoon season) for construction or fieldwork.",
    "visa_requirement": {
        "required": False,
        "type": "visa free",
        "processing_days": 0,
        "cost_usd": None,
        "apply_url": "https://immigration.gov.ph/visa-extension",
        "notes": "US passport holders get 30-day visa-free entry on arrival. Extend at the Bureau of Immigration for longer stays. Long-term options: SRRV (Special Resident Retiree's Visa) for property owners, or ACR I-Card for extended stays."
    },
    "vaccinations": ["Routine vaccines up to date (MMR, Tdap, Polio)", "Hepatitis A", "Hepatitis B", "Typhoid", "Japanese Encephalitis (if rural/long stay)", "Rabies (if rural work with animals)"],
    "packing_list": {
        "documents": ["Passport", "Printed Eden Heights title docs", "BIR & DENR papers", "USD/PHP cash + cards"],
        "clothing": ["Lightweight breathable shirts", "Long pants for site work", "Rain jacket (typhoon season)", "Sturdy boots", "Mosquito-proof hat"],
        "electronics": ["Universal adapter (Type A/B/C)", "Power bank", "Unlocked phone for local SIM", "Drone for site survey (declare at customs)"],
        "health": ["DEET mosquito spray (40%+)", "Anti-diarrheal", "Rehydration salts", "Sunblock SPF 50", "First aid kit"],
        "other": ["Small Filipino phrase guide", "Cash in small PHP bills for jeepneys/sari-sari", "Eco-construction reference notes"]
    },
    "dos": [
        "Greet elders with 'po' / 'opo' suffix as sign of respect",
        "Bring small gifts (pasalubong) when visiting family or partners",
        "Remove shoes when entering homes",
        "Use right hand or both hands when giving/receiving items",
        "Smile and stay calm during traffic or delays — Filipino time is real",
        "Tip ₱20–₱50 for service staff and ₱50–₱100 for porters"
    ],
    "donts": [
        "Don't raise your voice in disputes — public 'shaming' is taken seriously",
        "Don't point with your finger; gesture with your lips or full hand",
        "Don't refuse food at a host's home — accept at least a small portion",
        "Don't take photos of military or government installations",
        "Don't discuss religion or politics with strangers",
        "Don't flash valuables in Metro Manila — pickpockets target obvious tourists"
    ],
    "emergency_contacts": {
        "police": "117 (national emergency) or 911",
        "ambulance": "911 / Philippine Red Cross 143",
        "us_embassy_phone": "+63 2 5301 2000",
        "us_embassy_address": "1201 Roxas Boulevard, Ermita 1000, Manila, Philippines"
    },
    "local_currency": "PHP",
    "language": "Filipino (Tagalog) & English — English widely spoken in business",
    "time_zone": "UTC+8 (13h ahead of Atlanta EST, 12h ahead during EDT)",
    "cultural_notes": "Philippines blends Spanish, American, and Asian influences. Family ('bayanihan') and hospitality are central. Business runs on relationships — invest time in informal chats before contracts."
}


class TripIn(BaseModel):
    destination_name: str
    city: Optional[str] = None
    country: str
    country_code: Optional[str] = None
    departure_date: Optional[str] = None
    return_date: Optional[str] = None
    purpose: str = "leisure"  # business / leisure / eden_heights / family / conference / medical / mixed
    status: str = "planning"  # planning / booked / completed
    notes: Optional[str] = None


def _normalize_trip(t: Dict[str, Any]) -> Dict[str, Any]:
    out = {k: v for k, v in t.items() if k not in ("_id", "user_id")}
    out["flag"] = COUNTRY_FLAG.get((t.get("country_code") or "").upper(), "🏳️")
    if t.get("departure_date"):
        try:
            dep = datetime.fromisoformat(t["departure_date"].replace("Z", "+00:00"))
            today = datetime.now(timezone.utc)
            delta = (dep.date() - today.date()).days
            out["days_until_departure"] = delta
        except Exception:
            out["days_until_departure"] = None
    return out


@api_router.get("/travel/advisories")
async def list_advisories():
    return {"advisories": TRAVEL_ADVISORIES}


@api_router.get("/travel/advisory/{country_code}")
async def get_advisory(country_code: str):
    code = country_code.upper()
    if code in ADVISORY_BY_CODE:
        return {"cached": True, **ADVISORY_BY_CODE[code]}
    return {
        "cached": False,
        "country_code": code,
        "summary": "Advisory level not cached — tap to check travel.state.gov",
        "deeplink": f"https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/{code.lower()}-travel-advisory.html"
    }


@api_router.get("/travel/deals")
async def list_travel_deals():
    return {"deals": TRAVEL_DEALS_SEED, "mocked": True}


@api_router.get("/travel/flights")
async def get_flights(origin: str = "ATL", destination: str = "MNL"):
    if origin.upper() == "ATL" and destination.upper() == "MNL":
        return {"flights": ATL_MNL_FLIGHTS, "origin": "ATL", "destination": "MNL", "mocked": True}
    return {"flights": [], "origin": origin, "destination": destination, "mocked": True,
            "message": "Seed flight data only available for ATL → MNL. Tap deep-link to search live fares."}


@api_router.get("/travel/hotels")
async def get_hotels(city: str = "Manila"):
    if city.lower() in ("manila", "mnl"):
        return {"hotels": MANILA_HOTELS, "city": "Manila", "mocked": True}
    return {"hotels": [], "city": city, "mocked": True,
            "message": "Seed hotel data only available for Manila. Tap deep-link to search live rates."}


@api_router.get("/travel/trips")
async def list_trips(user_id: str = Depends(get_current_user_id)):
    items = await db.trips.find({"user_id": user_id}, {"_id": 0}).sort("departure_date", 1).to_list(100)
    return {"trips": [_normalize_trip(t) for t in items]}


@api_router.post("/travel/trips")
async def create_trip(body: TripIn, user_id: str = Depends(get_current_user_id)):
    now = datetime.now(timezone.utc).isoformat()
    doc = body.dict()
    if doc.get("country_code"):
        doc["country_code"] = doc["country_code"].upper()
    doc.update({"trip_id": str(uuid.uuid4()), "user_id": user_id, "created_at": now, "updated_at": now})
    await db.trips.insert_one(doc)
    return _normalize_trip(doc)


@api_router.get("/travel/trips/{trip_id}")
async def get_trip(trip_id: str, user_id: str = Depends(get_current_user_id)):
    t = await db.trips.find_one({"trip_id": trip_id, "user_id": user_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Trip not found")
    return _normalize_trip(t)


@api_router.put("/travel/trips/{trip_id}")
async def update_trip(trip_id: str, body: TripIn, user_id: str = Depends(get_current_user_id)):
    existing = await db.trips.find_one({"trip_id": trip_id, "user_id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Trip not found")
    update_fields = body.dict()
    if update_fields.get("country_code"):
        update_fields["country_code"] = update_fields["country_code"].upper()
    update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.trips.update_one({"trip_id": trip_id, "user_id": user_id}, {"$set": update_fields})
    merged = {**existing, **update_fields}
    return _normalize_trip(merged)


@api_router.delete("/travel/trips/{trip_id}")
async def delete_trip(trip_id: str, user_id: str = Depends(get_current_user_id)):
    r = await db.trips.delete_one({"trip_id": trip_id, "user_id": user_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Trip not found")
    await db.trip_checklists.delete_one({"trip_id": trip_id, "user_id": user_id})
    return {"ok": True}


class InsightsRequest(BaseModel):
    destination_name: str
    country: str
    country_code: Optional[str] = None
    city: Optional[str] = None
    departure_date: Optional[str] = None
    return_date: Optional[str] = None
    duration_days: Optional[int] = None
    purpose: str = "leisure"
    trip_id: Optional[str] = None
    force_refresh: bool = False


@api_router.post("/travel/insights")
async def get_destination_insights(body: InsightsRequest, user_id: str = Depends(get_current_user_id)):
    # If a trip_id is provided and insights already cached and not force_refresh — return cache.
    if body.trip_id and not body.force_refresh:
        t = await db.trips.find_one({"trip_id": body.trip_id, "user_id": user_id}, {"_id": 0})
        if t and t.get("cached_insights"):
            return {"insights": t["cached_insights"], "cached": True}

    # Hardcoded fast path for Philippines
    if (body.country_code or "").upper() == "PH" or "philippin" in (body.country or "").lower():
        insights = PH_CACHED_INSIGHTS
    else:
        try:
            chat = LlmChat(
                api_key=os.environ.get("EMERGENT_LLM_KEY"),
                session_id=f"travel_{user_id}_{int(time.time())}",
                system_message="You are a precise travel advisor for US passport holders. Return ONLY a valid JSON object with no markdown fences and no commentary.",
            ).with_model("anthropic", "claude-sonnet-4-5-20250929")

            duration_part = f"Trip duration: {body.duration_days} days." if body.duration_days else ""
            prompt = (
                f"Destination: {body.city + ', ' if body.city else ''}{body.country}. "
                f"Trip purpose: {body.purpose}. {duration_part} "
                "Return a JSON object with EXACTLY these keys: "
                "best_time_to_visit (string, 2 sentences), "
                "visa_requirement (object: required boolean, type string, processing_days int, cost_usd int|null, apply_url string|null, notes string), "
                "vaccinations (array of strings), "
                "packing_list (object: documents, clothing, electronics, health, other — each an array of strings; tailor to purpose & duration), "
                "dos (array of 5-7 strings), donts (array of 5-7 strings), "
                "emergency_contacts (object: police, ambulance, us_embassy_phone, us_embassy_address), "
                "local_currency (3-letter ISO code), language (primary language), "
                "time_zone (UTC offset and difference from Atlanta EST/EDT), "
                "cultural_notes (string, 2-3 sentences). "
                "Be specific, concise, accurate. NO markdown fences."
            )
            r = await chat.send_message(UserMessage(text=prompt))
            text = r.strip()
            # Strip code fences if model returned them
            if text.startswith("```"):
                text = text.split("\n", 1)[1] if "\n" in text else text
                if text.endswith("```"):
                    text = text.rsplit("```", 1)[0]
                if text.startswith("json"):
                    text = text[4:].lstrip()
            try:
                insights = json.loads(text)
            except Exception:
                # Fallback minimal scaffold
                insights = {
                    "best_time_to_visit": "Information unavailable — Claude returned malformed JSON.",
                    "visa_requirement": {"required": False, "type": "check official sources", "processing_days": 0, "cost_usd": None, "apply_url": None, "notes": text[:400]},
                    "vaccinations": [], "packing_list": {"documents": [], "clothing": [], "electronics": [], "health": [], "other": []},
                    "dos": [], "donts": [],
                    "emergency_contacts": {"police": "", "ambulance": "", "us_embassy_phone": "", "us_embassy_address": ""},
                    "local_currency": "", "language": "", "time_zone": "", "cultural_notes": "",
                }
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Insights generation failed: {e}")

    if body.trip_id:
        await db.trips.update_one(
            {"trip_id": body.trip_id, "user_id": user_id},
            {"$set": {"cached_insights": insights, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
    return {"insights": insights, "cached": False}


async def _init_checklist(trip_id: str, user_id: str, purpose: str) -> Dict[str, Any]:
    items = [{**i, "checked": False, "note": ""} for i in DEFAULT_CHECKLIST_ITEMS]
    if purpose == "eden_heights":
        items.append({**EDEN_CHECKLIST_ITEM, "checked": False, "note": ""})
    doc = {"trip_id": trip_id, "user_id": user_id, "items": items,
           "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.trip_checklists.insert_one(doc)
    return doc


@api_router.get("/travel/checklist/{trip_id}")
async def get_checklist(trip_id: str, user_id: str = Depends(get_current_user_id)):
    t = await db.trips.find_one({"trip_id": trip_id, "user_id": user_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Trip not found")
    c = await db.trip_checklists.find_one({"trip_id": trip_id, "user_id": user_id}, {"_id": 0})
    if not c:
        c = await _init_checklist(trip_id, user_id, t.get("purpose", "leisure"))
        c.pop("_id", None)
    # Apply auto-passport check
    pp = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0, "passport": 1}) or {}
    passport = pp.get("passport") or {}
    if passport.get("expiry_date"):
        try:
            expiry = datetime.fromisoformat(passport["expiry_date"]).date()
            today = datetime.now(timezone.utc).date()
            months = (expiry.year - today.year) * 12 + (expiry.month - today.month)
            for it in c["items"]:
                if it["key"] == "passport_valid":
                    it["checked"] = months >= 6
                    it["note"] = f"Expires {passport['expiry_date']} ({months}mo away)" if months >= 0 else f"EXPIRED {passport['expiry_date']}"
        except Exception:
            pass
    return {k: v for k, v in c.items() if k != "user_id"}


@api_router.put("/travel/checklist/{trip_id}")
async def update_checklist(trip_id: str, body: Dict[str, Any], user_id: str = Depends(get_current_user_id)):
    existing = await db.trip_checklists.find_one({"trip_id": trip_id, "user_id": user_id}, {"_id": 0})
    if not existing:
        t = await db.trips.find_one({"trip_id": trip_id, "user_id": user_id}, {"_id": 0})
        if not t:
            raise HTTPException(status_code=404, detail="Trip not found")
        existing = await _init_checklist(trip_id, user_id, t.get("purpose", "leisure"))
    items = body.get("items", existing["items"])
    await db.trip_checklists.update_one(
        {"trip_id": trip_id, "user_id": user_id},
        {"$set": {"items": items, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "items": items}


@api_router.get("/travel/cost-estimate/{trip_id}")
async def get_cost_estimate(trip_id: str, user_id: str = Depends(get_current_user_id)):
    t = await db.trips.find_one({"trip_id": trip_id, "user_id": user_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Trip not found")
    est = t.get("cost_estimate") or {
        "flights": 0, "hotel_per_night": 0, "nights": 0,
        "daily_budget": 0, "days": 0, "visa_fees": 0,
        "insurance": 0, "misc": 0,
    }
    return {"estimate": est}


@api_router.put("/travel/cost-estimate/{trip_id}")
async def put_cost_estimate(trip_id: str, body: Dict[str, Any], user_id: str = Depends(get_current_user_id)):
    t = await db.trips.find_one({"trip_id": trip_id, "user_id": user_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Trip not found")
    est = {
        "flights": float(body.get("flights", 0) or 0),
        "hotel_per_night": float(body.get("hotel_per_night", 0) or 0),
        "nights": int(body.get("nights", 0) or 0),
        "daily_budget": float(body.get("daily_budget", 0) or 0),
        "days": int(body.get("days", 0) or 0),
        "visa_fees": float(body.get("visa_fees", 0) or 0),
        "insurance": float(body.get("insurance", 0) or 0),
        "misc": float(body.get("misc", 0) or 0),
    }
    await db.trips.update_one(
        {"trip_id": trip_id, "user_id": user_id},
        {"$set": {"cost_estimate": est, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"estimate": est}


# --- Passport (stored on user_profile.passport) ---
class PassportIn(BaseModel):
    passport_number: Optional[str] = None
    issuing_country: str = "United States"
    issue_date: Optional[str] = None
    expiry_date: Optional[str] = None
    nationality: str = "United States"
    global_entry_number: Optional[str] = None
    global_entry_expiry: Optional[str] = None
    nexus_number: Optional[str] = None
    other_visa: Optional[str] = None


def _passport_status(expiry: Optional[str]) -> Dict[str, Any]:
    if not expiry:
        return {"level": "unknown", "color": "neutral", "label": "No passport on file"}
    try:
        d = datetime.fromisoformat(expiry).date()
        today = datetime.now(timezone.utc).date()
        months = (d.year - today.year) * 12 + (d.month - today.month) + (-1 if d.day < today.day else 0)
        if d < today:
            return {"level": "expired", "color": "danger", "label": "Passport expired — renew immediately at travel.state.gov/passports", "months": months}
        if months < 6:
            return {"level": "critical", "color": "danger", "label": "Passport renewal required before most international travel", "months": months}
        if months < 12:
            return {"level": "warning", "color": "warning", "label": "Passport expires soon — many countries require 6 months validity beyond travel dates", "months": months}
        return {"level": "ok", "color": "success", "label": "Passport valid", "months": months}
    except Exception:
        return {"level": "unknown", "color": "neutral", "label": "Invalid expiry date"}


@api_router.get("/travel/passport")
async def get_passport(user_id: str = Depends(get_current_user_id)):
    p = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0}) or {}
    passport = p.get("passport") or {"issuing_country": "United States", "nationality": "United States"}
    return {"passport": passport, "status": _passport_status(passport.get("expiry_date"))}


@api_router.put("/travel/passport")
async def put_passport(body: PassportIn, user_id: str = Depends(get_current_user_id)):
    passport = body.dict()
    await db.user_profile.update_one(
        {"user_id": user_id},
        {"$set": {"passport": passport}},
        upsert=True,
    )
    return {"passport": passport, "status": _passport_status(passport.get("expiry_date"))}


# --- Philippines pinned-template ---
@api_router.get("/travel/philippines-template")
async def ph_template(user_id: str = Depends(get_current_user_id)):
    # Fetch live PHP/USD rate from local rates cache via existing global tools call.
    rate = None
    try:
        async with httpx.AsyncClient(timeout=8.0) as cli:
            r = await cli.get("https://open.er-api.com/v6/latest/USD")
            if r.status_code == 200:
                data = r.json()
                rate = (data.get("rates") or {}).get("PHP")
    except Exception:
        rate = None
    return {
        "destination": {
            "destination_name": "Manila & Bulacan",
            "city": "Manila",
            "country": "Philippines",
            "country_code": "PH",
            "flag": "🇵🇭",
            "purpose": "eden_heights",
        },
        "flight_route": {"origin": "ATL", "destination": "MNL"},
        "immigration_note": "US passport holders receive 30-day visa-free entry on arrival. For longer stays extend at the Bureau of Immigration. Long-term options: SRRV (Special Resident Retiree's Visa) for property owners, or ACR I-Card.",
        "bulacan_note": "Bulacan province is ~1–2 hours north of Manila via NLEX (toll). No direct public transit from MNL airport to Bulacan — pre-arrange a private vehicle or Grab car.",
        "live_rate": rate,
        "rate_pair": "USD → PHP",
        "advisory": ADVISORY_BY_CODE.get("PH"),
        "cached_insights": PH_CACHED_INSIGHTS,
    }


# ====================================================================
# HEALTH & WELLBEING MODULE
# ====================================================================
GA_MEDICAID_THRESHOLD_MONTHLY = 1822  # 138% FPL single adult (2026 estimate)
GA_MEDICAID_THRESHOLD_FAMILY_OF_2 = 2466

DEFAULT_HEALTH_INSURANCE = {
    "coverage_type": "Medicaid",
    "plan_name": "Georgia Medicaid",
    "provider": "Georgia Department of Community Health",
    "policy_number": None,
    "renewal_date": None,  # YYYY-MM-DD
    "monthly_premium_usd": 0,
    "deductible_usd": 0,
    "household_size": 1,
    "monthly_income_usd": None,  # User-entered for eligibility tracking
    "notes": "Income-based coverage. Renewal review required annually.",
}

MEDICAID_RESOURCES = [
    {"label": "Georgia Medicaid Portal", "url": "https://medicaid.georgia.gov/", "description": "Apply, renew, check eligibility"},
    {"label": "Healthcare.gov Marketplace", "url": "https://www.healthcare.gov/", "description": "ACA marketplace plans if over Medicaid limit"},
    {"label": "GA Gateway (Renewals)", "url": "https://gateway.ga.gov/", "description": "Renew Medicaid online"},
    {"label": "Find In-Network Provider", "url": "https://medicaid.georgia.gov/providers/provider-search", "description": "Search Georgia Medicaid providers"},
    {"label": "PeachCare for Kids", "url": "https://medicaid.georgia.gov/peachcare-kids", "description": "Children under 19 coverage"},
    {"label": "Member Services", "url": "tel:18664394769", "description": "Call 1-866-439-4769"},
]

COVERED_SERVICES_SUMMARY = [
    "Primary care visits",
    "Emergency room services",
    "Hospital inpatient/outpatient care",
    "Lab work and X-rays",
    "Mental & behavioral health services",
    "Prescription medications (formulary)",
    "Maternity & newborn care",
    "Dental & vision (limited for adults)",
    "Substance use disorder treatment",
    "Family planning services",
]


class InsuranceIn(BaseModel):
    coverage_type: Optional[str] = None
    plan_name: Optional[str] = None
    provider: Optional[str] = None
    policy_number: Optional[str] = None
    renewal_date: Optional[str] = None
    monthly_premium_usd: Optional[float] = None
    deductible_usd: Optional[float] = None
    household_size: Optional[int] = None
    monthly_income_usd: Optional[float] = None
    notes: Optional[str] = None


def _eligibility_status(monthly_income: Optional[float], household_size: int = 1) -> Dict[str, Any]:
    threshold = GA_MEDICAID_THRESHOLD_MONTHLY if household_size <= 1 else GA_MEDICAID_THRESHOLD_FAMILY_OF_2
    if monthly_income is None:
        return {"level": "unknown", "color": "neutral", "label": "Income not entered", "threshold": threshold, "income": None, "ratio": None}
    ratio = monthly_income / threshold if threshold else 0
    if ratio > 1:
        return {"level": "over", "color": "danger", "label": "Income exceeds Medicaid threshold — review alternatives", "threshold": threshold, "income": monthly_income, "ratio": ratio}
    if ratio >= 0.85:
        return {"level": "approaching", "color": "warning", "label": "Income is approaching the Medicaid eligibility cap", "threshold": threshold, "income": monthly_income, "ratio": ratio}
    return {"level": "ok", "color": "success", "label": "Within Medicaid eligibility limits", "threshold": threshold, "income": monthly_income, "ratio": ratio}


def _days_until(date_str: Optional[str]) -> Optional[int]:
    if not date_str:
        return None
    try:
        d = datetime.fromisoformat(date_str).date()
        return (d - datetime.now(timezone.utc).date()).days
    except Exception:
        return None


@api_router.get("/health/insurance")
async def get_insurance(user_id: str = Depends(get_current_user_id)):
    p = await db.health_profile.find_one({"user_id": user_id}, {"_id": 0}) or {}
    ins = p.get("insurance") or DEFAULT_HEALTH_INSURANCE
    # Fall back to user's actual income if not set
    if ins.get("monthly_income_usd") is None:
        sources = await db.income_sources.find({"user_id": user_id}, {"_id": 0}).to_list(20)
        total = sum((s.get("monthly_amount") or 0) for s in sources)
        if total > 0:
            ins["monthly_income_usd"] = total
    elig = _eligibility_status(ins.get("monthly_income_usd"), ins.get("household_size") or 1)
    return {
        "insurance": ins,
        "eligibility": elig,
        "days_until_renewal": _days_until(ins.get("renewal_date")),
    }


@api_router.put("/health/insurance")
async def update_insurance(body: InsuranceIn, user_id: str = Depends(get_current_user_id)):
    p = await db.health_profile.find_one({"user_id": user_id}, {"_id": 0}) or {}
    ins = p.get("insurance") or {**DEFAULT_HEALTH_INSURANCE}
    update = {k: v for k, v in body.dict().items() if v is not None}
    ins.update(update)
    await db.health_profile.update_one({"user_id": user_id}, {"$set": {"insurance": ins}}, upsert=True)
    elig = _eligibility_status(ins.get("monthly_income_usd"), ins.get("household_size") or 1)
    return {"insurance": ins, "eligibility": elig, "days_until_renewal": _days_until(ins.get("renewal_date"))}


@api_router.get("/health/medicaid-resources")
async def medicaid_resources():
    return {
        "resources": MEDICAID_RESOURCES,
        "covered_services": COVERED_SERVICES_SUMMARY,
        "thresholds": {
            "single_adult_monthly_usd": GA_MEDICAID_THRESHOLD_MONTHLY,
            "family_of_2_monthly_usd": GA_MEDICAID_THRESHOLD_FAMILY_OF_2,
            "state": "Georgia",
            "year": 2026,
            "note": "Threshold reflects 138% of Federal Poverty Level. Verify on medicaid.georgia.gov for exact eligibility.",
        },
    }


class WellnessIn(BaseModel):
    energy: int  # 1-10
    sleep: int
    stress: int
    mood: int
    notes: Optional[str] = ""
    date: Optional[str] = None  # YYYY-MM-DD, defaults to today


@api_router.post("/health/wellness")
async def log_wellness(body: WellnessIn, user_id: str = Depends(get_current_user_id)):
    today = body.date or datetime.now(timezone.utc).date().isoformat()
    doc = {
        "user_id": user_id,
        "date": today,
        "energy": max(1, min(10, body.energy)),
        "sleep": max(1, min(10, body.sleep)),
        "stress": max(1, min(10, body.stress)),
        "mood": max(1, min(10, body.mood)),
        "notes": body.notes or "",
        "created_at": iso(now_utc()),
    }
    # Upsert by (user_id, date) so one entry per day
    await db.wellness_checkins.update_one(
        {"user_id": user_id, "date": today},
        {"$set": doc},
        upsert=True,
    )
    return {k: v for k, v in doc.items() if k != "user_id"}


@api_router.get("/health/wellness")
async def list_wellness(days: int = 7, user_id: str = Depends(get_current_user_id)):
    days = max(1, min(60, days))
    since = (datetime.now(timezone.utc).date() - timedelta(days=days)).isoformat()
    rows = await db.wellness_checkins.find(
        {"user_id": user_id, "date": {"$gte": since}},
        {"_id": 0, "user_id": 0},
    ).sort("date", 1).to_list(60)
    return {"checkins": rows, "since": since, "days": days}


class MedicationIn(BaseModel):
    name: str
    dosage: Optional[str] = None
    schedule_time: Optional[str] = None  # "08:00" / "Morning & Evening"
    notes: Optional[str] = None


@api_router.get("/health/medications")
async def list_meds(user_id: str = Depends(get_current_user_id)):
    rows = await db.medications.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).sort("created_at", 1).to_list(50)
    return {"medications": rows}


@api_router.post("/health/medications")
async def create_med(body: MedicationIn, user_id: str = Depends(get_current_user_id)):
    doc = {
        **body.dict(),
        "med_id": str(uuid.uuid4()),
        "user_id": user_id,
        "created_at": iso(now_utc()),
    }
    await db.medications.insert_one(doc)
    return {k: v for k, v in doc.items() if k not in ("_id", "user_id")}


@api_router.put("/health/medications/{med_id}")
async def update_med(med_id: str, body: MedicationIn, user_id: str = Depends(get_current_user_id)):
    r = await db.medications.update_one(
        {"med_id": med_id, "user_id": user_id},
        {"$set": {**body.dict(), "updated_at": iso(now_utc())}},
    )
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    doc = await db.medications.find_one({"med_id": med_id, "user_id": user_id}, {"_id": 0, "user_id": 0})
    return doc


@api_router.delete("/health/medications/{med_id}")
async def delete_med(med_id: str, user_id: str = Depends(get_current_user_id)):
    r = await db.medications.delete_one({"med_id": med_id, "user_id": user_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


class AppointmentIn(BaseModel):
    title: str
    datetime: str  # ISO
    location: Optional[str] = None
    notes: Optional[str] = None


@api_router.get("/health/appointments")
async def list_appts(user_id: str = Depends(get_current_user_id)):
    rows = await db.appointments.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).sort("datetime", 1).to_list(50)
    today = datetime.now(timezone.utc).date()
    for r in rows:
        try:
            d = datetime.fromisoformat(r["datetime"].replace("Z", "+00:00")).date()
            r["days_until"] = (d - today).days
        except Exception:
            r["days_until"] = None
    return {"appointments": rows}


@api_router.post("/health/appointments")
async def create_appt(body: AppointmentIn, user_id: str = Depends(get_current_user_id)):
    doc = {
        **body.dict(),
        "appt_id": str(uuid.uuid4()),
        "user_id": user_id,
        "created_at": iso(now_utc()),
    }
    await db.appointments.insert_one(doc)
    return {k: v for k, v in doc.items() if k not in ("_id", "user_id")}


@api_router.put("/health/appointments/{appt_id}")
async def update_appt(appt_id: str, body: AppointmentIn, user_id: str = Depends(get_current_user_id)):
    r = await db.appointments.update_one({"appt_id": appt_id, "user_id": user_id}, {"$set": body.dict()})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    doc = await db.appointments.find_one({"appt_id": appt_id, "user_id": user_id}, {"_id": 0, "user_id": 0})
    return doc


@api_router.delete("/health/appointments/{appt_id}")
async def delete_appt(appt_id: str, user_id: str = Depends(get_current_user_id)):
    r = await db.appointments.delete_one({"appt_id": appt_id, "user_id": user_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@api_router.post("/health/insights")
async def health_insights(user_id: str = Depends(get_current_user_id)):
    since = (datetime.now(timezone.utc).date() - timedelta(days=7)).isoformat()
    rows = await db.wellness_checkins.find(
        {"user_id": user_id, "date": {"$gte": since}},
        {"_id": 0, "user_id": 0},
    ).sort("date", 1).to_list(7)
    if not rows:
        return {"insights": "Log at least one wellness check-in to receive AI insights. Aim for a daily check-in for the best signal.", "data_points": 0}
    summary = "\n".join(
        f"{r['date']}: energy {r['energy']}/10, sleep {r['sleep']}/10, stress {r['stress']}/10, mood {r['mood']}/10. {r.get('notes','')}"
        for r in rows
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"health-insights-{user_id}-{int(time.time())}",
        system_message="You are a wellness coach for PLOS users. Be concise, evidence-based, and ALWAYS end with: 'This is not a medical diagnosis — please consult your doctor for medical questions.'",
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    prompt = (
        "Analyze this user's last 7 days of wellness check-ins. Identify the most concerning trend "
        "(stress, sleep, energy, or mood). Offer EXACTLY 3 evidence-based strategies they can try this week. "
        "Be brief (under 250 words total). Use markdown bullets.\n\nData:\n" + summary
    )
    try:
        r = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Insights failed: {e}")
    return {"insights": r if isinstance(r, str) else str(r), "data_points": len(rows)}


# ====================================================================
# LEGAL ADVISOR MODULE
# ====================================================================
LEGAL_CATEGORIES = [
    {"slug": "housing", "title": "Housing & Tenant Rights", "icon": "home", "color": "#3B82F6",
     "description": "Lease agreements, evictions, security deposits, repairs, fair housing"},
    {"slug": "employment", "title": "Employment Law", "icon": "briefcase", "color": "#F59E0B",
     "description": "At-will, discrimination, wage & hour, FMLA, workers' comp"},
    {"slug": "debt", "title": "Debt & Credit Rights (FDCPA)", "icon": "credit-card", "color": "#EF4444",
     "description": "Collector behavior, credit disputes, statute of limitations"},
    {"slug": "immigration", "title": "Immigration & International", "icon": "globe", "color": "#06B6D4",
     "description": "Visas, green cards, naturalization, work authorization"},
    {"slug": "family", "title": "Family Law Basics", "icon": "users", "color": "#A855F7",
     "description": "Marriage, divorce, custody, adoption, support"},
    {"slug": "estate", "title": "Estate Planning", "icon": "scroll", "color": "#10B981",
     "description": "Wills, trusts, POA, healthcare directives, probate"},
    {"slug": "consumer", "title": "Consumer Rights", "icon": "shopping-cart", "color": "#EC4899",
     "description": "Warranties, lemon laws, deceptive practices, refunds"},
    {"slug": "tax", "title": "Tax Law Basics", "icon": "calculator", "color": "#14B8A6",
     "description": "Filing requirements, deductions, IRS disputes, GA state tax"},
    {"slug": "smallbiz", "title": "Small Business Law", "icon": "building", "color": "#F97316",
     "description": "LLC formation, contracts, taxes, employment, licensing"},
]
LEGAL_CATEGORY_BY_SLUG = {c["slug"]: c for c in LEGAL_CATEGORIES}

LEGAL_DISCLAIMER = "⚖️ This is general legal information only and not legal advice. For specific legal situations, consult a licensed attorney in your jurisdiction."

DEFAULT_LEGAL_DOCS = [
    {"type": "will", "title": "Last Will & Testament", "description": "Directs distribution of assets after death."},
    {"type": "poa", "title": "Power of Attorney", "description": "Authorizes someone to act on your behalf."},
    {"type": "life_insurance", "title": "Life Insurance Beneficiaries", "description": "Confirm beneficiaries are current and correct."},
    {"type": "property_deed", "title": "Property Deeds & Titles", "description": "All real estate ownership documents filed."},
    {"type": "healthcare_directive", "title": "Healthcare Directive / Living Will", "description": "Medical decisions if incapacitated."},
]

GA_DEBT_RIGHTS = {
    "fdcpa": {
        "title": "Fair Debt Collection Practices Act (FDCPA)",
        "rights": [
            "Collectors may NOT call before 8 AM or after 9 PM in your time zone",
            "They cannot use abusive, obscene, or threatening language",
            "They must identify themselves and the debt they are collecting on",
            "You can request validation of the debt in writing within 30 days",
            "You can demand they cease all communication in writing",
            "They cannot discuss your debt with third parties (except spouse, attorney)",
            "Violations: $1,000 statutory damages + actual damages + attorney's fees",
        ],
    },
    "credit_disputes": {
        "title": "Disputing Credit Report Errors",
        "steps": [
            "Get free credit reports at annualcreditreport.com (weekly, all 3 bureaus)",
            "Send dispute letter via certified mail with return receipt",
            "Include: copy of report with item circled, explanation, supporting docs",
            "Bureau must investigate within 30 days (45 if you submit additional info)",
            "If unresolved, complain to CFPB at consumerfinance.gov/complaint",
        ],
    },
    "student_loans": {
        "title": "Student Loan Forgiveness Programs",
        "programs": [
            {"name": "Public Service Loan Forgiveness (PSLF)", "criteria": "120 qualifying payments while working full-time for government or 501(c)(3) — applies to USAID, GSU, public schools."},
            {"name": "Teacher Loan Forgiveness", "criteria": "Up to $17,500 after 5 consecutive years teaching low-income schools."},
            {"name": "Income-Driven Repayment (SAVE/IDR)", "criteria": "Payments capped at 5-10% of discretionary income; balance forgiven after 20-25 years."},
            {"name": "Borrower Defense to Repayment", "criteria": "School engaged in fraudulent practices."},
            {"name": "Total & Permanent Disability Discharge", "criteria": "Documented permanent disability through SSA/VA/physician."},
        ],
    },
    "statute_of_limitations_ga": {
        "title": "Statute of Limitations in Georgia (Debt Collection)",
        "items": [
            {"debt_type": "Credit card (open account)", "years": 4, "note": "Per O.C.G.A. § 9-3-25"},
            {"debt_type": "Written contract / signed agreement", "years": 6, "note": "Per O.C.G.A. § 9-3-24"},
            {"debt_type": "Promissory note", "years": 6, "note": "Per O.C.G.A. § 11-3-118"},
            {"debt_type": "Auto loan (UCC)", "years": 4, "note": "Per O.C.G.A. § 11-2-725"},
            {"debt_type": "Medical debt (oral)", "years": 4, "note": "Per O.C.G.A. § 9-3-26"},
            {"debt_type": "Judgments (state court)", "years": 7, "note": "Renewable; per O.C.G.A. § 9-12-60"},
        ],
    },
    "free_legal_aid_ga": [
        {"name": "Atlanta Legal Aid Society", "phone": "404-524-5811", "url": "https://atlantalegalaid.org/"},
        {"name": "Georgia Legal Services Program", "phone": "1-833-457-7529", "url": "https://www.glsp.org/"},
        {"name": "State Bar of Georgia Lawyer Referral", "phone": "404-527-8700", "url": "https://www.gabar.org/forthepublic/"},
        {"name": "CFPB (federal complaints)", "phone": "1-855-411-2372", "url": "https://www.consumerfinance.gov/complaint/"},
    ],
}


@api_router.get("/legal/categories")
async def list_legal_categories():
    return {"categories": LEGAL_CATEGORIES, "disclaimer": LEGAL_DISCLAIMER}


@api_router.post("/legal/topic/{slug}")
async def legal_topic(slug: str, force_refresh: bool = False, user_id: str = Depends(get_current_user_id)):
    cat = LEGAL_CATEGORY_BY_SLUG.get(slug)
    if not cat:
        raise HTTPException(status_code=404, detail="Unknown category")

    if not force_refresh:
        cached = await db.legal_topic_cache.find_one({"user_id": user_id, "slug": slug}, {"_id": 0})
        if cached and cached.get("response"):
            try:
                age_days = (datetime.now(timezone.utc) - datetime.fromisoformat(cached["generated_at"].replace("Z", "+00:00"))).days
                if age_days < 7:
                    return {"slug": slug, "title": cat["title"], "response": cached["response"], "cached": True, "disclaimer": LEGAL_DISCLAIMER}
            except Exception:
                pass

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"legal-{user_id}-{slug}-{int(time.time())}",
        system_message=(
            "You are a legal information assistant for PLOS users based in Atlanta, Georgia. "
            "Provide accurate, plain-English overviews of US/Georgia law. Use markdown structure: "
            "## Overview of Key Rights, ## Common Situations, ## When to Consult an Attorney, "
            "## Georgia Resources. Keep total response UNDER 600 words, focused on actionable info. "
            "ALWAYS end with: '⚖️ This is general legal information only and not legal advice. For specific legal situations, consult a licensed attorney in your jurisdiction.'"
        ),
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    prompt = f"Generate the overview for category: {cat['title']}. Description: {cat['description']}. User is in Georgia."
    try:
        r = await chat.send_message(UserMessage(text=prompt))
        text = r if isinstance(r, str) else str(r)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Legal topic failed: {e}")

    await db.legal_topic_cache.update_one(
        {"user_id": user_id, "slug": slug},
        {"$set": {"response": text, "generated_at": iso(now_utc())}},
        upsert=True,
    )
    return {"slug": slug, "title": cat["title"], "response": text, "cached": False, "disclaimer": LEGAL_DISCLAIMER}


class LegalDocIn(BaseModel):
    type: str
    title: str
    description: Optional[str] = ""
    status: str = "not_started"  # not_started / drafted / signed / filed
    date: Optional[str] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    custom: bool = False


@api_router.get("/legal/documents")
async def list_legal_docs(user_id: str = Depends(get_current_user_id)):
    items = await db.legal_documents.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).sort("created_at", 1).to_list(50)
    if not items:
        # Seed defaults
        now = iso(now_utc())
        for d in DEFAULT_LEGAL_DOCS:
            doc = {
                **d,
                "doc_id": str(uuid.uuid4()),
                "user_id": user_id,
                "status": "not_started",
                "date": None,
                "location": None,
                "notes": None,
                "custom": False,
                "created_at": now,
            }
            await db.legal_documents.insert_one(doc)
        items = await db.legal_documents.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).sort("created_at", 1).to_list(50)
    return {"documents": items, "disclaimer": LEGAL_DISCLAIMER}


@api_router.post("/legal/documents")
async def create_legal_doc(body: LegalDocIn, user_id: str = Depends(get_current_user_id)):
    doc = {
        **body.dict(),
        "doc_id": str(uuid.uuid4()),
        "user_id": user_id,
        "custom": True,
        "created_at": iso(now_utc()),
    }
    await db.legal_documents.insert_one(doc)
    return {k: v for k, v in doc.items() if k not in ("_id", "user_id")}


@api_router.put("/legal/documents/{doc_id}")
async def update_legal_doc(doc_id: str, body: LegalDocIn, user_id: str = Depends(get_current_user_id)):
    existing = await db.legal_documents.find_one({"doc_id": doc_id, "user_id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    update = body.dict()
    update["updated_at"] = iso(now_utc())
    # Preserve `custom` flag from existing doc
    update["custom"] = existing.get("custom", False)
    await db.legal_documents.update_one({"doc_id": doc_id, "user_id": user_id}, {"$set": update})
    merged = {**existing, **update}
    return {k: v for k, v in merged.items() if k not in ("_id", "user_id")}


@api_router.delete("/legal/documents/{doc_id}")
async def delete_legal_doc(doc_id: str, user_id: str = Depends(get_current_user_id)):
    existing = await db.legal_documents.find_one({"doc_id": doc_id, "user_id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    if not existing.get("custom"):
        raise HTTPException(status_code=400, detail="Default documents cannot be deleted — reset their status instead.")
    await db.legal_documents.delete_one({"doc_id": doc_id, "user_id": user_id})
    return {"ok": True}


@api_router.get("/legal/debt-rights")
async def debt_rights():
    return {**GA_DEBT_RIGHTS, "disclaimer": LEGAL_DISCLAIMER}


# ====================================================================
# Health check
# ====================================================================
@api_router.get("/")
async def root():
    return {"status": "ok", "service": "PLOS API"}


# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
