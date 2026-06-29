"""
PLOS — Safety & Local Enhancements (Enhancement 7)
- Offline Maps CRUD (per-user, persisted to MongoDB)
- Live Travel Map (returns active/upcoming trip with coordinates)
- GPS Navigation Alerts (settings + check endpoint)
- Local Media streaming (TV + radio stations near coords)
"""
from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/local", tags=["safety-local-enhanced"])


# ----------------------------- Models -------------------------------
class OfflineMapIn(BaseModel):
    name: str
    region_type: str = "country"  # country | state | metro | custom
    size_mb: int = 0
    notes: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None


class OfflineMap(OfflineMapIn):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str = "downloaded"  # downloaded | queued | failed
    last_updated: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class GpsAlertSettings(BaseModel):
    enabled: bool = True
    severe_weather: bool = True
    crime_geofence: bool = True
    travel_advisories: bool = True
    speed_alerts: bool = False
    radius_miles: float = 5.0


# ----------------------------- Media Catalog ------------------------
# Lightweight directory keyed by US state code. Falls back to national feeds.
LOCAL_MEDIA_DIRECTORY: Dict[str, Dict[str, List[Dict[str, Any]]]] = {
    "GA": {
        "tv": [
            {
                "name": "WSB-TV (ABC 2)",
                "channel": "2.1",
                "city": "Atlanta",
                "stream_url": "https://www.wsbtv.com/video/live/",
                "genre": "News",
            },
            {
                "name": "11Alive (NBC)",
                "channel": "11.1",
                "city": "Atlanta",
                "stream_url": "https://www.11alive.com/watch",
                "genre": "News",
            },
            {
                "name": "FOX 5 Atlanta",
                "channel": "5.1",
                "city": "Atlanta",
                "stream_url": "https://www.fox5atlanta.com/live",
                "genre": "News",
            },
        ],
        "radio": [
            {
                "name": "WABE 90.1 FM",
                "frequency": "90.1 FM",
                "city": "Atlanta",
                "stream_url": "https://stream.wabe.org/wabe-mp3",
                "genre": "NPR / Public Radio",
            },
            {
                "name": "Power 96.1",
                "frequency": "96.1 FM",
                "city": "Atlanta",
                "stream_url": "https://playerservices.streamtheworld.com/api/livestream-redirect/WWPWFMAAC.aac",
                "genre": "Top 40",
            },
            {
                "name": "V-103",
                "frequency": "103.3 FM",
                "city": "Atlanta",
                "stream_url": "https://playerservices.streamtheworld.com/api/livestream-redirect/WVEEFMAAC.aac",
                "genre": "R&B / Hip-Hop",
            },
        ],
    },
    "NY": {
        "tv": [
            {
                "name": "NY1",
                "channel": "1",
                "city": "New York",
                "stream_url": "https://www.ny1.com/nyc/all-boroughs/live",
                "genre": "News",
            },
            {
                "name": "ABC7 NY",
                "channel": "7.1",
                "city": "New York",
                "stream_url": "https://abc7ny.com/watch/live/",
                "genre": "News",
            },
        ],
        "radio": [
            {
                "name": "WNYC 93.9 FM",
                "frequency": "93.9 FM",
                "city": "New York",
                "stream_url": "https://fm939.wnyc.org/wnycfm",
                "genre": "NPR / Public Radio",
            },
            {
                "name": "Z100",
                "frequency": "100.3 FM",
                "city": "New York",
                "stream_url": "https://playerservices.streamtheworld.com/api/livestream-redirect/WHTZFMAAC.aac",
                "genre": "Top 40",
            },
        ],
    },
    "CA": {
        "tv": [
            {
                "name": "KTLA 5",
                "channel": "5.1",
                "city": "Los Angeles",
                "stream_url": "https://ktla.com/live/",
                "genre": "News",
            },
            {
                "name": "ABC7 Los Angeles",
                "channel": "7.1",
                "city": "Los Angeles",
                "stream_url": "https://abc7.com/watch/live/",
                "genre": "News",
            },
        ],
        "radio": [
            {
                "name": "KCRW 89.9 FM",
                "frequency": "89.9 FM",
                "city": "Santa Monica",
                "stream_url": "https://kcrw.streamguys1.com/kcrw_192k_mp3_e24_internet_radio",
                "genre": "NPR / Eclectic",
            },
        ],
    },
}
NATIONAL_FALLBACK = {
    "tv": [
        {
            "name": "CBSN (CBS News)",
            "channel": "Streaming",
            "city": "National",
            "stream_url": "https://www.cbsnews.com/live/",
            "genre": "News",
        },
        {
            "name": "ABC News Live",
            "channel": "Streaming",
            "city": "National",
            "stream_url": "https://abcnews.go.com/Live",
            "genre": "News",
        },
    ],
    "radio": [
        {
            "name": "NPR News Now",
            "frequency": "Streaming",
            "city": "National",
            "stream_url": "https://npr-ice.streamguys1.com/live.mp3",
            "genre": "NPR / News",
        },
    ],
}


