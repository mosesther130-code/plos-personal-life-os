"""
Iteration 29 — Travel Advisor: pin/unpin, scan, edit, delete + list sort.

Covers new/updated endpoints:
- GET  /api/travel/trips           (sorted: pinned first, then dep asc)
- POST /api/travel/trips           (create)
- PUT  /api/travel/trips/{id}      (edit: destination_name, dates, purpose, status)
- DELETE /api/travel/trips/{id}    (delete)
- PUT  /api/travel/trips/{id}/pin  (toggle pinned; persists)
- POST /api/travel/trips/{id}/scan (AI Router real_time_research -> Claude fallback)

Existing endpoints (regression):
- POST /api/travel/insights
- GET  /api/travel/checklist/{id}
- GET/PUT /api/travel/cost-estimate/{id}
"""
import os
import time
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


def _cleanup_test_trips(session):
    """Delete any lingering TEST_ prefixed trips from previous runs."""
    trips = session.get(f"{API}/travel/trips", timeout=30).json().get("trips", [])
    for t in trips:
        name = t.get("destination_name") or ""
        if name.startswith("TEST_"):
            session.delete(f"{API}/travel/trips/{t['trip_id']}", timeout=20)


@pytest.fixture(scope="module", autouse=True)
def _pre_post_cleanup(session):
    _cleanup_test_trips(session)
    yield
    _cleanup_test_trips(session)


