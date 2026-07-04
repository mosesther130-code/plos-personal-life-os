"""PLOS Travel — LIVE search via SerpApi (Google Flights + Hotels) + universal deep-links.

Design goals per user spec:
- Real prices only (never AI-estimated). SerpApi returns live Google Flights /
  Google Hotels data in 3-8s per call.
- Cache in `travel_live_cache` collection keyed by
  `{trip_id}|{origin}|{destination}|{dep}|{ret}|{travelers}|{cabin}|{type}`.
- Staleness: <2h Live · 2-24h yellow warn · >24h auto-refetch on GET.
- Deep-links to 20+ platforms work with or without SerpApi.
- Philippines auto-boost: Cebu Pacific, Philippine Airlines, Agoda-first,
  Traveloka, Bulacan/Airbnb note.
- Error logging into `ai_usage_log` collection (platform=serpapi).

Endpoints (mounted at /api/travel):
- POST /trips/{trip_id}/search-live?refresh=false  → run/return cached
- GET  /trips/{trip_id}/search-live?refresh=false  → same as POST (idempotent-ish)
- GET  /trips/{trip_id}/deep-links                 → all platform pre-filled URLs
- GET  /serpapi-status                             → key present + last error
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import urllib.parse
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

SERPAPI_ENDPOINT = "https://serpapi.com/search.json"
SERPAPI_TIMEOUT = 20.0  # seconds
FRESH_HOURS = 2
STALE_HOURS = 24
CABIN_MAP = {"economy": 1, "premium_economy": 2, "business": 3, "first": 4}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _kv(url: str, params: Dict[str, Any]) -> str:
    clean = {k: v for k, v in params.items() if v not in (None, "")}
    return f"{url}?{urllib.parse.urlencode(clean, safe=':/,+')}"


def _slug(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "-", (s or "").strip()).strip("-").lower()


def _yymmdd(iso_date: str) -> str:
    try:
        d = datetime.fromisoformat(iso_date)
        return d.strftime("%y%m%d")
    except Exception:
        return ""


def _nights(check_in: str, check_out: str) -> int:
    try:
        a = datetime.fromisoformat(check_in)
        b = datetime.fromisoformat(check_out)
        return max(0, (b - a).days)
    except Exception:
        return 0


CITY_TO_IATA = {
    "MANILA": "MNL", "CEBU": "CEB", "DAVAO": "DVO", "CLARK": "CRK",
    "PUERTO PRINCESA": "PPS", "BORACAY": "MPH", "KALIBO": "KLO",
    "ILOILO": "ILO", "BULACAN": "MNL",  # Bulacan → Manila airport
    "ATLANTA": "ATL", "NEW YORK": "JFK", "LOS ANGELES": "LAX",
    "SAN FRANCISCO": "SFO", "CHICAGO": "ORD", "SEATTLE": "SEA",
    "MIAMI": "MIA", "WASHINGTON": "IAD", "BOSTON": "BOS",
    "TOKYO": "NRT", "SEOUL": "ICN", "SINGAPORE": "SIN",
    "BANGKOK": "BKK", "HONG KONG": "HKG", "TAIPEI": "TPE",
    "PARIS": "CDG", "LONDON": "LHR", "BRUSSELS": "BRU",
    "AMSTERDAM": "AMS", "FRANKFURT": "FRA", "DUBAI": "DXB",
    "SYDNEY": "SYD", "MELBOURNE": "MEL", "MEXICO CITY": "MEX",
}


def _derive_iata(city: str, existing: Optional[str] = None) -> str:
    if existing and len(existing) == 3 and existing.isalpha():
        return existing.upper()
    key = (city or "").upper().strip()
    # Try exact match
    if key in CITY_TO_IATA:
        return CITY_TO_IATA[key]
    # Try tokens
    for token in re.split(r"[,\s&/]+", key):
        if token in CITY_TO_IATA:
            return CITY_TO_IATA[token]
    return ""


IATA_ALIASES = {
    "ATL": "ATL", "MNL": "MNL", "CEB": "CEB", "DVO": "DVO",
    "CRK": "CRK", "PPS": "PPS", "ICN": "ICN", "NRT": "NRT",
    "HND": "HND", "LAX": "LAX", "SFO": "SFO", "HKG": "HKG",
    "SIN": "SIN", "BKK": "BKK", "CDG": "CDG", "BRU": "BRU",
    "LHR": "LHR", "AMS": "AMS", "FRA": "FRA", "DXB": "DXB",
}


def _cabin_int(cabin: str) -> int:
    return CABIN_MAP.get((cabin or "economy").lower(), 1)


# ---------------------------------------------------------------------------
# Deep link builders — every platform pre-filled with trip params
# ---------------------------------------------------------------------------
def build_flight_deeplinks(
    *, origin: str, destination: str, dep: str, ret: Optional[str],
    adults: int = 1, one_way: bool = False,
) -> List[Dict[str, Any]]:
    origin, destination = origin.upper(), destination.upper()
    o_low, d_low = origin.lower(), destination.lower()
    dep_yy = _yymmdd(dep)
    ret_yy = _yymmdd(ret or "")
    trip_type = "OW" if one_way else "RT"

    google_flights = (
        f"https://www.google.com/travel/flights?q=Flights+from+{origin}+to+"
        f"{destination}+on+{dep}"
        + (f"+returning+{ret}" if not one_way and ret else "")
    )
    skyscanner = (
        f"https://www.skyscanner.com/transport/flights/{o_low}/{d_low}/"
        f"{dep_yy}/" + (f"{ret_yy}/" if not one_way and ret else "")
        + f"?adults={adults}&currency=USD"
    )
    skyscanner_anywhere = (
        f"https://www.skyscanner.com/transport/flights/{o_low}/anywhere/"
        f"{dep_yy}/" + (f"{ret_yy}/" if ret_yy else "")
        + f"?adults={adults}&currency=USD"
    )
    if one_way:
        kayak = (f"https://www.kayak.com/flights/{origin}-{destination}/"
                 f"{dep}/{adults}adults?sort=price_a")
    else:
        kayak = (f"https://www.kayak.com/flights/{origin}-{destination}/"
                 f"{dep}/{ret}/{adults}adults?sort=bestflight_a")
    kayak_alert = (
        f"https://www.kayak.com/flights/{origin}-{destination}/"
        f"{dep}" + (f"/{ret}" if not one_way and ret else "") + "?alert=true"
    )
    ita = (f"https://matrix.itasoftware.com/search?f={origin}&t={destination}"
           f"&d={dep}" + (f"&r={ret}" if not one_way and ret else "")
           + f"&px={adults}&sc=ECO")
    expedia = _kv("https://www.expedia.com/Flights-Search", {
        "trip": "roundtrip" if not one_way else "oneway",
        "leg1": f"from:{origin},to:{destination},departure:{dep}",
        "leg2": (f"from:{destination},to:{origin},departure:{ret}"
                 if not one_way and ret else None),
        "passengers": f"adults:{adults}",
        "options": "cabinclass:economy",
    })
    priceline = (f"https://www.priceline.com/fly/search/{origin}/"
                 f"{destination}/{dep}" + (f"/{ret}" if not one_way and ret else "")
                 + f"?adults={adults}")
    going = f"https://www.going.com/flights?origin={origin}&destination={destination}"
    secret_flying = "https://www.secretflying.com/usa-deals/"

    deeplinks: List[Dict[str, Any]] = [
        {"platform": "google_flights", "label": "Google Flights", "url": google_flights,
         "tagline": "Live prices, flexible dates", "primary": True},
        {"platform": "skyscanner", "label": "Skyscanner", "url": skyscanner,
         "tagline": "Compare all airlines"},
        {"platform": "kayak", "label": "Kayak", "url": kayak,
         "tagline": "Price alerts + comparison"},
        {"platform": "ita_matrix", "label": "ITA Matrix", "url": ita,
         "tagline": "Exact fare finder (advanced)",
         "note": "ITA Matrix finds the exact lowest published airfare. "
                 "You cannot book here — use it to find the cheapest fare then "
                 "search that exact itinerary on Google Flights or the airline "
                 "website to book."},
        {"platform": "expedia", "label": "Expedia", "url": expedia,
         "tagline": "Flights + hotels bundle savings", "more_options": True},
        {"platform": "priceline", "label": "Priceline", "url": priceline,
         "tagline": "Name your own price + Express Deals", "more_options": True},
        {"platform": "going", "label": "Going", "url": going,
         "tagline": "Mistake fares and flash deals", "more_options": True},
        {"platform": "secret_flying", "label": "Secret Flying", "url": secret_flying,
         "tagline": "Error fares (avg 90% off)", "more_options": True},
        {"platform": "kayak_alert", "label": "Set Price Alert on Kayak",
         "url": kayak_alert, "tagline": "Watch this route for price drops",
         "more_options": True},
        {"platform": "skyscanner_anywhere", "label": "Skyscanner Everywhere",
         "url": skyscanner_anywhere,
         "tagline": "Find cheapest destinations from " + origin,
         "more_options": True},
    ]
    _ = trip_type  # reserved for future analytics tags
    return deeplinks


PH_DESTINATION_TOKENS = {
    "PH", "PHILIPPINES", "MNL", "MANILA", "CEB", "CEBU", "DVO", "DAVAO",
    "CRK", "CLARK", "BULACAN", "MALOLOS", "SAN JOSE DEL MONTE",
    "PALAWAN", "BORACAY", "PPS",
}


def _is_philippines(destination: str, country: Optional[str] = None) -> bool:
    d = (destination or "").upper()
    c = (country or "").upper()
    return any(t in d or t in c for t in PH_DESTINATION_TOKENS)


def _is_bulacan(destination: str) -> bool:
    return any(t in (destination or "").upper()
               for t in ("BULACAN", "MALOLOS", "SAN JOSE DEL MONTE"))


def build_hotel_deeplinks(
    *, destination_city: str, destination_country: str,
    check_in: str, check_out: str, adults: int = 1,
) -> List[Dict[str, Any]]:
    city = destination_city or ""
    city_q = urllib.parse.quote_plus(city)
    country_q = urllib.parse.quote_plus(destination_country or "")
    city_slug = _slug(city)
    ph = _is_philippines(city, destination_country)

    booking_com = (f"https://www.booking.com/searchresults.html?"
                   f"ss={city_q}%2C+{country_q}&checkin={check_in}"
                   f"&checkout={check_out}&group_adults={adults}"
                   f"&no_rooms=1&order=price")
    hotels_com = (f"https://www.hotels.com/search.do?destination={city_q}"
                  f"&startDate={check_in}&endDate={check_out}"
                  f"&adults={adults}&sort=PRICE_LOW_TO_HIGH")
    google_hotels = (f"https://www.google.com/travel/hotels/{city_q}"
                     f"?dates={check_in},{check_out}&adults={adults}")
    agoda = (f"https://www.agoda.com/search?city={city_q}"
             f"&checkIn={check_in}&checkOut={check_out}"
             f"&rooms=1&adults={adults}&children=0")
    expedia = (f"https://www.expedia.com/Hotel-Search?destination={city_q}"
               f"&startDate={check_in}&endDate={check_out}"
               f"&adults={adults}&sort=PRICE_LOW_TO_HIGH")
    airbnb = (f"https://www.airbnb.com/s/{city_slug}--{_slug(destination_country)}"
              f"/homes?checkin={check_in}&checkout={check_out}"
              f"&adults={adults}")
    airbnb_cabins = (f"https://www.airbnb.com/s/{city_slug}/homes"
                     f"?checkin={check_in}&checkout={check_out}"
                     f"&adults={adults}&category_tag=Tag%3A8536")
    vrbo = (f"https://www.vrbo.com/search/keywords:{city_slug}-"
            f"{_slug(destination_country)}/arrival:{check_in}"
            f"/departure:{check_out}")
    plum_guide = (f"https://www.plumguide.com/homes?destination={city_q}"
                  f"&checkIn={check_in}&checkOut={check_out}")
    glamping_hub = (f"https://glampinghub.com/search/?location={city_q}"
                    f"&arrival={check_in}&departure={check_out}"
                    f"&guests={adults}")
    slh = (f"https://www.slh.com/hotels/?destination={city_q}"
           f"&checkIn={check_in}&checkOut={check_out}&adults={adults}")
    mr_smith = (f"https://www.mrandmrssmith.com/search?where={city_q}"
                f"&checkin={check_in}&checkout={check_out}&adults={adults}")
    traveloka = (f"https://www.traveloka.com/en-ph/hotel/search?"
                 f"spec={city_q}.{check_in}.{check_out}.1.1.HOTEL")

    hotels: List[Dict[str, Any]] = []

    # Philippines-priority ordering
    if ph:
        hotels.append({"platform": "agoda", "label": "Agoda",
                       "url": agoda, "tagline": "Best rates for Asia — first choice for Philippines",
                       "primary": True})
        hotels.append({"platform": "traveloka", "label": "Traveloka",
                       "url": traveloka,
                       "tagline": "Popular in Philippines, local prices"})
        hotels.append({"platform": "booking_com", "label": "Booking.com",
                       "url": booking_com,
                       "tagline": "Widest global inventory, free cancellation"})
    else:
        hotels.append({"platform": "booking_com", "label": "Booking.com",
                       "url": booking_com,
                       "tagline": "Widest global inventory, free cancellation",
                       "primary": True})
        hotels.append({"platform": "google_hotels", "label": "Google Hotels",
                       "url": google_hotels,
                       "tagline": "Compare prices across all sites"})
        hotels.append({"platform": "agoda", "label": "Agoda",
                       "url": agoda,
                       "tagline": "Best rates for Asia"})

    hotels.extend([
        {"platform": "hotels_com", "label": "Hotels.com", "url": hotels_com,
         "tagline": "10 nights = 1 free reward"},
        {"platform": "expedia_hotels", "label": "Expedia", "url": expedia,
         "tagline": "Flight + hotel bundle savings", "more_options": True},
        {"platform": "airbnb", "label": "Airbnb", "url": airbnb,
         "tagline": "Largest selection worldwide", "more_options": True},
        {"platform": "airbnb_cabins", "label": "Airbnb Cabins",
         "url": airbnb_cabins,
         "tagline": "Treehouses, cabins, unique stays", "more_options": True},
        {"platform": "vrbo", "label": "Vrbo", "url": vrbo,
         "tagline": "Best for whole-home rentals", "more_options": True},
        {"platform": "plum_guide", "label": "Plum Guide", "url": plum_guide,
         "tagline": "Curated high-end vetted homes", "more_options": True},
        {"platform": "glamping_hub", "label": "Glamping Hub",
         "url": glamping_hub,
         "tagline": "Glamping, treehouses, safari tents", "more_options": True},
        {"platform": "slh", "label": "Small Luxury Hotels", "url": slh,
         "tagline": "Boutique luxury curation", "more_options": True},
        {"platform": "mr_and_mrs_smith", "label": "Mr & Mrs Smith",
         "url": mr_smith,
         "tagline": "Boutique resort curation", "more_options": True},
    ])
    return hotels


def build_carrier_deeplinks(
    *, origin: str, destination: str, dep: str, ret: Optional[str],
    adults: int = 1, one_way: bool = False, destination_country: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Country-specific direct airline booking links (e.g. Cebu Pacific, PAL)."""
    if not _is_philippines(destination, destination_country):
        return []
    trip_type = "OW" if one_way else "RT"
    cebu_pacific = (f"https://book.cebupacificair.com/Flight/InternetBooking.aspx?"
                    f"culture=en-PH&Origin1={origin}&Destination1={destination}"
                    f"&DepartureDate1={dep}"
                    + (f"&Origin2={destination}&Destination2={origin}"
                       f"&DepartureDate2={ret}" if not one_way and ret else "")
                    + f"&Adult={adults}&TripType={trip_type}")
    pal = (f"https://www.philippineairlines.com/en/ph/home/book-a-flight?"
           f"origin={origin}&destination={destination}&departureDate={dep}"
           + (f"&returnDate={ret}" if not one_way and ret else "")
           + f"&adults={adults}&triptype={trip_type}")
    return [
        {"platform": "cebu_pacific", "label": "Cebu Pacific",
         "url": cebu_pacific,
         "tagline": "Lowest cost carrier Philippines · direct booking",
         "primary": True},
        {"platform": "philippine_airlines", "label": "Philippine Airlines",
         "url": pal,
         "tagline": "Direct booking · full-service carrier"},
    ]


