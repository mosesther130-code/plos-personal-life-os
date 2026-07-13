"""
PLOS — Enhancement 9: Shopping & Deals — AI Product Deal Finder
- CRUD for saved searches
- POST /find  → PLOS AI returns recommended deals across retailers for a product
- POST /searches/{id}/refresh → re-run AI for an existing search
"""
from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from emergentintegrations.llm.chat import LlmChat, UserMessage
from country_context import get_country, country_prompt_block

EMERGENT_LLM_KEY = os.getenv("EMERGENT_LLM_KEY", "")

router = APIRouter(prefix="/api/shopping/deal-finder", tags=["deal-finder"])


# --------------------------- Models -----------------------------------
class DealSearchIn(BaseModel):
    product: str
    max_price_usd: Optional[float] = None
    target_price_usd: Optional[float] = None
    preferred_retailers: Optional[List[str]] = None
    urgency: str = "anytime"  # "today" | "this_week" | "this_month" | "anytime"
    quality_preference: str = "balanced"  # "budget" | "balanced" | "premium"
    notes: Optional[str] = None
    country: Optional[str] = "US"


class DealSearch(DealSearchIn):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    last_results: Optional[List[Dict[str, Any]]] = None
    last_summary: Optional[str] = None
    last_run_at: Optional[str] = None


COMMON_RETAILERS = [
    "Amazon", "Walmart", "Target", "Best Buy", "Costco", "Sam's Club",
    "Home Depot", "Lowe's", "B&H", "Newegg", "Macy's", "Kohl's",
    "Wayfair", "eBay", "REI", "DICK'S Sporting Goods",
]


