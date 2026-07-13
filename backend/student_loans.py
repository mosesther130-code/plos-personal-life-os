"""
PLOS — Student Loan endpoints
Handles loan servicers (CRUD), deferment toggles, repayment plan comparisons,
loan forgiveness opportunities, and daily AI debt-relief tips.
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/student-loans", tags=["student-loans"])


# --------------------------- Models ---------------------------------------
class LoanServicer(BaseModel):
    servicer_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    website: Optional[str] = None
    phone: Optional[str] = None
    account_number: Optional[str] = None  # stored encrypted at rest is the goal; here masked
    notes: Optional[str] = None


class LoanServicerCreate(BaseModel):
    name: str
    website: Optional[str] = None
    phone: Optional[str] = None
    account_number: Optional[str] = None
    notes: Optional[str] = None


class DefermentUpdate(BaseModel):
    deferment_active: bool
    deferment_end_date: Optional[str] = None  # YYYY-MM-DD


# --------------------------- Constants ------------------------------------
FEDERAL_SERVICERS = [
    {"name": "Aidvantage (Maximus Education)", "website": "https://aidvantage.com", "phone": "1-800-722-1300"},
    {"name": "MOHELA", "website": "https://mohela.com", "phone": "1-888-866-4352"},
    {"name": "EdFinancial", "website": "https://edfinancial.com", "phone": "1-855-337-6884"},
    {"name": "Nelnet", "website": "https://nelnet.com", "phone": "1-888-486-4722"},
]


# --------------------------- Helpers --------------------------------------
def _mask(s: Optional[str]) -> Optional[str]:
    if not s:
        return s
    if len(s) <= 4:
        return "***" + s[-2:]
    return "*" * (len(s) - 4) + s[-4:]


def _strip(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return None
    doc.pop("_id", None)
    return doc


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _extract_json(text: str) -> Any:
    m = re.search(r"\{.*\}", text, re.DOTALL) or re.search(r"\[.*\]", text, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


# --------------------------- Servicer CRUD --------------------------------
def make_router(db, get_current_user_id, emergent_llm_key: str, llm_chat_cls, user_msg_cls):
    """
    Factory used by server.py to inject dependencies and return the configured router.
    """

    async def call_claude(session_id: str, system: str, prompt: str) -> str:
        chat = llm_chat_cls(
            api_key=emergent_llm_key,
            session_id=session_id,
            system_message=system,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        resp = await chat.send_message(user_msg_cls(text=prompt))
        return resp if isinstance(resp, str) else str(resp)

    @router.get("/servicers")
    async def list_servicers(user_id: str = Depends(get_current_user_id)):
        items = []
        async for d in db.loan_servicers.find({"user_id": user_id}).sort("name", 1):
            d = _strip(d)
            # mask account number in transit
            d["account_number_masked"] = _mask(d.get("account_number"))
            d.pop("account_number", None)
            items.append(d)
        return {"servicers": items}

    @router.post("/servicers")
    async def create_servicer(payload: LoanServicerCreate, user_id: str = Depends(get_current_user_id)):
        from pymongo.errors import DuplicateKeyError
        servicer = LoanServicer(**payload.model_dump()).model_dump()
        try:
            await db.loan_servicers.insert_one({**servicer, "user_id": user_id})
        except DuplicateKeyError:
            raise HTTPException(status_code=409, detail="A servicer with this name already exists")
        return {"servicer_id": servicer["servicer_id"]}

    @router.put("/servicers/{servicer_id}")
    async def update_servicer(
        servicer_id: str, payload: LoanServicerCreate, user_id: str = Depends(get_current_user_id)
    ):
        upd = payload.model_dump(exclude_none=False)
        r = await db.loan_servicers.update_one(
            {"user_id": user_id, "servicer_id": servicer_id}, {"$set": upd}
        )
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Servicer not found")
        return {"ok": True}

    @router.delete("/servicers/{servicer_id}")
    async def delete_servicer(servicer_id: str, user_id: str = Depends(get_current_user_id)):
        await db.loan_servicers.delete_one({"user_id": user_id, "servicer_id": servicer_id})
        return {"ok": True}

    @router.post("/servicers/seed-federal")
    async def seed_federal_servicers(user_id: str = Depends(get_current_user_id)):
        """Idempotent: only seeds servicers that the user doesn't already have by name."""
        added = 0
        existing_names = set()
        async for d in db.loan_servicers.find({"user_id": user_id}, {"name": 1}):
            existing_names.add(d.get("name"))
        for s in FEDERAL_SERVICERS:
            if s["name"] in existing_names:
                continue
            servicer = LoanServicer(**s).model_dump()
            await db.loan_servicers.insert_one({**servicer, "user_id": user_id})
            added += 1
        return {"added": added}

    # --------------------------- Deferment per-debt extras ----------------
    @router.get("/extras/{debt_id}")
    async def get_extras(debt_id: str, user_id: str = Depends(get_current_user_id)):
        doc = _strip(await db.debt_extras.find_one({"user_id": user_id, "debt_id": debt_id})) or {}
        return {
            "debt_id": debt_id,
            "deferment_active": bool(doc.get("deferment_active", False)),
            "deferment_end_date": doc.get("deferment_end_date"),
        }

    @router.put("/extras/{debt_id}")
    async def update_extras(
        debt_id: str, payload: DefermentUpdate, user_id: str = Depends(get_current_user_id)
    ):
        # Confirm the debt exists & belongs to user
        debt = await db.debts.find_one({"user_id": user_id, "debt_id": debt_id})
        if not debt:
            raise HTTPException(status_code=404, detail="Debt not found")
        await db.debt_extras.update_one(
            {"user_id": user_id, "debt_id": debt_id},
            {"$set": {
                "deferment_active": payload.deferment_active,
                "deferment_end_date": payload.deferment_end_date,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
        return {"ok": True}

    # --------------------------- Repayment Plans (PLOS AI) -----------------
    @router.post("/repayment-plans")
    async def repayment_plans(body: Dict[str, Any], user_id: str = Depends(get_current_user_id)):
        debt_id = body.get("debt_id")
        if not debt_id:
            raise HTTPException(status_code=400, detail="debt_id required")
        debt = await db.debts.find_one({"user_id": user_id, "debt_id": debt_id})
        if not debt or debt.get("debt_type") != "student_loan":
            raise HTTPException(status_code=404, detail="Student loan not found")

        # cache check (refresh every 7 days)
        cache_key = f"repayment::{debt_id}"
        cached = await db.student_loan_cache.find_one({"user_id": user_id, "key": cache_key})
        if cached:
            try:
                age = (datetime.now(timezone.utc) - datetime.fromisoformat(cached["generated_at"])).days
                if age < 7:
                    return {"plans": cached["plans"], "cached": True, "generated_at": cached["generated_at"]}
            except Exception:
                pass

        # pull income & household for IDR plans
        income_docs = [d async for d in db.income_sources.find({"user_id": user_id, "is_active": True})]
        annual_income = sum(float(i.get("net_monthly") or 0) for i in income_docs) * 12
        career = await db.career_profile.find_one({"user_id": user_id}) or {}
        household_size = int(career.get("household_size") or 1)

        balance = float(debt.get("balance") or 0)
        apr = float(debt.get("apr") or 6.0)
        if apr > 1:
            apr = apr  # already percent
        else:
            apr = apr * 100

        system = (
            "You are a US federal student loan repayment specialist. Output ONLY valid JSON. "
            "Be precise with numbers — use realistic federal loan formulas (Standard 10-yr fixed amortization, "
            "IBR/PAYE 10-15% of discretionary income, SAVE 5-10%, ICR 20%, forgiveness after 20-25 yr)."
        )
        prompt = (
            f"User loan: balance ${balance:,.0f}, APR {apr:.2f}%, annual income ${annual_income:,.0f}, "
            f"household size {household_size}, state Georgia.\n\n"
            "Return JSON with key 'plans' as array of 6 objects, one per plan in order: "
            "Standard 10-Year, Graduated, IBR, PAYE, SAVE, ICR. "
            "Each object: {name, monthly_payment (number USD), term_years (number), "
            "total_paid (number USD), total_interest (number USD), forgiveness_amount (number USD, 0 if none), "
            "best_for (1 short sentence)}."
        )
        try:
            text = await call_claude(f"sl-repay-{user_id}-{debt_id}", system, prompt)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"PLOS AI error: {e}")
        parsed = _extract_json(text) or {}
        plans = parsed.get("plans") if isinstance(parsed, dict) else parsed
        if not plans:
            raise HTTPException(status_code=502, detail="Unable to parse plans from PLOS AI")

        generated_at = datetime.now(timezone.utc).isoformat()
        await db.student_loan_cache.update_one(
            {"user_id": user_id, "key": cache_key},
            {"$set": {"plans": plans, "generated_at": generated_at}},
            upsert=True,
        )
        return {"plans": plans, "cached": False, "generated_at": generated_at}

    # --------------------------- Forgiveness Opportunities (PLOS AI) -------
    @router.post("/forgiveness")
    async def forgiveness(body: Dict[str, Any], user_id: str = Depends(get_current_user_id)):
        debt_id = body.get("debt_id")
        if not debt_id:
            raise HTTPException(status_code=400, detail="debt_id required")
        debt = await db.debts.find_one({"user_id": user_id, "debt_id": debt_id})
        if not debt:
            raise HTTPException(status_code=404, detail="Debt not found")

        cache_key = f"forgiveness::{debt_id}"
        cached = await db.student_loan_cache.find_one({"user_id": user_id, "key": cache_key})
        if cached:
            try:
                age = (datetime.now(timezone.utc) - datetime.fromisoformat(cached["generated_at"])).days
                if age < 1:
                    return {"programs": cached["programs"], "cached": True, "generated_at": cached["generated_at"]}
            except Exception:
                pass

        career = await db.career_profile.find_one({"user_id": user_id}) or {}
        employer = career.get("current_employer") or "Georgia State University"
        title = career.get("current_role") or "Federal/Public Service Employee"

        system = (
            "You are a US student loan forgiveness specialist. Output ONLY valid JSON. "
            "Focus on real, active federal programs as of 2026."
        )
        prompt = (
            f"User profile: employer '{employer}' (a public university, 501(c)(3) qualifying), "
            f"role '{title}', state Georgia, student loan balance ${float(debt.get('balance') or 0):,.0f}.\n\n"
            "Return JSON with key 'programs' as array of objects covering at minimum: "
            "Public Service Loan Forgiveness (PSLF), Teacher Loan Forgiveness, "
            "IDR Forgiveness (20-25 yr), Georgia state programs, and any new federal programs "
            "announced in the last 30 days. Each object: "
            "{name, eligibility ('Likely Eligible'|'Potentially Eligible'|'Not Eligible'), "
            "estimated_amount (number USD or null), why (1-2 sentences), "
            "next_steps (array of 2-4 short action strings), apply_url (string)}."
        )
        try:
            text = await call_claude(f"sl-forgive-{user_id}-{debt_id}", system, prompt)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"PLOS AI error: {e}")
        parsed = _extract_json(text) or {}
        programs = parsed.get("programs") if isinstance(parsed, dict) else parsed
        if not programs:
            raise HTTPException(status_code=502, detail="Unable to parse forgiveness programs")

        generated_at = datetime.now(timezone.utc).isoformat()
        await db.student_loan_cache.update_one(
            {"user_id": user_id, "key": cache_key},
            {"$set": {"programs": programs, "generated_at": generated_at}},
            upsert=True,
        )
        return {"programs": programs, "cached": False, "generated_at": generated_at}

    # --------------------------- Daily AI Debt Relief Tip -----------------
    @router.get("/daily-tip")
    async def daily_tip(user_id: str = Depends(get_current_user_id)):
        today = _today_iso()
        cache_key = f"daily::{today}"
        cached = await db.student_loan_cache.find_one({"user_id": user_id, "key": cache_key})
        if cached:
            return {"tip": cached.get("tip"), "news": cached.get("news"),
                    "resource": cached.get("resource"), "date": today, "cached": True}

        # Aggregate student loans for context
        loans = [d async for d in db.debts.find({"user_id": user_id, "debt_type": "student_loan"})]
        total_balance = sum(float(d.get("balance") or 0) for d in loans)
        career = await db.career_profile.find_one({"user_id": user_id}) or {}
        employer = career.get("current_employer") or "Georgia State University"

        system = (
            "You are a US student-loan policy & debt-relief expert. Output ONLY valid JSON."
        )
        prompt = (
            f"Today is {today}. User has ${total_balance:,.0f} in federal student loans, "
            f"employer '{employer}' (501(c)(3)). Return JSON: "
            "{tip: {title, body}, news: {title, body, source}, resource: {title, url, description}}. "
            "tip = one actionable, specific debt-relief tip for THIS user (3-4 sentences). "
            "news = one real policy / market news item from the last 30 days. "
            "resource = one legitimate, currently-active web resource."
        )
        try:
            text = await call_claude(f"sl-daily-{user_id}", system, prompt)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"PLOS AI error: {e}")
        parsed = _extract_json(text) or {}
        if not parsed:
            raise HTTPException(status_code=502, detail="Unable to parse daily tip")

        record = {
            "tip": parsed.get("tip"),
            "news": parsed.get("news"),
            "resource": parsed.get("resource"),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.student_loan_cache.update_one(
            {"user_id": user_id, "key": cache_key},
            {"$set": record},
            upsert=True,
        )
        return {**record, "date": today, "cached": False}

    # --------------------------- Bulk extras for the screen ---------------
    @router.get("/list")
    async def list_loans_with_extras(user_id: str = Depends(get_current_user_id)):
        """
        Returns the user's student loans with deferment status merged in.
        Useful for the Student Loans screen.
        """
        loans = [_strip(d) for d in [d async for d in db.debts.find(
            {"user_id": user_id, "debt_type": "student_loan"}
        )]]
        extras = {}
        async for e in db.debt_extras.find({"user_id": user_id}):
            extras[e["debt_id"]] = e
        merged = []
        total_active_min = 0.0
        total_deferred_min = 0.0
        for loan in loans:
            ex = extras.get(loan["debt_id"]) or {}
            loan["deferment_active"] = bool(ex.get("deferment_active", False))
            loan["deferment_end_date"] = ex.get("deferment_end_date")
            mp = float(loan.get("minimum_payment") or 0)
            if loan["deferment_active"]:
                total_deferred_min += mp
            else:
                total_active_min += mp
            merged.append(loan)
        return {
            "loans": merged,
            "totals": {
                "balance": sum(float(loan.get("balance") or 0) for loan in merged),
                "active_minimum_payment": total_active_min,
                "deferred_minimum_payment": total_deferred_min,
                "active_count": sum(1 for loan in merged if not loan["deferment_active"]),
                "deferred_count": sum(1 for loan in merged if loan["deferment_active"]),
            },
        }

    return router