def build_bundle_deeplinks(
    *, origin: str, destination: str, dep: str, ret: Optional[str], adults: int = 1,
) -> List[Dict[str, Any]]:
    kayak_bundle = (f"https://www.kayak.com/packages?origin={origin}"
                    f"&destination={destination}&depart={dep}"
                    + (f"&return={ret}" if ret else "")
                    + f"&adults={adults}")
    expedia_bundle = (f"https://www.expedia.com/packages/fly-drive?"
                      f"origin={origin}&destination={destination}"
                      f"&startDate={dep}"
                      + (f"&endDate={ret}" if ret else "")
                      + f"&adults={adults}")
    google_travel = "https://www.google.com/travel/trips"
    return [
        {"platform": "kayak_bundle", "label": "Kayak Bundle",
         "url": kayak_bundle,
         "tagline": "Flights + hotels together, save up to $500"},
        {"platform": "expedia_bundle", "label": "Expedia Bundle",
         "url": expedia_bundle,
         "tagline": "Flight + hotel savings guaranteed"},
        {"platform": "google_travel", "label": "Google Travel",
         "url": google_travel,
         "tagline": "Full trip planning: flights + hotels + cars"},
    ]


# ---------------------------------------------------------------------------
# SerpApi callers
# ---------------------------------------------------------------------------
async def _log_serpapi_error(db, user_id: str, kind: str, error: str,
                             status_code: Optional[int] = None) -> None:
    try:
        await db.ai_usage_log.insert_one({
            "platform": "serpapi",
            "kind": kind,
            "user_id": user_id,
            "error": error[:400],
            "status_code": status_code,
            "timestamp": _now(),
        })
    except Exception as e:  # pragma: no cover
        logger.warning("Could not log serpapi error: %s", e)