# --------------------------- Helpers ----------------------------------
def _strip(d: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not d:
        return None
    d.pop("_id", None)
    d.pop("user_id", None)
    return d


async def _run_claude_finder(
    user_id: str, search: Dict[str, Any]
) -> Dict[str, Any]:
    """Calls PLOS AI to produce a list of recommended deals for `search`."""
    country_code = (search.get("country") or "US").upper()
    c_info = get_country(country_code)
    currency = c_info["currency"]
    symbol = c_info["currency_symbol"]

    prompt_data = {
        "product": search["product"],
        f"max_price_{currency.lower()}": search.get("max_price_usd"),
        f"target_price_{currency.lower()}": search.get("target_price_usd"),
        "preferred_retailers": search.get("preferred_retailers") or [],
        "urgency": search.get("urgency", "anytime"),
        "quality_preference": search.get("quality_preference", "balanced"),
        "notes": search.get("notes") or "",
        "country": country_code,
        "country_name": c_info["name"],
        "currency": currency,
    }

    country_block = country_prompt_block(country_code)

    prompt = (
        "You are PLOS AI — an expert deal hunter helping a personal life OS user find the "
        f"best price for a product in {c_info['flag']} {c_info['name']}. Given the search criteria, suggest 4-6 "
        "REALISTIC deal recommendations. Use your knowledge of typical pricing "
        f"(June 2026) across MAJOR RETAILERS AVAILABLE IN {c_info['name'].upper()} "
        f"(examples: {c_info['retailers']}). "
        f"For each deal include: "
        f"retailer, model/variant, est_price_{currency.lower()} (number in {currency}), "
        f"original_price_{currency.lower()} (number in {currency} if applicable), "
        "savings_pct (number), pros (short), cons "
        "(short), and a confidence rating ('high','medium','low').\n\n"
        f"{country_block}\n\n"
        f"SEARCH:\n{json.dumps(prompt_data, indent=2)}\n\n"
        "OUTPUT JSON ONLY (no markdown fences):\n"
        f'{{ "summary": "2-3 sentence verdict and best pick — mention {c_info["name"]} availability", '
        f'"currency": "{currency}", '
        '"deals": [ { "retailer": "...", "model": "...", '
        f'"est_price_{currency.lower()}": 0, "original_price_{currency.lower()}": 0, "savings_pct": 0, '
        '"pros": "...", "cons": "...", "confidence": "high|medium|low", '
        '"buy_url_hint": "shop.brand.com/path-or-search-string" }, ... ] }'
    )

    import ai_router  # local to avoid circular
    routed = await ai_router.route_ai_task(
        task_type="real_time_research",
        payload={
            "system": (
                f"You are PLOS AI — a careful product deal expert focused on {c_info['name']}. "
                "Output ONLY valid JSON. "
                "Never fabricate URLs that include fake tracking; if unsure, return "
                f"a brand-domain hint instead. All prices MUST be in {currency} ({symbol})."
            ),
            "prompt": prompt,
        },
        user_id=user_id,
    )
    text = routed.get("content") or ""
    parsed: Dict[str, Any] = {}
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        try:
            parsed = json.loads(m.group(0))
        except Exception:
            parsed = {}

    deals = parsed.get("deals") or []
    summary = parsed.get("summary") or f"Top picks compiled from recent {c_info['name']} market pricing."
    # Normalize numeric fields — map any currency-suffixed keys back to _usd names for frontend compatibility
    cur_lower = currency.lower()
    for d in deals:
        # Support both "est_price_php" and legacy "est_price_usd"
        for src_k, dst_k in ((f"est_price_{cur_lower}", "est_price_usd"),
                              (f"original_price_{cur_lower}", "original_price_usd")):
            if src_k in d and dst_k not in d:
                d[dst_k] = d.pop(src_k)
        for k in ("est_price_usd", "original_price_usd", "savings_pct"):
            v = d.get(k)
            if isinstance(v, str):
                try:
                    d[k] = float(re.sub(r"[^0-9.]", "", v) or 0)
                except Exception:
                    d[k] = 0
        d.setdefault("confidence", "medium")
    # Sort by est_price ascending
    deals.sort(key=lambda d: (d.get("est_price_usd") or 1e9))
    return {
        "deals": deals,
        "summary": summary,
        "currency": currency,
        "currency_symbol": symbol,
        "country": country_code,
        "country_name": c_info["name"],
    }


# --------------------------- Factory ----------------------------------
def make_router(db, get_current_user_id):

    async def _seed_if_empty(user_id: str):
        cnt = await db.deal_searches.count_documents({"user_id": user_id})
        if cnt == 0:
            seed = DealSearch(
                product="65-inch 4K OLED TV (2025 model)",
                max_price_usd=1800,
                target_price_usd=1400,
                preferred_retailers=["Best Buy", "Costco"],
                urgency="this_month",
                quality_preference="balanced",
                notes="Living room. Bright daytime use.",
            ).model_dump()
            seed["user_id"] = user_id
            try:
                await db.deal_searches.insert_one(seed)
            except Exception:
                pass

    @router.get("/retailers")
    async def list_retailers(_user_id: str = Depends(get_current_user_id)):
        return {"retailers": COMMON_RETAILERS}

    @router.get("/searches")
    async def list_searches(user_id: str = Depends(get_current_user_id)):
        await _seed_if_empty(user_id)
        items: List[Dict[str, Any]] = []
        async for d in db.deal_searches.find({"user_id": user_id}).sort("created_at", -1):
            items.append(_strip(d) or {})
        return {"searches": items}

    @router.post("/searches")
    async def create_search(
        payload: DealSearchIn, user_id: str = Depends(get_current_user_id)
    ):
        if not payload.product or len(payload.product.strip()) < 3:
            raise HTTPException(
                status_code=400, detail="product description must be at least 3 characters"
            )
        m = DealSearch(**payload.model_dump()).model_dump()
        m["user_id"] = user_id
        await db.deal_searches.insert_one(m)
        return {"id": m["id"]}

    @router.put("/searches/{search_id}")
    async def update_search(
        search_id: str,
        payload: DealSearchIn,
        user_id: str = Depends(get_current_user_id),
    ):
        upd = payload.model_dump()
        r = await db.deal_searches.update_one(
            {"user_id": user_id, "id": search_id}, {"$set": upd}
        )
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Search not found")
        return {"ok": True}

    @router.delete("/searches/{search_id}")
    async def delete_search(
        search_id: str, user_id: str = Depends(get_current_user_id)
    ):
        await db.deal_searches.delete_one({"user_id": user_id, "id": search_id})
        return {"ok": True}

    @router.post("/find")
    async def find(
        payload: DealSearchIn, user_id: str = Depends(get_current_user_id)
    ):
        """Ad-hoc deal search (does NOT save). Returns AI recommendations."""
        if not payload.product or len(payload.product.strip()) < 3:
            raise HTTPException(
                status_code=400, detail="product description must be at least 3 characters"
            )
        try:
            result = await _run_claude_finder(user_id, payload.model_dump())
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"AI deal finder is temporarily unavailable: {str(e)[:160]}",
            )
        return {**result, "ran_at": datetime.now(timezone.utc).isoformat()}

    @router.post("/searches/{search_id}/refresh")
    async def refresh_saved(
        search_id: str, user_id: str = Depends(get_current_user_id)
    ):
        existing = await db.deal_searches.find_one(
            {"user_id": user_id, "id": search_id}, {"_id": 0}
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Search not found")
        try:
            result = await _run_claude_finder(user_id, existing)
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"AI deal finder is temporarily unavailable: {str(e)[:160]}",
            )
        now = datetime.now(timezone.utc).isoformat()
        await db.deal_searches.update_one(
            {"user_id": user_id, "id": search_id},
            {"$set": {
                "last_results": result["deals"],
                "last_summary": result["summary"],
                "last_run_at": now,
            }},
        )
        return {**result, "ran_at": now}

    return router
