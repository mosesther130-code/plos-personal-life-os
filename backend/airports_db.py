"""Airports database + smart search + saved custom routes."""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field


AIRPORTS: List[Dict[str, str]] = [
    # ---- Americas ----
    {"iata": "ATL", "name": "Hartsfield-Jackson Atlanta International",
     "city": "Atlanta", "region": "Georgia", "country": "USA"},
    {"iata": "JFK", "name": "John F. Kennedy International",
     "city": "New York", "region": "New York", "country": "USA"},
    {"iata": "LGA", "name": "LaGuardia", "city": "New York",
     "region": "New York", "country": "USA"},
    {"iata": "EWR", "name": "Newark Liberty International",
     "city": "Newark", "region": "New Jersey", "country": "USA"},
    {"iata": "LAX", "name": "Los Angeles International",
     "city": "Los Angeles", "region": "California", "country": "USA"},
    {"iata": "ORD", "name": "O'Hare International", "city": "Chicago",
     "region": "Illinois", "country": "USA"},
    {"iata": "DCA", "name": "Ronald Reagan Washington National",
     "city": "Washington", "region": "DC", "country": "USA"},
    {"iata": "IAD", "name": "Washington Dulles International",
     "city": "Washington", "region": "DC", "country": "USA"},
    {"iata": "BWI", "name": "Baltimore/Washington International",
     "city": "Baltimore", "region": "Maryland", "country": "USA"},
    {"iata": "MIA", "name": "Miami International", "city": "Miami",
     "region": "Florida", "country": "USA"},
    {"iata": "SFO", "name": "San Francisco International",
     "city": "San Francisco", "region": "California", "country": "USA"},
    {"iata": "SEA", "name": "Seattle-Tacoma International",
     "city": "Seattle", "region": "Washington", "country": "USA"},
    {"iata": "BOS", "name": "Boston Logan International",
     "city": "Boston", "region": "Massachusetts", "country": "USA"},
    {"iata": "DFW", "name": "Dallas/Fort Worth International",
     "city": "Dallas", "region": "Texas", "country": "USA"},
    {"iata": "DEN", "name": "Denver International", "city": "Denver",
     "region": "Colorado", "country": "USA"},
    {"iata": "PHX", "name": "Phoenix Sky Harbor International",
     "city": "Phoenix", "region": "Arizona", "country": "USA"},
    {"iata": "IAH", "name": "George Bush Intercontinental",
     "city": "Houston", "region": "Texas", "country": "USA"},
    {"iata": "MSP", "name": "Minneapolis-Saint Paul International",
     "city": "Minneapolis", "region": "Minnesota", "country": "USA"},
    {"iata": "DTW", "name": "Detroit Metropolitan Wayne County",
     "city": "Detroit", "region": "Michigan", "country": "USA"},
    {"iata": "YYZ", "name": "Toronto Pearson International",
     "city": "Toronto", "region": "Ontario", "country": "Canada"},
    {"iata": "YVR", "name": "Vancouver International",
     "city": "Vancouver", "region": "BC", "country": "Canada"},
    {"iata": "MEX", "name": "Mexico City International",
     "city": "Mexico City", "region": "", "country": "Mexico"},
    {"iata": "GRU", "name": "São Paulo–Guarulhos International",
     "city": "São Paulo", "region": "", "country": "Brazil"},

    # ---- Asia-Pacific (Moses priority) ----
    {"iata": "MNL", "name": "Ninoy Aquino International", "city": "Manila",
     "region": "Metro Manila", "country": "Philippines"},
    {"iata": "CEB", "name": "Mactan-Cebu International", "city": "Cebu",
     "region": "Cebu", "country": "Philippines"},
    {"iata": "CRK", "name": "Clark International", "city": "Angeles",
     "region": "Pampanga", "country": "Philippines"},
    {"iata": "DVO", "name": "Francisco Bangoy International",
     "city": "Davao", "region": "Davao", "country": "Philippines"},
    {"iata": "ILO", "name": "Iloilo International", "city": "Iloilo",
     "region": "Iloilo", "country": "Philippines"},
    {"iata": "PPS", "name": "Puerto Princesa International",
     "city": "Puerto Princesa", "region": "Palawan", "country": "Philippines"},
    {"iata": "KLO", "name": "Kalibo International", "city": "Kalibo",
     "region": "Aklan", "country": "Philippines"},
    {"iata": "MPH", "name": "Boracay Airport (Caticlan)",
     "city": "Caticlan", "region": "Malay", "country": "Philippines"},
    {"iata": "NRT", "name": "Narita International", "city": "Tokyo",
     "region": "Chiba", "country": "Japan"},
    {"iata": "HND", "name": "Haneda", "city": "Tokyo", "region": "Tokyo",
     "country": "Japan"},
    {"iata": "KIX", "name": "Kansai International", "city": "Osaka",
     "region": "Osaka", "country": "Japan"},
    {"iata": "ICN", "name": "Incheon International", "city": "Seoul",
     "region": "Incheon", "country": "South Korea"},
    {"iata": "GMP", "name": "Gimpo International", "city": "Seoul",
     "region": "Seoul", "country": "South Korea"},
    {"iata": "SIN", "name": "Changi", "city": "Singapore", "region": "",
     "country": "Singapore"},
    {"iata": "BKK", "name": "Suvarnabhumi", "city": "Bangkok",
     "region": "", "country": "Thailand"},
    {"iata": "DMK", "name": "Don Mueang International", "city": "Bangkok",
     "region": "", "country": "Thailand"},
    {"iata": "HKG", "name": "Hong Kong International",
     "city": "Hong Kong", "region": "", "country": "Hong Kong"},
    {"iata": "TPE", "name": "Taiwan Taoyuan International",
     "city": "Taipei", "region": "", "country": "Taiwan"},
    {"iata": "PEK", "name": "Beijing Capital International",
     "city": "Beijing", "region": "", "country": "China"},
    {"iata": "PVG", "name": "Shanghai Pudong International",
     "city": "Shanghai", "region": "", "country": "China"},
    {"iata": "DEL", "name": "Indira Gandhi International", "city": "Delhi",
     "region": "Delhi", "country": "India"},
    {"iata": "BOM", "name": "Chhatrapati Shivaji Maharaj International",
     "city": "Mumbai", "region": "Maharashtra", "country": "India"},
    {"iata": "SYD", "name": "Sydney Kingsford Smith", "city": "Sydney",
     "region": "NSW", "country": "Australia"},
    {"iata": "MEL", "name": "Melbourne", "city": "Melbourne",
     "region": "Victoria", "country": "Australia"},
    {"iata": "AKL", "name": "Auckland International", "city": "Auckland",
     "region": "", "country": "New Zealand"},
    {"iata": "KUL", "name": "Kuala Lumpur International",
     "city": "Kuala Lumpur", "region": "", "country": "Malaysia"},
    {"iata": "CGK", "name": "Soekarno-Hatta International",
     "city": "Jakarta", "region": "", "country": "Indonesia"},

    # ---- Europe (NATO / ADB / IMF priority) ----
    {"iata": "BRU", "name": "Brussels Airport", "city": "Brussels",
     "region": "", "country": "Belgium"},
    {"iata": "CDG", "name": "Charles de Gaulle", "city": "Paris",
     "region": "Île-de-France", "country": "France"},
    {"iata": "ORY", "name": "Paris-Orly", "city": "Paris",
     "region": "Île-de-France", "country": "France"},
    {"iata": "LHR", "name": "London Heathrow", "city": "London",
     "region": "England", "country": "UK"},
    {"iata": "LGW", "name": "London Gatwick", "city": "London",
     "region": "England", "country": "UK"},
    {"iata": "STN", "name": "London Stansted", "city": "London",
     "region": "England", "country": "UK"},
    {"iata": "AMS", "name": "Amsterdam Schiphol",
     "city": "Amsterdam", "region": "", "country": "Netherlands"},
    {"iata": "FRA", "name": "Frankfurt", "city": "Frankfurt",
     "region": "Hesse", "country": "Germany"},
    {"iata": "MUC", "name": "Munich", "city": "Munich", "region": "Bavaria",
     "country": "Germany"},
    {"iata": "BER", "name": "Berlin Brandenburg", "city": "Berlin",
     "region": "", "country": "Germany"},
    {"iata": "ZRH", "name": "Zurich", "city": "Zurich", "region": "",
     "country": "Switzerland"},
    {"iata": "GVA", "name": "Geneva", "city": "Geneva", "region": "",
     "country": "Switzerland"},
    {"iata": "FCO", "name": "Leonardo da Vinci International",
     "city": "Rome", "region": "Lazio", "country": "Italy"},
    {"iata": "MXP", "name": "Milan Malpensa", "city": "Milan",
     "region": "Lombardy", "country": "Italy"},
    {"iata": "MAD", "name": "Adolfo Suárez Madrid-Barajas",
     "city": "Madrid", "region": "", "country": "Spain"},
    {"iata": "BCN", "name": "Barcelona-El Prat", "city": "Barcelona",
     "region": "Catalonia", "country": "Spain"},
    {"iata": "LIS", "name": "Humberto Delgado", "city": "Lisbon",
     "region": "", "country": "Portugal"},
    {"iata": "VIE", "name": "Vienna International", "city": "Vienna",
     "region": "", "country": "Austria"},
    {"iata": "CPH", "name": "Copenhagen", "city": "Copenhagen",
     "region": "", "country": "Denmark"},
    {"iata": "ARN", "name": "Stockholm Arlanda", "city": "Stockholm",
     "region": "", "country": "Sweden"},
    {"iata": "OSL", "name": "Oslo Gardermoen", "city": "Oslo",
     "region": "", "country": "Norway"},
    {"iata": "HEL", "name": "Helsinki-Vantaa", "city": "Helsinki",
     "region": "", "country": "Finland"},
    {"iata": "DUB", "name": "Dublin", "city": "Dublin", "region": "",
     "country": "Ireland"},
    {"iata": "IST", "name": "Istanbul", "city": "Istanbul", "region": "",
     "country": "Turkey"},
    {"iata": "SVO", "name": "Sheremetyevo International", "city": "Moscow",
     "region": "", "country": "Russia"},

    # ---- Africa / Middle East ----
    {"iata": "DXB", "name": "Dubai International", "city": "Dubai",
     "region": "", "country": "UAE"},
    {"iata": "AUH", "name": "Abu Dhabi International", "city": "Abu Dhabi",
     "region": "", "country": "UAE"},
    {"iata": "DOH", "name": "Hamad International", "city": "Doha",
     "region": "", "country": "Qatar"},
    {"iata": "CAI", "name": "Cairo International", "city": "Cairo",
     "region": "", "country": "Egypt"},
    {"iata": "JNB", "name": "O.R. Tambo International",
     "city": "Johannesburg", "region": "Gauteng",
     "country": "South Africa"},
    {"iata": "CPT", "name": "Cape Town International",
     "city": "Cape Town", "region": "Western Cape",
     "country": "South Africa"},
    {"iata": "NBO", "name": "Jomo Kenyatta International",
     "city": "Nairobi", "region": "", "country": "Kenya"},
    {"iata": "ADD", "name": "Addis Ababa Bole International",
     "city": "Addis Ababa", "region": "", "country": "Ethiopia"},
    {"iata": "LOS", "name": "Murtala Muhammed International",
     "city": "Lagos", "region": "", "country": "Nigeria"},
    {"iata": "ABV", "name": "Nnamdi Azikiwe International",
     "city": "Abuja", "region": "", "country": "Nigeria"},
    {"iata": "YAO", "name": "Yaoundé Nsimalen International",
     "city": "Yaoundé", "region": "", "country": "Cameroon"},
    {"iata": "DLA", "name": "Douala International", "city": "Douala",
     "region": "", "country": "Cameroon"},
    {"iata": "ACC", "name": "Kotoka International", "city": "Accra",
     "region": "", "country": "Ghana"},
    {"iata": "DKR", "name": "Blaise Diagne International", "city": "Dakar",
     "region": "", "country": "Senegal"},
]