async def _call_serpapi(engine: str, params: Dict[str, Any],
                        db, user_id: str) -> Tuple[Dict[str, Any], Optional[str]]:
    """Returns (data, error_message).  On error, data may be {} and error set."""
    key = os.getenv("SERPAPI_KEY", "").strip()
    if not key:
        return {}, "SERPAPI_KEY not configured"
    q = {"engine": engine, "api_key": key, **params}
    try:
        async with httpx.AsyncClient(timeout=SERPAPI_TIMEOUT) as client:
            r = await client.get(SERPAPI_ENDPOINT, params=q)
        if r.status_code == 401:
            msg = "Invalid SerpApi key (401 Unauthorized)"
            await _log_serpapi_error(db, user_id, engine, msg, 401)
            return {}, msg
        if r.status_code == 429:
            msg = ("SerpApi monthly quota exceeded (429). Upgrade at "
                   "serpapi.com/pricing or wait until next reset.")
            await _log_serpapi_error(db, user_id, engine, msg, 429)
            return {}, msg
        if r.status_code >= 500:
            msg = f"SerpApi service unavailable ({r.status_code})"
            await _log_serpapi_error(db, user_id, engine, msg, r.status_code)
            return {}, msg
        r.raise_for_status()
        data = r.json()
        if isinstance(data, dict) and data.get("error"):
            msg = str(data["error"])[:300]
            await _log_serpapi_error(db, user_id, engine, msg, r.status_code)
            return {}, msg
        return data, None
    except httpx.TimeoutException:
        msg = f"SerpApi timeout after {SERPAPI_TIMEOUT}s"
        await _log_serpapi_error(db, user_id, engine, msg)
        return {}, msg
    except Exception as e:
        msg = str(e)[:300]
        await _log_serpapi_error(db, user_id, engine, msg)
        return {}, msg


