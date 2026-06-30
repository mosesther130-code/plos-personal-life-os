"""Backend tests for family CRUD endpoints (PUT/DELETE) - iteration 25."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL", "").rstrip("/") or os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
TEST_EMAIL = "test1@plos.app"
TEST_PASSWORD = "test123"


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# --- Family member create/update/delete round trip ---
def test_family_member_full_crud(headers):
    # Create
    r = requests.post(
        f"{BASE_URL}/api/local/family/invite",
        json={"name": "TEST Member"},
        headers=headers,
        timeout=30,
    )
    assert r.status_code == 200, r.text
    member_id = r.json()["member_id"]
    assert member_id

    try:
        # Update
        upd = requests.put(
            f"{BASE_URL}/api/local/family/members/{member_id}",
            json={"name": "Renamed", "relation": "Sibling", "color": "#10B981"},
            headers=headers,
            timeout=30,
        )
        assert upd.status_code == 200, upd.text
        assert upd.json().get("ok") is True

        # Verify persistence
        g = requests.get(f"{BASE_URL}/api/local/family", headers=headers, timeout=30)
        assert g.status_code == 200
        members = g.json().get("members", [])
        match = next((m for m in members if m["member_id"] == member_id), None)
        assert match is not None, "Member missing after update"
        assert match["name"] == "Renamed"
        assert match["relation"] == "Sibling"
        assert match["color"] == "#10B981"
        # initials should be regenerated from "Renamed" => "R"
        assert match["initials"] == "R", f"expected initials R, got {match['initials']}"
    finally:
        # Delete
        d = requests.delete(
            f"{BASE_URL}/api/local/family/members/{member_id}",
            headers=headers,
            timeout=30,
        )
        assert d.status_code == 200, d.text
        assert d.json().get("ok") is True

        # Verify gone
        g2 = requests.get(f"{BASE_URL}/api/local/family", headers=headers, timeout=30)
        ids = [m["member_id"] for m in g2.json().get("members", [])]
        assert member_id not in ids, "Member still present after delete"


# --- Edge: bogus member_id PUT/DELETE -> 404 ---
def test_update_bogus_member_returns_404(headers):
    r = requests.put(
        f"{BASE_URL}/api/local/family/members/does-not-exist-xyz",
        json={"name": "Whatever"},
        headers=headers,
        timeout=30,
    )
    assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"


def test_delete_bogus_member_returns_404(headers):
    r = requests.delete(
        f"{BASE_URL}/api/local/family/members/does-not-exist-xyz",
        headers=headers,
        timeout=30,
    )
    assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"


# --- Edge: PUT with no editable fields -> 400 ---
def test_update_no_editable_fields_returns_400(headers):
    # create a throwaway member to ensure target exists (so 400 is from validation, not 404)
    inv = requests.post(
        f"{BASE_URL}/api/local/family/invite",
        json={"name": "TEST Edge"},
        headers=headers,
        timeout=30,
    )
    assert inv.status_code == 200
    mid = inv.json()["member_id"]
    try:
        r = requests.put(
            f"{BASE_URL}/api/local/family/members/{mid}",
            json={"foo": "bar"},
            headers=headers,
            timeout=30,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
    finally:
        requests.delete(
            f"{BASE_URL}/api/local/family/members/{mid}", headers=headers, timeout=30
        )
