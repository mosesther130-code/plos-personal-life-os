"""Iteration 26 — Firebase integration tests.

Covers:
- /api/family-locations/status (Firestore admin readiness)
- /api/family-locations/sync (hydrate from MongoDB into Firestore)
- /api/family-locations/simulate (move a member ~0.5mi; verify haversine)
- /api/push/categories (six categories with label+trigger)
- /api/register-push (deferred OR registered both pass)
- /api/push/test (valid category deferred/sent; invalid -> 400)
"""
from __future__ import annotations

import math
import os

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    BASE_URL = "https://life-os-hub-32.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")

EMAIL = "test1@plos.app"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# -------- /api/family-locations/status ------------------------------------
def test_family_locations_status(auth):
    r = requests.get(f"{BASE_URL}/api/family-locations/status", headers=auth, timeout=15)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    assert data.get("firestore_available") is True, f"firestore not available: {data}"
    assert data.get("collection") == "family_locations"
    assert "note" in data and "TODO" in data["note"]


# -------- /api/family-locations/sync --------------------------------------
def test_family_locations_sync_first(auth):
    r = requests.post(f"{BASE_URL}/api/family-locations/sync", headers=auth, timeout=30)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert data.get("ok") is True
    assert data.get("synced", 0) >= 1
    members = data.get("members") or []
    assert len(members) >= 1
    for m in members:
        assert m.get("result", {}).get("ok") is True, f"sync write failed: {m}"


def test_family_locations_sync_idempotent(auth):
    """Second sync should still succeed with identical member_ids."""
    r1 = requests.post(f"{BASE_URL}/api/family-locations/sync", headers=auth, timeout=30)
    r2 = requests.post(f"{BASE_URL}/api/family-locations/sync", headers=auth, timeout=30)
    assert r1.status_code == 200 and r2.status_code == 200
    ids1 = sorted([m["member_id"] for m in r1.json()["members"]])
    ids2 = sorted([m["member_id"] for m in r2.json()["members"]])
    assert ids1 == ids2, "Sync should be idempotent w.r.t. member_ids"


# -------- /api/family-locations/simulate ----------------------------------
def _haversine_miles(lat1, lon1, lat2, lon2):
    R = 3958.7613
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def test_family_locations_simulate_distance(auth):
    # Make sure sync ran at least once so we have members.
    requests.post(f"{BASE_URL}/api/family-locations/sync", headers=auth, timeout=30)
    # Try Isaac first; fall back if 404.
    payload = {"member_name": "Isaac", "distance_miles": 0.5}
    r = requests.post(
        f"{BASE_URL}/api/family-locations/simulate", headers=auth, json=payload, timeout=30
    )
    if r.status_code == 404:
        # Pick first available member name from sync
        sync = requests.post(
            f"{BASE_URL}/api/family-locations/sync", headers=auth, timeout=30
        ).json()
        first_name = sync["members"][0]["name"]
        payload = {"member_name": first_name, "distance_miles": 0.5}
        r = requests.post(
            f"{BASE_URL}/api/family-locations/simulate", headers=auth, json=payload, timeout=30
        )
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert data.get("ok") is True
    prev = data["previous"]
    nw = data["new"]
    assert "lat" in prev and "lon" in prev
    assert "lat" in nw and "lon" in nw
    assert "bearing_deg" in data
    assert data["distance_miles"] == 0.5
    dist = _haversine_miles(prev["lat"], prev["lon"], nw["lat"], nw["lon"])
    # ±5% tolerance
    assert abs(dist - 0.5) <= 0.025, f"Distance {dist:.4f} mi not within ±5% of 0.5"


# -------- /api/push/categories --------------------------------------------
EXPECTED_CATEGORIES = {
    "financial_alerts",
    "security_alerts",
    "job_matches",
    "weather_alerts",
    "deal_alerts",
    "reminders",
}


def test_push_categories():
    r = requests.get(f"{BASE_URL}/api/push/categories", timeout=15)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    cats = data.get("categories")
    assert isinstance(cats, list) and len(cats) == 6
    keys = {c["key"] for c in cats}
    assert keys == EXPECTED_CATEGORIES, f"category keys mismatch: {keys}"
    for c in cats:
        assert isinstance(c.get("label"), str) and c["label"]
        assert isinstance(c.get("trigger"), str) and c["trigger"]


# -------- /api/register-push ---------------------------------------------
def test_register_push(auth):
    r = requests.post(
        f"{BASE_URL}/api/register-push",
        headers=auth,
        json={"platform": "ios", "device_token": "test-token-abc123"},
        timeout=15,
    )
    assert r.status_code == 201, f"{r.status_code} {r.text[:200]}"
    data = r.json()
    status = data.get("status")
    assert status in ("registered", "deferred"), f"unexpected status: {data}"
    if status == "deferred":
        assert data.get("reason") in ("key_placeholder", "upstream_unavailable", "network_error"), data


# -------- /api/push/test --------------------------------------------------
def test_push_test_valid_category(auth):
    r = requests.post(
        f"{BASE_URL}/api/push/test",
        headers=auth,
        json={"category": "financial_alerts", "title": "Test", "message": "Hello"},
        timeout=15,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    data = r.json()
    status = data.get("status")
    assert status in ("sent", "deferred"), f"unexpected status: {data}"
    if status == "deferred":
        assert data.get("reason") in ("key_placeholder", "upstream_unavailable", "network_error"), data


def test_push_test_invalid_category(auth):
    r = requests.post(
        f"{BASE_URL}/api/push/test",
        headers=auth,
        json={"category": "INVALID"},
        timeout=15,
    )
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"
