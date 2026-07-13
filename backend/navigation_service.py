"""
PLOS — Navigation Service (Phase 1)

Endpoints:
  GET  /api/navigation/places                    — list saved places for user
  POST /api/navigation/places                    — add/update saved place
  DELETE /api/navigation/places/{place_id}       — remove
  POST /api/navigation/route                     — generate route (mode → Google or OSRM)
  POST /api/navigation/compare                   — compare 4 modes side-by-side
  POST /api/navigation/history                   — log a navigation session
  GET  /api/navigation/history                   — recent nav sessions
  GET  /api/navigation/analytics                 — this-week miles + top destination
  POST /api/navigation/seed                      — idempotent seed of 6 preset places

Provider chain (per spec):
  driving  : Google → OSRM driving   → deep-link fallback
  walking  : Google → OSRM foot
  cycling  : OSRM cycling → Google bicycling
  transit  : Google only (else deep-link)
  hiking   : OSRM foot
  boat/mtn/truck/motorcycle : OSRM appropriate profile with disclaimer

Phase 2 TODO: Mapbox terrain routing, offline MBTiles, live traffic overlays,
Philippines coding-scheme alerts, EDSA re-router, family-shared live tracking.
"""
from __future__ import annotations

import os
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

GOOGLE_MAPS_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()
MAPBOX_API_KEY = os.getenv("MAPBOX_API_KEY", "").strip()  # Phase 2 placeholder — from mapbox.com/account (free 50k/mo)

logger = logging.getLogger(__name__)

OSRM_BASE = "https://router.project-osrm.org/route/v1"

# Modes → (provider_chain, osrm_profile, google_mode)
MODE_MAP: Dict[str, Dict[str, Any]] = {
    "driving":     {"chain": ["google", "osrm"], "osrm": "driving", "google": "driving"},
    "walking":     {"chain": ["google", "osrm"], "osrm": "foot",    "google": "walking"},
    "cycling":     {"chain": ["osrm", "google"], "osrm": "cycling", "google": "bicycling"},
    "transit":     {"chain": ["google"],         "osrm": None,      "google": "transit"},
    "hiking":      {"chain": ["osrm"],           "osrm": "foot",    "google": "walking"},
    "trail_run":   {"chain": ["osrm"],           "osrm": "foot",    "google": "walking"},
    "mountain":    {"chain": ["osrm"],           "osrm": "foot",    "google": "walking"},
    "boat":        {"chain": ["osrm"],           "osrm": "driving", "google": "driving"},
    "truck":       {"chain": ["osrm"],           "osrm": "driving", "google": "driving"},
    "motorcycle":  {"chain": ["google", "osrm"], "osrm": "driving", "google": "driving"},
    "train":       {"chain": ["google"],         "osrm": None,      "google": "transit"},
    "taxi":        {"chain": ["google", "osrm"], "osrm": "driving", "google": "driving"},
}

# Speed disclaimers for specialized modes
SPECIALIZED_DISCLAIMER = {
    "boat":       "Specialized marine routing — verify waterways are navigable for your vessel.",
    "truck":      "Specialized routing — verify height, weight, and length restrictions.",
    "mountain":   "Mountaineering routes are high risk. Ensure someone knows your route and expected return time.",
    "trail_run":  "Trail run route — verify current trail conditions.",
    "hiking":     "Hiking route — check current trail conditions before departure.",
}

# Preset saved places
PRESET_PLACES = [
    {"key": "home",           "name": "Home",                       "address": "6127 Ada St, Stone Mountain, GA 30083",                                "lat": 33.8073, "lng": -84.1700, "country": "US", "icon": "home",     "color": "#3B82F6"},
    {"key": "work",           "name": "Work",                       "address": "GSU Perimeter College, 555 N Indian Creek Dr, Clarkston, GA 30021",   "lat": 33.8110, "lng": -84.2536, "country": "US", "icon": "briefcase","color": "#10B981"},
    {"key": "eden_heights",   "name": "Eden Heights Sanctuary",     "address": "Bulacan, Philippines",                                                 "lat": 14.7942, "lng": 120.8784, "country": "PH", "icon": "leaf",     "color": "#22C55E"},
    {"key": "nato_hq",        "name": "NATO HQ Brussels",           "address": "Boulevard Léopold III, 1110 Brussels, Belgium",                       "lat": 50.8800, "lng": 4.4186,   "country": "BE", "icon": "shield",   "color": "#0EA5E9"},
    {"key": "adb_manila",     "name": "ADB Manila",                 "address": "6 ADB Avenue, Mandaluyong City, Metro Manila, Philippines",           "lat": 14.5832, "lng": 121.0559, "country": "PH", "icon": "building", "color": "#F59E0B"},
    {"key": "state_dept_dc",  "name": "US State Department",         "address": "2201 C St NW, Washington DC 20520",                                   "lat": 38.8948, "lng": -77.0484, "country": "US", "icon": "landmark", "color": "#8B5CF6"},
]

