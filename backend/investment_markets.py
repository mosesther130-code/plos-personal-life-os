"""
PLOS — Investment Markets (Enhancement 5)
Editable market list with readiness status per market.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/investment-markets", tags=["investment-markets"])


# --------------------------- Models ---------------------------------------
class InvestmentMarket(BaseModel):
    market_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: str  # Stock | Stock Index | Bond | Cryptocurrency | Real Estate | Commodity | Cash Equivalent | Retirement | Other
    risk_level: str  # None | Very Low | Low | Moderate | High | Very High
    minimum_investment: float = 0
    notes: Optional[str] = None


class InvestmentMarketCreate(BaseModel):
    name: str
    type: str
    risk_level: str
    minimum_investment: float = 0
    notes: Optional[str] = None


# --------------------------- Defaults --------------------------------------
DEFAULT_MARKETS = [
    {"name": "S&P 500 Index ETFs (VTI, FXAIX)", "type": "Stock Index", "risk_level": "Moderate", "minimum_investment": 1, "notes": "Diversified US stock exposure via low-cost index funds"},
    {"name": "US Treasury I-Bonds", "type": "Bond", "risk_level": "Very Low", "minimum_investment": 25, "notes": "Inflation-protected government bonds"},
    {"name": "High Yield Savings Account (HYSA)", "type": "Cash Equivalent", "risk_level": "None", "minimum_investment": 1, "notes": "FDIC-insured high-yield cash"},
    {"name": "TSP C Fund (S&P 500)", "type": "Retirement", "risk_level": "Moderate", "minimum_investment": 1, "notes": "Federal employee retirement, mirrors S&P 500"},
    {"name": "TSP G Fund (Government Securities)", "type": "Retirement", "risk_level": "Very Low", "minimum_investment": 1, "notes": "Federal retirement bond fund, government-backed"},
    {"name": "Real Estate Investment Trusts (REITs)", "type": "Real Estate", "risk_level": "Moderate", "minimum_investment": 10, "notes": "Liquid real estate exposure"},
    {"name": "Bitcoin (BTC)", "type": "Cryptocurrency", "risk_level": "Very High", "minimum_investment": 1, "notes": "Largest cryptocurrency by market cap"},
    {"name": "Ethereum (ETH)", "type": "Cryptocurrency", "risk_level": "Very High", "minimum_investment": 1, "notes": "Smart contract platform cryptocurrency"},
    {"name": "Corporate Bond ETFs (BND, AGG)", "type": "Bond", "risk_level": "Low", "minimum_investment": 1, "notes": "Diversified investment-grade bonds"},
]


def _strip(d):
    if not d:
        return None
    d.pop("_id", None)
    return d


# --------------------------- Readiness Status Map --------------------------
# Maps (type, risk_level) → required readiness gate
def _required_gate(market_type: str, risk_level: str) -> str:
    """Returns: 'cash' | 'stock' | 'crypto'"""
    if market_type in {"Cash Equivalent"} or risk_level in {"None", "Very Low"}:
        return "cash"
    if market_type == "Cryptocurrency" or risk_level == "Very High":
        return "crypto"
    return "stock"


def _readiness_for(snap: Dict[str, Any], risk: int, gate: str) -> tuple[str, List[str]]:
    """Returns (status, prerequisites). status: 'Ready to Invest' | 'Not Yet Ready' | 'Do Not Recommend'"""
    prereqs = []
    if gate == "cash":
        # always ready (with $1 minimum)
        if snap["monthly_surplus"] <= 0 and snap["credit_card_debt"] > 5000:
            prereqs.append("Pay down high credit card debt before parking new cash")
            return ("Not Yet Ready", prereqs)
        return ("Ready to Invest", prereqs)

    if gate == "stock":
        ok = (snap["emergency_months"] >= 3 and snap["credit_card_debt"] < 2000
              and snap["monthly_surplus"] > 0)
        if ok:
            return ("Ready to Invest", [])
        if snap["emergency_months"] < 3:
            prereqs.append(f"Build emergency fund to 3 months (currently {snap['emergency_months']:.1f})")
        if snap["credit_card_debt"] >= 2000:
            prereqs.append(f"Pay credit card debt below $2K (currently ${snap['credit_card_debt']:,.0f})")
        if snap["monthly_surplus"] <= 0:
            prereqs.append("Achieve positive monthly cashflow")
        return ("Not Yet Ready", prereqs)

    # crypto
    stock_ok = (snap["emergency_months"] >= 3 and snap["credit_card_debt"] < 2000
                and snap["monthly_surplus"] > 0)
    crypto_ok = (stock_ok and snap["emergency_months"] >= 6
                 and snap["monthly_surplus"] >= 1000
                 and snap["high_apr_debt"] < 1000 and risk >= 7)
    if crypto_ok:
        return ("Ready to Invest", [])
    if not stock_ok:
        return ("Do Not Recommend", ["Stock-market basics not yet met; address prerequisites first"])
    if snap["emergency_months"] < 6:
        prereqs.append(f"Emergency fund to 6 months (currently {snap['emergency_months']:.1f})")
    if snap["monthly_surplus"] < 1000:
        prereqs.append(f"Monthly surplus ≥ $1,000 (currently ${snap['monthly_surplus']:,.0f})")
    if snap["high_apr_debt"] >= 1000:
        prereqs.append(f"Reduce high-APR debt below $1K (currently ${snap['high_apr_debt']:,.0f})")
    if risk < 7:
        prereqs.append(f"Risk tolerance ≥ 7/10 (currently {risk})")
    return ("Not Yet Ready", prereqs)


# --------------------------- Factory --------------------------------------
def make_router(db, get_current_user_id, gather_user_context, finance_snapshot):
    @router.get("/list")
    async def list_markets(user_id: str = Depends(get_current_user_id)):
        # Auto-seed if empty
        cnt = await db.investment_markets.count_documents({"user_id": user_id})
        if cnt == 0:
            for m in DEFAULT_MARKETS:
                doc = InvestmentMarket(**m).model_dump()
                try:
                    await db.investment_markets.insert_one({**doc, "user_id": user_id})
                except Exception:
                    pass

        # Get snapshot for status calculation
        ctx = await gather_user_context(user_id)
        snap = finance_snapshot(ctx)
        profile = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0}) or {}
        risk = int(profile.get("risk_tolerance", 5))

        items = []
        async for d in db.investment_markets.find({"user_id": user_id}).sort("name", 1):
            d = _strip(d)
            gate = _required_gate(d.get("type", ""), d.get("risk_level", ""))
            status, prereqs = _readiness_for(snap, risk, gate)
            d["status"] = status
            d["prerequisites"] = prereqs
            d["gate"] = gate
            items.append(d)
        return {"markets": items, "snapshot": snap, "risk_tolerance": risk}

    @router.post("/")
    async def create_market(payload: InvestmentMarketCreate, user_id: str = Depends(get_current_user_id)):
        from pymongo.errors import DuplicateKeyError
        m = InvestmentMarket(**payload.model_dump()).model_dump()
        try:
            await db.investment_markets.insert_one({**m, "user_id": user_id})
        except DuplicateKeyError:
            raise HTTPException(status_code=409, detail="A market with this name already exists")
        return {"market_id": m["market_id"]}

    @router.put("/{market_id}")
    async def update_market(
        market_id: str, payload: InvestmentMarketCreate, user_id: str = Depends(get_current_user_id)
    ):
        upd = payload.model_dump()
        r = await db.investment_markets.update_one(
            {"user_id": user_id, "market_id": market_id}, {"$set": upd}
        )
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Market not found")
        return {"ok": True}

    @router.delete("/{market_id}")
    async def delete_market(market_id: str, user_id: str = Depends(get_current_user_id)):
        await db.investment_markets.delete_one({"user_id": user_id, "market_id": market_id})
        return {"ok": True}

    return router
