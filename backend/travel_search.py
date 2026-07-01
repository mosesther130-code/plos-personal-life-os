"""PLOS Travel — AI Flight + Hotel search via Claude Sonnet 4.5.

Endpoints (all under /api/travel):
- POST /trips/{trip_id}/search         → run Claude search + cache
- GET  /trips/{trip_id}/search         → return cached search + freshness
- POST /trips/{trip_id}/save-to-budget → creates an expense in Financial

The Claude call returns a single JSON with `flights[3]` + `hotels[3]` + a
`trip_cost_summary`. Cached under trips.search_results with searched_at.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are an expert travel search agent with comprehensive knowledge of "
    "airline routes, pricing patterns, hotel neighborhoods, booking platforms, "
    "and travel deals as of 2026. When given a trip request, identify the three "
    "best flight options (Cheapest, Fastest, Best Value) and the three best "
    "hotel options (Cheapest, Best Location, Best Value). Return complete "
    "booking details including specific booking URLs. Prioritize direct booking "
    "links on the provider's own website when available. For US travelers from "
    "Atlanta Hartsfield-Jackson (ATL), factor in ATL's Delta/American/United "
    "hub connections. For Philippines routes, factor in Seoul (ICN), Tokyo "
    "(NRT/HND), Los Angeles (LAX), San Francisco (SFO), and Hong Kong (HKG) as "
    "primary hub options. For hotels in the Philippines, always include Agoda as "
    "the top booking platform since it has the strongest Southeast Asia inventory."
)


class SearchBody(BaseModel):
    force: bool = False  # override 6-hour freshness gate


class SaveToBudgetBody(BaseModel):
    total_usd: float
    label: Optional[str] = None


def _extract_json(raw: str) -> Dict[str, Any]:
    if not raw:
        return {}
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if m:
        raw = m.group(1)
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        return {}
    try:
        return json.loads(raw[start : end + 1])
    except Exception as exc:
        logger.warning("Travel JSON parse failed: %s", exc)
        return {}


def _build_prompt(trip: Dict[str, Any]) -> str:
    dest = trip.get("destination") or "Manila"
    country = trip.get("country") or ""
    departure_city = trip.get("origin") or "Atlanta, GA (ATL)"
    dep_date = trip.get("departure_date") or trip.get("start_date") or ""
    ret_date = trip.get("return_date") or trip.get("end_date") or ""
    travelers = trip.get("travelers") or trip.get("guests") or 1
    purpose = trip.get("purpose") or trip.get("trip_purpose") or "leisure"
    cabin = trip.get("cabin_class") or "Economy"
    budget = trip.get("budget_preference") or "Mid-range"

    # Number of nights
    nights = trip.get("nights")
    if not nights and dep_date and ret_date:
        try:
            d1 = datetime.fromisoformat(dep_date[:10])
            d2 = datetime.fromisoformat(ret_date[:10])
            nights = max(1, (d2 - d1).days)
        except Exception:
            nights = 5

    return f"""Find flights AND hotels for this trip in a single JSON response.

Trip:
- Departure airport/city: {departure_city} (default ATL if unclear)
- Destination: {dest}{f', {country}' if country else ''}
- Outbound date: {dep_date}
- Return date: {ret_date} (or one-way if not specified)
- Number of travelers/guests: {travelers}
- Trip purpose: {purpose}
- Cabin class: {cabin}
- Budget preference: {budget}
- Nights: {nights}

Respond with ONE JSON object matching exactly this schema (no prose,
no code fences):