# ---------- models ----------
class LatLng(BaseModel):
    lat: float
    lng: float


class RouteRequest(BaseModel):
    origin: LatLng
    destination: LatLng
    mode: str = "driving"
    waypoints: Optional[List[LatLng]] = None
    avoid_tolls: bool = False
    avoid_highways: bool = False


class CompareRequest(BaseModel):
    origin: LatLng
    destination: LatLng


class SavedPlace(BaseModel):
    id: Optional[str] = None
    key: Optional[str] = None
    name: str
    address: Optional[str] = None
    lat: float
    lng: float
    country: Optional[str] = None
    icon: Optional[str] = "map-pin"
    color: Optional[str] = "#3B82F6"
    is_favorite: bool = False


class HistoryEntry(BaseModel):
    origin: LatLng
    destination: LatLng
    destination_name: Optional[str] = None
    transport_mode: str = "driving"
    planned_distance_km: Optional[float] = None
    planned_duration_minutes: Optional[float] = None
    country: Optional[str] = None
    map_provider_used: Optional[str] = None


# ---------- helpers ----------
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mps_to_kph(m: float) -> float:
    return round(m * 3.6, 1)


def _m_to_km(m: float) -> float:
    return round(m / 1000.0, 2)


def _m_to_miles(m: float) -> float:
    return round(m * 0.000621371, 2)


def _sec_to_minutes(s: float) -> float:
    return round(s / 60.0, 1)


async def _google_directions(origin: LatLng, destination: LatLng, mode: str,
                             waypoints: Optional[List[LatLng]] = None,
                             avoid_tolls: bool = False, avoid_highways: bool = False) -> Optional[Dict[str, Any]]:
    if not GOOGLE_MAPS_KEY:
        return None
    params = {
        "origin": f"{origin.lat},{origin.lng}",
        "destination": f"{destination.lat},{destination.lng}",
        "mode": mode,
        "departure_time": "now",
        "alternatives": "true",
        "key": GOOGLE_MAPS_KEY,
    }
    if mode == "driving":
        params["traffic_model"] = "best_guess"
    if waypoints:
        params["waypoints"] = "|".join(f"{w.lat},{w.lng}" for w in waypoints)
    avoids = []
    if avoid_tolls: avoids.append("tolls")
    if avoid_highways: avoids.append("highways")
    if avoids:
        params["avoid"] = "|".join(avoids)
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.get("https://maps.googleapis.com/maps/api/directions/json", params=params)
            data = r.json()
        status = data.get("status")
        if status != "OK":
            logger.info(f"[navigation] google returned {status}: {data.get('error_message','')}")
            return {"_error": status, "_error_message": data.get("error_message"), "_provider": "google"}
        routes = data.get("routes", [])
        if not routes:
            return None
        r0 = routes[0]
        legs = r0.get("legs", [])
        distance_m = sum(l["distance"]["value"] for l in legs)
        duration_s = sum(l.get("duration_in_traffic", l["duration"])["value"] for l in legs)
        steps = []
        for leg in legs:
            for s in leg.get("steps", []):
                steps.append({
                    "instruction": s.get("html_instructions", ""),
                    "distance_m": s["distance"]["value"],
                    "duration_s": s["duration"]["value"],
                    "maneuver": s.get("maneuver"),
                    "polyline": s.get("polyline", {}).get("points"),
                })
        return {
            "provider": "google",
            "distance_m": distance_m,
            "distance_km": _m_to_km(distance_m),
            "distance_miles": _m_to_miles(distance_m),
            "duration_s": duration_s,
            "duration_min": _sec_to_minutes(duration_s),
            "polyline": r0.get("overview_polyline", {}).get("points"),
            "steps": steps,
            "summary": r0.get("summary", ""),
            "warnings": r0.get("warnings", []),
            "alternatives": len(routes),
        }
    except Exception as e:
        logger.warning(f"[navigation] google error: {e}")
        return None


