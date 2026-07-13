"""PLOS — AI response cache manager.

Stores AI/LLM responses in the response_cache collection with a TTL index
on expires_at (auto-deletes expired docs). Every AI call throughout PLOS
should go through get_cached(key) → set_cached(key, response, ttl_hours)
to avoid re-generating identical results.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# TTL policy (hours) by task_type
TTL_HOURS: Dict[str, float] = {
    "daily_financial_advice": 20,
    "financial_health_score": 6,
    "debt_payoff_plan": 24,
    "retirement_projection": 24,
    "mortgage_analysis": 24,
    "job_match_score": 72,
    "resume_tailoring": 168,          # 7 days
    "translation": 720,                # 30 days
    "currency_rates": 1,
    "weather_data": 0.5,
    "legal_guidance": 48,
    "business_ideas": 168,
    "career_insights_dashboard": 24,
    "real_time_research": 0.5,         # scans
    "default": 12,
}


def compute_cache_key(task_type: str, payload: Any) -> str:
    material = json.dumps({"task_type": task_type, "payload": payload},
                          sort_keys=True, default=str)
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


async def ensure_indexes(db):
    try:
        await db.response_cache.create_index("cache_key", unique=True)
        await db.response_cache.create_index("expires_at", expireAfterSeconds=0)
        await db.response_cache.create_index("task_type")
    except Exception as e:
        logger.warning("Cache index create failed (may already exist): %s", e)


async def get_cached(db, cache_key: str) -> Optional[Dict[str, Any]]:
    doc = await db.response_cache.find_one({"cache_key": cache_key})
    if not doc:
        return None
    # Bump hit stats
    try:
        await db.response_cache.update_one(
            {"cache_key": cache_key},
            {"$inc": {"hit_count": 1},
             "$set": {"last_hit": datetime.now(timezone.utc)}},
        )
    except Exception:
        pass
    return {
        "content": doc.get("response_content"),
        "platform": doc.get("platform"),
        "model": doc.get("model_used"),
        "cached": True,
        "generated_at": doc.get("generated_at"),
        "tokens_saved": doc.get("tokens_est", 0),
    }


async def set_cached(db, cache_key: str, task_type: str, response: Dict[str, Any],
                     ttl_hours: Optional[float] = None) -> None:
    ttl = ttl_hours if ttl_hours is not None else TTL_HOURS.get(task_type, TTL_HOURS["default"])
    now = datetime.now(timezone.utc)
    doc = {
        "cache_key": cache_key,
        "task_type": task_type,
        "response_content": response.get("content"),
        "platform": response.get("platform"),
        "model_used": response.get("model_used") or response.get("model"),
        "generated_at": now,
        "expires_at": now + timedelta(hours=ttl),
        "ttl_hours": ttl,
        "tokens_est": response.get("tokens_used", 0),
        "hit_count": 0,
        "last_hit": None,
    }
    try:
        await db.response_cache.update_one(
            {"cache_key": cache_key}, {"$set": doc}, upsert=True,
        )
    except Exception as e:
        logger.warning("Cache set failed: %s", e)


async def stats(db) -> Dict[str, Any]:
    total = await db.response_cache.count_documents({})
    pipeline = [
        {"$group": {"_id": None,
                    "hits": {"$sum": "$hit_count"},
                    "tokens_saved": {"$sum": {"$multiply": ["$hit_count", "$tokens_est"]}}}},
    ]
    agg = await db.response_cache.aggregate(pipeline).to_list(1)
    hits = agg[0]["hits"] if agg else 0
    tokens_saved = agg[0]["tokens_saved"] if agg else 0
    # Rough cost estimate: $3/M input tokens (PLOS AI Sonnet blended)
    cost_saved_usd = round(tokens_saved * 3.0 / 1_000_000, 4)
    # By task type
    by_type_agg = await db.response_cache.aggregate([
        {"$group": {"_id": "$task_type", "cached_items": {"$sum": 1},
                    "hits": {"$sum": "$hit_count"}}},
        {"$sort": {"hits": -1}},
    ]).to_list(30)
    return {
        "total_cached_items": total,
        "total_cache_hits": hits,
        "est_tokens_saved": tokens_saved,
        "est_cost_saved_usd": cost_saved_usd,
        "by_task_type": [{"task_type": r["_id"] or "unknown",
                          "cached_items": r["cached_items"],
                          "hits": r["hits"]} for r in by_type_agg],
    }