_IATA_INDEX = {a["iata"]: a for a in AIRPORTS}


def get_airport(iata: str) -> Optional[Dict[str, Any]]:
    return _IATA_INDEX.get((iata or "").upper())


# City → default IATA mapping (for auto-fill from home address).
HOME_CITY_TO_IATA: Dict[str, str] = {
    "STONE MOUNTAIN": "ATL", "ATLANTA": "ATL", "DECATUR": "ATL",
    "MARIETTA": "ATL", "SANDY SPRINGS": "ATL", "ROSWELL": "ATL",
    "MANILA": "MNL", "QUEZON CITY": "MNL", "MAKATI": "MNL",
    "BULACAN": "MNL", "MALOLOS": "MNL", "SAN JOSE DEL MONTE": "MNL",
    "CEBU": "CEB", "DAVAO": "DVO", "CLARK": "CRK", "ANGELES": "CRK",
    "BRUSSELS": "BRU", "PARIS": "CDG", "LONDON": "LHR",
    "AMSTERDAM": "AMS", "FRANKFURT": "FRA", "MUNICH": "MUC",
    "WASHINGTON": "DCA", "NEW YORK": "JFK", "BROOKLYN": "JFK",
    "LOS ANGELES": "LAX", "CHICAGO": "ORD", "SEATTLE": "SEA",
    "SAN FRANCISCO": "SFO", "BOSTON": "BOS", "MIAMI": "MIA",
    "TOKYO": "NRT", "SEOUL": "ICN", "SINGAPORE": "SIN",
    "BANGKOK": "BKK", "HONG KONG": "HKG", "DUBAI": "DXB",
    "YAOUNDE": "YAO", "YAOUNDÉ": "YAO", "DOUALA": "DLA",
    "LAGOS": "LOS", "ABUJA": "ABV", "NAIROBI": "NBO",
}


