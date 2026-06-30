"""PLOS Firestore client — wraps firebase-admin for server-side Firestore writes.

Used by the Family Locations real-time feature. The frontend uses the firebase
web JS SDK (firebase/firestore) for reads + onSnapshot listeners. Server-side
writes from the backend (invite events, simulated updates, scheduled jobs) flow
through this module.

TODO: Switch Firestore to production mode and apply proper security rules
      before publishing to App Store. Currently the project must be in TEST
      MODE for the web SDK to read/write without auth.
"""
from __future__ import annotations

import logging
import os
import threading
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_db = None  # firestore client, initialized lazily


def _ensure_initialized():
    """Initialize firebase-admin and the Firestore client exactly once."""
    global _db
    if _db is not None:
        return _db
    with _lock:
        if _db is not None:
            return _db
        try:
            import firebase_admin
            from firebase_admin import credentials, firestore
        except ImportError as exc:  # pragma: no cover
            logger.error("firebase-admin not installed: %s", exc)
            return None

        key_path = os.environ.get(
            "FIREBASE_ADMIN_KEY_PATH", "/app/backend/firebase-admin.json"
        )
        project_id = os.environ.get("FIREBASE_PROJECT_ID", "plos-53fbd")
        if not os.path.exists(key_path):
            logger.warning(
                "Firebase admin key file not found at %s — Firestore disabled",
                key_path,
            )
            return None
        try:
            if not firebase_admin._apps:
                cred = credentials.Certificate(key_path)
                firebase_admin.initialize_app(
                    cred, {"projectId": project_id}
                )
            _db = firestore.client()
            logger.info("Firestore admin client initialized (project=%s)", project_id)
        except Exception as exc:
            logger.warning("Failed to initialize Firestore admin: %s", exc)
            _db = None
        return _db


def is_available() -> bool:
    return _ensure_initialized() is not None


# ---------- Family Locations collection helpers ----------------------------
COLLECTION = "family_locations"


def write_family_location(
    member_id: str,
    *,
    owner_user_id: str,
    display_name: str,
    latitude: float,
    longitude: float,
    accuracy: Optional[float] = None,
    sharing_active: bool = True,
    sharing_expires_at: Optional[str] = None,
    message: Optional[str] = None,
    trip_active: bool = False,
) -> Optional[Dict[str, Any]]:
    """Write or update a family member's live location document.

    Document path: family_locations/{member_id}
    The doc ID is the PLOS member_id, which matches the MongoDB record.
    """
    db = _ensure_initialized()
    if db is None:
        return None
    try:
        from firebase_admin import firestore
        doc_ref = db.collection(COLLECTION).document(member_id)
        payload: Dict[str, Any] = {
            "user_id": member_id,
            "owner_user_id": owner_user_id,
            "display_name": display_name,
            "latitude": float(latitude),
            "longitude": float(longitude),
            "accuracy": float(accuracy) if accuracy is not None else None,
            "timestamp": firestore.SERVER_TIMESTAMP,
            "sharing_active": bool(sharing_active),
            "sharing_expires_at": sharing_expires_at,
            "message": message,
            "trip_active": bool(trip_active),
        }
        doc_ref.set(payload, merge=True)
        return {"ok": True, "doc_path": f"{COLLECTION}/{member_id}"}
    except Exception as exc:
        logger.warning("write_family_location failed: %s", exc)
        return {"ok": False, "error": str(exc)}


def delete_family_location(member_id: str) -> bool:
    db = _ensure_initialized()
    if db is None:
        return False
    try:
        db.collection(COLLECTION).document(member_id).delete()
        return True
    except Exception as exc:
        logger.warning("delete_family_location failed: %s", exc)
        return False


def list_owned_locations(owner_user_id: str) -> List[Dict[str, Any]]:
    """One-off read of all locations owned by a given user (for admin tests)."""
    db = _ensure_initialized()
    if db is None:
        return []
    try:
        docs = (
            db.collection(COLLECTION)
            .where("owner_user_id", "==", owner_user_id)
            .stream()
        )
        out: List[Dict[str, Any]] = []
        for d in docs:
            data = d.to_dict() or {}
            data["_id"] = d.id
            # Convert Firestore timestamp to ISO string for JSON
            ts = data.get("timestamp")
            if ts is not None and hasattr(ts, "isoformat"):
                data["timestamp"] = ts.isoformat()
            out.append(data)
        return out
    except Exception as exc:
        logger.warning("list_owned_locations failed: %s", exc)
        return []