{{
  "flights": [
    {{
      "category": "Cheapest" | "Fastest" | "Best Value",
      "category_icon": "💰" | "⚡" | "⭐",
      "category_color": "#16A34A" | "#3B82F6" | "#A855F7",
      "airline": "…", "airline_code": "…" (2-letter IATA),
      "flight_numbers": ["…"],
      "departure_airport": "ATL", "departure_time": "11:30 PM",
      "arrival_airport": "MNL", "arrival_time": "06:45 AM+2",
      "stops": 0 | 1 | 2, "layover_airports": ["ICN"],
      "layover_durations": ["2h 15m"],
      "total_duration": "22h 45m",
      "price_per_person_usd": 687, "total_price_usd": 687,
      "includes_checked_bag": false, "carry_on_included": true,
      "refundable": false,
      "booking_url_airline": "https://…",
      "why_recommended": "one sentence explanation",
      "deal_score": 0-100
    }},
    …3 items total
  ],
  "hotels": [
    {{
      "category": "Cheapest" | "Best Location" | "Best Value",
      "category_icon": "💰" | "📍" | "⭐",
      "category_color": "#16A34A" | "#3B82F6" | "#A855F7",
      "hotel_name": "…", "star_rating": 3,
      "neighborhood": "Ermita, Manila",
      "distance_from_center_km": 1.2, "distance_from_airport_km": 12.5,
      "price_per_night_usd": 38, "total_price_usd": 190,
      "number_of_nights": {nights},
      "breakfast_included": false, "free_wifi": true, "free_parking": false,
      "pool": false, "fitness_center": false, "airport_shuttle": false,
      "rating_score": 7.8, "rating_label": "Good", "review_count": 1243,
      "highlights": ["…", "…", "…"],
      "booking_url_hotel_direct": "https://…",
      "why_recommended": "one sentence", "deal_score": 0-100,
      "ideal_for": "one-line audience description"
    }},
    …3 items total
  ],
  "trip_cost_summary": {{
    "cheapest_total_usd": 877,
    "best_value_total_usd": 1150,
    "ai_recommendation": {{
      "flight_category": "Best Value", "hotel_category": "Best Value",
      "total_usd": 1150, "reasoning": "one-sentence explanation"
    }}
  }},
  "philippines_note": "…" (ONLY set when destination country is Philippines;
    otherwise ""),
  "deals_intelligence": {
    "mistake_fare_alert":     {"show": true|false, "message": "…"},
    "best_booking_window":    {"show": true|false, "message": "…"},
    "flexible_dates_savings": {"show": true|false, "message": "…"},
    "bundle_opportunity":     {"show": true|false, "message": "…"},
    "asia_rate_alert":        {"show": true|false, "message": "…"}
  },
  "bundle_savings_estimate_usd": 50-200 integer,
  "pro_tips": ["short route-specific tip 1", "…", … 4-6 items]
}}

Rules:
- Do NOT include booking_url_google_flights, booking_url_kayak, etc. — I
  will construct those URLs deterministically from trip dates.
- deal_score 0-100 reflects value-for-money relative to typical prices on
  this route.