def _clean_flight(raw: Dict[str, Any], price_insights: Dict[str, Any],
                  fetched_at: datetime) -> Dict[str, Any]:
    flights = raw.get("flights") or []
    first = flights[0] if flights else {}
    last = flights[-1] if flights else {}
    stops = max(0, len(flights) - 1)
    layovers = raw.get("layovers") or []
    price_level = None
    typical = price_insights.get("typical_price_range") or []
    if price_insights.get("price_level"):
        pl = price_insights["price_level"].lower()
        price_level = pl if pl in ("low", "typical", "high") else None

    return {
        "airline": first.get("airline") or raw.get("airline") or "Unknown",
        "airline_logo": first.get("airline_logo") or raw.get("airline_logo") or "",
        "flight_number": first.get("flight_number") or "",
        "departure_airport_code": ((first.get("departure_airport") or {}).get("id") or ""),
        "departure_airport_name": ((first.get("departure_airport") or {}).get("name") or ""),
        "departure_time": ((first.get("departure_airport") or {}).get("time") or ""),
        "arrival_airport_code": ((last.get("arrival_airport") or {}).get("id") or ""),
        "arrival_airport_name": ((last.get("arrival_airport") or {}).get("name") or ""),
        "arrival_time": ((last.get("arrival_airport") or {}).get("time") or ""),
        "duration_minutes": int(raw.get("total_duration") or 0),
        "stops": stops,
        "layover_airports": [(lo.get("id") or lo.get("name") or "") for lo in layovers],
        "layover_details": [{"airport": (lo.get("id") or ""),
                             "name": (lo.get("name") or ""),
                             "duration_min": int(lo.get("duration") or 0)}
                            for lo in layovers],
        "price_usd": int(raw.get("price") or 0),
        "price_level": price_level,
        "typical_low_usd": int(typical[0]) if len(typical) >= 2 else None,
        "typical_high_usd": int(typical[1]) if len(typical) >= 2 else None,
        "carbon_emissions_g": (raw.get("carbon_emissions") or {}).get("this_flight"),
        "type": raw.get("type") or "",
        "booking_token": raw.get("booking_token") or "",
        "source": "serpapi_google_flights",
        "fetched_at": _iso(fetched_at),
    }


