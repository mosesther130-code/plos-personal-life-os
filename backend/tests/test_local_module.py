"""
PLOS Local Intelligence & Safety module backend tests.

Covers:
- Weather (real NWS) + graceful degradation
- Nearby services (mocked) + preferences toggle
- Gas prices (mocked, sorted)
- Recalls (real openFDA / CPSC / NHTSA)
- Family members (seeded Isaac/Ken) + invite + pause toggle
- Satellite status + offline maps
- SOS log + history persistence

Live-network tests assert either is_live or graceful error fallback (no 500s).
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL not set"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

TEST_EMAIL = "test1@plos.app"
TEST_PASSWORD = "test123"


# ============================ Fixtures =================================
@pytest.fixture(scope="module")
def auth_token():
    """Login (or register) the seeded test user and return JWT token."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})

    # Try login first
    r = s.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=15)
    if r.status_code != 200:
        # Try register
        r = s.post(
            f"{API}/auth/register",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD, "full_name": "Test User"},
            timeout=15,
        )
    assert r.status_code in (200, 201), f"Auth failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"No token in auth response: {data}"

    # Ensure local-module seed data exists (idempotent)
    try:
        s.post(f"{API}/seed-demo", headers={"Authorization": f"Bearer {token}"}, timeout=20)
    except Exception:
        pass
    return token


@pytest.fixture(scope="module")
def client(auth_token):
    s = requests.Session()
    s.headers.update(
        {"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}"}
    )
    return s


