"""PLOS Backend API tests"""
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://life-os-hub-32.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

EXISTING_EMAIL = "test1@plos.app"
EXISTING_PASSWORD = "test123"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def existing_token(client):
    r = client.post(f"{API}/auth/login", json={"email": EXISTING_EMAIL, "password": EXISTING_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth_headers(existing_token):
    return {"Authorization": f"Bearer {existing_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def fresh_user(client):
    """Register a new user for register-flow tests."""
    email = f"test_{uuid.uuid4().hex[:10]}@plos.app"
    r = client.post(f"{API}/auth/register", json={
        "email": email, "password": "Passw0rd!", "full_name": "TEST User"
    })
    assert r.status_code == 200, f"register failed: {r.text}"
    data = r.json()
    return {"email": email, "password": "Passw0rd!", "token": data["token"], "user_id": data["user_id"]}


# ---- Health ----
def test_health_root(client):
    r = client.get(f"{API}/")
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "ok"


# ---- Auth ----
def test_register_returns_token(fresh_user):
    assert fresh_user["token"]
    assert fresh_user["user_id"]


def test_register_duplicate_rejected(client, fresh_user):
    r = client.post(f"{API}/auth/register", json={
        "email": fresh_user["email"], "password": "x", "full_name": "dup"
    })
    assert r.status_code == 400


def test_login_existing(existing_token):
    assert existing_token


def test_login_wrong_password(client):
    r = client.post(f"{API}/auth/login", json={"email": EXISTING_EMAIL, "password": "wrong"})
    assert r.status_code == 401


def test_me_requires_auth(client):
    r = client.get(f"{API}/auth/me")
    assert r.status_code in (401, 403)


def test_me_returns_profile(client, auth_headers):
    r = client.get(f"{API}/auth/me", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == EXISTING_EMAIL
    assert "_id" not in body


# ---- Seed demo ----
def test_seed_demo(client, auth_headers):
    r = client.post(f"{API}/seed-demo", headers=auth_headers)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True


# ---- Dashboard ----
def test_dashboard(client, auth_headers):
    r = client.get(f"{API}/dashboard", headers=auth_headers)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ["financial_health_score", "net_worth", "monthly_income", "monthly_expenses",
              "monthly_cashflow", "recent_ai_decisions"]:
        assert k in d, f"missing key {k}"
    assert d["monthly_income"] > 0
    assert d["monthly_expenses"] > 0
    assert isinstance(d["recent_ai_decisions"], list)
    for dec in d["recent_ai_decisions"]:
        assert "_id" not in dec


# ---- CRUD helper ----
@pytest.mark.parametrize("resource,create_payload,id_field", [
    ("income", {"source_name": "TEST_Side", "type": "side", "gross_monthly": 1000, "net_monthly": 800}, "income_id"),
    ("expenses", {"category": "TEST", "vendor": "TEST_Vendor", "monthly_amount": 50}, "expense_id"),
    ("debts", {"debt_type": "credit_card", "lender": "TEST_Bank", "balance": 100, "apr": 1.0, "minimum_payment": 10}, "debt_id"),
    ("assets", {"asset_type": "vehicle", "name": "TEST_Car", "current_value": 1000, "purchase_value": 2000}, "asset_id"),
    ("investments", {"type": "brokerage", "balance": 100}, "investment_id"),
    ("job-applications", {"employer": "TEST_Co", "role_title": "TEST_Role", "match_score": 50}, "application_id"),
])
def test_crud_resources(client, auth_headers, resource, create_payload, id_field):
    # list
    r = client.get(f"{API}/{resource}", headers=auth_headers)
    assert r.status_code == 200, f"{resource} list: {r.text}"
    items = r.json()
    assert isinstance(items, list)
    for it in items:
        assert "_id" not in it
    # create
    r = client.post(f"{API}/{resource}", json=create_payload, headers=auth_headers)
    assert r.status_code == 200, f"{resource} create: {r.text}"
    created = r.json()
    rid = created[id_field]
    # verify in list
    r2 = client.get(f"{API}/{resource}", headers=auth_headers)
    assert any(i.get(id_field) == rid for i in r2.json())
    # delete
    r3 = client.delete(f"{API}/{resource}/{rid}", headers=auth_headers)
    assert r3.status_code == 200
    # verify removed
    r4 = client.get(f"{API}/{resource}", headers=auth_headers)
    assert not any(i.get(id_field) == rid for i in r4.json())


# ---- Career ----
def test_career_get_put(client, auth_headers):
    r = client.get(f"{API}/career", headers=auth_headers)
    assert r.status_code == 200
    r = client.put(f"{API}/career", json={"current_title": "TEST_Eng", "ats_score": 90}, headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["current_title"] == "TEST_Eng"
    assert body["ats_score"] == 90


# ---- Health profile ----
def test_health_profile_get_put(client, auth_headers):
    r = client.get(f"{API}/health-profile", headers=auth_headers)
    assert r.status_code == 200
    r = client.put(f"{API}/health-profile", json={"wellness_checkin_score": 8}, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["wellness_checkin_score"] == 8


# ---- AI Decisions list ----
def test_ai_decisions_list(client, auth_headers):
    r = client.get(f"{API}/ai-decisions", headers=auth_headers)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    for it in items:
        assert "_id" not in it


# ---- AI advice ----
def test_ai_advice_finance(client, auth_headers):
    r = client.post(f"{API}/ai/advice", json={"module": "finance"}, headers=auth_headers, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("priority") in ("urgent", "action", "info")
    assert body.get("advice_text")
    assert body.get("module") == "finance"


# ---- Chat ----
def test_chat_and_history(client, auth_headers):
    msg = "Give me one quick finance tip."
    r = client.post(f"{API}/chat", json={"message": msg}, headers=auth_headers, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("response")
    sid = body.get("session_id")
    assert sid

    # history
    time.sleep(1)
    r2 = client.get(f"{API}/chat/history?session_id={sid}", headers=auth_headers)
    assert r2.status_code == 200
    history = r2.json()
    assert any(h.get("role") == "user" and h.get("content") == msg for h in history)
    assert any(h.get("role") == "assistant" for h in history)
    for h in history:
        assert "_id" not in h


# ---- Unauth checks ----
@pytest.mark.parametrize("path", ["/dashboard", "/income", "/expenses", "/debts", "/assets", "/investments",
                                   "/career", "/health-profile", "/ai-decisions", "/chat/history"])
def test_endpoints_require_auth(client, path):
    r = client.get(f"{API}{path}")
    assert r.status_code in (401, 403), f"{path} returned {r.status_code}"