def resolve_home_iata(city: str, country: Optional[str] = None) -> Optional[str]:
    key = re.sub(r"[^A-Z ]", "", (city or "").upper()).strip()
    if not key:
        return None
    if key in HOME_CITY_TO_IATA:
        return HOME_CITY_TO_IATA[key]
    for token in key.split():
        if token in HOME_CITY_TO_IATA:
            return HOME_CITY_TO_IATA[token]
    return None


def search_airports(q: str, limit: int = 8) -> List[Dict[str, Any]]:
    if not q:
        return []
    ql = q.strip().upper()
    hits: List[Dict[str, Any]] = []

    # Exact IATA first
    if ql in _IATA_INDEX:
        hits.append({**_IATA_INDEX[ql], "match": "iata"})

    for a in AIRPORTS:
        if len(hits) >= limit:
            break
        if a["iata"] == ql:
            continue  # already added
        haystack = f"{a['iata']} {a['name']} {a['city']} {a['region']} {a['country']}".upper()
        if ql in haystack:
            reason = ("city" if ql in a["city"].upper()
                      else "country" if ql in a["country"].upper()
                      else "name" if ql in a["name"].upper()
                      else "iata_prefix")
            hits.append({**a, "match": reason})
    return hits[:limit]


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
class SavedRouteBody(BaseModel):
    origin_iata: str = Field(..., min_length=3, max_length=3)
    destination_iata: str = Field(..., min_length=3, max_length=3)
    label: Optional[str] = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


