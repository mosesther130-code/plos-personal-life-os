"""PLAY-STORE PRE-SUBMISSION critical-modules smoke test (iteration 35).

Tests the 6 critical modules only: Auth, Dashboard, Finance, Career, Safety/Local, Chatbot.
LLM-dependent endpoints (daily-advice, chatbot) are treated as pass-with-warning if 402/500
due to budget exhaustion, provided they don't crash the server.
"""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://life-os-hub-32.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
EMAIL = "test1@plos.app"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# -------------------- 1) AUTHENTICATION --------------------
class TestAuth:
    def test_register_new_user(self):
        email = f"TEST_ps_{uuid.uuid4().hex[:8]}@plos.app"
        r = requests.post(f"{API}/auth/register",
                          json={"email": email, "password": "test1234", "full_name": "PlayStore Test"},
                          timeout=30)
        assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text[:300]}"
        body = r.json()
        assert body.get("token") or body.get("access_token"), f"no token in register response: {body}"

    def test_login_success(self, token):
        assert token

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": "wrongpass"}, timeout=30)
        assert r.status_code in (400, 401, 403), f"expected 401, got {r.status_code}"

    def test_me_with_valid_token(self, auth_headers):
        r = requests.get(f"{API}/auth/me", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"/me failed: {r.status_code} {r.text[:200]}"
        assert r.json().get("email") == EMAIL

    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"

    def test_me_invalid_token(self):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer not.a.token"}, timeout=30)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


# -------------------- 2) DAILY DASHBOARD --------------------
class TestDashboard:
    def test_dashboard(self, auth_headers):
        r = requests.get(f"{API}/dashboard", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"/dashboard failed: {r.status_code} {r.text[:300]}"
        d = r.json()
        # accept both flat and nested shapes
        keys = set(d.keys())
        assert any(k in keys for k in ["income", "monthly_income", "total_income"]), f"no income key: {keys}"
        assert any(k in keys for k in ["expenses", "monthly_expenses", "total_expenses"]), f"no expenses key: {keys}"
        assert any(k in keys for k in ["net_worth", "networth"]), f"no net_worth: {keys}"
        assert any(k in keys for k in ["health_score", "financial_health_score", "score"]), f"no health_score: {keys}"

    def test_daily_advice(self, auth_headers):
        r = requests.post(f"{API}/ai/daily-advice", headers=auth_headers, json={}, timeout=60)
        # graceful-degradation acceptable per request
        assert r.status_code in (200, 402, 429, 500, 503), f"/ai/daily-advice unexpected: {r.status_code} {r.text[:300]}"
        if r.status_code == 200:
            body = r.json()
            # accept advice/message/text OR the current shape (summary + items)
            assert any(k in body for k in ["advice", "message", "text", "summary", "items"]), f"no advice content: {body}"

    def test_alerts(self, auth_headers):
        r = requests.get(f"{API}/alerts", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"/alerts failed: {r.status_code}"
        data = r.json()
        # accept list or {alerts: [...]}
        alerts = data if isinstance(data, list) else data.get("alerts", [])
        assert isinstance(alerts, list), f"alerts not a list: {type(alerts)}"


# -------------------- 3) FINANCIAL SNAPSHOT --------------------
class TestFinance:
    def test_dashboard_snapshot(self, auth_headers):
        # actual endpoint used by frontend for Financial Snapshot is /plaid/snapshot-fusion
        r = requests.get(f"{API}/plaid/snapshot-fusion", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"snapshot-fusion failed: {r.status_code} {r.text[:300]}"
        d = r.json()
        # snapshot-fusion returns nested manual + plaid + variance structure
        assert "manual" in d or "plaid" in d, f"unexpected snapshot shape: {list(d.keys())}"

    def test_plaid_accounts(self, auth_headers):
        # frontend uses /plaid/items to list bank accounts
        r = requests.get(f"{API}/plaid/items", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"/plaid/items failed: {r.status_code} {r.text[:300]}"
        d = r.json()
        items = d if isinstance(d, list) else d.get("items", [])
        assert isinstance(items, list), "items not list"

    def test_plaid_transactions(self, auth_headers):
        r = requests.get(f"{API}/plaid/transactions?limit=20", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"/plaid/transactions failed: {r.status_code} {r.text[:300]}"
        d = r.json()
        txns = d if isinstance(d, list) else d.get("transactions", [])
        assert isinstance(txns, list)

    def test_debts(self, auth_headers):
        r = requests.get(f"{API}/debts", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"/debts failed: {r.status_code}"
        d = r.json()
        debts = d if isinstance(d, list) else d.get("debts", [])
        assert isinstance(debts, list)


# -------------------- 4) CAREER --------------------
class TestCareer:
    BLOCKLIST = ("halvolink", "learn4good", "bebee", "jobrapido")

    def test_profiles(self, auth_headers):
        r = requests.get(f"{API}/career/preferences/profiles", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"profiles failed: {r.status_code}"
        d = r.json()
        profiles = d if isinstance(d, list) else d.get("profiles", [])
        assert isinstance(profiles, list) and len(profiles) > 0, "no profiles"
        active = [p for p in profiles if p.get("is_active") or p.get("active")]
        assert len(active) >= 1, f"no active profile in {len(profiles)}"

    def test_verified_feed(self, auth_headers):
        r = requests.get(f"{API}/jobs/verified-feed?limit=30", headers=auth_headers, timeout=90)
        assert r.status_code == 200, f"verified-feed failed: {r.status_code} {r.text[:300]}"
        d = r.json()
        jobs = d if isinstance(d, list) else d.get("jobs", [])
        assert isinstance(jobs, list), "jobs not list"
        if jobs:
            for j in jobs:
                # employer_verified must be True
                assert j.get("employer_verified") is True, f"job not employer_verified: {j.get('employer','?')} src={j.get('source','?')}"
                # blocklist check across all string fields
                blob = " ".join(str(v) for v in j.values() if isinstance(v, (str, int, float))).lower()
                for bad in self.BLOCKLIST:
                    assert bad not in blob, f"blocklisted source '{bad}' present: {j.get('source')}, url={j.get('url')}"


# -------------------- 5) SAFETY & LOCAL --------------------
class TestSafetyLocal:
    def test_weather(self, auth_headers):
        r = requests.get(f"{API}/local/weather?lat=33.749&lon=-84.388", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"weather failed: {r.status_code} {r.text[:300]}"
        d = r.json()
        # look for temp + forecast
        has_temp = any(k in d for k in ["temperature", "temp", "current_temp", "current"])
        has_forecast = any(k in d for k in ["forecast", "daily", "days"])
        assert has_temp, f"no temperature field: {list(d.keys())}"
        assert has_forecast, f"no forecast field: {list(d.keys())}"

    def test_nearby(self, auth_headers):
        r = requests.get(f"{API}/local/nearby", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"nearby failed: {r.status_code}"

    def test_gas(self, auth_headers):
        r = requests.get(f"{API}/local/gas", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"gas failed: {r.status_code} {r.text[:200]}"


# -------------------- 6) CHATBOT --------------------
class TestChatbot:
    def test_conversations(self, auth_headers):
        r = requests.get(f"{API}/chatbot/conversations", headers=auth_headers, timeout=30)
        assert r.status_code == 200, f"conversations failed: {r.status_code}"

    def test_message(self, auth_headers):
        # actual chatbot message endpoint used by frontend is /chat (POST)
        r = requests.post(f"{API}/chat",
                          headers=auth_headers,
                          json={"message": "Say hello in 5 words."},
                          timeout=90)
        # graceful-degradation acceptable
        assert r.status_code in (200, 402, 429, 500, 503), f"chat unexpected: {r.status_code} {r.text[:300]}"
        if r.status_code == 200:
            body = r.json()
            assert any(k in body for k in ["response", "message", "text", "content", "reply"]), f"no response text: {body}"
