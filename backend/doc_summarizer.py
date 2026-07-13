"""
PLOS — Enhancement 12: AI Document Summarizer
Global utility that ingests a PDF / image / DOCX / TXT and returns a PLOS AI
summary tailored to a focus (financial, medical, legal, technical, etc.).
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None  # type: ignore

try:
    from docx import Document
except ImportError:  # pragma: no cover
    Document = None  # type: ignore

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

EMERGENT_LLM_KEY = os.getenv("EMERGENT_LLM_KEY", "")

router = APIRouter(prefix="/api/doc-summarizer", tags=["doc-summarizer"])

MAX_FILE_SIZE = 12 * 1024 * 1024  # 12 MB

FOCUS_PRESETS: Dict[str, Dict[str, str]] = {
    "general": {
        "label": "General",
        "instruction": "Provide a balanced, comprehensive summary covering the document's main purpose, structure, and key takeaways.",
    },
    "financial": {
        "label": "Financial",
        "instruction": "Focus on financial data: amounts, fees, interest rates, payment terms, balances, tax implications, and any monetary obligations or opportunities.",
    },
    "medical": {
        "label": "Medical",
        "instruction": "Focus on medical content: diagnoses, lab values, medications & dosages, allergies, treatment plans, follow-up instructions, and red-flag results that require attention.",
    },
    "legal": {
        "label": "Legal",
        "instruction": "Focus on legal content: parties involved, obligations, deadlines, governing law, termination clauses, penalties, and any binding terms the reader must accept.",
    },
    "technical": {
        "label": "Technical",
        "instruction": "Focus on technical/engineering content: architecture, APIs, parameters, error codes, dependencies, performance characteristics, and developer-facing instructions.",
    },
    "academic": {
        "label": "Academic",
        "instruction": "Focus on academic/research content: hypothesis, methodology, results, statistical findings, conclusions, and limitations.",
    },
    "action_items": {
        "label": "Action Items",
        "instruction": "Focus exclusively on what the reader must DO. Extract concrete action items, deadlines, owners, and a recommended priority order.",
    },
}


def _strip(d: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not d:
        return None
    d.pop("_id", None)
    d.pop("user_id", None)
    return d


def _extract_text_from_pdf(data: bytes) -> str:
    if PdfReader is None:
        return ""
    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n\n".join((p.extract_text() or "") for p in reader.pages)
    except Exception:
        return ""


def _extract_text_from_docx(data: bytes) -> str:
    if Document is None:
        return ""
    try:
        doc = Document(io.BytesIO(data))
        return "\n".join(p.text for p in doc.paragraphs if p.text)
    except Exception:
        return ""


def _truncate(text: str, max_chars: int = 50_000) -> str:
    if len(text) <= max_chars:
        return text
    head = text[: int(max_chars * 0.7)]
    tail = text[-int(max_chars * 0.3):]
    return f"{head}\n\n[…document truncated…]\n\n{tail}"


async def _call_claude_text(
    user_id: str, focus: str, file_name: str, extracted_text: str
) -> Dict[str, Any]:
    preset = FOCUS_PRESETS.get(focus) or FOCUS_PRESETS["general"]
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"doc-summarizer-{user_id}",
        system_message=(
            "You are PLOS Document Intelligence. Read the provided document and "
            "produce a structured JSON summary. Output ONLY valid JSON."
        ),
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    prompt = (
        f"Document file name: {file_name}\n"
        f"Focus mode: {preset['label']} — {preset['instruction']}\n\n"
        f"DOCUMENT TEXT (may be truncated):\n{_truncate(extracted_text)}\n\n"
        "Return JSON with this exact shape:\n"
        '{ "tldr": "1-2 sentence headline summary",\n'
        '  "summary": "3-5 paragraph thorough summary in the chosen focus",\n'
        '  "key_points": ["bullet1", "bullet2", "..."],\n'
        '  "action_items": [ {"action": "...", "owner": "...", "deadline": "...", "priority": "high|med|low"} ],\n'
        '  "flags": [ {"label": "...", "severity": "info|warn|critical", "detail": "..."} ],\n'
        '  "topics": ["topic1","topic2"] }\n'
    )
    raw = await chat.send_message(UserMessage(text=prompt))
    return _parse_claude_json(raw)


async def _call_claude_image(
    user_id: str, focus: str, file_name: str, image_b64: str, mime: str
) -> Dict[str, Any]:
    preset = FOCUS_PRESETS.get(focus) or FOCUS_PRESETS["general"]
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"doc-summarizer-img-{user_id}",
        system_message=(
            "You are PLOS Document Intelligence with vision. The user has uploaded "
            "an image (scan, photo of a doc, or screenshot). Read it carefully and "
            "produce a structured JSON summary. Output ONLY valid JSON."
        ),
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    prompt = (
        f"Image file name: {file_name}\n"
        f"Focus mode: {preset['label']} — {preset['instruction']}\n\n"
        "Read the image and return JSON with the same shape as text mode:\n"
        '{ "tldr": "...", "summary": "...", "key_points": [...], '
        '"action_items": [...], "flags": [...], "topics": [...] }'
    )
    raw = await chat.send_message(
        UserMessage(
            text=prompt,
            file_contents=[ImageContent(image_base64=image_b64)],
        )
    )
    return _parse_claude_json(raw)


def _parse_claude_json(raw) -> Dict[str, Any]:
    text = raw if isinstance(raw, str) else str(raw)
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return {"tldr": "Could not parse AI response.", "summary": text[:1200]}
    try:
        return json.loads(m.group(0))
    except Exception:
        return {"tldr": "Partial AI response", "summary": text[:1200]}


def make_router(db, get_current_user_id):

    @router.get("/focuses")
    async def list_focuses(_user_id: str = Depends(get_current_user_id)):
        return {
            "focuses": [
                {"value": k, "label": v["label"], "instruction": v["instruction"]}
                for k, v in FOCUS_PRESETS.items()
            ]
        }

    @router.get("/history")
    async def list_history(user_id: str = Depends(get_current_user_id)):
        items: List[Dict[str, Any]] = []
        async for d in (
            db.doc_summaries.find({"user_id": user_id}).sort("created_at", -1).limit(50)
        ):
            d = _strip(d)
            # Don't ship full original text in list view
            d.pop("extracted_text", None)
            d.pop("source_b64", None)
            items.append(d)
        return {"history": items, "total": len(items)}

    @router.get("/history/{summary_id}")
    async def get_history(summary_id: str, user_id: str = Depends(get_current_user_id)):
        d = await db.doc_summaries.find_one(
            {"user_id": user_id, "summary_id": summary_id}
        )
        if not d:
            raise HTTPException(status_code=404, detail="Summary not found")
        d = _strip(d)
        d.pop("source_b64", None)
        return d

    @router.delete("/history/{summary_id}")
    async def delete_history(summary_id: str, user_id: str = Depends(get_current_user_id)):
        r = await db.doc_summaries.delete_one(
            {"user_id": user_id, "summary_id": summary_id}
        )
        if r.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Summary not found")
        return {"ok": True}

    @router.post("/summarize")
    async def summarize(
        file: UploadFile = File(...),
        focus: str = Form("general"),
        save: str = Form("false"),
        user_id: str = Depends(get_current_user_id),
    ):
        if focus not in FOCUS_PRESETS:
            raise HTTPException(status_code=400, detail=f"Invalid focus: {focus}")
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Empty file")
        if len(data) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large (max {MAX_FILE_SIZE // 1024 // 1024} MB)",
            )

        mime = (file.content_type or "").lower()
        filename = (file.filename or "document").lower()
        if not mime or mime == "application/octet-stream":
            if filename.endswith(".pdf"):
                mime = "application/pdf"
            elif filename.endswith(".docx"):
                mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            elif filename.endswith(".txt"):
                mime = "text/plain"
            elif filename.endswith((".jpg", ".jpeg")):
                mime = "image/jpeg"
            elif filename.endswith(".png"):
                mime = "image/png"

        extracted_text = ""
        try:
            if mime == "application/pdf":
                extracted_text = _extract_text_from_pdf(data)
            elif (
                mime
                == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ):
                extracted_text = _extract_text_from_docx(data)
            elif mime == "text/plain":
                extracted_text = data.decode("utf-8", errors="ignore")
            elif mime.startswith("image/"):
                pass  # handled below
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unsupported file type: {mime or 'unknown'}",
                )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Could not parse file: {str(e)[:160]}"
            )

        try:
            if mime.startswith("image/"):
                b64 = base64.b64encode(data).decode("ascii")
                ai = await _call_claude_image(user_id, focus, file.filename or "image", b64, mime)
            else:
                if not extracted_text.strip():
                    raise HTTPException(
                        status_code=400,
                        detail="Could not extract readable text from the document.",
                    )
                ai = await _call_claude_text(
                    user_id, focus, file.filename or "document", extracted_text
                )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"AI summarizer is temporarily unavailable: {str(e)[:160]}",
            )

        summary_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        result = {
            "summary_id": summary_id,
            "file_name": file.filename or "document",
            "mime": mime,
            "size_bytes": len(data),
            "focus": focus,
            "focus_label": FOCUS_PRESETS[focus]["label"],
            "created_at": now,
            "tldr": ai.get("tldr") or "",
            "summary": ai.get("summary") or "",
            "key_points": ai.get("key_points") or [],
            "action_items": ai.get("action_items") or [],
            "flags": ai.get("flags") or [],
            "topics": ai.get("topics") or [],
        }

        if str(save).lower() in ("true", "1", "yes"):
            persisted = {
                **result,
                "user_id": user_id,
                "extracted_text_excerpt": extracted_text[:8000] if extracted_text else "",
            }
            await db.doc_summaries.insert_one(persisted)
            result["saved"] = True
        else:
            result["saved"] = False

        return result

    return router
