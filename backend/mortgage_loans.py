"""
PLOS — Mortgage Loan endpoints
Servicer CRUD with 16 pre-populated US servicers, 4 PLOS AI advisory cards
(Refinance / Sell-Hold / Home Equity Loan / Home Equity Investment),
and a daily AI mortgage tip + news + resource.
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/mortgage", tags=["mortgage"])


# --------------------------- Models ---------------------------------------
class MortgageServicer(BaseModel):
    servicer_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category: Optional[str] = None  # "bank" | "non_bank"
    website: Optional[str] = None
    phone: Optional[str] = None
    loan_number: Optional[str] = None  # masked in transit
    current_rate: Optional[float] = None
    notes: Optional[str] = None


class MortgageServicerCreate(BaseModel):
    name: str
    category: Optional[str] = None
    website: Optional[str] = None
    phone: Optional[str] = None
    loan_number: Optional[str] = None
    current_rate: Optional[float] = None
    notes: Optional[str] = None


# --------------------------- Constants ------------------------------------
NON_BANK_SERVICERS = [
    {"name": "Rocket Mortgage", "website": "https://rocketmortgage.com", "phone": "1-800-863-4332"},
    {"name": "PennyMac", "website": "https://pennymacusa.com", "phone": "1-866-549-3583"},
    {"name": "loanDepot", "website": "https://loandepot.com", "phone": "1-888-983-3240"},
    {"name": "NewRez / Shellpoint", "website": "https://newrez.com", "phone": "1-800-365-7107"},
    {"name": "United Wholesale Mortgage (UWM)", "website": "https://uwm.com", "phone": "1-800-981-8898"},
    {"name": "Freedom Mortgage", "website": "https://freedommortgage.com", "phone": "1-855-690-5900"},
    {"name": "Lakeview Loan Servicing", "website": "https://lakeviewloanservicing.com", "phone": "1-855-294-8564"},
    {"name": "PHH Mortgage (Ocwen)", "website": "https://mortgagequestions.com", "phone": "1-800-449-8767"},
    {"name": "Cenlar FSB", "website": "https://cenlar.com", "phone": "1-800-223-6527"},
]
BANK_SERVICERS = [
    {"name": "Wells Fargo", "website": "https://wellsfargo.com/mortgage", "phone": "1-800-357-6675"},
    {"name": "JPMorgan Chase", "website": "https://chase.com/mortgage", "phone": "1-800-848-9136"},
    {"name": "U.S. Bank", "website": "https://usbank.com/mortgage", "phone": "1-800-365-7772"},
    {"name": "Bank of America", "website": "https://bankofamerica.com/mortgage", "phone": "1-800-669-6607"},
    {"name": "Truist Bank", "website": "https://truist.com/mortgage", "phone": "1-888-228-6654"},
    {"name": "PNC Bank", "website": "https://pnc.com/mortgage", "phone": "1-800-822-5626"},
    {"name": "Flagstar Bank (NYCB)", "website": "https://flagstar.com", "phone": "1-800-393-4887"},
]


# --------------------------- Helpers --------------------------------------
def _strip(doc):
    if not doc:
        return None
    doc.pop("_id", None)
    return doc


def _mask(s):
    if not s:
        return s
    if len(s) <= 4:
        return "***" + s[-2:]
    return "*" * (len(s) - 4) + s[-4:]


def _extract_json(text: str):
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def _today_iso():
    return datetime.now(timezone.utc).date().isoformat()


# --------------------------- Factory --------------------------------------
def make_router(db, get_current_user_id, emergent_llm_key: str, llm_chat_cls, user_msg_cls):
    async def call_claude(session_id: str, system: str, prompt: str) -> str:
        chat = llm_chat_cls(
            api_key=emergent_llm_key, session_id=session_id, system_message=system,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        resp = await chat.send_message(user_msg_cls(text=prompt))
        return resp if isinstance(resp, str) else str(resp)

    # ------- Servicer CRUD -------
    @router.get("/servicers")
    async def list_servicers(user_id: str = Depends(get_current_user_id)):
        items = []
        async for d in db.mortgage_servicers.find({"user_id": user_id}).sort("name", 1):
            d = _strip(d)
            d["loan_number_masked"] = _mask(d.get("loan_number"))
            d.pop("loan_number", None)
            items.append(d)
        # Also surface available templates the user can add quickly
        return {"servicers": items, "non_bank_templates": NON_BANK_SERVICERS, "bank_templates": BANK_SERVICERS}

    @router.post("/servicers")
    async def create_servicer(payload: MortgageServicerCreate, user_id: str = Depends(get_current_user_id)):
        from pymongo.errors import DuplicateKeyError
        servicer = MortgageServicer(**payload.model_dump()).model_dump()
        try:
            await db.mortgage_servicers.insert_one({**servicer, "user_id": user_id})
        except DuplicateKeyError:
            raise HTTPException(status_code=409, detail="A servicer with this name already exists")
        return {"servicer_id": servicer["servicer_id"]}

    @router.put("/servicers/{servicer_id}")
    async def update_servicer(
        servicer_id: str, payload: MortgageServicerCreate, user_id: str = Depends(get_current_user_id)
    ):
        upd = payload.model_dump(exclude_none=False)
        r = await db.mortgage_servicers.update_one(
            {"user_id": user_id, "servicer_id": servicer_id}, {"$set": upd}
        )
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Servicer not found")
        return {"ok": True}

    @router.delete("/servicers/{servicer_id}")
    async def delete_servicer(servicer_id: str, user_id: str = Depends(get_current_user_id)):
        await db.mortgage_servicers.delete_one({"user_id": user_id, "servicer_id": servicer_id})
        return {"ok": True}

    # ------- Mortgage Context -------
    async def _get_mortgage_context(user_id: str) -> Dict[str, Any]:
        """Aggregate the user's mortgage data + home equity context for PLOS AI."""
        mortgage = await db.debts.find_one({"user_id": user_id, "debt_type": "mortgage"})
        home = await db.assets.find_one({"user_id": user_id, "asset_type": "real_estate"})
        income = [d async for d in db.income_sources.find({"user_id": user_id, "is_active": True})]
        annual_income = sum(float(i.get("net_monthly") or 0) for i in income) * 12

        ctx = {
            "balance": float(mortgage.get("balance") or 0) if mortgage else 0,
            "rate": float(mortgage.get("apr") or 0) if mortgage else 0,
            "monthly_payment": float(mortgage.get("minimum_payment") or 0) if mortgage else 0,
            "lender": mortgage.get("lender") if mortgage else "—",
            "home_value": float(home.get("current_value") or 0) if home else 0,
            "purchase_value": float(home.get("purchase_value") or 0) if home else 0,
            "annual_income": annual_income,
        }
        ctx["equity"] = max(0.0, ctx["home_value"] - ctx["balance"])
        ctx["ltv"] = (ctx["balance"] / ctx["home_value"]) if ctx["home_value"] else 0
        # rate normalization
        if 0 < ctx["rate"] < 1:
            ctx["rate"] *= 100
        return ctx

    # ------- 4 Advisor Cards -------
    @router.post("/intelligence")
    async def mortgage_intelligence(user_id: str = Depends(get_current_user_id)):
        """Returns all 4 PLOS AI advisor cards in one call. Cached 24h."""
        cache_key = "intelligence::v1"
        cached = await db.mortgage_cache.find_one({"user_id": user_id, "key": cache_key})
        if cached:
            try:
                age = (datetime.now(timezone.utc) - datetime.fromisoformat(cached["generated_at"])).days
                if age < 1:
                    return {**{k: cached.get(k) for k in ["refinance", "sell_hold", "helo", "hei"]},
                            "cached": True, "generated_at": cached["generated_at"]}
            except Exception:
                pass

        ctx = await _get_mortgage_context(user_id)
        if ctx["balance"] <= 0:
            raise HTTPException(status_code=400, detail="No mortgage on file. Add one in Debt Manager.")

        system = (
            "You are a US mortgage advisor (NMLS-licensed style). Output ONLY valid JSON. "
            "Use realistic 2026 market rates (~6.5-7.5% 30yr, ~5.75-6.5% 15yr, ~8-10% HELOC). "
            "Be concrete with numbers."
        )
        prompt = (
            f"User mortgage: balance ${ctx['balance']:,.0f}, rate {ctx['rate']:.2f}%, monthly payment "
            f"${ctx['monthly_payment']:,.0f}, home value ${ctx['home_value']:,.0f}, equity "
            f"${ctx['equity']:,.0f}, LTV {ctx['ltv']*100:.1f}%, annual income ${ctx['annual_income']:,.0f}, "
            f"state Georgia (Atlanta metro).\n\n"
            "Return JSON containing ALL FOUR top-level keys (refinance, sell_hold, helo, hei). "
            "DO NOT OMIT ANY KEY. Each must be present even if recommendation is conservative.\n\n"
            "1. refinance: {recommendation: 'Refinance Now' | 'Wait' | 'Not Recommended', "
            "current_30yr_rate (number %), current_15yr_rate (number %), "
            "monthly_savings (USD), break_even_months (int), total_interest_savings (USD), "
            "reasoning (2-3 sentences)}\n"
            "2. sell_hold: {signal: 'Hold' | 'Consider Selling' | 'Strong Sell', "
            "estimated_equity (USD), market_outlook (string), reasoning (2-3 sentences)}\n"
            "3. helo: {available_equity (USD, at 80% LTV cap), estimated_heloc_rate (number %), "
            "max_heloc_amount (USD), recommendation: 'Recommended' | 'Caution' | 'Avoid', "
            "reasoning (2-3 sentences)}\n"
            "4. hei: {providers (array of 3 strings, e.g. ['Hometap','Point','Unison']), "
            "how_it_works (1-2 sentences), pros (array of 2-3 short strings), "
            "cons (array of 2-3 short strings), "
            "recommendation: 'Worth Exploring' | 'Caution' | 'Not Recommended for Your Situation', "
            "reasoning (2-3 sentences)}.\n\n"
            "Output ONLY the JSON object with all four keys present."
        )
        try:
            text = await call_claude(f"mortgage-int-{user_id}", system, prompt)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"PLOS AI error: {e}")
        parsed = _extract_json(text) or {}
        if not parsed.get("refinance"):
            raise HTTPException(status_code=502, detail="Unable to parse mortgage intelligence")

        generated_at = datetime.now(timezone.utc).isoformat()
        await db.mortgage_cache.update_one(
            {"user_id": user_id, "key": cache_key},
            {"$set": {**parsed, "generated_at": generated_at}},
            upsert=True,
        )
        return {**parsed, "cached": False, "generated_at": generated_at}

    # ------- Daily Mortgage Tip -------
    @router.get("/daily-tip")
    async def daily_tip(user_id: str = Depends(get_current_user_id)):
        today = _today_iso()
        cache_key = f"daily::{today}"
        cached = await db.mortgage_cache.find_one({"user_id": user_id, "key": cache_key})
        if cached:
            return {"tip": cached.get("tip"), "news": cached.get("news"),
                    "resource": cached.get("resource"), "date": today, "cached": True}

        ctx = await _get_mortgage_context(user_id)
        system = "You are a US mortgage & real-estate expert. Output ONLY valid JSON."
        prompt = (
            f"Today is {today}. User mortgage balance ${ctx['balance']:,.0f}, rate {ctx['rate']:.2f}%, "
            f"home equity ${ctx['equity']:,.0f} in Atlanta GA. Return JSON: "
            "{tip: {title, body}, news: {title, body, source}, resource: {title, url, description}}. "
            "tip = one actionable mortgage tip for THIS user (3-4 sentences). "
            "news = one real mortgage/rate market news item from the last 30 days. "
            "resource = one legitimate, currently-active web resource."
        )
        try:
            text = await call_claude(f"mortgage-daily-{user_id}", system, prompt)
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
        await db.mortgage_cache.update_one(
            {"user_id": user_id, "key": cache_key}, {"$set": record}, upsert=True
        )
        return {**record, "date": today, "cached": False}

    return router
