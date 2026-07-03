"""PLOS AI Router — dispatches every AI task to the most appropriate platform.

Public API:
    await route_ai_task(task_type: str, payload: dict, sensitivity_level: str = "low",
                        user_id: Optional[str] = None) -> RouterResponse

Design decisions
----------------
* **Env-only key storage** — no key is ever persisted to Mongo or returned to
  the client.  The AI Router only reads keys from `os.environ`.  Missing keys
  → automatic Claude fallback (spec).
* **24 h response cache** in `ai_router_cache` keyed by
  `sha256(task_type + canonical_json(payload))`.  Financial calculations
  with identical inputs are served from cache instantly.
* **Cost + latency tracking** — every call (including cached hits and
  fallbacks) is appended to `ai_usage_log` with platform / model /
  task_type / tokens_used / est_cost / latency_ms.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Task-type → platform map (per spec)
# ---------------------------------------------------------------------------
TASK_ROUTES: Dict[str, str] = {
    # Claude (Emergent LLM key)
    "financial_advice": "claude",
    "debt_analysis": "claude",
    "legal_guidance": "claude",
    "career_analysis": "claude",
    "resume_writing": "claude",
    "cover_letter": "claude",
    "document_summarization": "claude",
    # OpenAI GPT-4o
    "financial_calculation": "openai",
    "retirement_projection": "openai",
    "mortgage_amortization": "openai",
    "tax_calculation": "openai",
    # Google Gemini Flash
    "translation": "gemini",
    "multilingual_content": "gemini",
    "batch_keyword_analysis": "gemini",
    "batch_job_scoring": "gemini",
    "high_volume_text_processing": "gemini",
    # Perplexity (real-time web knowledge)
    "real_time_research": "perplexity",
    "deal_search": "perplexity",
    "recall_alert_check": "perplexity",
    "legal_current_events": "perplexity",
    "data_broker_scan": "perplexity",
    # Grok / xAI
    "social_intelligence": "grok",
    "twitter_job_signals": "grok",
    "breaking_news_alerts": "grok",
    "real_time_market_trends": "grok",
    # Mistral
    "european_legal": "mistral",
    "philippines_law": "mistral",
    "international_jurisdiction": "mistral",
    # Voice
    "voice_transcription": "whisper",
}

# ---------------------------------------------------------------------------
# Platform metadata for the "AI Platform Connections" screen.
# ---------------------------------------------------------------------------
PLATFORMS: List[Dict[str, str]] = [
    {"key": "claude", "label": "Claude (Emergent LLM key)",
     "env_var": "EMERGENT_LLM_KEY", "model": "claude-sonnet-4-5",
     "provider": "Anthropic", "always_connected": True},
    {"key": "openai", "label": "OpenAI GPT-4o",
     "env_var": "OPENAI_API_KEY", "model": "gpt-4o",
     "provider": "OpenAI"},
    {"key": "gemini", "label": "Google Gemini Flash",
     "env_var": "GEMINI_API_KEY", "model": "gemini-1.5-flash",
     "provider": "Google"},
    {"key": "perplexity", "label": "Perplexity Sonar",
     "env_var": "PERPLEXITY_API_KEY", "model": "llama-3.1-sonar-large-128k-online",
     "provider": "Perplexity"},
    {"key": "grok", "label": "Grok (xAI)",
     "env_var": "GROK_API_KEY", "model": "grok-beta",
     "provider": "xAI"},
    {"key": "mistral", "label": "Mistral Large",
     "env_var": "MISTRAL_API_KEY", "model": "mistral-large-latest",
     "provider": "Mistral"},
    {"key": "whisper", "label": "OpenAI Whisper",
     "env_var": "OPENAI_API_KEY", "model": "whisper-1",
     "provider": "OpenAI"},
    {"key": "elevenlabs", "label": "ElevenLabs Voice",
     "env_var": "ELEVENLABS_API_KEY", "model": "eleven_multilingual_v2",
     "provider": "ElevenLabs"},
]

# ---------------------------------------------------------------------------
# Estimated per-1K-token pricing (USD, June 2026 rates, blended in/out).
# Kept intentionally rough — the usage log stores raw token counts too.
# ---------------------------------------------------------------------------
COST_PER_1K: Dict[str, float] = {
    "claude": 0.006,       # sonnet 4.5 blended
    "openai": 0.007,       # gpt-4o blended
    "gemini": 0.00035,     # flash blended
    "perplexity": 0.001,   # sonar large online
    "grok": 0.005,         # grok-beta estimate
    "mistral": 0.004,      # large-latest blended
    "whisper": 0.006,      # per minute — normalized here
    "elevenlabs": 0.0,     # TTS — priced per char separately
}

# ---------------------------------------------------------------------------
# Mongo helpers (lazily wired by init())
# ---------------------------------------------------------------------------
_db = None  # type: ignore
_default_system_prompt = (
    "You are PLOS AI — the multi-model brain behind a personal life OS. "
    "Be concise, structured, and accurate. Return only the requested output."
)

# Cache injected by init()
_call_claude = None  # type: ignore


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _payload_hash(task_type: str, payload: Dict[str, Any]) -> str:
    try:
        canonical = json.dumps(payload, sort_keys=True, default=str)
    except Exception:
        canonical = str(payload)
    h = hashlib.sha256((task_type + "|" + canonical).encode("utf-8")).hexdigest()
    return h


def platform_status_snapshot() -> List[Dict[str, Any]]:
    """Return connection status for each platform (safe for client)."""
    out: List[Dict[str, Any]] = []
    for p in PLATFORMS:
        env_val = (os.getenv(p["env_var"]) or "").strip()
        connected = bool(env_val) or bool(p.get("always_connected"))
        out.append({
            "key": p["key"],
            "label": p["label"],
            "provider": p["provider"],
            "model": p["model"],
            "env_var": p["env_var"],
            "connected": connected,
            # Never leak the value — just first/last 4 for identification
            "hint": (f"{env_val[:4]}…{env_val[-4:]}" if env_val and len(env_val) > 12 else ""),
            "always_connected": bool(p.get("always_connected")),
        })
    return out


def _key_for(platform: str) -> str:
    for p in PLATFORMS:
        if p["key"] == platform:
            return (os.getenv(p["env_var"]) or "").strip()
    return ""


# ---------------------------------------------------------------------------
# Init — wire Mongo handle and Claude callable (from server.py bootstrap)
# ---------------------------------------------------------------------------
def init(db, call_claude_async):  # noqa: ANN001
    """Bind Mongo + Claude helper. Must be called once at boot."""
    global _db, _call_claude
    _db = db
    _call_claude = call_claude_async


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------
async def _cache_lookup(cache_key: str) -> Optional[Dict[str, Any]]:
    if _db is None:
        return None
    doc = await _db.ai_router_cache.find_one({"_id": cache_key})
    if not doc:
        return None
    exp = doc.get("expires_at")
    if exp:
        try:
            exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp_dt:
                await _db.ai_router_cache.delete_one({"_id": cache_key})
                return None
        except Exception:
            pass
    return doc


async def _cache_store(cache_key: str, response: Dict[str, Any]) -> None:
    if _db is None:
        return
    doc = {
        "_id": cache_key,
        "response": response,
        "created_at": _now_iso(),
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        ),
    }
    try:
        await _db.ai_router_cache.replace_one({"_id": cache_key}, doc, upsert=True)
    except Exception as e:
        logger.warning("cache store failed: %s", e)


# ---------------------------------------------------------------------------
# Usage log
# ---------------------------------------------------------------------------
async def _log_usage(entry: Dict[str, Any]) -> None:
    if _db is None:
        return
    try:
        await _db.ai_usage_log.insert_one(entry)
    except Exception as e:
        logger.warning("usage log failed: %s", e)


def _est_cost(platform: str, tokens: int) -> float:
    return round((tokens / 1000.0) * COST_PER_1K.get(platform, 0.0), 6)


def _extract_prompt(payload: Dict[str, Any]) -> Tuple[str, str]:
    """Return (system, user_prompt) from a payload dict.  Payloads MAY use:
        {"prompt": "..."}
        {"system": "...", "prompt": "..."}
        {"messages": [{"role": "system"|"user"|"assistant", "content": "..."}, ...]}
    """
    system = payload.get("system") or _default_system_prompt
    if "messages" in payload and isinstance(payload["messages"], list):
        sys_msgs = [m.get("content", "") for m in payload["messages"] if m.get("role") == "system"]
        if sys_msgs:
            system = "\n\n".join(sys_msgs)
        user_msgs = [m.get("content", "") for m in payload["messages"] if m.get("role") != "system"]
        return system, "\n\n".join(user_msgs)
    return system, str(payload.get("prompt") or "")


# ---------------------------------------------------------------------------
# Per-platform callers
# ---------------------------------------------------------------------------
async def _call_claude_fallback(system: str, prompt: str, session_id: str) -> Tuple[str, int, str]:
    if _call_claude is None:
        raise RuntimeError("Claude helper not initialised — call ai_router.init() at boot")
    text = await _call_claude(session_id, system, prompt)
    # Approx token count = chars/4
    approx = max(1, (len(system) + len(prompt) + len(text)) // 4)
    return text, approx, "claude-sonnet-4-5"


async def _call_openai(system: str, prompt: str, model: str = "gpt-4o") -> Tuple[str, int, str]:
    key = _key_for("openai")
    if not key:
        raise KeyError("openai")
    async with httpx.AsyncClient(timeout=45.0) as c:
        r = await c.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.5,
            },
        )
        r.raise_for_status()
        data = r.json()
    text = data["choices"][0]["message"]["content"]
    tokens = data.get("usage", {}).get("total_tokens", max(1, (len(prompt) + len(text)) // 4))
    return text, int(tokens), data.get("model", model)


async def _call_gemini(system: str, prompt: str, model: str = "gemini-2.5-flash") -> Tuple[str, int, str]:
    key = _key_for("gemini")
    if not key:
        raise KeyError("gemini")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    async with httpx.AsyncClient(timeout=45.0) as c:
        r = await c.post(url, json={
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        })
        r.raise_for_status()
        data = r.json()
    parts = ((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
    text = "".join(p.get("text", "") for p in parts)
    usage = data.get("usageMetadata") or {}
    tokens = int(usage.get("totalTokenCount")
                 or max(1, (len(prompt) + len(text)) // 4))
    return text, tokens, data.get("modelVersion", model)


async def _call_perplexity(system: str, prompt: str,
                           model: str = "sonar-pro") -> Tuple[str, int, str]:
    key = _key_for("perplexity")
    if not key:
        raise KeyError("perplexity")
    async with httpx.AsyncClient(timeout=60.0) as c:
        r = await c.post(
            "https://api.perplexity.ai/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
            },
        )
        r.raise_for_status()
        data = r.json()
    text = data["choices"][0]["message"]["content"]
    tokens = data.get("usage", {}).get("total_tokens", max(1, (len(prompt) + len(text)) // 4))
    return text, int(tokens), data.get("model", model)


async def _call_grok(system: str, prompt: str, model: str = "grok-4-fast-reasoning") -> Tuple[str, int, str]:
    key = _key_for("grok")
    if not key:
        raise KeyError("grok")
    async with httpx.AsyncClient(timeout=45.0) as c:
        r = await c.post(
            "https://api.x.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
            },
        )
        r.raise_for_status()
        data = r.json()
    text = data["choices"][0]["message"]["content"]
    tokens = data.get("usage", {}).get("total_tokens", max(1, (len(prompt) + len(text)) // 4))
    return text, int(tokens), data.get("model", model)


async def _call_mistral(system: str, prompt: str,
                        model: str = "mistral-large-latest") -> Tuple[str, int, str]:
    key = _key_for("mistral")
    if not key:
        raise KeyError("mistral")
    async with httpx.AsyncClient(timeout=45.0) as c:
        r = await c.post(
            "https://api.mistral.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
            },
        )
        r.raise_for_status()
        data = r.json()
    text = data["choices"][0]["message"]["content"]
    tokens = data.get("usage", {}).get("total_tokens", max(1, (len(prompt) + len(text)) // 4))
    return text, int(tokens), data.get("model", model)


async def _call_whisper(payload: Dict[str, Any]) -> Tuple[str, int, str]:
    """Whisper transcription. Expects payload['audio_b64'] + payload['filename']"""
    key = _key_for("whisper") or _key_for("openai")
    if not key:
        raise KeyError("whisper")
    import base64
    audio_b64 = payload.get("audio_b64", "")
    audio_bytes = base64.b64decode(audio_b64) if audio_b64 else b""
    filename = payload.get("filename", "clip.webm")
    async with httpx.AsyncClient(timeout=90.0) as c:
        r = await c.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {key}"},
            files={"file": (filename, audio_bytes, "application/octet-stream")},
            data={"model": "whisper-1"},
        )
        r.raise_for_status()
        data = r.json()
    text = data.get("text", "")
    tokens = max(1, len(text) // 4)
    return text, tokens, "whisper-1"


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
async def route_ai_task(
    task_type: str,
    payload: Dict[str, Any],
    sensitivity_level: str = "low",
    user_id: Optional[str] = None,
    force_no_cache: bool = False,
) -> Dict[str, Any]:
    """Route a task to the right AI platform and return a normalized response."""
    started = time.time()
    system, prompt = _extract_prompt(payload)

    # ------------ Sensitivity guard ------------
    if sensitivity_level == "high" and task_type == "sensitive_data_processing":
        response = {
            "content": "Sensitive data processing requires local AI — feature available in next build",
            "model_used": "local-llama-placeholder",
            "platform": "local",
            "tokens_used": 0,
            "latency_ms": int((time.time() - started) * 1000),
            "task_type": task_type,
            "cached": False,
        }
        await _log_usage({
            "log_id": f"log_{uuid.uuid4().hex[:12]}",
            "user_id": user_id, "task_type": task_type,
            "platform": "local", "model": "local-llama-placeholder",
            "tokens_used": 0, "est_cost_usd": 0.0,
            "latency_ms": response["latency_ms"], "cached": False,
            "sensitivity_level": sensitivity_level,
            "created_at": _now_iso(),
        })
        return response

    # ------------ Decide platform ------------
    requested_platform = TASK_ROUTES.get(task_type, "claude")
    platform = requested_platform
    fallback_used = False
    if platform != "claude" and not _key_for(platform):
        # Fallback → Claude, log the reason
        await _log_usage({
            "log_id": f"log_{uuid.uuid4().hex[:12]}",
            "user_id": user_id, "task_type": task_type,
            "platform": requested_platform, "model": "n/a",
            "tokens_used": 0, "est_cost_usd": 0.0,
            "latency_ms": 0, "cached": False,
            "fallback_reason": f"No API key for {requested_platform} — used Claude fallback",
            "created_at": _now_iso(),
        })
        platform = "claude"
        fallback_used = True

    # ------------ Cache lookup ------------
    cache_key = _payload_hash(task_type, payload)
    if not force_no_cache:
        cached = await _cache_lookup(cache_key)
        if cached:
            resp = dict(cached["response"])
            resp["cached"] = True
            resp["latency_ms"] = int((time.time() - started) * 1000)
            await _log_usage({
                "log_id": f"log_{uuid.uuid4().hex[:12]}",
                "user_id": user_id, "task_type": task_type,
                "platform": resp["platform"], "model": resp["model_used"],
                "tokens_used": 0, "est_cost_usd": 0.0,
                "latency_ms": resp["latency_ms"], "cached": True,
                "created_at": _now_iso(),
            })
            return resp

    # ------------ Dispatch ------------
    session_id = f"router-{user_id or 'anon'}-{uuid.uuid4().hex[:6]}"
    text = ""
    tokens = 0
    model_used = ""
    try:
        if platform == "claude":
            text, tokens, model_used = await _call_claude_fallback(system, prompt, session_id)
        elif platform == "openai":
            text, tokens, model_used = await _call_openai(system, prompt)
        elif platform == "gemini":
            text, tokens, model_used = await _call_gemini(system, prompt)
        elif platform == "perplexity":
            text, tokens, model_used = await _call_perplexity(system, prompt)
        elif platform == "grok":
            text, tokens, model_used = await _call_grok(system, prompt)
        elif platform == "mistral":
            text, tokens, model_used = await _call_mistral(system, prompt)
        elif platform == "whisper":
            text, tokens, model_used = await _call_whisper(payload)
        else:
            text, tokens, model_used = await _call_claude_fallback(system, prompt, session_id)
            platform = "claude"
    except KeyError:
        # Rare: chosen platform lost its key mid-flight → Claude
        text, tokens, model_used = await _call_claude_fallback(system, prompt, session_id)
        platform = "claude"
        fallback_used = True

    latency = int((time.time() - started) * 1000)
    response = {
        "content": text,
        "model_used": model_used,
        "platform": platform,
        "tokens_used": tokens,
        "latency_ms": latency,
        "task_type": task_type,
        "cached": False,
    }
    await _cache_store(cache_key, response)
    await _log_usage({
        "log_id": f"log_{uuid.uuid4().hex[:12]}",
        "user_id": user_id, "task_type": task_type,
        "platform": platform, "model": model_used,
        "tokens_used": tokens,
        "est_cost_usd": _est_cost(platform, tokens),
        "latency_ms": latency, "cached": False,
        "fallback_used": fallback_used,
        "requested_platform": requested_platform,
        "created_at": _now_iso(),
    })
    return response


# ---------------------------------------------------------------------------
# Dashboard helpers (mounted by ai_router_endpoints.py)
# ---------------------------------------------------------------------------
async def usage_dashboard(user_id: Optional[str] = None,
                          days: int = 30) -> Dict[str, Any]:
    if _db is None:
        return {"summary": {}, "by_platform": [], "by_task_type": [], "recent": []}
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    match: Dict[str, Any] = {"created_at": {"$gte": since}}
    if user_id:
        match["user_id"] = user_id

    total_calls = await _db.ai_usage_log.count_documents(match)
    total_cost = 0.0
    total_tokens = 0

    by_platform_agg: Dict[str, Dict[str, Any]] = {}
    by_task_agg: Dict[str, Dict[str, Any]] = {}
    cache_hits = 0
    fallback_hits = 0
    latencies: List[int] = []

    async for doc in _db.ai_usage_log.find(match, {"_id": 0}):
        plat = doc.get("platform", "?")
        tt = doc.get("task_type", "?")
        tokens = int(doc.get("tokens_used") or 0)
        cost = float(doc.get("est_cost_usd") or 0.0)
        lat = int(doc.get("latency_ms") or 0)
        total_cost += cost
        total_tokens += tokens
        if doc.get("cached"):
            cache_hits += 1
        if doc.get("fallback_used"):
            fallback_hits += 1
        latencies.append(lat)

        p = by_platform_agg.setdefault(plat, {
            "platform": plat, "calls": 0, "tokens": 0,
            "cost_usd": 0.0, "avg_latency_ms": 0, "_lat_sum": 0,
        })
        p["calls"] += 1
        p["tokens"] += tokens
        p["cost_usd"] += cost
        p["_lat_sum"] += lat

        t = by_task_agg.setdefault(tt, {"task_type": tt, "calls": 0})
        t["calls"] += 1

    by_platform = []
    for p in by_platform_agg.values():
        p["avg_latency_ms"] = int(p["_lat_sum"] / max(1, p["calls"]))
        p["cost_usd"] = round(p["cost_usd"], 6)
        p.pop("_lat_sum", None)
        by_platform.append(p)
    by_platform.sort(key=lambda x: -x["calls"])
    by_task = sorted(by_task_agg.values(), key=lambda x: -x["calls"])

    recent = []
    async for doc in _db.ai_usage_log.find(match, {"_id": 0}).sort("created_at", -1).limit(25):
        recent.append(doc)

    return {
        "summary": {
            "total_calls": total_calls,
            "total_cost_usd": round(total_cost, 6),
            "total_tokens": total_tokens,
            "cache_hits": cache_hits,
            "fallback_hits": fallback_hits,
            "avg_latency_ms": int(sum(latencies) / max(1, len(latencies))),
            "since": since, "days": days,
        },
        "by_platform": by_platform,
        "by_task_type": by_task,
        "recent": recent,
        "platforms": platform_status_snapshot(),
    }


# ---------------------------------------------------------------------------
# Env-only key management with runtime hot-reload + rotation
# ---------------------------------------------------------------------------
ENV_PATH = "/app/backend/.env"


def _write_env_var(env_var: str, value: str) -> None:
    """Rewrite .env in place: replace existing line or append."""
    if not os.path.exists(ENV_PATH):
        with open(ENV_PATH, "w") as f:
            f.write(f"{env_var}={value}\n")
        return
    lines: List[str] = []
    replaced = False
    with open(ENV_PATH, "r") as f:
        for line in f:
            if line.strip().startswith(f"{env_var}="):
                lines.append(f"{env_var}={value}\n")
                replaced = True
            else:
                lines.append(line)
    if not replaced:
        lines.append(f"{env_var}={value}\n")
    with open(ENV_PATH, "w") as f:
        f.writelines(lines)


def set_platform_key(platform_key: str, api_key: str) -> Dict[str, Any]:
    """Persist a new API key to .env and hot-reload into runtime env."""
    plat = next((p for p in PLATFORMS if p["key"] == platform_key), None)
    if not plat:
        raise ValueError(f"Unknown platform: {platform_key}")
    if plat.get("always_connected"):
        raise ValueError("Emergent LLM key is managed by the platform host — no rotation from this UI.")
    env_var = plat["env_var"]
    _write_env_var(env_var, api_key.strip())
    os.environ[env_var] = api_key.strip()  # hot reload
    return {
        "key": platform_key,
        "env_var": env_var,
        "connected": True,
        "rotated_at": _now_iso(),
    }


def rotate_platform_key(platform_key: str, new_api_key: str) -> Dict[str, Any]:
    """Immediately invalidate the old key and swap in the new one."""
    # Zero out first so an in-flight request sees the old value gone
    plat = next((p for p in PLATFORMS if p["key"] == platform_key), None)
    if plat and not plat.get("always_connected"):
        os.environ.pop(plat["env_var"], None)
    return set_platform_key(platform_key, new_api_key)


def clear_platform_key(platform_key: str) -> Dict[str, Any]:
    plat = next((p for p in PLATFORMS if p["key"] == platform_key), None)
    if not plat:
        raise ValueError(f"Unknown platform: {platform_key}")
    if plat.get("always_connected"):
        raise ValueError("Emergent LLM key cannot be cleared.")
    env_var = plat["env_var"]
    _write_env_var(env_var, "")
    os.environ.pop(env_var, None)
    return {"key": platform_key, "connected": False, "cleared_at": _now_iso()}