async def _osrm_route(origin: LatLng, destination: LatLng, profile: str = "driving") -> Optional[Dict[str, Any]]:
    coords = f"{origin.lng},{origin.lat};{destination.lng},{destination.lat}"
    url = f"{OSRM_BASE}/{profile}/{coords}"
    params = {"overview": "full", "geometries": "geojson", "steps": "true"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as c:
            r = await c.get(url, params=params)
            data = r.json()
        if data.get("code") != "Ok":
            return None
        route = data["routes"][0]
        return {
            "provider": "osrm",
            "distance_m": route["distance"],
            "distance_km": _m_to_km(route["distance"]),
            "distance_miles": _m_to_miles(route["distance"]),
            "duration_s": route["duration"],
            "duration_min": _sec_to_minutes(route["duration"]),
            "geometry_geojson": route.get("geometry"),
            "summary": profile,
            "steps": [],
        }
    except Exception as e:
        logger.warning(f"[navigation] osrm error: {e}")
        return None


async def _route_by_mode(req: RouteRequest) -> Dict[str, Any]:
    mode = req.mode
    cfg = MODE_MAP.get(mode) or MODE_MAP["driving"]
    last_err: Optional[str] = None
    for provider in cfg["chain"]:
        if provider == "google":
            res = await _google_directions(req.origin, req.destination, cfg["google"], req.waypoints,
                                           req.avoid_tolls, req.avoid_highways)
            if res and not res.get("_error"):
                res["mode"] = mode
                res["disclaimer"] = SPECIALIZED_DISCLAIMER.get(mode)
                return res
            if res and res.get("_error"):
                last_err = f"google:{res['_error']}"
        elif provider == "osrm":
            profile = cfg["osrm"] or "driving"
            res = await _osrm_route(req.origin, req.destination, profile)
            if res:
                res["mode"] = mode
                res["disclaimer"] = SPECIALIZED_DISCLAIMER.get(mode)
                return res
            last_err = "osrm:unreachable"
    # All providers failed → return deep-link fallback
    return {
        "provider": "fallback",
        "mode": mode,
        "error": last_err or "no_provider_available",
        "google_maps_link": f"https://www.google.com/maps/dir/?api=1&origin={req.origin.lat},{req.origin.lng}&destination={req.destination.lat},{req.destination.lng}&travelmode={cfg['google']}",
        "message": "Live routing unavailable — tap to open in Google Maps.",
    }


# ---------- Factory ----------
def make_navigation_router(db, get_current_user_id):
    router = APIRouter(prefix="/api/navigation", tags=["navigation"])

    async def _ensure_seeded():
        cnt = await db.navigation_places.count_documents({"key": {"$in": [p["key"] for p in PRESET_PLACES]}, "is_preset": True})
        if cnt >= len(PRESET_PLACES):
            return {"seeded": False, "count": cnt}
        for p in PRESET_PLACES:
            doc = {**p, "id": p["key"], "is_preset": True, "is_favorite": True,
                   "created_at": _now(), "user_id": None}  # global preset
            await db.navigation_places.update_one(
                {"key": p["key"], "is_preset": True},
                {"$setOnInsert": doc},
                upsert=True,
            )
        try:
            await db.navigation_places.create_index([("user_id", 1), ("key", 1)])
            await db.navigation_history.create_index([("user_id", 1), ("started_at", -1)])
        except Exception:
            pass
        return {"seeded": True, "count": len(PRESET_PLACES)}

    @router.post("/seed")
    async def seed(_user_id: str = Depends(get_current_user_id)):
        return await _ensure_seeded()

    # ---------- Places ----------
    @router.get("/places")
    async def list_places(user_id: str = Depends(get_current_user_id)):
        await _ensure_seeded()
        presets = [d async for d in db.navigation_places.find({"is_preset": True}, {"_id": 0})]
        user_places = [d async for d in db.navigation_places.find({"user_id": user_id, "is_preset": {"$ne": True}}, {"_id": 0})]
        return {
            "presets": presets,
            "user_places": user_places,
            "total": len(presets) + len(user_places),
        }

    @router.post("/places")
    async def add_place(body: SavedPlace, user_id: str = Depends(get_current_user_id)):
        pid = body.id or f"p-{uuid.uuid4()}"
        doc = {
            **body.model_dump(),
            "id": pid,
            "user_id": user_id,
            "is_preset": False,
            "created_at": _now(),
        }
        await db.navigation_places.update_one(
            {"id": pid, "user_id": user_id},
            {"$set": doc},
            upsert=True,
        )
        return {"ok": True, "id": pid}

    @router.delete("/places/{place_id}")
    async def delete_place(place_id: str, user_id: str = Depends(get_current_user_id)):
        res = await db.navigation_places.delete_one({"id": place_id, "user_id": user_id, "is_preset": {"$ne": True}})
        return {"ok": True, "removed": res.deleted_count}

    # ---------- Routing ----------
    @router.post("/route")
    async def route(body: RouteRequest, user_id: str = Depends(get_current_user_id)):
        result = await _route_by_mode(body)
        return result

    @router.post("/compare")
    async def compare(body: CompareRequest, user_id: str = Depends(get_current_user_id)):
        modes = ["driving", "walking", "cycling", "transit"]
        results: Dict[str, Any] = {}
        tasks = [_route_by_mode(RouteRequest(origin=body.origin, destination=body.destination, mode=m)) for m in modes]
        outs = await asyncio.gather(*tasks, return_exceptions=True)
        for m, o in zip(modes, outs):
            if isinstance(o, Exception):
                results[m] = {"error": str(o), "mode": m}
            else:
                results[m] = o
        return {
            "origin": body.model_dump()["origin"],
            "destination": body.model_dump()["destination"],
            "modes": results,
        }

    # ---------- History ----------
    @router.post("/history")
    async def log_history(body: HistoryEntry, user_id: str = Depends(get_current_user_id)):
        sid = str(uuid.uuid4())
        doc = {
            "id": sid,
            "user_id": user_id,
            "origin": body.origin.model_dump(),
            "destination": body.destination.model_dump(),
            "destination_name": body.destination_name,
            "transport_mode": body.transport_mode,
            "planned_distance_km": body.planned_distance_km,
            "planned_duration_minutes": body.planned_duration_minutes,
            "country": body.country,
            "map_provider_used": body.map_provider_used,
            "started_at": _now(),
        }
        await db.navigation_history.insert_one(doc)
        return {"ok": True, "id": sid}

    @router.get("/history")
    async def list_history(user_id: str = Depends(get_current_user_id), limit: int = 20):
        items = [d async for d in db.navigation_history.find({"user_id": user_id}, {"_id": 0}).sort("started_at", -1).limit(limit)]
        return {"history": items, "count": len(items)}

    # ---------- Analytics ----------
    @router.get("/analytics")
    async def analytics(user_id: str = Depends(get_current_user_id)):
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        total_km = 0.0
        counts: Dict[str, int] = {}
        top_dest: Dict[str, Dict[str, Any]] = {}
        async for d in db.navigation_history.find(
            {"user_id": user_id, "started_at": {"$gte": week_ago}},
            {"_id": 0, "planned_distance_km": 1, "transport_mode": 1, "destination_name": 1},
        ):
            total_km += float(d.get("planned_distance_km") or 0)
            m = d.get("transport_mode") or "driving"
            counts[m] = counts.get(m, 0) + 1
            name = d.get("destination_name") or "(unknown)"
            if name not in top_dest:
                top_dest[name] = {"name": name, "count": 0}
            top_dest[name]["count"] += 1
        top = sorted(top_dest.values(), key=lambda x: -x["count"])[:1]
        top_mode = max(counts.items(), key=lambda kv: kv[1])[0] if counts else None
        return {
            "week_km": round(total_km, 2),
            "week_miles": round(total_km * 0.621371, 2),
            "sessions": sum(counts.values()),
            "top_mode": top_mode,
            "top_destination": (top[0]["name"] if top else None),
        }

    return router