# Atlanta default → "GA" mapping by simple lat/lon proximity
STATE_BOUNDING_BOXES = [
    # (state, min_lat, max_lat, min_lon, max_lon)
    ("GA", 30.3, 35.0, -85.6, -80.8),
    ("NY", 40.0, 45.0, -79.8, -71.8),
    ("CA", 32.5, 42.0, -124.5, -114.1),
    ("FL", 24.4, 31.0, -87.6, -79.9),
    ("TX", 25.8, 36.6, -106.7, -93.5),
]


def _state_from_coords(lat: Optional[float], lon: Optional[float]) -> Optional[str]:
    if lat is None or lon is None:
        return None
    for st, lat_min, lat_max, lon_min, lon_max in STATE_BOUNDING_BOXES:
        if lat_min <= lat <= lat_max and lon_min <= lon <= lon_max:
            return st
    return None


def _haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 3958.8  # earth radius in miles
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(a))


# ----------------------------- City lookup (lite) --------------------
# Tiny gazetteer so we can render a Live Travel Map without external APIs.
CITY_COORDS: Dict[str, Dict[str, Any]] = {
    "atlanta": {"lat": 33.749, "lon": -84.388, "country": "USA"},
    "new york": {"lat": 40.7128, "lon": -74.0060, "country": "USA"},
    "los angeles": {"lat": 34.0522, "lon": -118.2437, "country": "USA"},
    "san francisco": {"lat": 37.7749, "lon": -122.4194, "country": "USA"},
    "chicago": {"lat": 41.8781, "lon": -87.6298, "country": "USA"},
    "miami": {"lat": 25.7617, "lon": -80.1918, "country": "USA"},
    "manila": {"lat": 14.5995, "lon": 120.9842, "country": "Philippines"},
    "bulacan": {"lat": 14.7943, "lon": 120.8794, "country": "Philippines"},
    "london": {"lat": 51.5074, "lon": -0.1278, "country": "UK"},
    "paris": {"lat": 48.8566, "lon": 2.3522, "country": "France"},
    "tokyo": {"lat": 35.6762, "lon": 139.6503, "country": "Japan"},
    "dubai": {"lat": 25.2048, "lon": 55.2708, "country": "UAE"},
    "mexico city": {"lat": 19.4326, "lon": -99.1332, "country": "Mexico"},
    "sydney": {"lat": -33.8688, "lon": 151.2093, "country": "Australia"},
}


def _city_lookup(city: Optional[str], country: Optional[str]) -> Optional[Dict[str, Any]]:
    if not city:
        return None
    key = city.lower().strip()
    if key in CITY_COORDS:
        return CITY_COORDS[key]
    # Fallback by country
    if country:
        c = country.lower()
        for v in CITY_COORDS.values():
            if v["country"].lower() == c:
                return v
    return None


