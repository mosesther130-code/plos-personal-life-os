"""
PLOS — Enhancement 11: Account Management
- POST /api/auth/change-password
- POST /api/auth/delete-account (2-step: confirm_text=="DELETE" + password)

Both endpoints require an authenticated JWT. Failures are recorded in
audit_logs. Deletion cascades across every user-scoped collection in the DB,
keyed primarily by `user_id` (with `users` keyed by `user_id` field as well).
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator


router = APIRouter(prefix="/api/auth", tags=["account-management"])


# Module-level password helpers will be injected from server.py via factory
class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=200)

    @field_validator("new_password")
    @classmethod
    def _strength(cls, v: str) -> str:
        if v.strip() != v:
            raise ValueError("new_password may not have leading/trailing whitespace")
        if not re.search(r"[A-Za-z]", v) or not re.search(r"[0-9]", v):
            raise ValueError("new_password must contain at least one letter and one digit")
        return v


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1)
    confirm_text: str

    @field_validator("confirm_text")
    @classmethod
    def _must_equal_delete(cls, v: str) -> str:
        if v != "DELETE":
            raise ValueError('confirm_text must be exactly "DELETE"')
        return v


async def _log_event(
    db, event_type: str, user_id: str | None, details: Dict[str, Any]
):
    try:
        await db.audit_logs.insert_one(
            {
                "event_type": event_type,
                "user_id": user_id,
                "details": details,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception:
        # Never let audit failures break the main flow.
        pass


def make_router(db, get_current_user_id, hash_password_fn, verify_password_fn):

    @router.post("/change-password")
    async def change_password(
        payload: ChangePasswordRequest,
        user_id: str = Depends(get_current_user_id),
    ):
        user = await db.users.find_one({"user_id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if not verify_password_fn(payload.current_password, user["password_hash"]):
            await _log_event(
                db,
                "password_change_failed",
                user_id,
                {"reason": "invalid_current_password"},
            )
            raise HTTPException(status_code=400, detail="Current password is incorrect")

        if payload.current_password == payload.new_password:
            raise HTTPException(
                status_code=400,
                detail="New password must be different from the current password",
            )

        now_iso = datetime.now(timezone.utc).isoformat()
        await db.users.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "password_hash": hash_password_fn(payload.new_password),
                    "password_changed_at": now_iso,
                }
            },
        )

        await _log_event(db, "password_changed", user_id, {})
        return {"ok": True, "password_changed_at": now_iso}

    @router.post("/delete-account")
    async def delete_account(
        payload: DeleteAccountRequest,
        user_id: str = Depends(get_current_user_id),
    ):
        user = await db.users.find_one({"user_id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if not verify_password_fn(payload.password, user["password_hash"]):
            await _log_event(
                db,
                "account_delete_failed",
                user_id,
                {"reason": "invalid_password"},
            )
            raise HTTPException(status_code=400, detail="Password is incorrect")

        # Capture email for audit before deletion
        email = user.get("email")

        # Cascade-delete across every user-scoped collection.
        # We dynamically enumerate all collections and delete by user_id where
        # the collection actually has that field. This protects against forgetting
        # to add a new collection to a static map.
        deletion_report: Dict[str, int] = {}
        try:
            names = await db.list_collection_names()
        except Exception:
            names = []
        for name in names:
            if name == "audit_logs":
                continue  # preserve audit trail
            try:
                # Special case: users collection (parent record)
                if name == "users":
                    continue  # delete last, after children
                coll = db[name]
                res = await coll.delete_many({"user_id": user_id})
                if res.deleted_count:
                    deletion_report[name] = res.deleted_count
            except Exception:
                # ignore per-collection failures so we still proceed
                pass

        # Finally remove parent record
        try:
            res = await db.users.delete_one({"user_id": user_id})
            if res.deleted_count:
                deletion_report["users"] = 1
        except Exception:
            pass

        await _log_event(
            db,
            "account_deleted",
            user_id,
            {"email": email, "collections_cleared": deletion_report},
        )

        return {
            "ok": True,
            "collections_cleared": deletion_report,
            "total_records": sum(deletion_report.values()),
        }

    return router
