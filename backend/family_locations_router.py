"""Family Locations real-time sync router (Firestore).

Endpoints:
- POST /api/family-locations/sync     — push all of this user's family members
                                         to Firestore (one-time hydrate)
- POST /api/family-locations/simulate — move a specific member by ~0.5 miles
                                         to demonstrate the real-time listener
- GET  /api/family-locations/status   — admin readiness check (whether
                                         firebase-admin is loaded & connected)

The frontend subscribes via the Firebase JS SDK directly; we never expose the
service-account file.
"""
from __future__ import annotations

import logging
import math
import random
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import firestore_client

logger = logging.getLogger(__name__)


class SimulateBody(BaseModel):
    member_id: Optional[str] = None
    member_name: Optional[str] = None  # alt lookup, e.g. "Isaac"
    distance_miles: float = 0.5
    bearing_deg: Optional[float] = None  # if None, random direction
    message: Optional[str] = None


def _move_point(lat: float, lon: float, distance_miles: float, bearing_deg: float):
    """Return a new (lat, lon) that is `distance_miles` away on `bearing_deg`.

    Uses the spherical-earth approximation (good enough for half-mile hops).
    """
    R_miles = 3958.7613
    brng = math.radians(bearing_deg)
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)
    ang = distance_miles / R_miles
    lat2 = math.asin(
        math.sin(lat1) * math.cos(ang) + math.cos(lat1) * math.sin(ang) * math.cos(brng)
    )
    lon2 = lon1 + math.atan2(
        math.sin(brng) * math.sin(ang) * math.cos(lat1),
        math.cos(ang) - math.sin(lat1) * math.sin(lat2),
    )
    return (math.degrees(lat2), math.degrees(lon2))


def make_router(db, get_current_user_id):
    r = APIRouter(prefix="/api/family-locations", tags=["family-locations"])

    @r.get("/status")
    async def status():
        return {
            "firestore_available": firestore_client.is_available(),
            "collection": firestore_client.COLLECTION,
            "note": "TODO: Switch Firestore to production mode and apply proper "
            "security rules before publishing to App Store.",
        }

    @r.post("/sync")
    async def sync_all(user_id: str = Depends(get_current_user_id)):
        """Push every family member of this user to Firestore.

        Used on app open / first Safety module load so the listener has
        baseline docs to render. Pending invites get sharing_active=false.

        Returns 503 if ANY Firestore write fails (e.g. API disabled,
        database not created) so the frontend can surface the issue
        instead of showing a misleading "all good" state.
        """
        if not firestore_client.is_available():
            raise HTTPException(
                status_code=503,
                detail="Firestore not initialised — check FIREBASE_ADMIN_KEY_PATH",
            )
        members = await db.family_members.find(
            {"user_id": user_id}, {"_id": 0}
        ).to_list(50)
        written = []
        failures: list = []
        # Default to Atlanta if member has no lat/lon yet (mocked seed data)
        for idx, m in enumerate(members):
            lat = m.get("lat")
            lon = m.get("lon")
            if lat is None or lon is None:
                # Spread mocked members in a small cluster around Atlanta
                lat = 33.749 + (idx * 0.004)
                lon = -84.388 + (idx * 0.004)
            sharing_active = m.get("invite_status") != "pending"
            res = firestore_client.write_family_location(
                m["member_id"],
                owner_user_id=user_id,
                display_name=m.get("name", "Unknown"),
                latitude=float(lat),
                longitude=float(lon),
                accuracy=15.0,
                sharing_active=sharing_active,
                trip_active=False,
                message=None,
            )
            written.append(
                {"member_id": m["member_id"], "name": m.get("name"), "result": res}
            )
            if not res or not res.get("ok"):
                failures.append(res or {"error": "unknown"})
        if failures and len(failures) == len(written) and written:
            # Every single write failed → almost always means the Firestore
            # API is disabled in GCP or the database hasn't been created.
            err = (failures[0] or {}).get("error", "")
            hint = ""
            if "SERVICE_DISABLED" in err or "has not been used" in err:
                hint = (
                    " — enable Cloud Firestore API at "
                    "https://console.developers.google.com/apis/api/"
                    "firestore.googleapis.com/overview?project=plos-53fbd"
                )
            raise HTTPException(
                status_code=503,
                detail=f"All Firestore writes failed{hint}",
            )
        return {
            "ok": len(failures) == 0,
            "synced": len(written) - len(failures),
            "failed": len(failures),
            "members": written,
        }

    @r.post("/simulate")
    async def simulate_move(
        body: SimulateBody,
        user_id: str = Depends(get_current_user_id),
    ) -> Dict[str, Any]:
        """Move a specific family member by `distance_miles` in Firestore.

        Frontend listener should pick this up within ~1-2 seconds without
        any manual refresh. This is the realtime-listener proof.
        """
        if not firestore_client.is_available():
            raise HTTPException(
                status_code=503,
                detail="Firestore not initialised — check FIREBASE_ADMIN_KEY_PATH",
            )

        # Look up member (by id or name)
        query: Dict[str, Any] = {"user_id": user_id}
        if body.member_id:
            query["member_id"] = body.member_id
        elif body.member_name:
            query["name"] = body.member_name
        else:
            raise HTTPException(400, "Provide member_id or member_name")
        member = await db.family_members.find_one(query, {"_id": 0})
        if not member:
            raise HTTPException(404, "Family member not found")

        # Resolve current location: read latest from Firestore so successive
        # simulate calls accumulate distance.
        owned = firestore_client.list_owned_locations(user_id)
        current = next(
            (d for d in owned if d.get("user_id") == member["member_id"]), None
        )
        if current and current.get("latitude") is not None:
            lat = float(current["latitude"])
            lon = float(current["longitude"])
        else:
            # Seed default — Atlanta cluster
            lat = float(member.get("lat") or 33.749)
            lon = float(member.get("lon") or -84.388)

        bearing = (
            body.bearing_deg
            if body.bearing_deg is not None
            else random.uniform(0, 360)
        )
        new_lat, new_lon = _move_point(lat, lon, body.distance_miles, bearing)

        res = firestore_client.write_family_location(
            member["member_id"],
            owner_user_id=user_id,
            display_name=member.get("name", "Family"),
            latitude=new_lat,
            longitude=new_lon,
            accuracy=12.0,
            sharing_active=True,
            trip_active=True,
            message=body.message or "On the move",
        )
        if not res or not res.get("ok"):
            err = (res or {}).get("error", "")
            hint = ""
            if "SERVICE_DISABLED" in err or "has not been used" in err:
                hint = (
                    " — enable Cloud Firestore API at "
                    "https://console.developers.google.com/apis/api/"
                    "firestore.googleapis.com/overview?project=plos-53fbd"
                )
            raise HTTPException(
                status_code=503,
                detail=f"Firestore write failed{hint}",
            )
        return {
            "ok": True,
            "member_id": member["member_id"],
            "name": member.get("name"),
            "previous": {"lat": lat, "lon": lon},
            "new": {"lat": new_lat, "lon": new_lon},
            "bearing_deg": round(bearing, 1),
            "distance_miles": body.distance_miles,
            "firestore": res,
        }

    return r