# ----------------------------- Helpers ------------------------------
def _strip(d: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not d:
        return None
    d.pop("_id", None)
    d.pop("user_id", None)
    return d


# ============= Factory =============
def make_router(db, get_current_user_id):

    # ---------- Offline Maps CRUD ----------
    async def _seed_offline_if_empty(user_id: str):
        cnt = await db.offline_maps.count_documents({"user_id": user_id})
        if cnt == 0:
            seeds = [
                {
                    "name": "Georgia, USA",
                    "region_type": "state",
                    "size_mb": 180,
                    "lat": 33.749,
                    "lon": -84.388,
                    "notes": "Home region · auto-seeded",
                },
                {
                    "name": "Bulacan Province, Philippines",
                    "region_type": "state",
                    "size_mb": 45,
                    "lat": 14.7943,
                    "lon": 120.8794,
                    "notes": "Family region · auto-seeded",
                },
            ]
            for s in seeds:
                m = OfflineMap(**s).model_dump()
                m["user_id"] = user_id
                try:
                    await db.offline_maps.insert_one(m)
                except Exception:
                    pass

    @router.get("/offline-maps")
    async def list_offline_maps(user_id: str = Depends(get_current_user_id)):
        await _seed_offline_if_empty(user_id)
        items: List[Dict[str, Any]] = []
        async for d in db.offline_maps.find({"user_id": user_id}).sort("name", 1):
            items.append(_strip(d) or {})
        total_mb = sum(int(i.get("size_mb") or 0) for i in items)
        return {"regions": items, "total_size_mb": total_mb, "is_mocked": False}

    @router.post("/offline-maps")
    async def create_offline_map(
        payload: OfflineMapIn, user_id: str = Depends(get_current_user_id)
    ):
        m = OfflineMap(**payload.model_dump()).model_dump()
        m["user_id"] = user_id
        await db.offline_maps.insert_one(m)
        return {"id": m["id"]}

    @router.put("/offline-maps/{region_id}")
    async def update_offline_map(
        region_id: str,
        payload: OfflineMapIn,
        user_id: str = Depends(get_current_user_id),
    ):
        upd = payload.model_dump()
        upd["last_updated"] = datetime.now(timezone.utc).isoformat()
        r = await db.offline_maps.update_one(
            {"user_id": user_id, "id": region_id}, {"$set": upd}
        )
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Region not found")
        return {"ok": True}

    @router.delete("/offline-maps/{region_id}")
    async def delete_offline_map(
        region_id: str, user_id: str = Depends(get_current_user_id)
    ):
        await db.offline_maps.delete_one({"user_id": user_id, "id": region_id})
        return {"ok": True}

    # ---------- Live Travel Map ----------
    @router.get("/travel-map")
    async def live_travel_map(user_id: str = Depends(get_current_user_id)):
        """Returns the user's nearest upcoming/active trip with origin and
        destination coordinates so the client can render a route map."""
        # Pull trips, prefer status=booked or status=planning with closest dep
        trips = await db.trips.find({"user_id": user_id}, {"_id": 0}).to_list(50)
        if not trips:
            return {"trip": None, "message": "No trips planned. Add one in the Travel module."}

        # Score by closeness of departure
        def _score(t):
            dep = t.get("departure_date") or ""
            try:
                d = datetime.fromisoformat(dep.replace("Z", "+00:00"))
                return abs((d - datetime.now(timezone.utc)).total_seconds())
            except Exception:
                return 1e12

        trips.sort(key=_score)
        target = trips[0]
        # Get origin (user's home location)
        profile = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0}) or {}
        home_city = profile.get("home_city") or "Atlanta"
        home_state = profile.get("home_state") or "GA"
        origin = _city_lookup(home_city, None) or {"lat": 33.749, "lon": -84.388, "country": "USA"}
        dest = _city_lookup(target.get("city"), target.get("country"))
        if not dest:
            # fallback to country only
            dest = {"lat": 0.0, "lon": 0.0, "country": target.get("country", "")}
        distance_mi = round(
            _haversine_miles(origin["lat"], origin["lon"], dest["lat"], dest["lon"]), 1
        )
        return {
            "trip": {
                "trip_id": target.get("trip_id"),
                "destination_name": target.get("destination_name"),
                "city": target.get("city"),
                "country": target.get("country"),
                "departure_date": target.get("departure_date"),
                "return_date": target.get("return_date"),
                "purpose": target.get("purpose"),
                "status": target.get("status"),
            },
            "origin": {
                "label": f"{home_city}, {home_state}",
                "lat": origin["lat"],
                "lon": origin["lon"],
            },
            "destination": {
                "label": (
                    f"{target.get('city') or target.get('destination_name')}, {target.get('country', '')}"
                ).strip(", "),
                "lat": dest["lat"],
                "lon": dest["lon"],
            },
            "distance_miles": distance_mi,
        }

    # ---------- GPS Navigation Alerts ----------
    @router.get("/gps-alerts/settings")
    async def get_gps_alert_settings(user_id: str = Depends(get_current_user_id)):
        doc = await db.gps_alert_settings.find_one({"user_id": user_id}, {"_id": 0})
        if not doc:
            return GpsAlertSettings().model_dump()
        doc.pop("user_id", None)
        return doc

    @router.put("/gps-alerts/settings")
    async def update_gps_alert_settings(
        payload: GpsAlertSettings, user_id: str = Depends(get_current_user_id)
    ):
        await db.gps_alert_settings.update_one(
            {"user_id": user_id},
            {"$set": payload.model_dump()},
            upsert=True,
        )
        return {"ok": True}

    @router.post("/gps-alerts/check")
    async def check_gps_alerts(
        body: Dict[str, Any], user_id: str = Depends(get_current_user_id)
    ):
        lat = float(body.get("lat") or 0)
        lon = float(body.get("lon") or 0)
        settings = await db.gps_alert_settings.find_one(
            {"user_id": user_id}, {"_id": 0}
        ) or GpsAlertSettings().model_dump()

        alerts: List[Dict[str, Any]] = []
        if settings.get("enabled", True):
            # 1. Severe weather (only if module enabled). Pull from active SOS or use heuristic.
            if settings.get("severe_weather", True):
                # If user_profile.last_weather_alerts exists, surface those
                profile = await db.user_profile.find_one(
                    {"user_id": user_id}, {"_id": 0}
                ) or {}
                for a in (profile.get("last_weather_alerts") or [])[:2]:
                    alerts.append({
                        "alert_id": str(uuid.uuid4()),
                        "type": "severe_weather",
                        "title": a.get("event", "Weather alert"),
                        "message": a.get("headline", ""),
                        "severity": a.get("severity", "moderate"),
                    })

            # 2. Crime geofence — mock high-risk pings within radius
            if settings.get("crime_geofence", True):
                # Very small ruleset: if near downtown Atlanta + late hour, raise an alert
                hour_utc = datetime.now(timezone.utc).hour
                if 33.7 <= lat <= 33.8 and -84.45 <= lon <= -84.35 and (hour_utc >= 3 or hour_utc <= 5):
                    alerts.append({
                        "alert_id": str(uuid.uuid4()),
                        "type": "crime_geofence",
                        "title": "Elevated crime activity nearby",
                        "message": "Recent incidents reported within 1 mi. Stay aware of surroundings.",
                        "severity": "moderate",
                    })

            # 3. Speed alert: stub — would integrate with motion sensor in app.
            if settings.get("speed_alerts", False):
                # Placeholder demonstrating capability
                pass

            # 4. Travel advisory near destination
            if settings.get("travel_advisories", True):
                trips = await db.trips.find(
                    {"user_id": user_id, "status": {"$in": ["booked", "planning"]}},
                    {"_id": 0},
                ).to_list(10)
                for t in trips[:1]:
                    if (t.get("country_code") or "").upper() in {"PH", "MX", "BR", "EG"}:
                        alerts.append({
                            "alert_id": str(uuid.uuid4()),
                            "type": "travel_advisory",
                            "title": f"Travel advisory: {t.get('country', '')}",
                            "message": (
                                "Increased caution recommended for your upcoming trip. "
                                "Review State Dept advisories in Travel."
                            ),
                            "severity": "moderate",
                        })

        return {
            "alerts": alerts,
            "count": len(alerts),
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "settings": settings,
        }

    # ---------- Local Media (TV + Radio) ----------
    @router.get("/media")
    async def local_media(
        user_id: str = Depends(get_current_user_id),
        lat: Optional[float] = Query(None),
        lon: Optional[float] = Query(None),
    ):
        st = _state_from_coords(lat, lon)
        if st and st in LOCAL_MEDIA_DIRECTORY:
            data = LOCAL_MEDIA_DIRECTORY[st]
            return {
                "matched": True,
                "state": st,
                "tv": data.get("tv", []),
                "radio": data.get("radio", []),
                "source": "PLOS curated directory",
            }
        return {
            "matched": False,
            "state": st,
            "tv": NATIONAL_FALLBACK["tv"],
            "radio": NATIONAL_FALLBACK["radio"],
            "source": "National streams (no local directory for your coords)",
        }

    return router