def _clean_hotel(raw: Dict[str, Any], nights: int,
                 fetched_at: datetime) -> Dict[str, Any]:
    rate = raw.get("rate_per_night") or {}
    nightly = int((rate.get("extracted_lowest") or rate.get("lowest") or 0) or 0)
    if not nightly and raw.get("total_rate"):
        try:
            total = int((raw["total_rate"] or {}).get("extracted_lowest") or 0)
            nightly = int(total / max(nights, 1)) if total else 0
        except Exception:
            nightly = 0
    images = raw.get("images") or []
    thumb = ""
    if images and isinstance(images, list):
        first = images[0]
        thumb = (first.get("thumbnail") if isinstance(first, dict)
                 else (first if isinstance(first, str) else ""))
    return {
        "name": raw.get("name") or "Unnamed property",
        "type": raw.get("type") or "hotel",
        "description": (raw.get("description") or "")[:300],
        "address": raw.get("address") or "",
        "neighborhood": raw.get("neighborhood") or "",
        "rating": raw.get("overall_rating") or raw.get("rating") or None,
        "review_count": raw.get("reviews") or 0,
        "hotel_class": raw.get("hotel_class") or raw.get("extracted_hotel_class") or None,
        "amenities": raw.get("amenities") or [],
        "thumbnail": thumb,
        "images": [i.get("thumbnail") for i in images
                   if isinstance(i, dict) and i.get("thumbnail")][:5],
        "nightly_usd": nightly,
        "total_usd": nightly * max(nights, 1) if nightly else 0,
        "gps_coordinates": raw.get("gps_coordinates") or {},
        "check_in_time": raw.get("check_in_time") or "",
        "check_out_time": raw.get("check_out_time") or "",
        "property_token": raw.get("property_token") or "",
        "link": raw.get("link") or "",
        "source": "serpapi_google_hotels",
        "fetched_at": _iso(fetched_at),
    }


