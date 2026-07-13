"""
PLOS — Enhancement 8: Global Tools — World Clock + Time Zone Converter
- CRUD for the user's world clocks (city + IANA timezone)
- Time Zone Converter: convert any time across many zones
- Best Meeting Time: Claude-powered AI scheduler given participant timezones
"""
from __future__ import annotations

import json
import re
import uuid
import os
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

try:
    from zoneinfo import ZoneInfo
except ImportError:  # py<3.9 fallback
    from backports.zoneinfo import ZoneInfo  # type: ignore

from emergentintegrations.llm.chat import LlmChat, UserMessage

EMERGENT_LLM_KEY = os.getenv("EMERGENT_LLM_KEY", "")

router = APIRouter(prefix="/api/world-clock", tags=["world-clock"])


# --------------------------- Curated timezone directory ----------------
TZ_DIRECTORY: List[Dict[str, str]] = [
    {"label": "Los Angeles", "tz": "America/Los_Angeles", "country": "USA"},
    {"label": "Denver", "tz": "America/Denver", "country": "USA"},
    {"label": "Chicago", "tz": "America/Chicago", "country": "USA"},
    {"label": "New York", "tz": "America/New_York", "country": "USA"},
    {"label": "Atlanta", "tz": "America/New_York", "country": "USA"},
    {"label": "Mexico City", "tz": "America/Mexico_City", "country": "Mexico"},
    {"label": "São Paulo", "tz": "America/Sao_Paulo", "country": "Brazil"},
    {"label": "Buenos Aires", "tz": "America/Argentina/Buenos_Aires", "country": "Argentina"},
    {"label": "London", "tz": "Europe/London", "country": "UK"},
    {"label": "Berlin", "tz": "Europe/Berlin", "country": "Germany"},
    {"label": "Paris", "tz": "Europe/Paris", "country": "France"},
    {"label": "Madrid", "tz": "Europe/Madrid", "country": "Spain"},
    {"label": "Rome", "tz": "Europe/Rome", "country": "Italy"},
    {"label": "Athens", "tz": "Europe/Athens", "country": "Greece"},
    {"label": "Istanbul", "tz": "Europe/Istanbul", "country": "Turkey"},
    {"label": "Cairo", "tz": "Africa/Cairo", "country": "Egypt"},
    {"label": "Lagos", "tz": "Africa/Lagos", "country": "Nigeria"},
    {"label": "Johannesburg", "tz": "Africa/Johannesburg", "country": "South Africa"},
    {"label": "Dubai", "tz": "Asia/Dubai", "country": "UAE"},
    {"label": "Mumbai", "tz": "Asia/Kolkata", "country": "India"},
    {"label": "Bangkok", "tz": "Asia/Bangkok", "country": "Thailand"},
    {"label": "Singapore", "tz": "Asia/Singapore", "country": "Singapore"},
    {"label": "Hong Kong", "tz": "Asia/Hong_Kong", "country": "Hong Kong"},
    {"label": "Beijing", "tz": "Asia/Shanghai", "country": "China"},
    {"label": "Manila", "tz": "Asia/Manila", "country": "Philippines"},
    {"label": "Tokyo", "tz": "Asia/Tokyo", "country": "Japan"},
    {"label": "Seoul", "tz": "Asia/Seoul", "country": "South Korea"},
    {"label": "Sydney", "tz": "Australia/Sydney", "country": "Australia"},
    {"label": "Auckland", "tz": "Pacific/Auckland", "country": "New Zealand"},
    {"label": "Honolulu", "tz": "Pacific/Honolulu", "country": "USA"},
]


# --------------------------- Models -----------------------------------
class WorldClockIn(BaseModel):
    label: str
    tz: str
    is_home: bool = False
    notes: Optional[str] = None


class WorldClock(WorldClockIn):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class ConvertIn(BaseModel):
    source_tz: str
    source_datetime: str  # ISO 8601 "YYYY-MM-DDTHH:MM"
    targets: List[str]  # list of IANA tz strings


class MeetingTimeIn(BaseModel):
    participants: List[Dict[str, str]]  # [{label, tz}]
    duration_minutes: int = 60
    earliest_local_hour: int = 8
    latest_local_hour: int = 19
    preferred_date: Optional[str] = None  # YYYY-MM-DD (default: tomorrow UTC)
    constraints: Optional[str] = None


