"""Iteration 14 — Backend regression for PUT /api/travel/trips/{id} on PH trip.
Also exposes helpers to cleanup PH trip before the UI test runs."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "https://life-os-hub-32.preview.emergentagent.com").rstrip("/")
EMAIL = "test1@plos.app"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    token = r.json()["token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _ph_trips(headers):
    r = requests.get(f"{BASE_URL}/api/travel/trips", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    return [t for t in r.json().get("trips", []) if (t.get("country_code") or "").upper() == "PH"]


def test_cleanup_existing_ph_trip(auth_headers):
    """Delete any existing PH trip(s) so the UI test starts in first-time-create state."""
    for t in _ph_trips(auth_headers):
        d = requests.delete(f"{BASE_URL}/api/travel/trips/{t['trip_id']}", headers=auth_headers, timeout=15)
        assert d.status_code in (200, 204), d.text
    assert _ph_trips(auth_headers) == []


def test_put_ph_trip_preserves_country_and_country_code(auth_headers):
    # Create a PH trip
    create_payload = {
        "destination_name": "TEST_PH_Backend",
        "city": "Manila",
        "country": "Philippines",
        "country_code": "PH",
        "purpose": "eden_heights",
        "status": "planning",
    }
    c = requests.post(f"{BASE_URL}/api/travel/trips", json=create_payload, headers=auth_headers, timeout=15)
    assert c.status_code in (200, 201), c.text
    trip_id = c.json()["trip_id"]
    try:
        # Verify create response
        assert c.json().get("country") == "Philippines"
        assert c.json().get("country_code") == "PH"
        assert c.json().get("flag") == "🇵🇭"

        # PUT: change title + purpose + dates
        put_payload = {
            "destination_name": "Test PH Trip",
            "city": "Manila",
            "country": "Philippines",
            "country_code": "PH",
            "departure_date": "2026-12-15",
            "return_date": "2026-12-30",
            "purpose": "conference",
            "status": "planning",
        }
        u = requests.put(f"{BASE_URL}/api/travel/trips/{trip_id}", json=put_payload, headers=auth_headers, timeout=15)
        assert u.status_code == 200, u.text

        # GET and verify persistence
        g = requests.get(f"{BASE_URL}/api/travel/trips/{trip_id}", headers=auth_headers, timeout=15)
        assert g.status_code == 200, g.text
        body = g.json()
        assert body.get("destination_name") == "Test PH Trip"
        assert body.get("purpose") == "conference"
        assert body.get("departure_date") == "2026-12-15"
        assert body.get("return_date") == "2026-12-30"
        assert body.get("country") == "Philippines"
        assert body.get("country_code") == "PH"
        assert body.get("flag") == "🇵🇭"
        assert "_id" not in body
        assert "user_id" not in body
    finally:
        requests.delete(f"{BASE_URL}/api/travel/trips/{trip_id}", headers=auth_headers, timeout=15)


def test_final_cleanup(auth_headers):
    """Make sure no PH trip leaks after backend regression."""
    for t in _ph_trips(auth_headers):
        requests.delete(f"{BASE_URL}/api/travel/trips/{t['trip_id']}", headers=auth_headers, timeout=15)
    assert _ph_trips(auth_headers) == []
