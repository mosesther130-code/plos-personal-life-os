"""Backend tests for PLOS Travel AI Flight+Hotel search (iteration 28).

Endpoints under test:
  POST /api/travel/trips/{trip_id}/search
  GET  /api/travel/trips/{trip_id}/search
  POST /api/travel/trips/{trip_id}/save-to-budget

Requires the seeded Manila trip id 5b452c2e-702b-4521-848e-dc1d818e6c01
belonging to user test1@plos.app.
"""
from __future__ import annotations

import os
import re
import time

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
# Main-agent-supplied id is stale; fall back to any Manila/Philippines trip.
PREFERRED_TRIP_ID = "5b452c2e-702b-4521-848e-dc1d818e6c01"
EMAIL = "test1@plos.app"
PASSWORD = "test123"

# Shared state (module scope) between ordered tests
STATE: dict = {}


@pytest.fixture(scope="module")
def token() -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    return data["token"]


@pytest.fixture(scope="module")
def headers(token) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ------------------------- Setup / discovery ---------------------------
def test_01_find_manila_trip(headers):
    r = requests.get(f"{BASE_URL}/api/travel/trips", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    trips = r.json().get("trips", [])
    assert trips, "no trips found for user"
    target = next((t for t in trips if t.get("trip_id") == PREFERRED_TRIP_ID), None)
    if target is None:
        # Preferred id stale — fall back to first Philippines trip
        target = next(
            (
                t for t in trips
                if "philippines" in (t.get("country") or "").lower()
                or (t.get("country_code") or "").upper() == "PH"
            ),
            None,
        )
    assert target is not None, (
        f"no Manila/Philippines trip found. Available: "
        f"{[(t.get('trip_id'), t.get('country')) for t in trips]}"
    )
    STATE["trip"] = target
    STATE["trip_id"] = target["trip_id"]
    STATE["start_date"] = (
        target.get("start_date") or target.get("departure_date") or ""
    )[:10]
    STATE["end_date"] = (
        target.get("end_date") or target.get("return_date") or ""
    )[:10]
    assert STATE["start_date"], f"trip missing start/departure date: {target}"
    assert STATE["end_date"], f"trip missing end/return date: {target}"
    country = (target.get("country") or "").lower()
    assert (
        "philippines" in country or (target.get("country_code") or "").upper() == "PH"
    ), f"expected Philippines trip, got country={target.get('country')!r}"


# ------------------------- POST /search --------------------------------
def test_02_post_search_returns_valid_structure(headers):
    assert STATE.get("trip"), "prerequisite test_01 must pass"
    start = time.time()
    trip_id = STATE["trip_id"]
    url = f"{BASE_URL}/api/travel/trips/{trip_id}/search"
    # generous 90s timeout for Claude
    try:
        r = requests.post(url, headers=headers, json={"force": True}, timeout=100)
    except requests.exceptions.Timeout:
        pytest.fail("Claude search exceeded 100s timeout")
    elapsed = time.time() - start
    STATE["elapsed_s"] = round(elapsed, 2)

    # retry once on 502 per task spec
    if r.status_code == 502:
        time.sleep(2)
        r = requests.post(url, headers=headers, json={"force": True}, timeout=100)

    assert r.status_code == 200, f"search failed {r.status_code}: {r.text[:500]}"
    assert elapsed <= 100, f"elapsed {elapsed:.1f}s exceeded budget"

    data = r.json()
    STATE["search_response"] = data

    # --- top-level keys ---
    for key in ("flights", "hotels", "trip_cost_summary", "extras", "searched_at"):
        assert key in data, f"missing top-level key '{key}'. keys={list(data.keys())}"

    # --- flights ---
    flights = data["flights"]
    assert isinstance(flights, list) and len(flights) == 3, (
        f"expected 3 flights, got {len(flights)}"
    )
    flight_cats = [f.get("category") for f in flights]
    for cat in ("Cheapest", "Fastest", "Best Value"):
        assert cat in flight_cats, f"missing flight category {cat}: {flight_cats}"

    flight_url_fields = (
        "booking_url_airline",
        "google_flights",
        "kayak",
        "expedia",
        "priceline",
        "skyscanner",
        "momondo",
    )
    for i, f in enumerate(flights):
        for uf in flight_url_fields:
            assert uf in f and f[uf], f"flight[{i}] missing url field {uf}: {f.keys()}"

    # --- hotels ---
    hotels = data["hotels"]
    assert isinstance(hotels, list) and len(hotels) == 3, (
        f"expected 3 hotels, got {len(hotels)}"
    )
    hotel_cats = [h.get("category") for h in hotels]
    for cat in ("Cheapest", "Best Location", "Best Value"):
        assert cat in hotel_cats, f"missing hotel category {cat}: {hotel_cats}"

    hotel_url_fields = (
        "booking_url_hotel_direct",
        "booking_url_booking_com",
        "booking_url_hotels_com",
        "booking_url_agoda",
        "booking_url_expedia",
        "booking_url_priceline",
        "booking_url_kayak",
    )
    for i, h in enumerate(hotels):
        for uf in hotel_url_fields:
            assert uf in h and h[uf], f"hotel[{i}] missing url field {uf}: {h.keys()}"

    # --- trip_cost_summary ---
    tcs = data["trip_cost_summary"]
    for k in ("cheapest_total_usd", "best_value_total_usd", "ai_recommendation"):
        assert k in tcs, f"trip_cost_summary missing {k}: {tcs}"

    # --- extras (Philippines mode) ---
    extras = data["extras"]
    assert extras.get("philippines_mode") is True, (
        f"philippines_mode not True: {extras}"
    )
    assert extras.get("bulacan_note"), f"bulacan_note empty: {extras}"
    airbnb = extras.get("airbnb_url")
    assert airbnb and airbnb.startswith("https://www.airbnb.com/"), (
        f"airbnb_url invalid: {airbnb!r}"
    )


# ------------------------- URL date fidelity ---------------------------
def test_03_all_booking_urls_contain_trip_dates():
    data = STATE.get("search_response")
    assert data, "prerequisite test_02 must pass"
    start = STATE["start_date"]
    end = STATE["end_date"]
    date_re = re.compile(r"\d{4}-\d{2}-\d{2}")

    flight_url_fields = (
        "booking_url_airline",
        "google_flights",
        "kayak",
        "expedia",
        "priceline",
        "skyscanner",
        "momondo",
    )
    hotel_url_fields = (
        "booking_url_hotel_direct",
        "booking_url_booking_com",
        "booking_url_hotels_com",
        "booking_url_agoda",
        "booking_url_expedia",
        "booking_url_priceline",
        "booking_url_kayak",
    )

    failures = []
    for i, f in enumerate(data["flights"]):
        for uf in flight_url_fields:
            url = f[uf]
            dates = date_re.findall(url)
            if uf == "booking_url_airline":
                # airline url is AI-provided; require presence of at least one
                # trip date OR skip check (may be a generic homepage-style link).
                if not dates:
                    continue
            if not dates:
                failures.append(f"flight[{i}].{uf} has no YYYY-MM-DD: {url}")
                continue
            # every date in url must be either start or end
            for d in dates:
                if d not in (start, end):
                    failures.append(
                        f"flight[{i}].{uf} date {d} != {start}|{end}: {url}"
                    )

    for i, h in enumerate(data["hotels"]):
        for uf in hotel_url_fields:
            url = h[uf]
            dates = date_re.findall(url)
            if uf == "booking_url_hotel_direct":
                if not dates:
                    continue
            if not dates:
                failures.append(f"hotel[{i}].{uf} has no YYYY-MM-DD: {url}")
                continue
            for d in dates:
                if d not in (start, end):
                    failures.append(
                        f"hotel[{i}].{uf} date {d} != {start}|{end}: {url}"
                    )

    assert not failures, "\n".join(failures[:15])


def test_04_agoda_and_google_flights_url_format():
    data = STATE.get("search_response")
    assert data
    # Agoda for the Cheapest hotel
    cheapest = next(h for h in data["hotels"] if h["category"] == "Cheapest")
    agoda = cheapest["booking_url_agoda"]
    assert "checkIn=" in agoda, f"agoda missing checkIn: {agoda}"
    assert "cid=1844104" in agoda, f"agoda missing cid=1844104: {agoda}"

    # Google flights for at least one flight
    f0 = data["flights"][0]
    gf = f0["google_flights"]
    assert "hl=en#flt=" in gf, f"google_flights missing hl=en#flt=: {gf}"
    assert "c:USD" in gf, f"google_flights missing c:USD: {gf}"
    origin = f0["departure_airport"]
    dest = f0["arrival_airport"]
    assert origin in gf and dest in gf, (
        f"google_flights missing airport codes {origin}/{dest}: {gf}"
    )


def test_05_count_unique_booking_urls():
    data = STATE.get("search_response")
    assert data
    urls: set = set()
    for f in data["flights"]:
        for uf in (
            "booking_url_airline",
            "google_flights",
            "kayak",
            "expedia",
            "priceline",
            "skyscanner",
            "momondo",
        ):
            urls.add(f[uf])
    STATE["unique_flight_url_count"] = len(urls)
    # Total addressable = 3 × 7 = 21. In practice the 6 deterministic
    # constructors produce identical URLs across categories (same origin/dest/
    # dates), so ~6 shared + up to 3 distinct airline URLs = ~9 unique.
    print(f"\n[REPORT] Unique flight booking URLs: {len(urls)} (of 21 possible)")
    assert len(urls) <= 21
    assert len(urls) >= 7, f"unexpectedly few unique flight urls: {len(urls)}"


# ------------------------- searched_at persisted -----------------------
def test_06_searched_at_persisted_on_trip(headers):
    r = requests.get(
        f"{BASE_URL}/api/travel/trips/{STATE['trip_id']}", headers=headers, timeout=15
    )
    assert r.status_code == 200
    trip = r.json()
    assert trip.get("searched_at"), f"searched_at not persisted: keys={list(trip.keys())}"


# ------------------------- GET /search ---------------------------------
def test_07_get_search_returns_cached(headers):
    r = requests.get(
        f"{BASE_URL}/api/travel/trips/{STATE['trip_id']}/search",
        headers=headers,
        timeout=15,
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    assert payload.get("has_results") is True, payload
    assert payload.get("stale") is False, f"expected stale=false: {payload}"
    results = payload.get("results")
    assert results and len(results.get("flights", [])) == 3
    assert len(results.get("hotels", [])) == 3


# ------------------------- Save to Budget ------------------------------
def test_08_save_to_budget(headers):
    r = requests.post(
        f"{BASE_URL}/api/travel/trips/{STATE['trip_id']}/save-to-budget",
        headers=headers,
        json={"total_usd": 1500, "label": "Manila trip - Eden Heights"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is True
    exp_id = data.get("expense_id")
    assert exp_id and exp_id.startswith("exp_"), f"bad expense_id: {exp_id}"
    STATE["expense_id"] = exp_id


def test_09_planned_expense_persisted(headers):
    """Verify record via mongo shell (planned_expenses has no HTTP API).
    We use a direct pymongo query for validation.
    """
    from pymongo import MongoClient

    client = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = client[os.environ.get("DB_NAME", "test_database")]
    exp_id = STATE.get("expense_id")
    assert exp_id, "prerequisite test_08 must pass"
    doc = db.planned_expenses.find_one({"expense_id": exp_id})
    assert doc, f"planned_expenses record {exp_id} not found"
    assert doc.get("category") == "Travel"
    assert doc.get("trip_id") == STATE["trip_id"]
    assert float(doc.get("amount_usd", 0)) == 1500.0
    assert doc.get("status") == "planned"
    assert doc.get("label") == "Manila trip - Eden Heights"


# ------------------------- Edge case -----------------------------------
def test_10_search_non_existent_trip_404(headers):
    r = requests.post(
        f"{BASE_URL}/api/travel/trips/does-not-exist-xyz/search",
        headers=headers,
        json={"force": True},
        timeout=20,
    )
    assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"