def _strip(d: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not d:
        return None
    d.pop("_id", None)
    d.pop("user_id", None)
    return d


def _validate_tz(tz: str) -> bool:
    try:
        ZoneInfo(tz)
        return True
    except Exception:
        return False


# --------------------------- Best meeting helpers ---------------------
def _candidate_slots(
    participants: List[Dict[str, str]],
    duration_minutes: int,
    earliest_h: int,
    latest_h: int,
    base_date: datetime,
) -> List[Dict[str, Any]]:
    """For each UTC hour of the day, compute each participant's local hour and
    label the slot as 'green' (in-hours for all), 'yellow' (in-hours for some),
    or 'red' (out-of-hours for all)."""
    slots = []
    for h in range(0, 24):
        utc_dt = base_date.replace(hour=h, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
        per_participant = []
        in_hours_count = 0
        for p in participants:
            tz_str = p.get("tz")
            if not tz_str or not _validate_tz(tz_str):
                continue
            local = utc_dt.astimezone(ZoneInfo(tz_str))
            local_end = (utc_dt + timedelta(minutes=duration_minutes)).astimezone(
                ZoneInfo(tz_str)
            )
            in_hours = earliest_h <= local.hour < latest_h
            if in_hours:
                in_hours_count += 1
            per_participant.append({
                "label": p.get("label") or tz_str,
                "tz": tz_str,
                "local_time": local.strftime("%a %H:%M"),
                "local_end": local_end.strftime("%H:%M"),
                "in_hours": in_hours,
            })
        if not per_participant:
            continue
        all_in = in_hours_count == len(per_participant)
        color = "green" if all_in else ("yellow" if in_hours_count > 0 else "red")
        slots.append({
            "utc_hour": h,
            "utc_time": utc_dt.strftime("%Y-%m-%dT%H:%MZ"),
            "score": in_hours_count,
            "color": color,
            "participants": per_participant,
        })
    # Keep only green and best yellow
    slots.sort(key=lambda s: (-s["score"], abs(12 - s["utc_hour"])))
    return slots


# --------------------------- Factory ----------------------------------
def make_router(db, get_current_user_id):

    async def _seed_if_empty(user_id: str):
        cnt = await db.world_clocks.count_documents({"user_id": user_id})
        if cnt == 0:
            seeds = [
                {"label": "Atlanta", "tz": "America/New_York", "is_home": True, "notes": "Home"},
                {"label": "Manila", "tz": "Asia/Manila", "is_home": False, "notes": "Family"},
                {"label": "London", "tz": "Europe/London", "is_home": False, "notes": ""},
            ]
            for s in seeds:
                m = WorldClock(**s).model_dump()
                m["user_id"] = user_id
                try:
                    await db.world_clocks.insert_one(m)
                except Exception:
                    pass

    # -------- Directory --------
    @router.get("/directory")
    async def directory(_user_id: str = Depends(get_current_user_id)):
        return {"timezones": TZ_DIRECTORY}

    # -------- Clocks CRUD --------
    @router.get("/clocks")
    async def list_clocks(user_id: str = Depends(get_current_user_id)):
        await _seed_if_empty(user_id)
        items: List[Dict[str, Any]] = []
        async for c in db.world_clocks.find({"user_id": user_id}).sort("is_home", -1):
            stripped = _strip(c) or {}
            # Compute current local time
            if _validate_tz(stripped.get("tz", "")):
                now_local = datetime.now(ZoneInfo(stripped["tz"]))
                stripped["local_time"] = now_local.strftime("%H:%M")
                stripped["local_date"] = now_local.strftime("%a, %b %-d")
                stripped["utc_offset_hours"] = (
                    now_local.utcoffset().total_seconds() / 3600.0
                    if now_local.utcoffset()
                    else 0
                )
            items.append(stripped)
        return {"clocks": items, "now_utc": datetime.now(timezone.utc).isoformat()}

    @router.post("/clocks")
    async def create_clock(
        payload: WorldClockIn, user_id: str = Depends(get_current_user_id)
    ):
        if not _validate_tz(payload.tz):
            raise HTTPException(status_code=400, detail=f"Unknown IANA timezone: {payload.tz}")
        m = WorldClock(**payload.model_dump()).model_dump()
        m["user_id"] = user_id
        # Ensure only one is_home
        if m["is_home"]:
            await db.world_clocks.update_many(
                {"user_id": user_id}, {"$set": {"is_home": False}}
            )
        await db.world_clocks.insert_one(m)
        return {"id": m["id"]}

    @router.put("/clocks/{clock_id}")
    async def update_clock(
        clock_id: str,
        payload: WorldClockIn,
        user_id: str = Depends(get_current_user_id),
    ):
        if not _validate_tz(payload.tz):
            raise HTTPException(status_code=400, detail=f"Unknown IANA timezone: {payload.tz}")
        upd = payload.model_dump()
        if upd.get("is_home"):
            await db.world_clocks.update_many(
                {"user_id": user_id}, {"$set": {"is_home": False}}
            )
        r = await db.world_clocks.update_one(
            {"user_id": user_id, "id": clock_id}, {"$set": upd}
        )
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Clock not found")
        return {"ok": True}

    @router.delete("/clocks/{clock_id}")
    async def delete_clock(
        clock_id: str, user_id: str = Depends(get_current_user_id)
    ):
        await db.world_clocks.delete_one({"user_id": user_id, "id": clock_id})
        return {"ok": True}

    # -------- Converter --------
    @router.post("/convert")
    async def convert(payload: ConvertIn, _user_id: str = Depends(get_current_user_id)):
        if not _validate_tz(payload.source_tz):
            raise HTTPException(status_code=400, detail=f"Invalid source_tz: {payload.source_tz}")
        try:
            naive = datetime.fromisoformat(payload.source_datetime.replace("Z", ""))
        except Exception:
            raise HTTPException(status_code=400, detail="source_datetime must be ISO 8601")
        src_dt = naive.replace(tzinfo=ZoneInfo(payload.source_tz))
        results: List[Dict[str, Any]] = []
        for t in payload.targets:
            if not _validate_tz(t):
                results.append({"tz": t, "error": "invalid timezone"})
                continue
            local = src_dt.astimezone(ZoneInfo(t))
            results.append({
                "tz": t,
                "label": next(
                    (e["label"] for e in TZ_DIRECTORY if e["tz"] == t), t
                ),
                "local_datetime": local.isoformat(),
                "local_time": local.strftime("%H:%M"),
                "local_date": local.strftime("%a, %b %-d"),
                "utc_offset_hours": (
                    local.utcoffset().total_seconds() / 3600.0
                    if local.utcoffset()
                    else 0
                ),
            })
        return {
            "source": {
                "tz": payload.source_tz,
                "datetime": src_dt.isoformat(),
                "utc": src_dt.astimezone(timezone.utc).isoformat(),
            },
            "results": results,
        }

    # -------- Best Meeting Time (AI) --------
    @router.post("/best-meeting-time")
    async def best_meeting_time(
        payload: MeetingTimeIn, user_id: str = Depends(get_current_user_id)
    ):
        # Validate
        for p in payload.participants:
            if not p.get("tz") or not _validate_tz(p["tz"]):
                raise HTTPException(
                    status_code=400, detail=f"Invalid timezone in participants: {p}"
                )
        if not payload.participants:
            raise HTTPException(status_code=400, detail="At least one participant required")

        # Resolve base date
        try:
            base_date = (
                datetime.fromisoformat(payload.preferred_date)
                if payload.preferred_date
                else datetime.now(timezone.utc) + timedelta(days=1)
            )
        except Exception:
            base_date = datetime.now(timezone.utc) + timedelta(days=1)

        slots = _candidate_slots(
            payload.participants,
            payload.duration_minutes,
            payload.earliest_local_hour,
            payload.latest_local_hour,
            base_date,
        )
        top_slots = [s for s in slots if s["color"] in ("green", "yellow")][:6]
        if not top_slots:
            top_slots = slots[:6]

        # Build PLOS AI prompt
        prompt_data = {
            "duration_minutes": payload.duration_minutes,
            "earliest_local_hour": payload.earliest_local_hour,
            "latest_local_hour": payload.latest_local_hour,
            "participants": [
                {"label": p.get("label"), "tz": p["tz"]} for p in payload.participants
            ],
            "candidate_slots": top_slots,
            "user_constraints": payload.constraints or "none",
            "base_date_utc": base_date.strftime("%Y-%m-%d"),
        }

        prompt = (
            "You are a meeting scheduler. Given several candidate meeting slots "
            "(each with each participant's local time and whether it falls within "
            "their preferred working hours), pick the SINGLE BEST slot and explain "
            "your reasoning in 2-3 sentences. Prefer 'green' (all participants in "
            "hours) slots; if none exist, pick the most balanced 'yellow' slot.\n\n"
            f"INPUT:\n{json.dumps(prompt_data, indent=2)}\n\n"
            'OUTPUT JSON ONLY: {"chosen_utc_time": "YYYY-MM-DDTHH:MMZ", '
            '"reasoning": "...", "tradeoffs": "..." }'
        )

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"world-clock-{user_id}",
            system_message=(
                "You are an expert meeting scheduler. Output only valid JSON, no prose."
            ),
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")

        ai_raw = await chat.send_message(UserMessage(text=prompt))
        ai_text = ai_raw if isinstance(ai_raw, str) else str(ai_raw)
        ai_parsed: Dict[str, Any] = {}
        m = re.search(r"\{.*\}", ai_text, re.DOTALL)
        if m:
            try:
                ai_parsed = json.loads(m.group(0))
            except Exception:
                ai_parsed = {}

        chosen_iso = ai_parsed.get("chosen_utc_time")
        chosen_slot = None
        if chosen_iso:
            chosen_slot = next(
                (s for s in top_slots if s["utc_time"].startswith(chosen_iso[:16])),
                None,
            )
        if chosen_slot is None and top_slots:
            chosen_slot = top_slots[0]

        return {
            "chosen_slot": chosen_slot,
            "candidates": top_slots,
            "reasoning": ai_parsed.get(
                "reasoning", "Best balance of working hours across participants."
            ),
            "tradeoffs": ai_parsed.get("tradeoffs", ""),
            "base_date_utc": base_date.strftime("%Y-%m-%d"),
        }

    return router
