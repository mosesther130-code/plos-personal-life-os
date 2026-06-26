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
    type: str  # TSP/social_security/life_insurance/IRA/brokerage
    balance: float
    contribution_monthly: float = 0
    employer_match_pct: float = 0
    projected_at_65: float = 0


class InvestmentCreate(BaseModel):
    type: str
    balance: float
    contribution_monthly: float = 0
    employer_match_pct: float = 0
    projected_at_65: float = 0


class CareerProfile(BaseModel):
    career_id: str
    current_title: Optional[str] = None
    current_employer: Optional[str] = None
    resume_master_text: Optional[str] = None
    ats_score: int = 0
    target_roles: List[str] = []
    target_locations: List[str] = []
    min_salary: float = 0
    auto_apply_enabled: bool = False


class CareerProfileUpdate(BaseModel):
    current_title: Optional[str] = None
    current_employer: Optional[str] = None
    resume_master_text: Optional[str] = None
    ats_score: Optional[int] = None
    target_roles: Optional[List[str]] = None
    target_locations: Optional[List[str]] = None
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


class JobApplicationCreate(BaseModel):
    employer: str
    role_title: str
    match_score: int = 0
    status: str = "matched"
    resume_version_used: Optional[str] = None
    cover_letter_used: Optional[str] = None
    applied_date: Optional[str] = None


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
    obj = Investment(**payload.dict())
    doc = obj.dict()
    doc["user_id"] = user_id
    await db.investments.insert_one(doc)
    return obj


@api_router.delete("/investments/{investment_id}")
async def delete_investment(
    investment_id: str, user_id: str = Depends(get_current_user_id)
):
    await db.investments.delete_one({"investment_id": investment_id, "user_id": user_id})
    return {"ok": True}


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

    # simple financial health score
    cashflow = monthly_income - monthly_expenses
    score = 50
    if monthly_income > 0:
        savings_rate = cashflow / monthly_income
        score += int(savings_rate * 50)
    if total_debt > 0 and monthly_income > 0:
        debt_ratio = total_debt / (monthly_income * 12)
        score -= int(min(debt_ratio * 20, 30))
    score = max(0, min(100, score))

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
        "total_debt": total_debt,
        "total_assets": total_assets,
        "total_investments": total_investments,
        "net_worth": net_worth,
        "financial_health_score": score,
        "income_count": len(income),
        "expense_count": len(expenses),
        "debt_count": len(debts),
        "asset_count": len(assets),
        "investment_count": len(investments),
        "recent_ai_decisions": recent_decisions,
    }


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
        {"employer": "Anthropic", "role_title": "Senior Product Engineer", "match_score": 87, "status": "interview", "resume_version_used": "v3-tech", "cover_letter_used": "anthropic-cover", "applied_date": "2026-01-18"},
        {"employer": "Stripe", "role_title": "Staff Engineer, Payments", "match_score": 78, "status": "applied", "resume_version_used": "v3-tech", "cover_letter_used": None, "applied_date": "2026-02-02"},
        {"employer": "Linear", "role_title": "Engineering Manager", "match_score": 72, "status": "matched", "resume_version_used": None, "cover_letter_used": None, "applied_date": None},
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
            "auto_apply_enabled": False,
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
