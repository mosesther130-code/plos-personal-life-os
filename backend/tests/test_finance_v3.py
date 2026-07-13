"""Iteration 3 — Finance Snapshot, Debt Manager, Payoff Plan, Mortgage Analyzer tests."""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL", "https://life-os-hub-32.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "test1@plos.app"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth_headers(client):
    r = client.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200
    # Re-seed for deterministic data
    tok = r.json()["token"]
    h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    client.post(f"{API}/seed-demo", headers=h)
    return h


# ---- Listing endpoints (regression) ----
def test_list_income(client, auth_headers):
    r = client.get(f"{API}/income", headers=auth_headers)
    assert r.status_code == 200
    assert len(r.json()) >= 3


def test_list_expenses(client, auth_headers):
    r = client.get(f"{API}/expenses", headers=auth_headers)
    assert r.status_code == 200
    assert len(r.json()) >= 6


def test_list_debts(client, auth_headers):
    r = client.get(f"{API}/debts", headers=auth_headers)
    assert r.status_code == 200
    debts = r.json()
    assert len(debts) >= 4
    lenders = [d["lender"] for d in debts]
    assert "Chase Sapphire" in lenders
    assert "Wells Fargo" in lenders


# ---- PUT updates ----
def test_put_income_updates(client, auth_headers):
    items = client.get(f"{API}/income", headers=auth_headers).json()
    target = items[0]
    payload = {
        "source_name": target["source_name"] + " (TEST)",
        "type": target["type"],
        "gross_monthly": target["gross_monthly"] + 100,
        "net_monthly": target["net_monthly"] + 80,
        "frequency": target.get("frequency", "monthly"),
        "is_active": target.get("is_active", True),
    }
    r = client.put(f"{API}/income/{target['income_id']}", json=payload, headers=auth_headers)
    assert r.status_code == 200, r.text
    assert r.json()["source_name"].endswith("(TEST)")
    # Revert
    client.put(f"{API}/income/{target['income_id']}", json={
        "source_name": target["source_name"], "type": target["type"],
        "gross_monthly": target["gross_monthly"], "net_monthly": target["net_monthly"],
        "frequency": target.get("frequency", "monthly"),
        "is_active": target.get("is_active", True),
    }, headers=auth_headers)


def test_put_expense_updates(client, auth_headers):
    items = client.get(f"{API}/expenses", headers=auth_headers).json()
    t = items[0]
    payload = {
        "category": t["category"], "vendor": t["vendor"] + " (TEST)",
        "monthly_amount": t["monthly_amount"], "due_day_of_month": t["due_day_of_month"],
        "auto_pay": t["auto_pay"], "deal_watch_enabled": t["deal_watch_enabled"],
    }
    r = client.put(f"{API}/expenses/{t['expense_id']}", json=payload, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["vendor"].endswith("(TEST)")


def test_put_debt_updates(client, auth_headers):
    items = client.get(f"{API}/debts", headers=auth_headers).json()
    t = items[0]
    payload = {
        "debt_type": t["debt_type"], "lender": t["lender"],
        "balance": t["balance"] + 50, "apr": t["apr"],
        "minimum_payment": t["minimum_payment"],
        "payoff_strategy": t.get("payoff_strategy", "avalanche"),
    }
    r = client.put(f"{API}/debts/{t['debt_id']}", json=payload, headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["balance"] == t["balance"] + 50


def test_put_invalid_id_returns_404(client, auth_headers):
    bogus = "00000000-0000-0000-0000-000000000000"
    for path, payload in [
        (f"/income/{bogus}", {"source_name": "x", "type": "salary", "gross_monthly": 1, "net_monthly": 1}),
        (f"/expenses/{bogus}", {"category": "x", "vendor": "x", "monthly_amount": 1}),
        (f"/debts/{bogus}", {"debt_type": "credit_card", "lender": "x", "balance": 1, "apr": 1, "minimum_payment": 1}),
    ]:
        r = client.put(f"{API}{path}", json=payload, headers=auth_headers)
        assert r.status_code == 404, f"{path} returned {r.status_code}"


# ---- Payoff plan ----
def test_payoff_plan_baseline_no_savings(client, auth_headers):
    r = client.post(f"{API}/finance/payoff-plan",
                    json={"strategy": "avalanche", "extra_monthly": 0}, headers=auth_headers)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["interest_saved"] == 0
    assert d["months"] > 0
    assert isinstance(d["schedule"], list)
    assert isinstance(d["per_debt"], list)
    for pd in d["per_debt"]:
        assert "debt_id" in pd and "lender" in pd


def test_payoff_plan_avalanche_orders_by_apr(client, auth_headers):
    r = client.post(f"{API}/finance/payoff-plan",
                    json={"strategy": "avalanche", "extra_monthly": 500}, headers=auth_headers)
    assert r.status_code == 200
    d = r.json()
    assert d["interest_saved"] > 0
    # Avalanche should focus on Chase Sapphire (22.99% APR) first
    early_focus = [s["focus_debt"] for s in d["schedule"][:5]]
    assert "Chase Sapphire" in early_focus, f"Avalanche should target highest APR first; got: {early_focus}"


def test_payoff_plan_snowball_orders_by_balance(client, auth_headers):
    r = client.post(f"{API}/finance/payoff-plan",
                    json={"strategy": "snowball", "extra_monthly": 500}, headers=auth_headers)
    assert r.status_code == 200
    d = r.json()
    # Snowball — smallest balance (Chase Sapphire $4,200) is also first
    early_focus = [s["focus_debt"] for s in d["schedule"][:5]]
    assert "Chase Sapphire" in early_focus


# ---- AI debt strategy (real PLOS AI) ----
def test_ai_debt_strategy(client, auth_headers):
    r = client.post(f"{API}/ai/debt-strategy",
                    json={"strategy": "avalanche", "extra_monthly": 500},
                    headers=auth_headers, timeout=120)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("recommendation")
    assert len(d["recommendation"]) > 30
    assert "recommended_extra" in d
    assert "interest_saved" in d
    assert "months_to_debt_free" in d and d["months_to_debt_free"] > 0
    assert isinstance(d["payment_order"], list)


# ---- Mortgage scenarios ----
def test_mortgage_scenarios(client, auth_headers):
    r = client.post(f"{API}/finance/mortgage-scenarios",
                    json={"extra_payment": 200, "refinance_apr": 5.0, "refinance_term_months": 360},
                    headers=auth_headers, timeout=120)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "mortgage" in d
    assert d["mortgage"]["lender"] == "Wells Fargo"
    assert len(d["scenarios"]) == 3
    s_min, s_extra, s_refi = d["scenarios"]
    # Math sanity: extra payment scenario has less total interest than min
    assert s_extra["total_interest"] < s_min["total_interest"]
    # Refi @ 5.0% (below 6.25%) -> lower monthly payment than original min
    assert s_refi["monthly_payment"] < s_min["monthly_payment"]
    assert d.get("ai_best_scenario")
    assert d.get("ai_reasoning") and len(d["ai_reasoning"]) > 20
