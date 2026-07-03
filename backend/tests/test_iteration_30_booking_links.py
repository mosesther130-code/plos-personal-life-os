"""
Iteration 30 — Travel Advisor scan booking_links + new fields.

Verifies POST /api/travel/trips/{id}/scan returns:
- booking_links.{flights_one_way, flights_round_trip, hotels} with {platform,url}
- URLs contain trip departure/return dates
- Google Flights URL encodes dep/ret dates
- Skyscanner uses lowercase IATA codes (MNL Philippines, HND Japan)
- Kayak uses uppercase IATA codes
- Booking.com hotel URL contains checkin/checkout=<dates>
- Agoda only for Asian destinations
- One-way-only trip: flights_round_trip empty, hotels empty
- price_confidence + notes fields present
- force_no_cache=True: two consecutive scans yield different scanned_at
- Regression: pin/edit/delete still work
"""
import os
import time
import urllib.parse as up
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://life-os-hub-32.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "test1@plos.app"
PASSWORD = "test123"


# ---------------------- fixtures ----------------------
@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def session(token):
    s = requests.Session()
    s.headers.update(
        {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    )
    return s


def _cleanup(session):
    trips = session.get(f"{API}/travel/trips", timeout=30).json().get("trips", [])
    for t in trips:
        name = t.get("destination_name") or ""
        if name.startswith("TEST_"):
            session.delete(f"{API}/travel/trips/{t['trip_id']}", timeout=20)


@pytest.fixture(scope="module", autouse=True)
def _pre_post_cleanup(session):
    _cleanup(session)
    yield
    _cleanup(session)


def _create_trip(session, name, dep=None, ret=None, country="Japan", cc="JP",
                 city=None, purpose="leisure", status="planning"):
    body = {
        "destination_name": name,
        "country": country,
        "country_code": cc,
        "city": city,
        "departure_date": dep,
        "return_date": ret,
        "purpose": purpose,
        "status": status,
    }
    r = session.post(f"{API}/travel/trips", json=body, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def _scan(session, tid):
    r = session.post(f"{API}/travel/trips/{tid}/scan", timeout=120)
    assert r.status_code == 200, f"scan failed: {r.status_code} {r.text[:400]}"
    return r.json()


def _find(links, platform):
    for item in links:
        if item["platform"].lower() == platform.lower():
            return item["url"]
    return None


# ---------------------- 1. Asian destination (Manila / Philippines) ----------------------
class TestBookingLinksManila:
    def test_manila_all_links_and_agoda_present(self, session):
        dep = "2026-06-01"
        ret = "2026-06-14"
        trip = _create_trip(
            session, "TEST_BL_Manila",
            dep=dep, ret=ret,
            country="Philippines", cc="PH", city="Manila",
        )
        tid = trip["trip_id"]
        try:
            data = _scan(session, tid)

            # New fields
            assert "price_confidence" in data
            assert "notes" in data
            assert data["price_confidence"] in ("low", "medium", "high")

            # booking_links present with 3 arrays
            bl = data.get("booking_links")
            assert isinstance(bl, dict), f"booking_links missing / wrong type: {type(bl)}"
            for key in ("flights_one_way", "flights_round_trip", "hotels"):
                assert key in bl, f"missing {key}"
                assert isinstance(bl[key], list) and len(bl[key]) > 0, \
                    f"{key} empty for round-trip Manila"
                for item in bl[key]:
                    assert "platform" in item and "url" in item, item
                    assert item["url"].startswith("http"), item["url"]

            # ---- Google Flights encodes dep + ret dates ----
            gf_ow = _find(bl["flights_one_way"], "Google Flights")
            assert gf_ow and "q=" in gf_ow
            gf_ow_dec = up.unquote_plus(gf_ow)
            assert dep in gf_ow_dec, f"one-way GF URL missing dep date: {gf_ow_dec}"

            gf_rt = _find(bl["flights_round_trip"], "Google Flights")
            assert gf_rt and "q=" in gf_rt
            gf_rt_dec = up.unquote_plus(gf_rt)
            assert dep in gf_rt_dec and ret in gf_rt_dec, \
                f"round-trip GF URL missing dep or ret: {gf_rt_dec}"

            # ---- Skyscanner: MNL for Philippines, LOWERCASE in path ----
            sky_ow = _find(bl["flights_one_way"], "Skyscanner")
            assert sky_ow, "Skyscanner one-way missing"
            assert "/mnl/" in sky_ow, f"Expected lowercase mnl in Skyscanner URL: {sky_ow}"
            assert dep in sky_ow, f"Skyscanner one-way missing dep date: {sky_ow}"
            assert "/atl/" in sky_ow or "/ATL/" not in sky_ow, \
                f"Skyscanner path segments should be lowercase: {sky_ow}"

            sky_rt = _find(bl["flights_round_trip"], "Skyscanner")
            assert sky_rt and "/mnl/" in sky_rt and dep in sky_rt and ret in sky_rt, sky_rt

            # ---- Kayak: uppercase IATA codes ----
            kayak_ow = _find(bl["flights_one_way"], "Kayak")
            assert kayak_ow, "Kayak one-way missing"
            # path segment must be ATL-MNL (uppercase)
            assert "ATL-MNL" in kayak_ow, f"Kayak should use uppercase IATA: {kayak_ow}"
            assert dep in kayak_ow

            kayak_rt = _find(bl["flights_round_trip"], "Kayak")
            assert kayak_rt and "ATL-MNL" in kayak_rt and dep in kayak_rt and ret in kayak_rt, kayak_rt

            # ---- Booking.com hotel: checkin=/checkout= present ----
            booking = _find(bl["hotels"], "Booking.com")
            assert booking, "Booking.com URL missing"
            assert f"checkin={dep}" in booking, f"Booking checkin missing: {booking}"
            assert f"checkout={ret}" in booking, f"Booking checkout missing: {booking}"

            # ---- Agoda link present for Asian destination ----
            agoda = _find(bl["hotels"], "Agoda")
            assert agoda is not None, "Agoda link should be present for Philippines"
            assert f"checkIn={dep}" in agoda and f"checkOut={ret}" in agoda, agoda
        finally:
            session.delete(f"{API}/travel/trips/{tid}", timeout=20)


# ---------------------- 2. Non-Asian destination (Paris / France) ----------------------
class TestBookingLinksParis:
    def test_paris_no_agoda_iata_cdg(self, session):
        dep = "2026-09-10"
        ret = "2026-09-20"
        trip = _create_trip(
            session, "TEST_BL_Paris",
            dep=dep, ret=ret,
            country="France", cc="FR", city="Paris",
        )
        tid = trip["trip_id"]
        try:
            data = _scan(session, tid)
            bl = data["booking_links"]

            # Skyscanner: /atl/cdg/ lowercase
            sky_rt = _find(bl["flights_round_trip"], "Skyscanner")
            assert sky_rt and "/cdg/" in sky_rt and "/atl/" in sky_rt, sky_rt
            assert dep in sky_rt and ret in sky_rt

            # Kayak uppercase
            kayak_rt = _find(bl["flights_round_trip"], "Kayak")
            assert kayak_rt and "ATL-CDG" in kayak_rt, kayak_rt

            # Booking.com dates
            booking = _find(bl["hotels"], "Booking.com")
            assert booking and f"checkin={dep}" in booking and f"checkout={ret}" in booking

            # Agoda must NOT be present for non-Asian destination
            agoda = _find(bl["hotels"], "Agoda")
            assert agoda is None, f"Agoda should NOT appear for France, got {agoda}"
        finally:
            session.delete(f"{API}/travel/trips/{tid}", timeout=20)


# ---------------------- 3. One-way-only trip (no return_date) ----------------------
class TestBookingLinksOneWayOnly:
    def test_no_return_date_no_rt_no_hotels(self, session):
        dep = "2026-05-15"
        trip = _create_trip(
            session, "TEST_BL_OneWay",
            dep=dep, ret=None,
            country="South Korea", cc="KR", city="Seoul",
        )
        tid = trip["trip_id"]
        try:
            data = _scan(session, tid)
            bl = data["booking_links"]

            # one-way populated
            assert len(bl["flights_one_way"]) > 0
            # round-trip empty
            assert bl["flights_round_trip"] == [], \
                f"Expected empty flights_round_trip for one-way trip, got {bl['flights_round_trip']}"
            # hotels empty (needs checkout date)
            assert bl["hotels"] == [], \
                f"Expected empty hotels for one-way trip, got {bl['hotels']}"

            # Skyscanner ICN for Seoul (one-way still built)
            sky_ow = _find(bl["flights_one_way"], "Skyscanner")
            assert sky_ow and "/icn/" in sky_ow and dep in sky_ow, sky_ow
        finally:
            session.delete(f"{API}/travel/trips/{tid}", timeout=20)


# ---------------------- 4. force_no_cache=True: fresh scan each time ----------------------
class TestScanNoCache:
    def test_two_scans_different_scanned_at(self, session):
        trip = _create_trip(
            session, "TEST_BL_NoCache",
            dep="2026-07-01", ret="2026-07-10",
            country="Japan", cc="JP", city="Tokyo",
        )
        tid = trip["trip_id"]
        try:
            d1 = _scan(session, tid)
            time.sleep(1.2)
            d2 = _scan(session, tid)
            # scanned_at must differ (server timestamp per call → confirms not returning cached)
            assert d1["scanned_at"] != d2["scanned_at"], \
                f"scanned_at unchanged across scans: {d1['scanned_at']} == {d2['scanned_at']}"
        finally:
            session.delete(f"{API}/travel/trips/{tid}", timeout=20)


# ---------------------- 5. Regression: pin / edit / delete ----------------------
class TestRegression:
    def test_pin_toggle(self, session):
        trip = _create_trip(session, "TEST_BL_Pin", dep="2026-06-01", ret="2026-06-10")
        tid = trip["trip_id"]
        try:
            r = session.put(f"{API}/travel/trips/{tid}/pin", json={"pinned": True}, timeout=20)
            assert r.status_code == 200 and r.json() == {"ok": True, "pinned": True}
            g = session.get(f"{API}/travel/trips/{tid}", timeout=20)
            assert g.json().get("pinned") is True
        finally:
            session.delete(f"{API}/travel/trips/{tid}", timeout=20)

    def test_edit_persists(self, session):
        trip = _create_trip(session, "TEST_BL_Edit_Before", dep="2026-05-01", ret="2026-05-10",
                            country="Spain", cc="ES")
        tid = trip["trip_id"]
        try:
            body = {
                "destination_name": "TEST_BL_Edit_After",
                "country": "Spain", "country_code": "ES",
                "departure_date": "2026-07-15", "return_date": "2026-07-25",
                "purpose": "business", "status": "booked",
            }
            r = session.put(f"{API}/travel/trips/{tid}", json=body, timeout=30)
            assert r.status_code == 200
            g = session.get(f"{API}/travel/trips/{tid}", timeout=20).json()
            assert g["destination_name"] == "TEST_BL_Edit_After"
            assert g["status"] == "booked"
            assert g["departure_date"] == "2026-07-15"
        finally:
            session.delete(f"{API}/travel/trips/{tid}", timeout=20)

    def test_delete_removes(self, session):
        trip = _create_trip(session, "TEST_BL_Delete", dep="2026-08-01", ret="2026-08-10")
        tid = trip["trip_id"]
        r = session.delete(f"{API}/travel/trips/{tid}", timeout=20)
        assert r.status_code == 200 and r.json() == {"ok": True}
        g = session.get(f"{API}/travel/trips/{tid}", timeout=20)
        assert g.status_code == 404