- All prices in USD.
- All dates you reference in URLs must be in YYYY-MM-DD format.
"""


# --- Deterministic booking URL constructors (all 15 platforms) ------------
ASIAN_COUNTRIES = {
    "philippines", "ph", "thailand", "th", "vietnam", "vn", "indonesia", "id",
    "south korea", "korea", "kr", "japan", "jp", "singapore", "sg",
    "malaysia", "my", "cambodia", "kh", "laos", "la", "taiwan", "tw",
    "hong kong", "hk", "macau", "china", "cn",
}


def _is_asian(country: str, destination: str = "") -> bool:
    c = (country or "").lower().strip()
    d = (destination or "").lower()
    if c in ASIAN_COUNTRIES:
        return True
    return any(k in d for k in ("manila", "bulacan", "cebu", "davao", "bangkok",
                                 "seoul", "tokyo", "singapore", "kuala lumpur",
                                 "ho chi minh", "hanoi", "jakarta", "bali"))


def _flight_urls(flight: Dict[str, Any], trip: Dict[str, Any]) -> Dict[str, str]:
    origin = flight.get("departure_airport") or "ATL"
    dest = flight.get("arrival_airport") or "MNL"
    dep = (trip.get("departure_date") or trip.get("start_date") or "")[:10]
    ret = (trip.get("return_date") or trip.get("end_date") or "")[:10]
    origin_city = (trip.get("origin_city") or "atlanta").lower().replace(" ", "-")
    is_oneway = not ret
    urls: Dict[str, str] = {}
    # Google Flights
    if is_oneway:
        urls["google_flights"] = (
            f"https://www.google.com/flights?hl=en#flt={origin}.{dest}.{dep};c:USD;e:1;sd:1;t:f"
        )
    else:
        urls["google_flights"] = (
            f"https://www.google.com/flights?hl=en#flt={origin}.{dest}.{dep}*"
            f"{dest}.{origin}.{ret};c:USD;e:1;sd:1;t:f"
        )
    # Skyscanner
    if is_oneway:
        urls["skyscanner"] = (
            f"https://www.skyscanner.com/transport/flights/{origin.lower()}/"
            f"{dest.lower()}/{dep}/?adults=1&currency=USD&locale=en-US"
        )
    else:
        urls["skyscanner"] = (
            f"https://www.skyscanner.com/transport/flights/{origin.lower()}/"
            f"{dest.lower()}/{dep}/{ret}/?adults=1&currency=USD&locale=en-US"
        )
    urls["skyscanner_everywhere"] = (
        f"https://www.skyscanner.com/transport/flights/{origin.lower()}/anywhere/"
        f"{dep}/{ret}/?adults=1&currency=USD" if not is_oneway else
        f"https://www.skyscanner.com/transport/flights/{origin.lower()}/anywhere/"
        f"{dep}/?adults=1&currency=USD"
    )
    urls["skyscanner_cheapest_month"] = (
        f"https://www.skyscanner.com/transport/flights/{origin.lower()}/"
        f"{dest.lower()}/?adults=1&currency=USD&locale=en-US&market=US"
    )
    # Kayak
    if is_oneway:
        urls["kayak"] = (
            f"https://www.kayak.com/flights/{origin}-{dest}/{dep}/1adults?sort=bestflight_a"
        )
    else:
        urls["kayak"] = (
            f"https://www.kayak.com/flights/{origin}-{dest}/{dep}/{ret}/1adults?sort=bestflight_a"
        )
    urls["kayak_flexible"] = (
        f"https://www.kayak.com/flights/{origin}-{dest}/{dep}/{ret}/1adults"
        f"?flexibility=3&sort=price_a"
    ) if not is_oneway else urls["kayak"]
    # Momondo
    urls["momondo"] = (
        f"https://www.momondo.com/flight-search/{origin}-{dest}/{dep}/{ret}?adults=1&currency=USD"
        if not is_oneway else
        f"https://www.momondo.com/flight-search/{origin}-{dest}/{dep}?adults=1&currency=USD&tripType=oneway"
    )
    # Expedia
    urls["expedia"] = (
        f"https://www.expedia.com/Flights-Search?trip=roundtrip"
        f"&leg1=from%3A{origin}%2Cto%3A{dest}%2Cdeparture%3A{dep}%40dateType%3Dspecific"
        f"&leg2=from%3A{dest}%2Cto%3A{origin}%2Cdeparture%3A{ret}%40dateType%3Dspecific"
        f"&passengers=adults%3A1%2Cchildren%3A0%2Cinfantsinlap%3A0"
        f"&options=cabinclass%3Aeconomy&mode=search"
    )
    # Priceline
    urls["priceline"] = (
        f"https://www.priceline.com/fly/search/{origin}/{dest}/{dep}/{ret}?adults=1"
    )
    # Going (was Scott's Cheap Flights)
    urls["going"] = (
        f"https://www.going.com/flights?origin={origin}&destination={dest}"
    )
    # Secret Flying
    urls["secret_flying"] = (
        f"https://www.secretflying.com/posts/?origin={origin_city}"
    )
    return urls


def _hotel_urls(trip: Dict[str, Any]) -> Dict[str, str]:
    dep = (trip.get("departure_date") or trip.get("start_date") or "")[:10]
    ret = (trip.get("return_date") or trip.get("end_date") or dep)[:10]
    dest = (trip.get("destination") or "Manila").replace(" ", "+")
    country = (trip.get("country") or "Philippines").replace(" ", "+")
    nights = trip.get("nights") or 5
    try:
        if not trip.get("nights") and dep and ret:
            nights = max(1, (datetime.fromisoformat(ret) - datetime.fromisoformat(dep)).days)
    except Exception:
        pass
    return {
        "booking_com": (
            f"https://www.booking.com/searchresults.html?ss={dest}%2C+{country}"
            f"&checkin={dep}&checkout={ret}&group_adults=1&no_rooms=1&order=price"
        ),
        "hotels_com": (
            f"https://www.hotels.com/search.do?destination={dest}"
            f"&startDate={dep}&endDate={ret}&adults=1&sort=PRICE_LOW_TO_HIGH"
        ),
        "kayak": f"https://www.kayak.com/hotels/{dest}/{dep}/{ret}/1adults?sort=price_a",
        "kayak_pricebreakers": (
            f"https://www.kayak.com/hotels/{dest}/{dep}/{ret}/1adults"
            f"?fs=dealType=PRICEBREAKER"
        ),
        "hoteltonight": f"https://www.hoteltonight.com/s/{dest}",
        "priceline": (
            f"https://www.priceline.com/relax/at/{dest}/from/{dep}/to/{ret}/rooms/1/guests/1"
        ),
        "priceline_express": (
            f"https://www.priceline.com/relax/at/{dest}/from/{dep}/to/{ret}"
            f"/rooms/1/guests/1?dealType=EXPRESS"
        ),
        "expedia": (
            f"https://www.expedia.com/Hotel-Search?destination={dest}"
            f"&startDate={dep}&endDate={ret}&adults=1&sort=PRICE_LOW_TO_HIGH"
        ),
        "agoda": (
            f"https://www.agoda.com/search?city={dest}&checkIn={dep}"
            f"&checkOut={ret}&rooms=1&adults=1&children=0&los={nights}"
            f"&currency=USD&sort=priceLowToHigh&cid=1844104"
        ),
        "airbnb": (
            f"https://www.airbnb.com/s/{dest}--{country}/homes?"
            f"checkin={dep}&checkout={ret}&adults=1&price_max=150"
        ),
    }


def _bundle_urls(trip: Dict[str, Any]) -> Dict[str, str]:
    dep = (trip.get("departure_date") or trip.get("start_date") or "")[:10]
    ret = (trip.get("return_date") or trip.get("end_date") or dep)[:10]
    dest_city = (trip.get("destination") or "Manila").replace(" ", "+")
    # Flight origin/dest airports (best-effort — fall back to city name if missing)
    origin = "ATL"
    dest = "MNL"
    return {
        "expedia": (
            f"https://www.expedia.com/packages/fly-drive?origin={origin}"
            f"&destination={dest}&startDate={dep}&endDate={ret}&adults=1"
        ),
        "orbitz": (
            f"https://www.orbitz.com/packages/fly-drive?origin={origin}"
            f"&destination={dest}&startDate={dep}&endDate={ret}&adults=1"
        ),
        "travelocity": (
            f"https://www.travelocity.com/packages?origin={origin}"
            f"&destination={dest}&startDate={dep}&endDate={ret}&adults=1"
        ),
        "travelzoo": (
            f"https://www.travelzoo.com/travel-deals/?destination={dest_city}"
        ),
        "priceline": (
            f"https://www.priceline.com/packages?origin={origin}"
            f"&destination={dest}&startDate={dep}&endDate={ret}&adults=1"
        ),
    }


def _enrich(result: Dict[str, Any], trip: Dict[str, Any]) -> Dict[str, Any]:
    dep = (trip.get("departure_date") or trip.get("start_date") or "")[:10]
    ret = (trip.get("return_date") or trip.get("end_date") or dep)[:10]
    dest_city = trip.get("destination") or "Manila"
    country = (trip.get("country") or "").lower()
    is_asian = _is_asian(country, dest_city)
    is_philippines = "philippines" in country or country == "ph"

    # Flights: attach ALL 8 platform URLs to each flight card
    for f in result.get("flights", []) or []:
        f.update(_flight_urls(f, trip))

    # Hotels: attach ALL 9 platform URLs to each hotel card
    hotel_urls = _hotel_urls(trip)
    for h in result.get("hotels", []) or []:
        h["booking_url_booking_com"] = hotel_urls["booking_com"]
        h["booking_url_hotels_com"] = hotel_urls["hotels_com"]
        h["booking_url_kayak"] = hotel_urls["kayak"]
        h["booking_url_kayak_pricebreakers"] = hotel_urls["kayak_pricebreakers"]
        h["booking_url_hoteltonight"] = hotel_urls["hoteltonight"]
        h["booking_url_priceline"] = hotel_urls["priceline"]
        h["booking_url_priceline_express"] = hotel_urls["priceline_express"]
        h["booking_url_expedia"] = hotel_urls["expedia"]
        h["booking_url_agoda"] = hotel_urls["agoda"]
        h["booking_url_airbnb"] = hotel_urls["airbnb"]

    # Nights
    try:
        nights = max(1, (datetime.fromisoformat(ret) - datetime.fromisoformat(dep)).days)
    except Exception:
        nights = trip.get("nights") or 5

    result["bundles"] = _bundle_urls(trip)
    result["extras"] = {
        "airbnb_url": hotel_urls["airbnb"],
        "philippines_mode": is_philippines,
        "asian_mode": is_asian,
        "nights": nights,
        "long_stay": nights >= 7,
        "monthly_stay": nights >= 28,
        "bulacan_note": (
            "Pro tip: For Bulacan accommodation, search hotels in Malolos or "
            "San Jose del Monte rather than Manila — closer to Eden Heights "
            "and significantly cheaper. Also consider Airbnb private homes in "
            "Bulacan province."
        ) if is_philippines else None,
        "airbnb_long_stay_note": (
            "Airbnb offers automatic monthly discounts of 20-50% for stays "
            "over 28 nights — ideal for extended Eden Heights development trips."
        ) if nights >= 28 else (
            "For stays of 7+ nights, compare Airbnb's weekly rates — often "
            "20-30% less than nightly × 7."
        ) if nights >= 7 else None,
    }
    return result


def make_router(db, get_current_user_id, emergent_llm_key, llm_chat_cls, user_msg_cls):
    async def call_claude(session_id: str, prompt: str) -> str:
        chat = llm_chat_cls(
            api_key=emergent_llm_key, session_id=session_id, system_message=SYSTEM_PROMPT,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        resp = await chat.send_message(user_msg_cls(text=prompt))
        return resp if isinstance(resp, str) else str(resp)

    r = APIRouter(prefix="/api/travel/trips", tags=["travel-search"])

    async def _run_and_cache(trip: Dict[str, Any]) -> Dict[str, Any]:
        prompt = _build_prompt(trip)
        session = f"trip-search-{trip['trip_id']}-{uuid.uuid4().hex[:8]}"
        raw = await call_claude(session, prompt)
        parsed = _extract_json(raw)
        if not parsed or "flights" not in parsed:
            raise HTTPException(502, "Search failed — Claude returned no parseable JSON")
        enriched = _enrich(parsed, trip)
        now = datetime.now(timezone.utc).isoformat()
        await db.trips.update_one(
            {"trip_id": trip["trip_id"], "user_id": trip["user_id"]},
            {"$set": {"search_results": enriched, "searched_at": now}},
        )
        enriched["searched_at"] = now
        return enriched

    @r.post("/{trip_id}/search")
    async def run_search(
        trip_id: str,
        body: Optional[SearchBody] = None,
        user_id: str = Depends(get_current_user_id),
    ):
        trip = await db.trips.find_one({"trip_id": trip_id, "user_id": user_id}, {"_id": 0})
        if not trip:
            raise HTTPException(404, "Trip not found")
        return await _run_and_cache(trip)

    @r.get("/{trip_id}/search")
    async def get_search(
        trip_id: str, user_id: str = Depends(get_current_user_id)
    ):
        trip = await db.trips.find_one({"trip_id": trip_id, "user_id": user_id}, {"_id": 0})
        if not trip:
            raise HTTPException(404, "Trip not found")
        cached = trip.get("search_results")
        searched_at = trip.get("searched_at")
        stale = True
        if searched_at:
            try:
                delta = datetime.now(timezone.utc) - datetime.fromisoformat(searched_at.replace("Z", "+00:00"))
                stale = delta.total_seconds() > 6 * 3600
            except Exception:
                stale = True
        return {
            "results": cached,
            "searched_at": searched_at,
            "stale": stale,
            "has_results": bool(cached),
        }

    @r.post("/{trip_id}/save-to-budget")
    async def save_to_budget(
        trip_id: str,
        body: SaveToBudgetBody,
        user_id: str = Depends(get_current_user_id),
    ):
        trip = await db.trips.find_one({"trip_id": trip_id, "user_id": user_id}, {"_id": 0})
        if not trip:
            raise HTTPException(404, "Trip not found")
        label = body.label or f"Trip: {trip.get('destination', 'Unknown')}"
        now = datetime.now(timezone.utc).isoformat()
        expense_doc = {
            "expense_id": f"exp_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "category": "Travel",
            "label": label,
            "amount_usd": float(body.total_usd),
            "target_date": trip.get("departure_date") or trip.get("start_date"),
            "source": "travel_planner",
            "trip_id": trip_id,
            "status": "planned",
            "created_at": now,
        }
        await db.planned_expenses.insert_one(expense_doc)
        return {"ok": True, "expense_id": expense_doc["expense_id"]}

    return r
