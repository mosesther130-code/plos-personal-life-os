"""
Backend tests for Enhancement 8 — Global Tools: World Clock,
Time Zone Converter, and AI Best Meeting Time.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://life-os-hub-32.preview.emergentagent.com").rstrip("/")
EMAIL = "test1@plos.app"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# -------------------- Directory + Clocks CRUD --------------------
class TestDirectoryAndClocks:
    def test_directory(self, auth):
        r = requests.get(f"{BASE_URL}/api/world-clock/directory", headers=auth, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "timezones" in data
        assert len(data["timezones"]) >= 25
        # Each entry has label and tz
        for e in data["timezones"][:5]:
            assert "label" in e and "tz" in e

    def test_list_clocks_autoseeds(self, auth):
        r = requests.get(f"{BASE_URL}/api/world-clock/clocks", headers=auth, timeout=10)
        assert r.status_code == 200
        data = r.json()
        assert "clocks" in data
        clocks = data["clocks"]
        assert len(clocks) >= 1, "Should autoseed clocks on first call or have prior items"
        # Field validation
        for c in clocks:
            for f in ("id", "label", "tz", "is_home"):
                assert f in c, f"Missing field {f} in clock {c}"
            # local_time/local_date/utc_offset_hours present when tz valid
            assert "local_time" in c
            assert "local_date" in c
            assert "utc_offset_hours" in c

    def test_create_clock_tokyo(self, auth):
        r = requests.post(
            f"{BASE_URL}/api/world-clock/clocks",
            headers=auth,
            json={"label": "Tokyo TEST", "tz": "Asia/Tokyo", "is_home": False},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "id" in body
        pytest.tokyo_id = body["id"]

    def test_create_clock_invalid_tz(self, auth):
        r = requests.post(
            f"{BASE_URL}/api/world-clock/clocks",
            headers=auth,
            json={"label": "Bad", "tz": "Foo/Bar", "is_home": False},
            timeout=10,
        )
        assert r.status_code == 400

    def test_update_clock_home_mutex(self, auth):
        cid = getattr(pytest, "tokyo_id", None)
        assert cid, "tokyo_id must be set from previous test"
        r = requests.put(
            f"{BASE_URL}/api/world-clock/clocks/{cid}",
            headers=auth,
            json={"label": "Tokyo HQ TEST", "tz": "Asia/Tokyo", "is_home": True, "notes": ""},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        # Verify mutex: only one clock has is_home=True
        r2 = requests.get(f"{BASE_URL}/api/world-clock/clocks", headers=auth, timeout=10)
        clocks = r2.json()["clocks"]
        home = [c for c in clocks if c.get("is_home")]
        assert len(home) == 1, f"Mutex broken: {len(home)} clocks marked is_home"
        assert home[0]["id"] == cid
        assert home[0]["label"] == "Tokyo HQ TEST"

    def test_delete_clock(self, auth):
        cid = getattr(pytest, "tokyo_id", None)
        assert cid
        r = requests.delete(f"{BASE_URL}/api/world-clock/clocks/{cid}", headers=auth, timeout=10)
        assert r.status_code == 200


# -------------------- Time Zone Converter --------------------
class TestConverter:
    def test_convert_et_to_multi(self, auth):
        r = requests.post(
            f"{BASE_URL}/api/world-clock/convert",
            headers=auth,
            json={
                "source_tz": "America/New_York",
                "source_datetime": "2026-07-01T14:00",
                "targets": ["Asia/Manila", "Europe/London", "Asia/Tokyo"],
            },
            timeout=10,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        results = {x["tz"]: x for x in data["results"]}
        # ET 14:00 July 1 (EDT UTC-4) → UTC 18:00
        # Manila UTC+8 → 02:00 next day
        # London BST UTC+1 → 19:00 same day
        # Tokyo UTC+9 → 03:00 next day
        assert results["Asia/Manila"]["local_time"] == "02:00", results["Asia/Manila"]
        assert results["Europe/London"]["local_time"] == "19:00", results["Europe/London"]
        assert results["Asia/Tokyo"]["local_time"] == "03:00", results["Asia/Tokyo"]
        for tz, rr in results.items():
            assert "label" in rr
            assert "local_date" in rr
            assert "utc_offset_hours" in rr

    def test_convert_invalid_source(self, auth):
        r = requests.post(
            f"{BASE_URL}/api/world-clock/convert",
            headers=auth,
            json={"source_tz": "Foo/Bar", "source_datetime": "2026-07-01T14:00", "targets": ["Asia/Tokyo"]},
            timeout=10,
        )
        assert r.status_code == 400


# -------------------- Best Meeting Time (AI) --------------------
class TestBestMeetingAI:
    def test_best_meeting(self, auth):
        r = requests.post(
            f"{BASE_URL}/api/world-clock/best-meeting-time",
            headers=auth,
            json={
                "participants": [
                    {"label": "Atlanta", "tz": "America/New_York"},
                    {"label": "Manila", "tz": "Asia/Manila"},
                    {"label": "London", "tz": "Europe/London"},
                ],
                "duration_minutes": 60,
                "earliest_local_hour": 8,
                "latest_local_hour": 19,
            },
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "chosen_slot" in data and data["chosen_slot"] is not None
        cs = data["chosen_slot"]
        assert "utc_time" in cs
        assert "color" in cs
        assert "participants" in cs and len(cs["participants"]) == 3
        assert "candidates" in data and isinstance(data["candidates"], list)
        assert len(data["candidates"]) <= 6
        assert isinstance(data.get("reasoning"), str) and len(data["reasoning"]) > 0
        assert "base_date_utc" in data
        # YYYY-MM-DD shape
        assert len(data["base_date_utc"]) == 10 and data["base_date_utc"][4] == "-"

    def test_best_meeting_empty_participants(self, auth):
        r = requests.post(
            f"{BASE_URL}/api/world-clock/best-meeting-time",
            headers=auth,
            json={"participants": [], "duration_minutes": 60, "earliest_local_hour": 8, "latest_local_hour": 19},
            timeout=15,
        )
        assert r.status_code == 400

    def test_best_meeting_invalid_tz(self, auth):
        r = requests.post(
            f"{BASE_URL}/api/world-clock/best-meeting-time",
            headers=auth,
            json={
                "participants": [{"label": "Bad", "tz": "Foo/Bar"}],
                "duration_minutes": 60,
                "earliest_local_hour": 8,
                "latest_local_hour": 19,
            },
            timeout=15,
        )
        assert r.status_code == 400
