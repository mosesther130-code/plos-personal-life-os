"""Investments module backend tests for PLOS.

Covers:
- /api/investments/portfolio (total balance, projection, readiness, accounts)
- /api/investments/readiness-gate (checklist, ready_now, blocked, snapshot)
- /api/investments/opportunities (ranked list w/ match_score, prereqs_met)
- /api/investments/market-readiness (stocks/crypto gates, conditions)
- /api/investments/social-security (62/67/70 + break-even)
- /api/investments/contribution-optimizer (Claude-powered)
- Regression smoke: dashboard, alerts, ai/daily-advice, finance + career endpoints
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
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    assert "token" in data, data
    assert data.get("email") == EMAIL
    return data["token"]


@pytest.fixture(scope="module")
def hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Auth ----------
class TestAuth:
    def test_login_returns_jwt(self):
        r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("token"), str) and len(data["token"]) > 20
        assert data["email"] == EMAIL


# ---------- Investments ----------
class TestInvestmentsPortfolio:
    def test_portfolio_shape(self, hdr):
        r = requests.get(f"{API}/investments/portfolio", headers=hdr, timeout=20)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        for k in [
            "total_balance",
            "total_projected_at_65",
            "total_monthly_contribution",
            "years_to_65",
            "needed_corpus",
            "retirement_readiness_score",
            "on_track",
            "monthly_gap",
            "annual_income",
            "investments",
        ]:
            assert k in d, f"missing key {k}"
        assert isinstance(d["investments"], list)
        assert d["total_balance"] >= 0
        assert 0 <= d["retirement_readiness_score"] <= 100
        # Each enriched account has projection and trend
        if d["investments"]:
            inv0 = d["investments"][0]
            assert "projected_at_65" in inv0
            assert "annual_growth_rate" in inv0
            assert "trend_pct" in inv0


class TestReadinessGate:
    def test_readiness_gate_shape(self, hdr):
        r = requests.get(f"{API}/investments/readiness-gate", headers=hdr, timeout=20)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        for k in ["snapshot", "checklist", "ready_now", "blocked", "reassessment_in_months", "all_prereqs_met"]:
            assert k in d
        # Snapshot fields
        snap = d["snapshot"]
        assert "emergency_months" in snap
        assert "monthly_income" in snap
        assert "monthly_expenses" in snap
        assert "monthly_surplus" in snap
        # Checklist items have key/label/ready/detail
        assert len(d["checklist"]) >= 3
        for item in d["checklist"]:
            assert {"key", "label", "ready", "detail"}.issubset(item.keys())
        # ready_now / blocked are lists
        assert isinstance(d["ready_now"], list)
        assert isinstance(d["blocked"], list)


class TestOpportunities:
    def test_opportunities_ranked(self, hdr):
        r = requests.post(f"{API}/investments/opportunities", headers=hdr, timeout=20)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert "opportunities" in d and "snapshot" in d
        ops = d["opportunities"]
        assert isinstance(ops, list) and len(ops) >= 3
        # Ranked descending by match_score
        scores = [o["match_score"] for o in ops]
        assert scores == sorted(scores, reverse=True)
        first = ops[0]
        for k in ["name", "type", "risk", "est_return_annual_pct", "min_to_start", "match_score", "prereqs_met", "instructions"]:
            assert k in first, f"missing {k} in opportunity"
        assert isinstance(first["instructions"], list) and len(first["instructions"]) >= 2


class TestMarketReadiness:
    def test_market_readiness_shape(self, hdr):
        r = requests.get(f"{API}/investments/market-readiness", headers=hdr, timeout=20)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        for k in ["stock_ready", "crypto_ready", "risk_tolerance", "snapshot", "stock_conditions_to_meet", "crypto_conditions_to_meet"]:
            assert k in d
        assert isinstance(d["stock_ready"], bool)
        assert isinstance(d["crypto_ready"], bool)
        assert 1 <= d["risk_tolerance"] <= 10
        assert isinstance(d["stock_conditions_to_meet"], list)
        assert isinstance(d["crypto_conditions_to_meet"], list)
        # if stock_ready, allocation must be present
        if d["stock_ready"]:
            assert d["allocation"] is not None
            assert {"equity_pct", "bonds_pct", "crypto_pct"}.issubset(d["allocation"].keys())


class TestSocialSecurity:
    def test_social_security_estimates(self, hdr):
        payload = {
            "current_age": 40,
            "current_salary": 120000,
            "years_of_contributions": 18,
            "life_expectancy": 85,
        }
        r = requests.post(f"{API}/investments/social-security", json=payload, headers=hdr, timeout=20)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        for k in [
            "monthly_at_62",
            "monthly_at_67",
            "monthly_at_70",
            "lifetime_at_62",
            "lifetime_at_67",
            "lifetime_at_70",
            "break_even_62_vs_67_age",
            "break_even_67_vs_70_age",
            "recommended_claim_age",
            "reasoning",
        ]:
            assert k in d
        # monotonic: 62 < 67 < 70 monthly
        assert d["monthly_at_62"] < d["monthly_at_67"] < d["monthly_at_70"]
        # break-even ages reasonable (>62 and <100)
        assert 60 < d["break_even_62_vs_67_age"] < 100
        assert 60 < d["break_even_67_vs_70_age"] < 100
        assert d["recommended_claim_age"] in (62, 67, 70)


class TestContributionOptimizer:
    """Claude-powered. May take 5-15s."""

    def test_contribution_optimizer(self, hdr):
        r = requests.post(f"{API}/investments/contribution-optimizer", headers=hdr, timeout=60)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert isinstance(d, dict)
        assert "recommendation" in d
        assert isinstance(d["recommendation"], str) and len(d["recommendation"]) > 10


# ---------- Regression: dashboard, alerts, ai ----------
class TestRegressionCore:
    def test_dashboard(self, hdr):
        r = requests.get(f"{API}/dashboard", headers=hdr, timeout=20)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert "total_income" in d or "monthly_income" in d or "net_worth" in d

    def test_alerts(self, hdr):
        r = requests.get(f"{API}/alerts", headers=hdr, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), (list, dict))

    def test_daily_advice(self, hdr):
        r = requests.post(f"{API}/ai/daily-advice", headers=hdr, timeout=60)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert isinstance(d, dict)


# ---------- Regression: finance + career smoke ----------
class TestRegressionFinanceCareer:
    def test_income_list(self, hdr):
        r = requests.get(f"{API}/income", headers=hdr, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_expenses_list(self, hdr):
        r = requests.get(f"{API}/expenses", headers=hdr, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_debts_list(self, hdr):
        r = requests.get(f"{API}/debts", headers=hdr, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_payoff_plan(self, hdr):
        r = requests.post(f"{API}/finance/payoff-plan", headers=hdr, json={"strategy": "avalanche"}, timeout=30)
        assert r.status_code == 200, r.text[:200]

    def test_career_profile(self, hdr):
        r = requests.get(f"{API}/career", headers=hdr, timeout=20)
        assert r.status_code == 200

    def test_career_pipeline(self, hdr):
        r = requests.get(f"{API}/career/pipeline", headers=hdr, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "counts" in d or isinstance(d, dict)

    def test_job_applications(self, hdr):
        r = requests.get(f"{API}/job-applications", headers=hdr, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)
