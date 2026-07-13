"""
PLOS — Personality Assessment Service.

Endpoints (mounted at /api/personality):
  GET  /frameworks                 — metadata for all 6 assessments
  GET  /questions/{assessment}     — question bank for one assessment
  GET  /status                     — user's completion status across all 6
  POST /session/start              — start or resume a session
  POST /session/save               — auto-save partial responses (idempotent)
  POST /session/submit             — score + AI interpretation + persist
  GET  /results/{assessment}       — latest completed result (raw + AI JSON)
  GET  /dna                        — synthesised DNA profile across all completed
  POST /dna/refresh                — regenerate DNA synthesis with PLOS AI
"""
from __future__ import annotations

import json
import os
import re
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from emergentintegrations.llm.chat import LlmChat, UserMessage

from personality_frameworks import FRAMEWORKS, SCORERS, ENNEAGRAM_TYPE_INFO
from personality_questions import ALL_BANKS

EMERGENT_LLM_KEY = os.getenv("EMERGENT_LLM_KEY", "")
log = logging.getLogger("personality")


# ----------------------------- Models ---------------------------------------
class SessionStartBody(BaseModel):
    assessment_type: str


class SessionSaveBody(BaseModel):
    session_id: str
    assessment_type: str
    responses: Dict[str, Any]


class SessionSubmitBody(BaseModel):
    session_id: str
    assessment_type: str
    responses: Dict[str, Any]
    time_taken_seconds: Optional[int] = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ------------------------- PLOS AI helpers ----------------------------------
async def _plos_ai_json(system: str, prompt: str, session_id: str) -> Dict[str, Any]:
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    r = await chat.send_message(UserMessage(text=prompt))
    text = r if isinstance(r, str) else str(r)
    # Strip fences
    text = re.sub(r"```(?:json)?", "", text).strip()
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return {"headline_summary": "Assessment complete.", "detailed_narrative": text[:1200]}
    try:
        return json.loads(m.group(0))
    except Exception as e:
        log.warning(f"[personality] JSON parse fail: {e} — returning raw text")
        return {"headline_summary": "Assessment complete.", "detailed_narrative": text[:1200]}


def _framework_context(assessment_type: str, scored: Dict[str, Any]) -> str:
    """Human-readable scored summary used inside the LLM prompt."""
    if assessment_type == "big_five":
        parts = [f"{d}: {v['level']} (percentile {v['percentile']}, raw {v['raw']})" for d, v in scored["dimensions"].items()]
        return "Big Five results — " + " · ".join(parts) + f" · Profile code: {scored['profile_code']}"
    if assessment_type == "mbti":
        s = scored["splits"]
        parts = [
            f"E {s['EI']['E']}% / I {s['EI']['I']}%",
            f"S {s['SN']['S']}% / N {s['SN']['N']}%",
            f"T {s['TF']['T']}% / F {s['TF']['F']}%",
            f"J {s['JP']['J']}% / P {s['JP']['P']}%",
        ]
        return f"MBTI type: {scored['type_code']} — " + " · ".join(parts)
    if assessment_type == "enneagram":
        return f"Enneagram primary: Type {scored['primary_type']} ({scored['primary_name']}), wing {scored['wing_code']}, center {scored['center']}. Stress→{scored['stress_direction']}, Growth→{scored['growth_direction']}."
    if assessment_type == "via_strengths":
        top = ", ".join(s["strength"] for s in scored["signature_strengths"])
        return f"VIA top-5 signature strengths: {top}"
    if assessment_type == "eq":
        parts = [f"{d}: {v['score']}" for d, v in scored["dimensions"].items()]
        return f"EQ overall {scored['overall']} ({scored['level']}) — " + " · ".join(parts)
    if assessment_type == "disc":
        return f"DISC primary: {scored['primary']}, secondary: {scored['secondary']} (profile {scored['profile_code']})"
    return str(scored)


