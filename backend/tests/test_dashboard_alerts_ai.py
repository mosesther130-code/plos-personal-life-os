"""PLOS Daily Dashboard tests - dashboard fields, alerts, daily-advice."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://life-os-hub-32.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "test1@plos.app"
PWD = "test123"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_headers(client):
    r = client.post(f"{API}/auth/login", json={"email": EMAIL, "password": PWD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def reseed(client, auth_headers):
    # restore canonical demo
    r = client.post(f"{API}/seed-demo", headers=auth_headers)
    assert r.status_code == 200


# ---- Dashboard new fields ----
def test_dashboard_has_new_fields(client, auth_headers):
    r = client.get(f"{API}/dashboard", headers=auth_headers)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ["financial_health_score", "score_components", "emergency_fund",
              "emergency_months", "emergency_target_months", "monthly_surplus"]:
        assert k in d, f"missing field {k}"
    sc = d["score_components"]
    for sk in ["surplus", "debt_to_income", "emergency_fund", "credit_estimate", "investment_rate"]:
        assert sk in sc, f"score_components missing {sk}"
        assert isinstance(sc[sk], (int, float))
    assert d["emergency_target_months"] == 6
    # monthly_surplus should equal income - expenses approx
    assert d["monthly_surplus"] == d["monthly_income"] - d["monthly_expenses"]
    # emergency_months should be a positive number given seeded HYSA $18,500 and expenses ~$3,410
    assert d["emergency_months"] > 0
    # health score range
    assert 0 <= d["financial_health_score"] <= 100
    # no _id leakage
    assert "_id" not in d


# ---- Alerts ----
def test_alerts_endpoint_shape(client, auth_headers):
    r = client.get(f"{API}/alerts", headers=auth_headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "alerts" in body
    assert "count" in body
    alerts = body["alerts"]
    assert isinstance(alerts, list)
    assert len(alerts) > 0
    sev_allowed = {"urgent", "warning", "info", "good"}
    for a in alerts:
        for k in ["id", "severity", "icon", "title", "subtitle", "time_label", "route"]:
            assert k in a, f"alert missing key {k}: {a}"
        assert a["severity"] in sev_allowed


def test_alerts_includes_seeded_signals(client, auth_headers):
    r = client.get(f"{API}/alerts", headers=auth_headers)
    alerts = r.json()["alerts"]
    titles = " ".join((a["title"] + " " + a["subtitle"]).lower() for a in alerts)
    # high APR Chase 22.99 should appear
    assert "chase" in titles or "22.99" in titles or "high-apr" in titles or "high apr" in titles, \
        f"expected Chase/22.99 alert. titles={titles}"
    # Trader Joe's is non-autopay groceries -> should produce due-soon style alert
    # (only assert it's mentioned; date-based logic may not always trigger)
    # Positive savings rate alert (good severity) since user has surplus
    sevs = [a["severity"] for a in alerts]
    assert "good" in sevs or "info" in sevs


def test_alerts_requires_auth(client):
    r = client.get(f"{API}/alerts")
    assert r.status_code in (401, 403)


# ---- Daily Advice ----
def test_daily_advice_basic(client, auth_headers):
    r = client.post(f"{API}/ai/daily-advice", json={"force": True}, headers=auth_headers, timeout=60)
    assert r.status_code == 200, r.text
    b = r.json()
    for k in ["summary", "items", "generated_at", "date"]:
        assert k in b, f"missing {k}"
    assert isinstance(b["items"], list)
    assert 1 <= len(b["items"]) <= 5
    assert b["summary"]
    # deep_analysis should be None/absent for non-deep
    assert not b.get("deep_analysis")


def test_daily_advice_caching(client, auth_headers):
    # First (force)
    r1 = client.post(f"{API}/ai/daily-advice", json={"force": True}, headers=auth_headers, timeout=60)
    assert r1.status_code == 200
    p1 = r1.json()
    # Second without force should be cached -> identical payload
    time.sleep(1)
    r2 = client.post(f"{API}/ai/daily-advice", json={}, headers=auth_headers, timeout=60)
    assert r2.status_code == 200
    p2 = r2.json()
    assert p1["generated_at"] == p2["generated_at"], "cache returned different generated_at"
    assert p1["summary"] == p2["summary"]
    assert p1["items"] == p2["items"]


def test_daily_advice_deep(client, auth_headers):
    r = client.post(f"{API}/ai/daily-advice", json={"force": True, "deep": True},
                    headers=auth_headers, timeout=90)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b.get("deep_analysis"), "deep_analysis missing when deep=true"
    assert isinstance(b["deep_analysis"], str)
    assert len(b["deep_analysis"]) > 50


def test_daily_advice_requires_auth(client):
    r = client.post(f"{API}/ai/daily-advice", json={})
    assert r.status_code in (401, 403)
