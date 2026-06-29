"""
Backend tests for Enhancement 9: AI Product Deal Finder
Endpoints under /api/shopping/deal-finder/*
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://life-os-hub-32.preview.emergentagent.com").rstrip("/")
EMAIL = "test1@plos.app"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    t = r.json().get("token")
    assert t
    return t


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ----- /retailers -----
def test_retailers(headers):
    r = requests.get(f"{BASE_URL}/api/shopping/deal-finder/retailers", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    rs = data.get("retailers", [])
    assert isinstance(rs, list) and len(rs) >= 15, f"expected >=15 retailers, got {len(rs)}"
    for must in ["Amazon", "Walmart", "Best Buy", "Costco"]:
        assert must in rs, f"missing {must}"


# ----- /searches (auto-seed) -----
def test_searches_autoseed(headers):
    r = requests.get(f"{BASE_URL}/api/shopping/deal-finder/searches", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    searches = data.get("searches", [])
    assert len(searches) >= 1
    # Verify field shape exists on at least one entry
    s = searches[-1]  # oldest entry (sorted desc by created_at) -> last is oldest
    expected_keys = {
        "id", "product", "max_price_usd", "target_price_usd", "preferred_retailers",
        "urgency", "quality_preference", "notes", "created_at",
        "last_results", "last_summary", "last_run_at",
    }
    for k in expected_keys:
        assert k in s, f"missing field {k} in search"


# ----- POST /searches -----
def test_create_search(headers):
    payload = {
        "product": "Nintendo Switch OLED",
        "max_price_usd": 400,
        "target_price_usd": 300,
        "preferred_retailers": ["Best Buy", "Target"],
        "urgency": "this_week",
        "quality_preference": "balanced",
        "notes": "Gift",
    }
    r = requests.post(f"{BASE_URL}/api/shopping/deal-finder/searches", headers=headers, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    sid = r.json().get("id")
    assert sid
    pytest.created_search_id = sid


def test_create_search_too_short(headers):
    r = requests.post(f"{BASE_URL}/api/shopping/deal-finder/searches", headers=headers, json={"product": "X"}, timeout=15)
    assert r.status_code == 400, r.text


# ----- PUT /searches/{id} -----
def test_update_search(headers):
    sid = getattr(pytest, "created_search_id", None)
    assert sid, "create test must run first"
    payload = {
        "product": "Nintendo Switch OLED",
        "max_price_usd": 400,
        "target_price_usd": 280,
        "preferred_retailers": ["Best Buy", "Target"],
        "urgency": "this_week",
        "quality_preference": "balanced",
        "notes": "Gift - updated notes",
    }
    r = requests.put(f"{BASE_URL}/api/shopping/deal-finder/searches/{sid}", headers=headers, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    # Verify via GET
    g = requests.get(f"{BASE_URL}/api/shopping/deal-finder/searches", headers=headers, timeout=15)
    assert g.status_code == 200
    found = next((s for s in g.json().get("searches", []) if s["id"] == sid), None)
    assert found is not None
    assert found["notes"] == "Gift - updated notes"


# ----- DELETE /searches/{id} -----
def test_delete_search(headers):
    sid = getattr(pytest, "created_search_id", None)
    assert sid
    r = requests.delete(f"{BASE_URL}/api/shopping/deal-finder/searches/{sid}", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    g = requests.get(f"{BASE_URL}/api/shopping/deal-finder/searches", headers=headers, timeout=15)
    found = next((s for s in g.json().get("searches", []) if s["id"] == sid), None)
    assert found is None


# ----- POST /find -----
def test_find_ai(headers):
    payload = {
        "product": "Apple Watch Series 10 GPS 45mm",
        "max_price_usd": 450,
        "urgency": "this_month",
        "quality_preference": "balanced",
    }
    r = requests.post(f"{BASE_URL}/api/shopping/deal-finder/find", headers=headers, json=payload, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data.get("summary"), str) and len(data["summary"]) > 5
    deals = data.get("deals", [])
    assert isinstance(deals, list) and len(deals) >= 3, f"expected >=3 deals, got {len(deals)}"
    for d in deals:
        assert "retailer" in d and isinstance(d["retailer"], str)
        assert "est_price_usd" in d and isinstance(d["est_price_usd"], (int, float))
        assert d.get("confidence") in {"high", "medium", "low"}
        assert "pros" in d and isinstance(d["pros"], str)
        assert "cons" in d and isinstance(d["cons"], str)


def test_find_too_short(headers):
    r = requests.post(f"{BASE_URL}/api/shopping/deal-finder/find", headers=headers, json={"product": "X"}, timeout=15)
    assert r.status_code == 400, r.text


# ----- POST /searches/{id}/refresh -----
def test_refresh_seeded(headers):
    # Use the seeded search (TV) or any existing one
    g = requests.get(f"{BASE_URL}/api/shopping/deal-finder/searches", headers=headers, timeout=15)
    assert g.status_code == 200
    searches = g.json().get("searches", [])
    assert len(searches) >= 1
    seeded = searches[0]
    sid = seeded["id"]

    r = requests.post(f"{BASE_URL}/api/shopping/deal-finder/searches/{sid}/refresh", headers=headers, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data.get("summary"), str)
    assert isinstance(data.get("deals"), list) and len(data["deals"]) >= 1

    # Verify persisted
    g2 = requests.get(f"{BASE_URL}/api/shopping/deal-finder/searches", headers=headers, timeout=15)
    after = next((s for s in g2.json().get("searches", []) if s["id"] == sid), None)
    assert after is not None
    assert after.get("last_run_at") is not None
    assert after.get("last_summary") is not None
    assert isinstance(after.get("last_results"), list) and len(after["last_results"]) >= 1


def test_refresh_invalid_id(headers):
    r = requests.post(f"{BASE_URL}/api/shopping/deal-finder/searches/nonexistent-id-xyz/refresh", headers=headers, timeout=15)
    assert r.status_code == 404, r.text
