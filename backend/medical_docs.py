"""
PLOS — Enhancement 10: Medical Documents CRUD
- Upload (multipart) PDF / image / docx / txt
- List metadata
- Update metadata (title, doc_type, doc_date, provider, notes)
- Delete
- Download (returns base64 content)
"""
from __future__ import annotations

import base64
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

router = APIRouter(prefix="/api/health/medical-docs", tags=["medical-docs"])

MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB

ALLOWED_DOC_TYPES = {
    "lab_result",
    "imaging",
    "prescription",
    "discharge_summary",
    "vaccine_record",
    "insurance_card",
    "visit_note",
    "specialist_referral",
    "test_report",
    "other",
}


class MedicalDocUpdate(BaseModel):
    title: Optional[str] = None
    doc_type: Optional[str] = None
    doc_date: Optional[str] = None  # YYYY-MM-DD
    provider: Optional[str] = None
    notes: Optional[str] = None


def _strip(d: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not d:
        return None
    d.pop("_id", None)
    d.pop("user_id", None)
    return d


def make_router(db, get_current_user_id):

    @router.get("/types")
    async def list_types(_user_id: str = Depends(get_current_user_id)):
        return {"doc_types": sorted(ALLOWED_DOC_TYPES)}

    @router.get("")
    async def list_docs(
        doc_type: Optional[str] = None,
        user_id: str = Depends(get_current_user_id),
    ):
        q: Dict[str, Any] = {"user_id": user_id}
        if doc_type:
            if doc_type not in ALLOWED_DOC_TYPES:
                raise HTTPException(status_code=400, detail=f"Invalid doc_type: {doc_type}")
            q["doc_type"] = doc_type
        items: List[Dict[str, Any]] = []
        async for d in db.medical_docs.find(q).sort("uploaded_at", -1):
            d = _strip(d)
            d.pop("content_b64", None)
            items.append(d)
        return {"docs": items, "total": len(items)}

    @router.get("/{doc_id}")
    async def get_doc(doc_id: str, user_id: str = Depends(get_current_user_id)):
        d = await db.medical_docs.find_one({"user_id": user_id, "doc_id": doc_id})
        if not d:
            raise HTTPException(status_code=404, detail="Document not found")
        d = _strip(d)
        d.pop("content_b64", None)  # exclude raw bytes
        return d

    @router.get("/{doc_id}/download")
    async def download_doc(doc_id: str, user_id: str = Depends(get_current_user_id)):
        d = await db.medical_docs.find_one({"user_id": user_id, "doc_id": doc_id})
        if not d:
            raise HTTPException(status_code=404, detail="Document not found")
        return {
            "filename": d.get("filename", "document"),
            "mime_type": d.get("mime", "application/octet-stream"),
            "content_base64": d.get("content_b64", ""),
            "size_bytes": d.get("size", 0),
        }

    @router.post("/upload")
    async def upload_doc(
        file: UploadFile = File(...),
        title: Optional[str] = Form(None),
        doc_type: str = Form("other"),
        doc_date: Optional[str] = Form(None),
        provider: Optional[str] = Form(None),
        notes: Optional[str] = Form(None),
        user_id: str = Depends(get_current_user_id),
    ):
        if doc_type not in ALLOWED_DOC_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid doc_type: {doc_type}")
        content = await file.read()
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Empty file")
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too large (max {MAX_FILE_SIZE // 1024 // 1024} MB)",
            )

        mime = file.content_type or "application/octet-stream"
        if mime == "application/octet-stream":
            fn = (file.filename or "").lower()
            if fn.endswith(".pdf"):
                mime = "application/pdf"
            elif fn.endswith((".jpg", ".jpeg")):
                mime = "image/jpeg"
            elif fn.endswith(".png"):
                mime = "image/png"
            elif fn.endswith(".heic"):
                mime = "image/heic"
            elif fn.endswith(".docx"):
                mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            elif fn.endswith(".txt"):
                mime = "text/plain"

        doc_id = str(uuid.uuid4())
        rec = {
            "doc_id": doc_id,
            "user_id": user_id,
            "title": (title or file.filename or "Untitled").strip(),
            "doc_type": doc_type,
            "doc_date": doc_date,
            "provider": provider,
            "notes": notes,
            "filename": file.filename or "untitled",
            "mime": mime,
            "size": len(content),
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "content_b64": base64.b64encode(content).decode("ascii"),
        }
        await db.medical_docs.insert_one(rec)
        out = dict(rec)
        out.pop("content_b64", None)
        out.pop("user_id", None)
        out.pop("_id", None)
        return {"doc": out}

    @router.put("/{doc_id}")
    async def update_doc(
        doc_id: str,
        payload: MedicalDocUpdate,
        user_id: str = Depends(get_current_user_id),
    ):
        upd: Dict[str, Any] = {k: v for k, v in payload.model_dump().items() if v is not None}
        if "doc_type" in upd and upd["doc_type"] not in ALLOWED_DOC_TYPES:
            raise HTTPException(
                status_code=400, detail=f"Invalid doc_type: {upd['doc_type']}"
            )
        if not upd:
            raise HTTPException(status_code=400, detail="No fields to update")
        r = await db.medical_docs.update_one(
            {"user_id": user_id, "doc_id": doc_id}, {"$set": upd}
        )
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Document not found")
        return {"ok": True}

    @router.delete("/{doc_id}")
    async def delete_doc(doc_id: str, user_id: str = Depends(get_current_user_id)):
        r = await db.medical_docs.delete_one({"user_id": user_id, "doc_id": doc_id})
        if r.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Document not found")
        return {"ok": True}

    return router
