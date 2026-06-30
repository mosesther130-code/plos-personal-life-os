"""PLOS Push Notification module — Emergent-managed FCM relay.

Implements the Emergent push notification playbook:
- POST /api/register-push: relays device token to Emergent push service
- send_push() helper: triggers notifications to one or many user_ids
- Six PLOS categories: financial_alerts, security_alerts, job_matches,
  weather_alerts, deal_alerts, reminders

The frontend calls only /api/register-push and /api/push/test, never talks
to Emergent directly. EMERGENT_PUSH_KEY is a placeholder during development;
the deployer replaces it at build time. DO NOT edit EMERGENT_PUSH_KEY in .env.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

load_dotenv()

logger = logging.getLogger(__name__)

PUSH_BASE_URL = "https://integrations.emergentagent.com"

# Six PLOS push categories with display label + trigger description.
PUSH_CATEGORIES: Dict[str, Dict[str, str]] = {
    "financial_alerts": {
        "label": "Financial Alerts",
        "trigger": "upcoming bills, rate changes, budget thresholds",
    },
    "security_alerts": {
        "label": "Security Alerts",
        "trigger": "new broker listings, breaches, hard credit inquiries",
    },
    "job_matches": {
        "label": "Job Matches",
        "trigger": "new job posting matches your auto-search criteria",
    },
    "weather_alerts": {
        "label": "Weather Alerts",
        "trigger": "severe weather active for your GPS location",
    },
    "deal_alerts": {
        "label": "Deal Alerts",
        "trigger": "new deal matching your saved search or rate alert",
    },
    "reminders": {
        "label": "Reminders",
        "trigger": "medication refill, passport expiry, deferment end, appointments",
    },
}

# Single shared async client, created lazily.
_client: Optional[httpx.AsyncClient] = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=PUSH_BASE_URL,
            headers={"X-Push-Key": os.environ.get("EMERGENT_PUSH_KEY", "placeholder")},
            timeout=10.0,
        )
    return _client


# ---------- Models ---------------------------------------------------------
class RegisterPushBody(BaseModel):
    user_id: str = ""
    platform: str  # "ios" | "android" | "web"
    device_token: str


class TestPushBody(BaseModel):
    category: str = Field(default="reminders")
    title: str = Field(default="PLOS test notification")
    message: str = Field(default="This is a test notification from PLOS.")
    action_url: Optional[str] = None


# ---------- Core helpers (no auth, called internally) ---------------------
async def _register_push_internal(body: RegisterPushBody) -> Dict[str, Any]:
    try:
        client = _get_client()
        resp = await client.post(
            "/api/v1/push/users/register", json=body.model_dump()
        )
    except httpx.RequestError as exc:
        logger.warning("Push register network error: %s", exc)
        return {"status": "skipped", "reason": "network_error"}
    if resp.status_code == 401:
        # Key not yet replaced by deployer — expected during dev.
        logger.info("Push register: EMERGENT_PUSH_KEY is placeholder (dev mode)")
        return {"status": "deferred", "reason": "key_placeholder"}
    if resp.status_code >= 500:
        logger.warning("Push register upstream error: %s", resp.status_code)
        return {"status": "deferred", "reason": "upstream_unavailable"}
    if resp.status_code >= 400:
        logger.warning(
            "Push register bad request: %s %s", resp.status_code, resp.text[:200]
        )
        raise HTTPException(status_code=400, detail="register failed")
    return {"status": "registered"}


async def send_push(
    recipients: List[str],
    title: str,
    message: str,
    *,
    category: str = "reminders",
    extra: Optional[Dict[str, Any]] = None,
    idempotency_key: Optional[str] = None,
) -> Dict[str, Any]:
    """Send a push notification to one or more PLOS user IDs.

    Always wrap calls to this function in try/except — push delivery must
    never block the primary operation. Returns a status dict.
    """
    if not recipients:
        return {"status": "skipped", "reason": "no_recipients"}
    if len(recipients) > 100:
        raise ValueError("max 100 recipients per send_push call")
    if category not in PUSH_CATEGORIES:
        raise ValueError(f"unknown category: {category}")

    data: Dict[str, Any] = {"title": title, "message": message, "category": category}
    if extra:
        for k in ("subtext", "image_url", "action_url", "deeplink"):
            if k in extra and extra[k] is not None:
                data[k] = extra[k]
    payload: Dict[str, Any] = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key

    try:
        client = _get_client()
        resp = await client.post("/api/v1/push/trigger", json=payload)
    except httpx.RequestError as exc:
        logger.warning("send_push network error: %s", exc)
        return {"status": "deferred", "reason": "network_error"}

    if resp.status_code == 401:
        logger.info("send_push deferred: EMERGENT_PUSH_KEY is placeholder")
        return {"status": "deferred", "reason": "key_placeholder", "category": category}
    if resp.status_code >= 500:
        logger.warning("send_push upstream %s", resp.status_code)
        return {"status": "deferred", "reason": "upstream_unavailable"}
    if resp.status_code >= 400:
        logger.warning(
            "send_push bad request: %s %s", resp.status_code, resp.text[:200]
        )
        return {"status": "failed", "reason": "bad_request"}
    return {"status": "sent", "category": category, "recipients": len(recipients)}


# Category-specific convenience wrappers --------------------------------------
async def push_financial(user_id: str, title: str, message: str, **extra) -> Dict:
    return await send_push([user_id], title, message, category="financial_alerts", extra=extra)


async def push_security(user_id: str, title: str, message: str, **extra) -> Dict:
    return await send_push([user_id], title, message, category="security_alerts", extra=extra)


async def push_job(user_id: str, title: str, message: str, **extra) -> Dict:
    return await send_push([user_id], title, message, category="job_matches", extra=extra)


async def push_weather(user_id: str, title: str, message: str, **extra) -> Dict:
    return await send_push([user_id], title, message, category="weather_alerts", extra=extra)


async def push_deal(user_id: str, title: str, message: str, **extra) -> Dict:
    return await send_push([user_id], title, message, category="deal_alerts", extra=extra)


async def push_reminder(user_id: str, title: str, message: str, **extra) -> Dict:
    return await send_push([user_id], title, message, category="reminders", extra=extra)


# ---------- Router factory -------------------------------------------------
def make_router(get_current_user_id):
    """Factory that returns the push router with user-auth dependency wired up."""
    r = APIRouter(prefix="/api", tags=["push"])

    @r.post("/register-push", status_code=201)
    async def register_push_route(
        body: RegisterPushBody,
        user_id: str = Depends(get_current_user_id),
    ):
        # Ensure the device token is tied to the authenticated user only.
        body.user_id = user_id
        return await _register_push_internal(body)

    @r.get("/push/categories")
    async def list_categories_route():
        return {
            "categories": [
                {"key": k, "label": v["label"], "trigger": v["trigger"]}
                for k, v in PUSH_CATEGORIES.items()
            ]
        }

    @r.post("/push/test")
    async def trigger_test_push_route(
        body: TestPushBody,
        user_id: str = Depends(get_current_user_id),
    ):
        if body.category not in PUSH_CATEGORIES:
            raise HTTPException(status_code=400, detail="unknown category")
        extra: Dict[str, Any] = {}
        if body.action_url:
            extra["action_url"] = body.action_url
        return await send_push(
            recipients=[user_id],
            title=body.title,
            message=body.message,
            category=body.category,
            extra=extra,
        )

    return r