def _create_trip(session, name, dep=None, ret=None, country="Japan", cc="JP",
                 purpose="leisure", status="planning"):
    body = {
        "destination_name": name,
        "country": country,
        "country_code": cc,
        "departure_date": dep,
        "return_date": ret,
        "purpose": purpose,
        "status": status,
    }
    r = session.post(f"{API}/travel/trips", json=body, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------- 1. Pin / Unpin ----------------------
class TestPinTrip:
    def test_pin_toggle_and_persist(self, session):
        trip = _create_trip(session, "TEST_PinTrip_A", dep="2026-06-01", ret="2026-06-10")
        tid = trip["trip_id"]
        try:
            # pin=True
            r = session.put(f"{API}/travel/trips/{tid}/pin", json={"pinned": True}, timeout=30)
            assert r.status_code == 200, r.text
            data = r.json()
            assert data == {"ok": True, "pinned": True}

            # GET verify persistence
            g = session.get(f"{API}/travel/trips/{tid}", timeout=20)
            assert g.status_code == 200
            assert g.json().get("pinned") is True

            # unpin
            r2 = session.put(f"{API}/travel/trips/{tid}/pin", json={"pinned": False}, timeout=30)
            assert r2.status_code == 200
            assert r2.json() == {"ok": True, "pinned": False}

            g2 = session.get(f"{API}/travel/trips/{tid}", timeout=20)
            assert g2.json().get("pinned") is False
        finally:
            session.delete(f"{API}/travel/trips/{tid}", timeout=20)

    def test_pin_missing_trip_returns_404(self, session):
        r = session.put(
            f"{API}/travel/trips/nonexistent-trip-id-abc123/pin",
            json={"pinned": True}, timeout=30,
        )
        assert r.status_code == 404


# ---------------------- 2. List sort: pinned first, then dep asc ----------------------
class TestListSort:
    def test_pinned_first_then_dep_asc(self, session):
        # Create three trips with different dep dates; pin the last-departing one.
        early = _create_trip(session, "TEST_Sort_Early", dep="2026-03-01", ret="2026-03-10", cc="FR", country="France")
        mid = _create_trip(session, "TEST_Sort_Mid",   dep="2026-06-01", ret="2026-06-10", cc="DE", country="Germany")
        late = _create_trip(session, "TEST_Sort_Late",  dep="2026-09-01", ret="2026-09-10", cc="IT", country="Italy")
        try:
            # Pin the LATE trip — it must appear first, then early, then mid.
            pr = session.put(f"{API}/travel/trips/{late['trip_id']}/pin",
                             json={"pinned": True}, timeout=30)
            assert pr.status_code == 200

            r = session.get(f"{API}/travel/trips", timeout=30)
            assert r.status_code == 200
            trips = r.json()["trips"]
            # Filter down to just our TEST_Sort_* trips (there may be other user trips)
            ours = [t for t in trips if (t.get("destination_name") or "").startswith("TEST_Sort_")]
            assert len(ours) == 3
            # Order: TEST_Sort_Late (pinned) first, then Early (2026-03-01), then Mid (2026-06-01)
            names = [t["destination_name"] for t in ours]
            assert names == ["TEST_Sort_Late", "TEST_Sort_Early", "TEST_Sort_Mid"], names

            # Sanity: pinned trip must have pinned=True in list response
            assert ours[0].get("pinned") is True
        finally:
            for t in (early, mid, late):
                session.delete(f"{API}/travel/trips/{t['trip_id']}", timeout=20)


# ---------------------- 3. Edit trip ----------------------
class TestEditTrip:
    def test_put_updates_fields_and_persists(self, session):
        trip = _create_trip(
            session, "TEST_Edit_Before", dep="2026-05-01", ret="2026-05-10",
            country="Spain", cc="ES", purpose="leisure", status="planning",
        )
        tid = trip["trip_id"]
        try:
            body = {
                "destination_name": "TEST_Edit_After",
                "country": "Spain",
                "country_code": "ES",
                "departure_date": "2026-07-15",
                "return_date": "2026-07-25",
                "purpose": "business",
                "status": "booked",
            }
            r = session.put(f"{API}/travel/trips/{tid}", json=body, timeout=30)
            assert r.status_code == 200, r.text
            updated = r.json()
            assert updated["destination_name"] == "TEST_Edit_After"
            assert updated["departure_date"] == "2026-07-15"
            assert updated["return_date"] == "2026-07-25"
            assert updated["purpose"] == "business"
            assert updated["status"] == "booked"

            g = session.get(f"{API}/travel/trips/{tid}", timeout=20)
            assert g.status_code == 200
            gj = g.json()
            assert gj["destination_name"] == "TEST_Edit_After"
            assert gj["status"] == "booked"
            assert gj["purpose"] == "business"
            assert gj["departure_date"] == "2026-07-15"
        finally:
            session.delete(f"{API}/travel/trips/{tid}", timeout=20)


# ---------------------- 4. Delete trip ----------------------
class TestDeleteTrip:
    def test_delete_removes_trip(self, session):
        trip = _create_trip(session, "TEST_Delete_Me", dep="2026-08-01", ret="2026-08-10")
        tid = trip["trip_id"]

        r = session.delete(f"{API}/travel/trips/{tid}", timeout=20)
        assert r.status_code == 200
        assert r.json() == {"ok": True}

        g = session.get(f"{API}/travel/trips/{tid}", timeout=20)
        assert g.status_code == 404

    def test_delete_missing_returns_404(self, session):
        r = session.delete(f"{API}/travel/trips/does-not-exist-xyz", timeout=20)
        assert r.status_code == 404


# ---------------------- 5. Scan (AI Router fallback) ----------------------
class TestScanTrip:
    def test_scan_returns_prices_and_persists(self, session):
        trip = _create_trip(
            session, "TEST_Scan_Tokyo",
            dep="2026-06-01", ret="2026-06-14",
            country="Japan", cc="JP", purpose="leisure",
        )
        tid = trip["trip_id"]
        try:
            t0 = time.time()
            r = session.post(f"{API}/travel/trips/{tid}/scan", timeout=120)
            elapsed = time.time() - t0
            assert r.status_code == 200, f"scan failed ({elapsed:.1f}s): {r.status_code} {r.text[:400]}"
            data = r.json()

            # Required response keys
            for k in [
                "best_one_way_usd", "best_round_trip_usd", "avg_hotel_per_night_usd",
                "weather_snapshot", "advisory", "top_deal",
                "scanned_at", "platform_used", "model_used",
            ]:
                assert k in data, f"missing key {k} in scan response: {list(data.keys())}"

            # platform_used should be a real provider — with the Perplexity 401
            # fallback, we expect 'claude'. Accept either.
            assert data["platform_used"] in ("claude", "perplexity", "openai", "gemini"), data["platform_used"]

            # scanned_at is an ISO timestamp
            assert isinstance(data["scanned_at"], str) and "T" in data["scanned_at"]

            # Persistence — GET must contain scan_result + last_scanned_at
            g = session.get(f"{API}/travel/trips/{tid}", timeout=30)
            assert g.status_code == 200
            gj = g.json()
            assert "scan_result" in gj, f"scan_result not persisted: {list(gj.keys())}"
            assert "last_scanned_at" in gj
            assert gj["scan_result"]["platform_used"] == data["platform_used"]
        finally:
            session.delete(f"{API}/travel/trips/{tid}", timeout=20)

    def test_scan_missing_trip_returns_404(self, session):
        r = session.post(f"{API}/travel/trips/nope-nope-nope/scan", timeout=30)
        assert r.status_code == 404


# ---------------------- 6. Regression — existing endpoints still work ----------------------
class TestExistingEndpoints:
    def test_insights_ph_fast_path(self, session):
        body = {
            "destination_name": "Manila & Bulacan",
            "country": "Philippines",
            "country_code": "PH",
            "city": "Manila",
            "purpose": "eden_heights",
        }
        r = session.post(f"{API}/travel/insights", json=body, timeout=60)
        assert r.status_code == 200, r.text
        ins = r.json()["insights"]
        assert ins["local_currency"] == "PHP"

    def test_checklist_after_create(self, session):
        trip = _create_trip(session, "TEST_Checklist_Trip",
                            dep="2026-04-01", ret="2026-04-10",
                            country="Singapore", cc="SG", purpose="leisure")
        tid = trip["trip_id"]
        try:
            r = session.get(f"{API}/travel/checklist/{tid}", timeout=30)
            assert r.status_code == 200
            items = r.json()["items"]
            assert len(items) >= 10
            assert any(i["key"] == "passport_valid" for i in items)
        finally:
            session.delete(f"{API}/travel/trips/{tid}", timeout=20)

    def test_cost_estimate_put_get(self, session):
        trip = _create_trip(session, "TEST_Cost_Trip",
                            dep="2026-04-01", ret="2026-04-10",
                            country="Singapore", cc="SG")
        tid = trip["trip_id"]
        try:
            body = {"flights": 900, "hotel_per_night": 100, "nights": 9,
                    "daily_budget": 50, "days": 10, "visa_fees": 0,
                    "insurance": 60, "misc": 150}
            rp = session.put(f"{API}/travel/cost-estimate/{tid}", json=body, timeout=30)
            assert rp.status_code == 200
            rg = session.get(f"{API}/travel/cost-estimate/{tid}", timeout=20)
            assert rg.status_code == 200
            est = rg.json()["estimate"]
            assert est["flights"] == 900
            assert est["hotel_per_night"] == 100
        finally:
            session.delete(f"{API}/travel/trips/{tid}", timeout=20)
