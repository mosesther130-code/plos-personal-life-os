"""
Enhancement 7 — Safety & Local backend tests.
Endpoints under /api/local/* defined in /app/backend/safety_local.py
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://life-os-hub-32.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
EMAIL = "test1@plos.app"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# -------------------- A. Offline Maps CRUD --------------------
class TestOfflineMaps:
    def test_01_list_auto_seeds(self, headers):
        r = requests.get(f"{API}/local/offline-maps", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "regions" in data
        assert "total_size_mb" in data
        assert data.get("is_mocked") is False
        names = [x.get("name") for x in data["regions"]]
        # Auto-seed (only on first call) – allow if previously seeded too
        assert any("Georgia" in n for n in names), f"Expected Georgia seed; got {names}"
        assert any("Bulacan" in n for n in names), f"Expected Bulacan seed; got {names}"

    def test_02_create_offline_map(self, headers):
        payload = {"name": "Florida, USA", "region_type": "state", "size_mb": 120, "notes": "Vacation"}
        r = requests.post(f"{API}/local/offline-maps", headers=headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        rid = r.json().get("id")
        assert rid
        pytest._florida_id = rid
        # Verify via GET
        g = requests.get(f"{API}/local/offline-maps", headers=headers, timeout=30).json()
        found = [x for x in g["regions"] if x.get("id") == rid]
        assert found and found[0]["name"] == "Florida, USA"
        assert found[0]["size_mb"] == 120

    def test_03_update_offline_map(self, headers):
        rid = pytest._florida_id
        payload = {"name": "Florida (Vacation)", "region_type": "state", "size_mb": 130}
        r = requests.put(f"{API}/local/offline-maps/{rid}", headers=headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        # Verify
        g = requests.get(f"{API}/local/offline-maps", headers=headers, timeout=30).json()
        found = [x for x in g["regions"] if x.get("id") == rid]
        assert found and found[0]["name"] == "Florida (Vacation)"
        assert found[0]["size_mb"] == 130

    def test_04_delete_offline_map(self, headers):
        rid = pytest._florida_id
        r = requests.delete(f"{API}/local/offline-maps/{rid}", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        g = requests.get(f"{API}/local/offline-maps", headers=headers, timeout=30).json()
        assert not any(x.get("id") == rid for x in g["regions"])


# -------------------- B. Live Travel Map --------------------
class TestTravelMap:
    def test_05_travel_map(self, headers):
        r = requests.get(f"{API}/local/travel-map", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # Trip may or may not exist; per spec test1 has Manila & Bulacan
        assert "trip" in data
        if data.get("trip"):
            assert "origin" in data
            assert "destination" in data
            assert "distance_miles" in data
            dest = data["destination"]
            # Manila coords ~14.6, ~120.98
            assert abs(dest["lat"] - 14.5995) < 0.5, f"dest lat: {dest}"
            assert abs(dest["lon"] - 120.9842) < 0.5, f"dest lon: {dest}"
            assert data["distance_miles"] > 0
        else:
            pytest.skip(f"No trip seeded for test1: {data}")


# -------------------- C. GPS Alerts --------------------
class TestGpsAlerts:
    def test_06_default_settings(self, headers):
        r = requests.get(f"{API}/local/gps-alerts/settings", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        s = r.json()
        # Either default or persisted from past iteration. Just verify keys exist.
        for k in ("enabled", "severe_weather", "crime_geofence", "travel_advisories", "speed_alerts", "radius_miles"):
            assert k in s, f"Missing key {k}: {s}"

    def test_07_update_then_get(self, headers):
        body = {
            "enabled": True,
            "severe_weather": False,
            "crime_geofence": True,
            "travel_advisories": True,
            "speed_alerts": True,
            "radius_miles": 10,
        }
        r = requests.put(f"{API}/local/gps-alerts/settings", headers=headers, json=body, timeout=30)
        assert r.status_code == 200, r.text
        # Persistence check
        g = requests.get(f"{API}/local/gps-alerts/settings", headers=headers, timeout=30).json()
        assert g["severe_weather"] is False
        assert g["speed_alerts"] is True
        assert g["crime_geofence"] is True
        assert g["radius_miles"] == 10

    def test_08_check_alerts(self, headers):
        body = {"lat": 33.749, "lon": -84.388}
        r = requests.post(f"{API}/local/gps-alerts/check", headers=headers, json=body, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("alerts", "count", "checked_at", "settings"):
            assert k in data, f"Missing {k}: {data}"
        assert isinstance(data["alerts"], list)
        assert data["count"] == len(data["alerts"])


# -------------------- D. Local Media --------------------
class TestLocalMedia:
    def test_09_media_atlanta(self, headers):
        r = requests.get(f"{API}/local/media", headers=headers, params={"lat": 33.749, "lon": -84.388}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["matched"] is True
        assert d["state"] == "GA"
        tv_names = [t["name"] for t in d["tv"]]
        radio_names = [t["name"] for t in d["radio"]]
        assert any("WSB" in n for n in tv_names), f"WSB-TV missing: {tv_names}"
        assert any("WABE" in n for n in radio_names), f"WABE missing: {radio_names}"

    def test_10_media_ny(self, headers):
        r = requests.get(f"{API}/local/media", headers=headers, params={"lat": 40.0, "lon": -74.0}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["matched"] is True
        assert d["state"] == "NY"
        assert len(d["tv"]) >= 1
        assert len(d["radio"]) >= 1

    def test_11_media_fallback(self, headers):
        r = requests.get(f"{API}/local/media", headers=headers, params={"lat": 0, "lon": 0}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["matched"] is False
        # National fallback content
        assert any("CBS" in t["name"] or "ABC" in t["name"] for t in d["tv"])
        assert any("NPR" in t["name"] for t in d["radio"])