# ============================ Weather (NWS - live) =====================
class TestWeather:
    def test_weather_default_atlanta(self, client):
        r = client.get(f"{API}/local/weather", timeout=20)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert data.get("using_default_location") is True
        assert "current" in data and "forecast" in data and "alerts" in data
        if "error" not in data:
            # live NWS path
            cur = data["current"]
            assert "temperature" in cur and cur["temperature"] is not None
            for k in ("unit", "short_forecast", "icon", "wind_speed", "wind_direction"):
                assert k in cur
            assert isinstance(data["forecast"], list)
            assert len(data["forecast"]) >= 1
            # each forecast row has expected keys
            for d in data["forecast"]:
                assert {"day", "high", "low", "icon"}.issubset(d.keys())
            assert isinstance(data["alerts"], list)
        else:
            # graceful degradation
            assert isinstance(data["error"], str)
            assert data["current"] == {}
            assert data["forecast"] == []

    def test_weather_explicit_coords_no_default_flag(self, client):
        # San Francisco - not default
        r = client.get(f"{API}/local/weather?lat=37.7749&lon=-122.4194", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data.get("using_default_location") is False

    def test_weather_invalid_coords_no_500(self, client):
        # Send obviously off-grid coords -> backend should catch & return error field
        r = client.get(f"{API}/local/weather?lat=999&lon=999", timeout=20)
        assert r.status_code == 200
        data = r.json()
        # Either has error or somehow returns; must not crash
        assert "location" in data and "fetched_at" in data


# ============================ Nearby + Preferences =====================
class TestNearby:
    def test_nearby_returns_seeded_atlanta(self, client):
        r = client.get(f"{API}/local/nearby", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["is_mocked"] is True
        names = [h["name"] for h in data["hospitals"]]
        assert "Grady Memorial Hospital" in names
        assert "Emory Decatur Hospital" in names
        police = [p["name"] for p in data["police"]]
        assert any("DeKalb" in p for p in police)
        assert any("Stone Mountain" in p for p in police)
        # Filipino preference seeded => Grill City Filipino BBQ
        rest_names = [r_["name"] for r_ in data["restaurants"]]
        assert "Grill City Filipino BBQ" in rest_names
        parks = [p["name"] for p in data["parks"]]
        assert any("Stone Mountain" in p for p in parks)
        assert len(data["traffic"]) >= 1

    def test_preferences_update_flips_mocked_when_key_set(self, client):
        # Set Google Places API key
        r = client.put(
            f"{API}/local/preferences",
            json={"google_places_api_key": "TEST_FAKE_KEY_123"},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True

        nb = client.get(f"{API}/local/nearby", timeout=15).json()
        assert nb["is_mocked"] is False
        assert nb["has_places_key"] is True

        # Cleanup: clear the key
        r = client.put(
            f"{API}/local/preferences",
            json={"google_places_api_key": ""},
            timeout=10,
        )
        assert r.status_code == 200
        nb2 = client.get(f"{API}/local/nearby", timeout=15).json()
        assert nb2["is_mocked"] is True

    def test_preferences_cuisine_change(self, client):
        r = client.put(
            f"{API}/local/preferences",
            json={"cuisine_preference": "Italian"},
            timeout=10,
        )
        assert r.status_code == 200
        nb = client.get(f"{API}/local/nearby", timeout=15).json()
        # Should no longer be Filipino path
        rest_names = [r_["name"] for r_ in nb["restaurants"]]
        assert "Grill City Filipino BBQ" not in rest_names
        # Reset
        client.put(f"{API}/local/preferences", json={"cuisine_preference": "Filipino"}, timeout=10)


# ============================ Gas (mocked) =============================
class TestGas:
    def test_gas_sorted_by_price(self, client):
        r = client.get(f"{API}/local/gas", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["is_mocked"] is True
        stations = data["stations"]
        assert len(stations) == 3
        # Cheapest first
        assert stations[0]["name"] == "Murphy Express"
        assert stations[0]["price_per_gallon"] == 2.89
        assert stations[1]["name"] == "QuikTrip"
        assert stations[1]["price_per_gallon"] == 2.94
        assert stations[2]["name"] == "RaceTrac"
        assert stations[2]["price_per_gallon"] == 2.97


# ============================ Recalls (live) ===========================
class TestRecalls:
    def test_food_recalls_live_or_graceful(self, client):
        r = client.get(f"{API}/local/recalls/food", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "is_live" in data and "recalls" in data
        if data["is_live"]:
            assert data["source"] == "openFDA"
            assert len(data["recalls"]) <= 5
            assert len(data["recalls"]) >= 1
            r0 = data["recalls"][0]
            for k in ("recall_number", "product_description", "reason_for_recall", "recalling_firm", "recall_date"):
                assert k in r0
        else:
            assert isinstance(data.get("error", ""), str)

    def test_product_recalls_live_or_graceful(self, client):
        r = client.get(f"{API}/local/recalls/products", timeout=25)
        assert r.status_code == 200
        data = r.json()
        assert "is_live" in data and "recalls" in data
        if data["is_live"]:
            assert len(data["recalls"]) <= 5
            assert len(data["recalls"]) >= 1
            assert "title" in data["recalls"][0]
        else:
            assert isinstance(data.get("error", ""), str)

    def test_vehicle_recalls_2015_rav4(self, client):
        r = client.post(
            f"{API}/local/recalls/vehicle",
            json={"year": 2015, "make": "Toyota", "model": "RAV4"},
            timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        assert "is_live" in data and "recalls" in data
        if data["is_live"]:
            assert data["source"] == "NHTSA"
            assert data["recall_count"] >= 1
            r0 = data["recalls"][0]
            for k in ("campaign", "component", "consequence", "remedy"):
                assert k in r0
            assert data["vehicle"]["year"] == 2015
            assert data["vehicle"]["make"] == "Toyota"
            assert data["vehicle"]["model"] == "RAV4"
        else:
            assert isinstance(data.get("error", ""), str)


# ============================ Family ===================================
class TestFamily:
    def test_family_seeded(self, client):
        r = client.get(f"{API}/local/family", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["is_mocked"] is True
        members = data["members"]
        names = [m["name"] for m in members]
        assert "Isaac" in names and "Ken" in names
        assert len(members) >= 2
        # Validate colors
        for m in members:
            if m["name"] == "Isaac":
                assert m["color"] == "#A855F7"
                assert "Oak View Elementary" in m["last_address"]
            if m["name"] == "Ken":
                assert m["color"] == "#14B8A6"
                assert "Oak View Elementary" in m["last_address"]

    def test_family_invite_returns_link(self, client):
        r = client.post(f"{API}/local/family/invite", json={"name": "TEST_Cousin"}, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True
        assert "invite_link" in data and data["invite_link"].startswith("https://plos.app/invite/")
        assert data["name"] == "TEST_Cousin"

    def test_family_invite_requires_name(self, client):
        r = client.post(f"{API}/local/family/invite", json={"name": ""}, timeout=10)
        assert r.status_code == 400

    def test_pause_toggle_persists(self, client):
        # Pause
        r = client.put(f"{API}/local/family/pause", json={"paused": True}, timeout=10)
        assert r.status_code == 200
        assert r.json().get("paused") is True
        # Verify via GET
        fam = client.get(f"{API}/local/family", timeout=10).json()
        assert fam["self_paused"] is True
        # Unpause
        r2 = client.put(f"{API}/local/family/pause", json={"paused": False}, timeout=10)
        assert r2.status_code == 200
        assert r2.json().get("paused") is False
        fam2 = client.get(f"{API}/local/family", timeout=10).json()
        assert fam2["self_paused"] is False


# ============================ Satellite + Offline ======================
class TestSatelliteAndMaps:
    def test_satellite_status(self, client):
        r = client.get(f"{API}/local/satellite-status", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["gps_satellites_acquired"] == 9
        assert data["gps_satellites_total"] == 12
        assert data["gps_lock"] is True
        assert len(data["offline_maps"]["downloaded_regions"]) == 2
        assert data["satellite_messaging"]["configured"] is False
        # Should match seeded family member count (Isaac + Ken = 2)
        assert data["emergency_contacts_loaded"] >= 2

    def test_offline_maps_two_regions(self, client):
        r = client.get(f"{API}/local/offline-maps", timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert data["is_mocked"] is True
        assert len(data["regions"]) == 2
        names = [r_["name"] for r_ in data["regions"]]
        assert any("Georgia" in n for n in names)
        assert any("Bulacan" in n for n in names)
        for r_ in data["regions"]:
            assert r_["status"] == "downloaded"
            assert isinstance(r_["size_mb"], (int, float))


# ============================ SOS ======================================
class TestSOS:
    def test_sos_persist_and_history(self, client):
        # Trigger test SOS
        r = client.post(
            f"{API}/local/sos",
            json={"lat": 33.749, "lon": -84.388, "test_mode": True},
            timeout=10,
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True
        assert "event_id" in data
        assert data.get("test_mode") is True
        assert data.get("notified_count", 0) >= 2  # Isaac + Ken
        assert "Isaac" in data["contacts"] and "Ken" in data["contacts"]

        # Verify history
        hist = client.get(f"{API}/local/sos/history", timeout=10).json()
        assert "events" in hist
        ids = [e.get("event_id") for e in hist["events"]]
        assert data["event_id"] in ids


# ============================ Regression spot-checks ===================
class TestRegression:
    """Spot-check a few prior endpoints to ensure local module didn't break anything."""

    def test_dashboard_alive(self, client):
        r = client.get(f"{API}/dashboard", timeout=15)
        # Should be 200 or 404 if endpoint was removed; main thing: no 500
        assert r.status_code < 500, r.text[:200]

    def test_finance_summary_alive(self, client):
        r = client.get(f"{API}/finance/summary", timeout=15)
        assert r.status_code < 500

    def test_security_alive(self, client):
        r = client.get(f"{API}/security/dashboard", timeout=15)
        assert r.status_code < 500
