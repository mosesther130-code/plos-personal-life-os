"""Backend tests for PLOS Career v2 tracks + editable job sources."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL is required")

TEST_EMAIL = "test1@plos.app"
TEST_PASSWORD = "test123"

V2_NAMES = {
    "International Organizations Track",
    "Nonprofit & Foundations Track",
    "Global Development Consulting Track",
    "Remote-First Global Track",
}


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": TEST_EMAIL, "password": TEST_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Profiles / Tracks ----------
class TestTracks:
    def test_list_returns_seven_profiles_including_v2(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/career/preferences/profiles",
                         headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        profiles = r.json().get("profiles", [])
        names = [p.get("profile_name") for p in profiles]
        assert len(profiles) >= 7, f"expected >=7 tracks, got {len(profiles)}: {names}"
        for v in V2_NAMES:
            assert v in names, f"missing v2 track: {v}. got {names}"

    def test_v2_seed_flag_is_idempotent(self, auth_headers):
        # A second call should NOT duplicate v2 tracks.
        r1 = requests.get(f"{BASE_URL}/api/career/preferences/profiles",
                          headers=auth_headers, timeout=15).json()
        r2 = requests.get(f"{BASE_URL}/api/career/preferences/profiles",
                          headers=auth_headers, timeout=15).json()
        n1 = [p["profile_name"] for p in r1["profiles"]]
        n2 = [p["profile_name"] for p in r2["profiles"]]
        assert n1 == n2, "profile list changed between calls — v2 seed not idempotent"
        # Each v2 name must appear exactly once
        for v in V2_NAMES:
            assert n2.count(v) == 1, f"duplicated: {v}"

    def test_rename_profile(self, auth_headers):
        # Pick the Remote-First Global Track
        profiles = requests.get(f"{BASE_URL}/api/career/preferences/profiles",
                                headers=auth_headers, timeout=15).json()["profiles"]
        target = next((p for p in profiles if p["profile_name"] == "Remote-First Global Track"), None)
        assert target, "Remote-First Global Track missing"
        pid = target["profile_id"]
        original_name = target["profile_name"]
        new_name = original_name + " TEST"
        body = {**{k: v for k, v in target.items()
                   if k in {"is_default", "target_roles", "excluded_keywords",
                            "sectors", "locations", "work_types", "min_salary",
                            "max_salary", "include_no_salary", "experience_levels",
                            "education_requirement", "clearance_filter",
                            "ranking_weights", "alert_min_match_score",
                            "alert_min_rank", "alert_frequency_cap",
                            "quiet_hours_start", "quiet_hours_end"}},
                "profile_name": new_name}
        r = requests.put(f"{BASE_URL}/api/career/preferences/profiles/{pid}",
                         json=body, headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        # Verify persistence
        profiles2 = requests.get(f"{BASE_URL}/api/career/preferences/profiles",
                                 headers=auth_headers, timeout=15).json()["profiles"]
        found = next((p for p in profiles2 if p["profile_id"] == pid), None)
        assert found and found["profile_name"] == new_name
        # Revert
        body["profile_name"] = original_name
        requests.put(f"{BASE_URL}/api/career/preferences/profiles/{pid}",
                     json=body, headers=auth_headers, timeout=15)

    def test_delete_profile_and_verify(self, auth_headers):
        # Create a temp profile, delete it, verify gone
        payload = {
            "profile_name": f"TEST_TEMP_{int(time.time())}",
            "is_default": False,
            "target_roles": [], "excluded_keywords": [],
            "sectors": [], "locations": [], "work_types": ["remote"],
            "min_salary": 65000, "include_no_salary": True,
            "experience_levels": ["senior"],
        }
        r = requests.post(f"{BASE_URL}/api/career/preferences/profiles",
                          json=payload, headers=auth_headers, timeout=15)
        assert r.status_code == 201, r.text
        pid = r.json()["profile_id"]
        d = requests.delete(f"{BASE_URL}/api/career/preferences/profiles/{pid}",
                            headers=auth_headers, timeout=15)
        assert d.status_code == 200, d.text
        profiles = requests.get(f"{BASE_URL}/api/career/preferences/profiles",
                                headers=auth_headers, timeout=15).json()["profiles"]
        assert not any(p["profile_id"] == pid for p in profiles)


# ---------- Job Sources ----------
class TestJobSources:
    def test_list_sources(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/career/preferences/sources",
                         headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "sources" in data
        assert isinstance(data["sources"], list)
        assert len(data["sources"]) > 0

    def test_create_update_delete_source(self, auth_headers):
        # CREATE
        payload = {
            "label": f"TEST_Custom_{int(time.time())}",
            "kind": "custom_url",
            "url": "https://example.com/feed.rss",
            "update_frequency_min": 120,
        }
        r = requests.post(f"{BASE_URL}/api/career/preferences/sources",
                          json=payload, headers=auth_headers, timeout=15)
        assert r.status_code == 201, r.text
        created = r.json()
        sid = created["source_id"]
        assert created["label"] == payload["label"]
        assert created["kind"] == "custom_url"
        assert created["update_frequency_min"] == 120
        assert created.get("paused") is False

        # UPDATE label + paused + frequency
        new_label = payload["label"] + "_R"
        u = requests.put(
            f"{BASE_URL}/api/career/preferences/sources/{sid}",
            json={"label": new_label, "paused": True, "update_frequency_min": 60},
            headers=auth_headers, timeout=15,
        )
        assert u.status_code == 200, u.text
        # Verify
        sources = requests.get(f"{BASE_URL}/api/career/preferences/sources",
                               headers=auth_headers, timeout=15).json()["sources"]
        found = next((s for s in sources if s["source_id"] == sid), None)
        assert found, "source disappeared after update"
        assert found["label"] == new_label
        assert found["paused"] is True
        assert found["update_frequency_min"] == 60

        # DELETE
        d = requests.delete(f"{BASE_URL}/api/career/preferences/sources/{sid}",
                            headers=auth_headers, timeout=15)
        assert d.status_code == 200
        # Verify gone
        sources2 = requests.get(f"{BASE_URL}/api/career/preferences/sources",
                                headers=auth_headers, timeout=15).json()["sources"]
        assert not any(s["source_id"] == sid for s in sources2)

    def test_delete_builtin_source_and_restore(self, auth_headers):
        # Delete a built-in seed (remotive)
        d = requests.delete(f"{BASE_URL}/api/career/preferences/sources/remotive",
                            headers=auth_headers, timeout=15)
        assert d.status_code in (200, 404), d.text
        # Restore defaults
        r = requests.post(f"{BASE_URL}/api/career/preferences/sources/restore-defaults",
                          headers=auth_headers, timeout=15)
        assert r.status_code == 200, r.text
        payload = r.json()
        assert "restored" in payload
        # Should be non-negative int
        assert isinstance(payload["restored"], int)
        # After restore, remotive should exist
        sources = requests.get(f"{BASE_URL}/api/career/preferences/sources",
                               headers=auth_headers, timeout=15).json()["sources"]
        assert any(s["source_id"] == "remotive" for s in sources), \
            "remotive not restored"

    def test_restore_defaults_does_not_duplicate(self, auth_headers):
        # Running restore-defaults when everything present should return restored=0
        r = requests.post(f"{BASE_URL}/api/career/preferences/sources/restore-defaults",
                          headers=auth_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["restored"] == 0
        # No duplicate source_ids overall
        sources = requests.get(f"{BASE_URL}/api/career/preferences/sources",
                               headers=auth_headers, timeout=15).json()["sources"]
        ids = [s["source_id"] for s in sources]
        assert len(ids) == len(set(ids)), f"duplicate source_ids: {ids}"

    def test_update_missing_source_returns_404(self, auth_headers):
        r = requests.put(
            f"{BASE_URL}/api/career/preferences/sources/does_not_exist_xyz",
            json={"paused": True}, headers=auth_headers, timeout=15,
        )
        assert r.status_code == 404