DEFAULT_ROUTES = [
    {"origin_iata": "ATL", "destination_iata": "MNL",
     "label": "Atlanta to Manila",
     "context": "Eden Heights Development", "default": True},
    {"origin_iata": "MNL", "destination_iata": "ATL",
     "label": "Manila to Atlanta", "context": "Return route",
     "default": True},
    {"origin_iata": "ATL", "destination_iata": "BRU",
     "label": "Atlanta to Brussels", "context": "NATO route",
     "default": True},
    {"origin_iata": "ATL", "destination_iata": "DCA",
     "label": "Atlanta to DC", "context": "Federal government",
     "default": True},
    {"origin_iata": "ATL", "destination_iata": "NRT",
     "label": "Atlanta to Tokyo", "context": "ADB connection hub",
     "default": True},
    {"origin_iata": "ATL", "destination_iata": "JFK",
     "label": "Atlanta to New York", "context": "UN / IMF route",
     "default": True},
]


def make_router(db, get_current_user_id):
    r = APIRouter(tags=["airports"])

    airports_r = APIRouter(prefix="/travel/airports")

    @airports_r.get("/search")
    async def search(q: str = Query(..., min_length=1, max_length=40),
                     limit: int = Query(8, ge=1, le=20)):
        return {"results": search_airports(q, limit)}

    @airports_r.get("/{iata}")
    async def get_by_iata(iata: str):
        a = get_airport(iata)
        if not a:
            raise HTTPException(404, "Airport not found")
        return a

    @airports_r.get("/home/auto-fill")
    async def home_autofill(user_id: str = Depends(get_current_user_id)):
        prof = await db.user_profile.find_one({"user_id": user_id}) or {}
        home_city = (prof.get("home_city")
                     or prof.get("city")
                     or prof.get("address_city") or "")
        home_country = (prof.get("home_country") or prof.get("country") or "")
        iata = resolve_home_iata(home_city, home_country)
        if not iata:
            iata = "ATL"  # Moses-safe default
        return {**(_IATA_INDEX.get(iata) or {}), "auto": True,
                "source_city": home_city or "Atlanta"}

    # ---- Saved routes ---------------------------------------------------
    routes = APIRouter(prefix="/travel/routes", tags=["travel-routes"])

    async def _ensure_seed(user_id: str):
        exists = await db.travel_saved_routes.count_documents({"user_id": user_id})
        if exists:
            return
        for d in DEFAULT_ROUTES:
            await db.travel_saved_routes.insert_one({
                **d, "route_id": f"rt_{uuid.uuid4().hex[:10]}",
                "user_id": user_id, "created_at": _now_iso(),
            })

    @routes.get("")
    async def list_routes(user_id: str = Depends(get_current_user_id)):
        await _ensure_seed(user_id)
        rows = await db.travel_saved_routes.find(
            {"user_id": user_id}, {"_id": 0}
        ).sort("created_at", 1).to_list(50)
        # Enrich each route with airport data
        for row in rows:
            row["origin"] = get_airport(row.get("origin_iata"))
            row["destination"] = get_airport(row.get("destination_iata"))
        return {"routes": rows}

    @routes.post("", status_code=201)
    async def create_route(body: SavedRouteBody,
                           user_id: str = Depends(get_current_user_id)):
        o = get_airport(body.origin_iata)
        d = get_airport(body.destination_iata)
        if not o or not d:
            raise HTTPException(400, "Invalid IATA code")
        route_id = f"rt_{uuid.uuid4().hex[:10]}"
        doc = {
            "route_id": route_id,
            "user_id": user_id,
            "origin_iata": o["iata"], "destination_iata": d["iata"],
            "label": body.label or f"{o['city']} to {d['city']}",
            "context": "Custom route", "default": False,
            "created_at": _now_iso(),
        }
        await db.travel_saved_routes.insert_one(doc)
        doc.pop("_id", None)
        doc["origin"] = o
        doc["destination"] = d
        return doc

    @routes.delete("/{route_id}")
    async def delete_route(route_id: str,
                           user_id: str = Depends(get_current_user_id)):
        res = await db.travel_saved_routes.delete_one(
            {"user_id": user_id, "route_id": route_id}
        )
        if res.deleted_count == 0:
            raise HTTPException(404, "Route not found")
        return {"ok": True}

    r.include_router(airports_r)
    r.include_router(routes)
    return r
