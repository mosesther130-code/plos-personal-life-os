"""PLOS Integrations — Google Maps, ExchangeRate-API, OpenWeatherMap.

Follows the verified integration playbook. All keys live in env; clients call
backend proxy endpoints. In-memory TTL caches with Mongo fallback. Alerts are
written to the `alerts` Mongo collection (Supabase mirror deferred until user
provides a service role key + runs SQL migrations).
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
EXCHANGE_RATE_API_KEY = os.getenv("EXCHANGE_RATE_API_KEY", "")
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")

CURRENCIES = ["USD", "PHP", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "INR", "BRL", "MXN", "KRW"]
DEFAULT_LAT = 33.749
DEFAULT_LON = -84.388

_cur_cache: Dict[str, Dict[str, Any]] = {}
_wx_cache: Dict[str, Dict[str, Any]] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _publish_alert(db, user_id: str, type_: str, title: str, message: str, severity: str = "warning"):
    doc = {
        "alert_id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": type_,
        "title": title,
        "message": message,
        "severity": severity,
        "created_at": _now().isoformat(),
        "read": False,
    }
    try:
        # Deduplicate within last 6 hours
        cutoff = (_now() - timedelta(hours=6)).isoformat()
        existing = await db.alerts.find_one({
            "user_id": user_id,
            "type": type_,
            "message": message,
            "created_at": {"$gt": cutoff},
        })
        if existing:
            return
        await db.alerts.insert_one(doc)
    except Exception:
        pass


class NearbyPlace(BaseModel):
    name: str
    place_id: str
    lat: float
    lon: float
    address: Optional[str] = None
    rating: Optional[float] = None


def make_router(db, get_current_user_id):
    router = APIRouter(prefix="/api", tags=["integrations"])

    # ===================== Google Maps =====================
    @router.get("/maps/nearby")
    async def maps_nearby(
        lat: float = DEFAULT_LAT,
        lon: float = DEFAULT_LON,
        type: str = "restaurant",
        radius: int = 1500,
        user_id: str = Depends(get_current_user_id),
    ):
        if not GOOGLE_MAPS_API_KEY:
            raise HTTPException(503, "Google Maps not configured")
        url = "https://places.googleapis.com/v1/places:searchNearby"
        body = {
            "includedTypes": [type] if type else [],
            "maxResultCount": 15,
            "locationRestriction": {
                "circle": {"center": {"latitude": lat, "longitude": lon}, "radius": float(radius)}
            },
        }
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask": "places.displayName,places.id,places.location,places.formattedAddress,places.rating",
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.post(url, json=body, headers=headers)
                r.raise_for_status()
                data = r.json()
        except httpx.HTTPError as e:
            raise HTTPException(502, f"Maps nearby failed: {e}")
        out = []
        for p in data.get("places", []) or []:
            loc = p.get("location") or {}
            out.append({
                "name": (p.get("displayName") or {}).get("text", ""),
                "place_id": p.get("id", ""),
                "lat": loc.get("latitude", 0.0),
                "lon": loc.get("longitude", 0.0),
                "address": p.get("formattedAddress"),
                "rating": p.get("rating"),
            })
        return {"places": out, "count": len(out), "center": {"lat": lat, "lon": lon}}

    @router.get("/maps/directions")
    async def maps_directions(
        origin: str,
        destination: str,
        mode: str = "driving",
        user_id: str = Depends(get_current_user_id),
    ):
        if not GOOGLE_MAPS_API_KEY:
            raise HTTPException(503, "Google Maps not configured")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    "https://maps.googleapis.com/maps/api/directions/json",
                    params={"origin": origin, "destination": destination, "mode": mode, "key": GOOGLE_MAPS_API_KEY},
                )
                r.raise_for_status()
                data = r.json()
        except httpx.HTTPError as e:
            raise HTTPException(502, f"Maps directions failed: {e}")
        if data.get("status") != "OK":
            return {"status": data.get("status"), "error_message": data.get("error_message"), "routes": []}
        routes = []
        for rt in data.get("routes", []):
            legs = rt.get("legs", [{}])
            leg0 = legs[0] if legs else {}
            routes.append({
                "summary": rt.get("summary"),
                "distance_text": (leg0.get("distance") or {}).get("text"),
                "duration_text": (leg0.get("duration") or {}).get("text"),
                "start_address": leg0.get("start_address"),
                "end_address": leg0.get("end_address"),
            })
        return {"status": "OK", "routes": routes}

    @router.get("/maps/geocode")
    async def maps_geocode(address: str, user_id: str = Depends(get_current_user_id)):
        if not GOOGLE_MAPS_API_KEY:
            raise HTTPException(503, "Google Maps not configured")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    "https://maps.googleapis.com/maps/api/geocode/json",
                    params={"address": address, "key": GOOGLE_MAPS_API_KEY},
                )
                r.raise_for_status()
                data = r.json()
        except httpx.HTTPError as e:
            raise HTTPException(502, f"Geocode failed: {e}")
        out = []
        for res in data.get("results", []):
            loc = (res.get("geometry") or {}).get("location") or {}
            out.append({
                "formatted_address": res.get("formatted_address", ""),
                "lat": loc.get("lat", 0.0),
                "lon": loc.get("lng", 0.0),
            })
        return {"results": out}

    # ===================== ExchangeRate-API =====================
    @router.get("/exchange/rates")
    async def exchange_rates(user_id: str = Depends(get_current_user_id)):
        """Live USD-base rates with 60-min TTL cache + Mongo fallback.
        Publishes a `currency` alert when USD/PHP > 58.00.
        """
        key = "USD_latest"
        now = _now()
        cached = _cur_cache.get(key)
        if cached and (now - cached["updated_at"]) < timedelta(minutes=60):
            await _maybe_currency_alert(db, user_id, cached["rates"])
            return {"base": "USD", "rates": cached["rates"], "updated_at": cached["updated_at"].isoformat(), "source": "memory"}
        # Mongo fallback
        doc = await db.currency_cache.find_one({"base": "USD"})
        if doc:
            updated_at = doc.get("updated_at")
            if isinstance(updated_at, str):
                try:
                    updated_at = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
                except Exception:
                    updated_at = None
            if updated_at and (now - updated_at) < timedelta(minutes=60):
                _cur_cache[key] = {"rates": doc["rates"], "updated_at": updated_at}
                await _maybe_currency_alert(db, user_id, doc["rates"])
                return {"base": "USD", "rates": doc["rates"], "updated_at": updated_at.isoformat(), "source": "db"}
        # Fetch fresh
        if not EXCHANGE_RATE_API_KEY:
            raise HTTPException(503, "ExchangeRate-API not configured")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(f"https://v6.exchangerate-api.com/v6/{EXCHANGE_RATE_API_KEY}/latest/USD")
                r.raise_for_status()
                data = r.json()
        except httpx.HTTPError as e:
            # Final fallback: return stale data if any
            if doc:
                return {"base": "USD", "rates": doc["rates"], "updated_at": doc.get("updated_at"), "source": "stale", "warning": str(e)}
            raise HTTPException(502, f"ExchangeRate-API failed: {e}")
        if data.get("result") != "success":
            raise HTTPException(502, f"ExchangeRate-API error: {data.get('error-type', 'unknown')}")
        conv = data.get("conversion_rates", {})
        rates = {c: float(conv[c]) for c in CURRENCIES if c in conv}
        _cur_cache[key] = {"rates": rates, "updated_at": now}
        await db.currency_cache.update_one(
            {"base": "USD"},
            {"$set": {"base": "USD", "rates": rates, "updated_at": now.isoformat()}},
            upsert=True,
        )
        await _maybe_currency_alert(db, user_id, rates)
        return {"base": "USD", "rates": rates, "updated_at": now.isoformat(), "source": "live"}

    async def _maybe_currency_alert(db, user_id: str, rates: Dict[str, float]):
        php = rates.get("PHP")
        if php and php > 58.0:
            await _publish_alert(
                db, user_id, "currency",
                "USD/PHP rate alert",
                f"USD→PHP is {php:.2f} (above 58.00 threshold). Consider remittances.",
                "warning",
            )

    # ===================== OpenWeatherMap =====================
    @router.get("/weather/live")
    async def weather_live(
        lat: float = DEFAULT_LAT,
        lon: float = DEFAULT_LON,
        user_id: str = Depends(get_current_user_id),
    ):
        """Current weather with 30-min TTL cache + Mongo fallback.
        Publishes alerts on severe weather or heat advisory >95°F.
        """
        key = f"{round(lat,3)}:{round(lon,3)}"
        now = _now()
        cached = _wx_cache.get(key)
        if cached and (now - cached["updated_at"]) < timedelta(minutes=30):
            await _maybe_weather_alert(db, user_id, cached["data"])
            return {**cached["data"], "source": "memory"}
        doc = await db.weather_cache.find_one({"key": key})
        if doc:
            updated_at = doc.get("updated_at")
            if isinstance(updated_at, str):
                try:
                    updated_at = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
                except Exception:
                    updated_at = None
            if updated_at and (now - updated_at) < timedelta(minutes=30):
                _wx_cache[key] = {"data": doc["data"], "updated_at": updated_at}
                await _maybe_weather_alert(db, user_id, doc["data"])
                return {**doc["data"], "source": "db"}
        if not OPENWEATHER_API_KEY:
            raise HTTPException(503, "OpenWeatherMap not configured")
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    "https://api.openweathermap.org/data/2.5/weather",
                    params={"lat": lat, "lon": lon, "units": "imperial", "appid": OPENWEATHER_API_KEY},
                )
                r.raise_for_status()
                raw = r.json()
        except httpx.HTTPError as e:
            if doc:
                return {**doc["data"], "source": "stale", "warning": str(e)}
            raise HTTPException(502, f"OpenWeatherMap failed: {e}")
        main = raw.get("main", {})
        wind = raw.get("wind", {})
        wx_list = raw.get("weather") or []
        wx0 = wx_list[0] if wx_list else {}
        data = {
            "lat": lat, "lon": lon,
            "temperature_f": main.get("temp", 0.0),
            "feels_like_f": main.get("feels_like", 0.0),
            "humidity": main.get("humidity", 0),
            "wind_mph": wind.get("speed", 0.0),
            "condition": wx0.get("main", ""),
            "description": wx0.get("description", ""),
            "icon": wx0.get("icon", ""),
            "city": raw.get("name", ""),
            "updated_at": now.isoformat(),
        }
        _wx_cache[key] = {"data": data, "updated_at": now}
        await db.weather_cache.update_one(
            {"key": key},
            {"$set": {"key": key, "data": data, "updated_at": now.isoformat()}},
            upsert=True,
        )
        await _maybe_weather_alert(db, user_id, data)
        return {**data, "source": "live"}

    async def _maybe_weather_alert(db, user_id: str, data: Dict[str, Any]):
        temp = data.get("temperature_f", 0)
        cond = data.get("condition", "")
        if temp > 95:
            await _publish_alert(db, user_id, "weather",
                "Heat advisory", f"Current temperature is {temp:.0f}°F. Stay hydrated and limit outdoor exposure.", "warning")
        if cond in {"Thunderstorm", "Tornado", "Extreme", "Squall", "Hurricane"}:
            await _publish_alert(db, user_id, "weather",
                f"Severe weather: {cond}", data.get("description", "") or "Severe weather detected near you.", "critical")

    # ===================== Alerts =====================
    @router.get("/alerts/inbox")
    async def list_alerts(user_id: str = Depends(get_current_user_id), unread_only: bool = False):
        q: Dict[str, Any] = {"user_id": user_id}
        if unread_only:
            q["read"] = False
        items = []
        async for d in db.alerts.find(q).sort("created_at", -1).limit(50):
            d.pop("_id", None)
            d.pop("user_id", None)
            items.append(d)
        return {"alerts": items, "count": len(items)}

    @router.post("/alerts/inbox/{alert_id}/read")
    async def mark_alert_read(alert_id: str, user_id: str = Depends(get_current_user_id)):
        r = await db.alerts.update_one({"user_id": user_id, "alert_id": alert_id}, {"$set": {"read": True}})
        if r.matched_count == 0:
            raise HTTPException(404, "Alert not found")
        return {"ok": True}

    @router.delete("/alerts/inbox/{alert_id}")
    async def delete_alert(alert_id: str, user_id: str = Depends(get_current_user_id)):
        await db.alerts.delete_one({"user_id": user_id, "alert_id": alert_id})
        return {"ok": True}

    return router