async def _interpret_assessment(user_id: str, assessment_type: str, scored: Dict[str, Any], user_profile: Dict[str, Any]) -> Dict[str, Any]:
    fw = FRAMEWORKS[assessment_type]
    ctx = _framework_context(assessment_type, scored)
    system = (
        f"You are PLOS AI — an expert psychologist certified in {fw['name']}. "
        f"You have complete context about the user's professional background, career goals, and life situation "
        f"through their PLOS profile. Generate a specific, insightful, practical interpretation. "
        f"Return ONLY valid JSON (no markdown fences). Keep each string field concise but rich."
    )
    prompt = f"""Interpret this personality assessment for a specific PLOS user.

USER PROFILE:
- Name: {user_profile.get('name') or 'PLOS user'}
- Professional background: {user_profile.get('professional_background') or 'university department coordinator, former USAID finance leader, international-development focus'}
- Career goals: {user_profile.get('career_goals') or 'targeting ADB, NATO, State Department, World Bank senior roles'}
- Current life context: {user_profile.get('life_context') or 'Eden Heights development in Bulacan, academic work at GSU, active job search'}

ASSESSMENT: {fw['name']} ({fw['science']})
RESULTS: {ctx}

Return this exact JSON schema:
{{
  "headline_summary": "one powerful sentence capturing the essence",
  "detailed_narrative": "4-5 paragraph personalised narrative (350-500 words) that speaks TO this specific person",
  "career_insights": ["insight 1 tied to ADB/international-development goals", "insight 2 on leadership style", "insight 3 on academic-admin alignment"],
  "financial_behavior_insights": ["spending pattern", "saving tendency", "investment risk tolerance implication"],
  "relationship_insights": ["communication style with colleagues", "team dynamics", "conflict-resolution approach"],
  "growth_opportunities": ["development area 1 with action step", "development area 2 with action step", "development area 3 with action step"],
  "strengths_to_leverage": ["strength 1 to apply now", "strength 2 to apply now", "strength 3 to apply now"],
  "daily_life_applications": ["specific tactic 1 for today", "specific tactic 2 for today", "specific tactic 3 for today"],
  "compatible_personality_types": ["type/label 1", "type/label 2", "type/label 3"],
  "famous_people_similar": ["name 1", "name 2", "name 3", "name 4"],
  "one_word_essence": "single word"
}}"""
    return await _plos_ai_json(system, prompt, f"personality-{assessment_type}-{user_id}")


async def _synthesise_dna(user_id: str, completed: List[Dict[str, Any]], user_profile: Dict[str, Any]) -> Dict[str, Any]:
    lines = []
    for a in completed:
        lines.append(f"- {FRAMEWORKS[a['assessment_type']]['name']}: {_framework_context(a['assessment_type'], a['scored'])}")
    system = (
        "You are PLOS AI — a senior psychologist synthesising multiple personality assessments into "
        "one integrated 'Personality DNA' summary. Return ONLY valid JSON."
    )
    prompt = f"""Synthesise the following assessment results into an integrated Personality DNA profile.

USER: {user_profile.get('name') or 'PLOS user'} — {user_profile.get('professional_background') or 'international-development leader'}
GOALS: {user_profile.get('career_goals') or 'ADB / NATO / World Bank senior roles'}

COMPLETED ASSESSMENTS:
{chr(10).join(lines)}

Return this exact JSON:
{{
  "headline_summary": "one-sentence identity summary (e.g. 'A visionary achiever with rare global perspective and strategic empathy')",
  "one_word_essence": "single word",
  "core_identity": "1-2 sentence description of what stays consistent across frameworks",
  "superpower": "the combination of traits that makes this person uniquely effective (1-2 sentences)",
  "blind_spot": "the consistent pattern that may limit them (1-2 sentences)",
  "ideal_environment": "the work and life conditions where they thrive (1-2 sentences)",
  "growth_edge": "the one development area that would unlock the most potential (1-2 sentences)",
  "career_insights": ["insight 1", "insight 2", "insight 3"],
  "financial_insights": ["insight 1", "insight 2", "insight 3"],
  "relationship_insights": ["insight 1", "insight 2", "insight 3"],
  "famous_similar": ["name 1", "name 2", "name 3"],
  "radar_dimensions": {{
    "Openness": 0-100,
    "Conscientiousness": 0-100,
    "Extraversion": 0-100,
    "Agreeableness": 0-100,
    "Emotional Stability": 0-100,
    "Leadership": 0-100,
    "Creativity": 0-100,
    "Analytical": 0-100,
    "Empathy": 0-100,
    "Resilience": 0-100
  }}
}}
For the radar_dimensions, estimate each 0-100 score from the assessment data provided.
"""
    return await _plos_ai_json(system, prompt, f"personality-dna-{user_id}")