async def fetch_serpapi_flights(*, origin: str, destination: str, dep: str,
                                ret: Optional[str], adults: int,
                                one_way: bool, cabin: str, db, user_id: str
                                ) -> Tuple[Dict[str, Any], Optional[str]]:
    params: Dict[str, Any] = {
        "departure_id": origin.upper(),
        "arrival_id": destination.upper(),
        "outbound_date": dep,
        "currency": "USD",
        "hl": "en",
        "adults": adults,
        "type": 2 if one_way else 1,
        "travel_class": _cabin_int(cabin),
    }
    if not one_way and ret:
        params["return_date"] = ret
    data, err = await _call_serpapi("google_flights", params, db, user_id)
    if err:
        return {}, err
    fetched_at = _now()
    price_insights = data.get("price_insights") or {}
    best = data.get("best_flights") or []
    other = data.get("other_flights") or []
    all_flights_raw = [*best, *other]
    cleaned = [_clean_flight(f, price_insights, fetched_at)
               for f in all_flights_raw if f]
    # Categorize
    by_price = sorted([f for f in cleaned if f["price_usd"] > 0],
                      key=lambda x: x["price_usd"])
    by_speed = sorted([f for f in cleaned if f["duration_minutes"] > 0],
                      key=lambda x: x["duration_minutes"])
    cheapest = by_price[0] if by_price else None
    fastest = by_speed[0] if by_speed else None
    best_value = None
    if by_price:
        # Pick a mid-price flight with fewest stops within top 5 cheapest
        top5 = by_price[:5]
        best_value = min(top5, key=lambda f: (f["stops"], f["duration_minutes"]))
    return {
        "flights": cleaned[:12],
        "cheapest": cheapest, "fastest": fastest, "best_value": best_value,
        "price_insights": {
            "level": price_insights.get("price_level"),
            "typical_range_usd": price_insights.get("typical_price_range"),
            "lowest_price": price_insights.get("lowest_price"),
            "note": price_insights.get("price_history"),
        },
        "fetched_at": _iso(fetched_at),
    }, None


async def fetch_serpapi_hotels(*, destination_city: str, check_in: str,
                               check_out: str, adults: int, db, user_id: str
                               ) -> Tuple[Dict[str, Any], Optional[str]]:
    params: Dict[str, Any] = {
        "q": f"{destination_city} hotels",
        "check_in_date": check_in,
        "check_out_date": check_out,
        "adults": adults,
        "currency": "USD",
        "hl": "en",
    }
    data, err = await _call_serpapi("google_hotels", params, db, user_id)
    if err:
        return {}, err
    fetched_at = _now()
    nights = _nights(check_in, check_out)
    props = data.get("properties") or []
    cleaned = [_clean_hotel(p, nights, fetched_at) for p in props if p]
    # Sort by nightly price ascending for "cheapest"
    priced = sorted([h for h in cleaned if h["nightly_usd"] > 0],
                    key=lambda x: x["nightly_usd"])
    cheapest = priced[0] if priced else None
    best_rated = sorted(cleaned, key=lambda x: -(x.get("rating") or 0))[:1]
    best_rated = best_rated[0] if best_rated else None
    return {
        "hotels": cleaned[:15],
        "cheapest": cheapest,
        "best_rated": best_rated,
        "nights": nights,
        "fetched_at": _iso(fetched_at),
    }, None


# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------
def _cache_key(trip_id: str, origin: str, destination: str, dep: str,
               ret: Optional[str], adults: int, cabin: str, one_way: bool) -> str:
    return "|".join([
        trip_id, origin.upper(), destination.upper(), dep or "",
        ret or "", str(adults), cabin, "OW" if one_way else "RT",
    ])


async def _load_cached(db, ck: str) -> Optional[Dict[str, Any]]:
    return await db.travel_live_cache.find_one({"cache_key": ck}, {"_id": 0})


