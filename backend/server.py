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
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt as pyjwt
from emergentintegrations.llm.chat import LlmChat, UserMessage

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
@api_router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, user_id: str = Depends(get_current_user_id)):
    session_id = payload.session_id or f"chat-{user_id}-{uuid.uuid4()}"
    context = await gather_user_context(user_id)

    # persist user message
    await db.chat_messages.insert_one({
        "user_id": user_id,
        "session_id": session_id,
        "role": "user",
        "content": payload.message,
        "created_at": iso(now_utc()),
    })

    system = (
        PLOS_SYSTEM_PROMPT
        + f"\n\nThe user's full data context (use it to answer):\n{context}"
    )

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
        "created_at": iso(now_utc()),
    })

    return ChatResponse(response=response_text, session_id=session_id)


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

    return {"ok": True, "message": "Demo data seeded"}


# ----------------------------- Health check ----------------------------
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
