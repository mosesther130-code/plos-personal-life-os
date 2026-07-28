"""
Test Emergent Google Auth integration for PLOS.
Covers:
- POST /api/auth/google/session error paths (400/401)
- POST /api/auth/logout best-effort (200 with unknown token)
- get_current_user_id: JWT login regression + fake session_token -> 401 (not 500)
- MongoDB user_sessions indexes (session_token unique, expires_at TTL)
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path("/app/backend/.env"))
load_dotenv(Path("/app/frontend/.env"))

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ["EXPO_PUBLIC_BACKEND_URL"]
).rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

REVIEWER_EMAIL = "reviewer@plos-demo.com"
REVIEWER_PWD = "PLOSReview2026"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


# ---------- Google session error paths ----------
def test_google_session_missing_session_id(s):
    r = s.post(f"{API}/auth/google/session", json={"session_id": ""})
    assert r.status_code == 400, r.text


def test_google_session_short_session_id(s):
    r = s.post(f"{API}/auth/google/session", json={"session_id": "abc"})
    assert r.status_code == 400, r.text


def test_google_session_invalid_session_id_returns_401(s):
    # A well-formed-length but bogus id — Emergent should reject → 401
    r = s.post(
        f"{API}/auth/google/session",
        json={"session_id": "invalid_" + "x" * 40},
    )
    # Backend should map upstream non-200 to 401 (not 500)
    assert r.status_code in (401, 502), r.text
    # We want 401 primarily. 502 acceptable only if upstream unreachable.
    assert r.status_code == 401, (
        f"Expected 401 for invalid session_id, got {r.status_code}: {r.text}"
    )


# ---------- Logout best-effort ----------
def test_logout_unknown_token_returns_200(s):
    r = s.post(
        f"{API}/auth/logout",
        headers={"Authorization": "Bearer unknown_token_xyz"},
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True}


# ---------- Fake session_token in Authorization header ----------
def test_fake_session_token_returns_401_not_500(s):
    r = s.get(
        f"{API}/auth/me",
        headers={"Authorization": "Bearer completely_fake_session_token_12345"},
    )
    assert r.status_code == 401, f"Expected 401, got {r.status_code}: {r.text}"


# ---------- JWT regression (existing password auth) ----------
def test_jwt_login_and_me_regression(s):
    # Try login with reviewer creds; if not seeded, register a fresh test user
    login = s.post(
        f"{API}/auth/login",
        json={"email": REVIEWER_EMAIL, "password": REVIEWER_PWD},
    )
    if login.status_code != 200:
        # Fresh register fallback
        email = f"test_gauth_{int(time.time())}@example.com"
        reg = s.post(
            f"{API}/auth/register",
            json={"email": email, "password": "TempPass123!", "full_name": "Test User"},
        )
        assert reg.status_code == 200, reg.text
        token = reg.json()["token"]
    else:
        token = login.json()["token"]
        assert "user_id" in login.json()

    me = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    body = me.json()
    assert "user_id" in body and "email" in body


# ---------- Mongo indexes ----------
def test_user_sessions_indexes_exist():
    mc = MongoClient(MONGO_URL)
    coll = mc[DB_NAME].user_sessions
    # Trigger startup ensured indexes; give it a moment if just booted
    info = coll.index_information()
    # Find session_token unique index
    st_indexes = [
        (name, spec) for name, spec in info.items()
        if any(k[0] == "session_token" for k in spec.get("key", []))
    ]
    assert st_indexes, f"session_token index missing. Have: {list(info.keys())}"
    assert any(spec.get("unique") for _, spec in st_indexes), (
        f"session_token index is not unique: {st_indexes}"
    )
    # TTL on expires_at
    exp_indexes = [
        (name, spec) for name, spec in info.items()
        if any(k[0] == "expires_at" for k in spec.get("key", []))
    ]
    assert exp_indexes, f"expires_at index missing. Have: {list(info.keys())}"
    assert any("expireAfterSeconds" in spec for _, spec in exp_indexes), (
        f"expires_at index is not TTL: {exp_indexes}"
    )


# ---------- yarn.lock file exists ----------
def test_yarn_lock_exists_and_nonempty():
    p = Path("/app/frontend/yarn.lock")
    assert p.exists(), "yarn.lock missing"
    assert p.stat().st_size > 1000, f"yarn.lock too small: {p.stat().st_size} bytes"