async def _save_cache(db, ck: str, user_id: str, payload: Dict[str, Any]) -> None:
    doc = {**payload, "cache_key": ck, "user_id": user_id, "fetched_at": _iso(_now())}
    await db.travel_live_cache.update_one(
        {"cache_key": ck}, {"$set": doc}, upsert=True,
    )


def _staleness(fetched_at_iso: Optional[str]) -> Dict[str, Any]:
    dt = _parse_dt(fetched_at_iso)
    if not dt:
        return {"minutes_ago": None, "fresh": False, "stale": True, "auto_refetch": True}
    age = _now() - dt
    mins = int(age.total_seconds() / 60)
    return {
        "minutes_ago": mins,
        "fresh": age < timedelta(hours=FRESH_HOURS),
        "stale": age >= timedelta(hours=FRESH_HOURS),
        "auto_refetch": age >= timedelta(hours=STALE_HOURS),
    }


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
class LiveSearchBody(BaseModel):
    refresh: bool = False
    one_way: bool = False
    cabin: str = "economy"
    adults: int = 1


def make_router(db, get_current_user_id):
    r = APIRouter(prefix="/travel", tags=["travel-live"])

    async def _resolve_trip(trip_id: str, user_id: str) -> Dict[str, Any]:
        t = await db.trips.find_one({"trip_id": trip_id, "user_id": user_id})
        if not t:
            raise HTTPException(404, "Trip not found")
        return t

    def _params_from_trip(t: Dict[str, Any], body: LiveSearchBody) -> Dict[str, Any]:
        # Origin — try explicit IATA, then home-airport, then default ATL.
        origin = (t.get("origin_iata")
                  or t.get("origin_code")
                  or t.get("origin")
                  or "ATL").upper()
        origin = _derive_iata(origin, origin if len(origin) == 3 else None) or "ATL"
        # Destination — resolve from IATA field or city name.
        dest_city = (t.get("destination_city")
                     or t.get("city")
                     or (t.get("destination") or "").split(",")[0].strip()
                     or t.get("destination_name") or "")
        destination = _derive_iata(dest_city, t.get("destination_iata")
                                   or t.get("destination_code"))
        if not destination:
            destination = (t.get("destination_iata")
                           or t.get("destination_code") or "").upper()[:3] or "MNL"
        dep = t.get("departure_date") or ""
        ret = t.get("return_date") or None
        adults = int(t.get("travelers") or body.adults or 1)
        cabin = (t.get("cabin_class") or body.cabin or "economy").lower()
        return {"origin": origin, "destination": destination,
                "dep": dep, "ret": ret, "adults": adults, "cabin": cabin,
                "one_way": bool(body.one_way)}

    def _build_all_deeplinks(t: Dict[str, Any], p: Dict[str, Any]) -> Dict[str, Any]:
        destination_country = t.get("country") or t.get("country_name") or ""
        city = (t.get("destination_city")
                or (t.get("destination") or "").split(",")[0].strip()
                or t.get("destination_name") or "")
        check_in = t.get("checkin_date") or t.get("departure_date") or ""
        check_out = t.get("checkout_date") or t.get("return_date") or ""
        nights = _nights(check_in, check_out)
        ph = _is_philippines(f"{city} {destination_country}", destination_country)
        return {
            "flight_platforms": build_flight_deeplinks(
                origin=p["origin"], destination=p["destination"],
                dep=p["dep"], ret=p["ret"], adults=p["adults"],
                one_way=p["one_way"]),
            "carrier_platforms": build_carrier_deeplinks(
                origin=p["origin"], destination=p["destination"],
                dep=p["dep"], ret=p["ret"], adults=p["adults"],
                one_way=p["one_way"],
                destination_country=destination_country),
            "hotel_platforms": build_hotel_deeplinks(
                destination_city=city,
                destination_country=destination_country,
                check_in=check_in, check_out=check_out, adults=p["adults"]),
            "bundle_platforms": build_bundle_deeplinks(
                origin=p["origin"], destination=p["destination"],
                dep=p["dep"], ret=p["ret"], adults=p["adults"]),
            "philippines": ph,
            "bulacan": _is_bulacan(f"{city} {destination_country}"),
            "airbnb_weekly_note": ("Airbnb offers automatic weekly discounts of "
                                   "15-40% for stays over 7 nights")
                                  if nights >= 7 else None,
            "airbnb_monthly_note": ("Monthly pricing typically 30-50% less than "
                                    "nightly rate")
                                   if nights >= 28 else None,
            "bulacan_note": ("For Eden Heights Sanctuary visits — hotels in "
                             "Malolos or San Jose del Monte are closest to the "
                             "property. Search these cities specifically for "
                             "better rates than Manila hotels.")
                            if _is_bulacan(f"{city} {destination_country}") else None,
            "nights": nights,
            "check_in": check_in, "check_out": check_out,
            "trip_city": city, "trip_country": destination_country,
        }

    @r.get("/serpapi-status")
    async def serpapi_status(user_id: str = Depends(get_current_user_id)):
        key = os.getenv("SERPAPI_KEY", "").strip()
        latest_err = await db.ai_usage_log.find_one(
            {"platform": "serpapi"}, sort=[("timestamp", -1)]
        )
        return {
            "configured": bool(key),
            "key_hint": (key[:4] + "…" + key[-4:]) if key else None,
            "last_error": (
                {"error": latest_err.get("error"),
                 "status_code": latest_err.get("status_code"),
                 "kind": latest_err.get("kind"),
                 "timestamp": _iso(latest_err.get("timestamp"))}
                if latest_err else None
            ),
        }

    @r.get("/trips/{trip_id}/deep-links")
    async def get_deep_links(trip_id: str,
                             one_way: bool = Query(False),
                             user_id: str = Depends(get_current_user_id)):
        t = await _resolve_trip(trip_id, user_id)
        p = _params_from_trip(t, LiveSearchBody(one_way=one_way))
        return _build_all_deeplinks(t, p)

    async def _perform_search(t: Dict[str, Any], p: Dict[str, Any],
                              user_id: str, refresh: bool) -> Dict[str, Any]:
        destination_country = t.get("country") or t.get("country_name") or ""
        city = (t.get("destination_city")
                or (t.get("destination") or "").split(",")[0].strip()
                or t.get("destination_name") or "")
        check_in = t.get("checkin_date") or t.get("departure_date") or ""
        check_out = t.get("checkout_date") or t.get("return_date") or ""

        ck = _cache_key(t["trip_id"], p["origin"], p["destination"],
                        p["dep"], p["ret"], p["adults"], p["cabin"],
                        p["one_way"])
        cached = await _load_cached(db, ck) if not refresh else None
        if cached:
            st = _staleness(cached.get("last_fetched_at"))
            if st["auto_refetch"]:
                cached = None  # force refetch
        if cached and not refresh:
            st = _staleness(cached.get("last_fetched_at"))
            return {**cached, "staleness": st, "cache_hit": True,
                    "trip_id": t["trip_id"]}

        # Fresh call — flights + hotels in parallel
        flights_task = fetch_serpapi_flights(
            origin=p["origin"], destination=p["destination"],
            dep=p["dep"], ret=p["ret"], adults=p["adults"],
            one_way=p["one_way"], cabin=p["cabin"], db=db, user_id=user_id,
        )
        hotels_task = fetch_serpapi_hotels(
            destination_city=city, check_in=check_in,
            check_out=check_out, adults=p["adults"], db=db, user_id=user_id,
        )
        (flights_res, flights_err), (hotels_res, hotels_err) = await asyncio.gather(
            flights_task, hotels_task,
        )
        now_iso = _iso(_now())
        payload = {
            "trip_id": t["trip_id"],
            "params": {**p, "check_in": check_in, "check_out": check_out,
                       "trip_city": city, "trip_country": destination_country},
            "flights_data": flights_res or {"flights": []},
            "hotels_data": hotels_res or {"hotels": []},
            "flights_error": flights_err,
            "hotels_error": hotels_err,
            "last_fetched_at": now_iso,
            "provider": "serpapi",
            "has_live_data": bool((flights_res and flights_res.get("flights"))
                                  or (hotels_res and hotels_res.get("hotels"))),
        }
        # Only cache real hits (avoid caching errors)
        if payload["has_live_data"]:
            await _save_cache(db, ck, user_id, payload)
        payload["staleness"] = _staleness(now_iso)
        payload["cache_hit"] = False
        return payload

    @r.post("/trips/{trip_id}/search-live")
    async def search_live_post(trip_id: str, body: LiveSearchBody,
                               user_id: str = Depends(get_current_user_id)):
        t = await _resolve_trip(trip_id, user_id)
        p = _params_from_trip(t, body)
        result = await _perform_search(t, p, user_id, refresh=body.refresh)
        result["deep_links"] = _build_all_deeplinks(t, p)
        return result

    @r.get("/trips/{trip_id}/search-live")
    async def search_live_get(trip_id: str,
                              refresh: bool = Query(False),
                              one_way: bool = Query(False),
                              cabin: str = Query("economy"),
                              adults: int = Query(1),
                              user_id: str = Depends(get_current_user_id)):
        body = LiveSearchBody(refresh=refresh, one_way=one_way,
                              cabin=cabin, adults=adults)
        t = await _resolve_trip(trip_id, user_id)
        p = _params_from_trip(t, body)
        result = await _perform_search(t, p, user_id, refresh=body.refresh)
        result["deep_links"] = _build_all_deeplinks(t, p)
        return result

    return r