# --------------------------------------------------------------------
# Router factory
# --------------------------------------------------------------------
def make_personality_router(db, get_current_user_id, get_user_profile=None):
    router = APIRouter(prefix="/api/personality", tags=["personality"])

    async def _user_profile(user_id: str) -> Dict[str, Any]:
        # Best-effort: read the user's saved profile from mongodb
        try:
            u = await db.users.find_one({"user_id": user_id}, {"_id": 0}) or {}
        except Exception:
            u = {}
        return {
            "name": u.get("name") or u.get("full_name") or "PLOS user",
            "professional_background": u.get("professional_background") or u.get("bio"),
            "career_goals": u.get("career_goals"),
            "life_context": u.get("life_context"),
        }

    @router.get("/frameworks")
    async def frameworks():
        return {"frameworks": [FRAMEWORKS[k] for k in FRAMEWORKS.keys()]}

    @router.get("/questions/{assessment_type}")
    async def get_questions(assessment_type: str, _user_id: str = Depends(get_current_user_id)):
        if assessment_type not in ALL_BANKS:
            raise HTTPException(404, "Unknown assessment")
        return {
            "assessment_type": assessment_type,
            "framework": FRAMEWORKS[assessment_type],
            "questions": ALL_BANKS[assessment_type],
            "total": len(ALL_BANKS[assessment_type]),
        }

    @router.get("/status")
    async def status(user_id: str = Depends(get_current_user_id)):
        completed = [d async for d in db.personality_assessments.find({"user_id": user_id, "status": "completed"}, {"_id": 0}).sort("completed_at", -1)]
        in_progress = [d async for d in db.personality_sessions.find({"user_id": user_id, "status": "in_progress"}, {"_id": 0})]
        by_type = {a["assessment_type"]: a for a in completed}
        progress = {a["assessment_type"]: a for a in in_progress}
        return {
            "completed": completed,
            "in_progress": in_progress,
            "summary": {
                k: {
                    "assessment_type": k,
                    "status": ("completed" if k in by_type else ("in_progress" if k in progress else "not_started")),
                    "last_completed_at": by_type.get(k, {}).get("completed_at"),
                    "progress_pct": _progress_pct(k, progress.get(k, {}).get("responses") or {}),
                }
                for k in FRAMEWORKS.keys()
            },
        }

    @router.post("/session/start")
    async def session_start(body: SessionStartBody, user_id: str = Depends(get_current_user_id)):
        if body.assessment_type not in ALL_BANKS:
            raise HTTPException(404, "Unknown assessment")
        # Resume existing in-progress session if any
        existing = await db.personality_sessions.find_one({"user_id": user_id, "assessment_type": body.assessment_type, "status": "in_progress"}, {"_id": 0})
        if existing:
            return {"session_id": existing["session_id"], "resumed": True, "responses": existing.get("responses") or {}}
        sid = f"sess-{uuid.uuid4()}"
        doc = {
            "session_id": sid,
            "user_id": user_id,
            "assessment_type": body.assessment_type,
            "status": "in_progress",
            "started_at": _now(),
            "responses": {},
        }
        await db.personality_sessions.insert_one(doc)
        return {"session_id": sid, "resumed": False, "responses": {}}

    @router.post("/session/save")
    async def session_save(body: SessionSaveBody, user_id: str = Depends(get_current_user_id)):
        await db.personality_sessions.update_one(
            {"session_id": body.session_id, "user_id": user_id},
            {"$set": {"responses": body.responses, "assessment_type": body.assessment_type, "updated_at": _now()}},
            upsert=False,
        )
        return {"ok": True}

    @router.post("/session/submit")
    async def session_submit(body: SessionSubmitBody, user_id: str = Depends(get_current_user_id)):
        if body.assessment_type not in SCORERS:
            raise HTTPException(400, "Unknown assessment")
        scored = SCORERS[body.assessment_type](body.responses)
        profile = await _user_profile(user_id)
        try:
            interp = await _interpret_assessment(user_id, body.assessment_type, scored, profile)
        except Exception as e:
            log.warning(f"[personality] interpretation failed: {e}")
            interp = {"headline_summary": "Assessment complete.", "detailed_narrative": "Interpretation is temporarily unavailable — your raw scores are saved and you can retry from the results screen."}

        # Persist
        assessment_doc = {
            "assessment_id": f"asmt-{uuid.uuid4()}",
            "session_id": body.session_id,
            "user_id": user_id,
            "assessment_type": body.assessment_type,
            "status": "completed",
            "completed_at": _now(),
            "time_taken_seconds": body.time_taken_seconds or 0,
            "raw_responses": body.responses,
            "scored": scored,
            "plos_ai_interpretation": interp,
        }
        await db.personality_assessments.insert_one(assessment_doc)
        # Mark session complete
        await db.personality_sessions.update_one(
            {"session_id": body.session_id, "user_id": user_id},
            {"$set": {"status": "completed", "completed_at": _now()}},
            upsert=False,
        )
        # Invalidate DNA cache
        await db.personality_dna.delete_one({"user_id": user_id})
        return {"ok": True, "scored": scored, "interpretation": interp, "framework": FRAMEWORKS[body.assessment_type]}

    @router.get("/results/{assessment_type}")
    async def results(assessment_type: str, user_id: str = Depends(get_current_user_id)):
        if assessment_type not in FRAMEWORKS:
            raise HTTPException(404, "Unknown assessment")
        doc = await db.personality_assessments.find_one(
            {"user_id": user_id, "assessment_type": assessment_type, "status": "completed"},
            {"_id": 0},
            sort=[("completed_at", -1)],
        )
        if not doc:
            raise HTTPException(404, "No completed result")
        return {"result": doc, "framework": FRAMEWORKS[assessment_type]}

    @router.get("/dna")
    async def get_dna(user_id: str = Depends(get_current_user_id)):
        cached = await db.personality_dna.find_one({"user_id": user_id}, {"_id": 0})
        if cached:
            return {"dna": cached, "cached": True}
        completed = [d async for d in db.personality_assessments.find({"user_id": user_id, "status": "completed"}, {"_id": 0}).sort("completed_at", -1)]
        if not completed:
            return {"dna": None, "cached": False, "message": "Complete at least one assessment to unlock your Personality DNA."}
        profile = await _user_profile(user_id)
        try:
            dna = await _synthesise_dna(user_id, completed, profile)
        except Exception as e:
            log.warning(f"[personality] DNA synth failed: {e}")
            dna = {"headline_summary": "Complete more assessments to unlock a richer DNA profile.", "radar_dimensions": {}}
        doc = {"user_id": user_id, "last_updated": _now(), "assessments_completed": [c["assessment_type"] for c in completed], **dna}
        await db.personality_dna.insert_one(doc)
        # Strip mongo _id before returning
        doc.pop("_id", None)
        return {"dna": doc, "cached": False}

    @router.post("/dna/refresh")
    async def refresh_dna(user_id: str = Depends(get_current_user_id)):
        await db.personality_dna.delete_one({"user_id": user_id})
        return await get_dna(user_id=user_id)  # type: ignore

    return router


# ----------------------------------------------------------------------------
# progress-percentage helper
# ----------------------------------------------------------------------------
def _progress_pct(assessment_type: str, responses: Dict[str, Any]) -> int:
    total = len(ALL_BANKS.get(assessment_type, []))
    if total == 0:
        return 0
    return round(min(100, len(responses) * 100 / total))
