"""Investments CRUD backend tests for PLOS — Iteration 6.

Covers the new fields & endpoints added to the Investments module:
- POST /api/investments: accepts extended fields (nickname, institution,
  growth_rate_override, beneficiary_name, notes) and validates non-negatives.
- PUT /api/investments/{id}: InvestmentUpdate payload persists all new fields,
  returns 400 on negative balance / contribution, 404 when not owned/not found.
- DELETE /api/investments/{id}: removes account and updates portfolio totals.
- GET /api/investments/portfolio: uses growth_rate_override when set, falls
  back to ACCOUNT_GROWTH_RATE map otherwise; pension supports projection.
- GET /api/investments/summary: returns the 5-field shape used by the
  Home dashboard.

Does NOT modify the existing 17-test regression suite in
/app/backend/tests/test_investments_module.py.
"""

import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL", "https://life-os-hub-32.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"
EMAIL = "test1@plos.app"
PASSWORD = "test123"


# ---------------------------------------------------------------- fixtures
@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def _cleanup_pension(hdr):
    """Pre-clean any leftover pension accounts from previous runs so we have a
    deterministic starting point. Yields control then re-cleans on teardown."""
    def _purge():
        try:
            r = requests.get(f"{API}/investments", headers=hdr, timeout=20)
            if r.status_code == 200:
                for inv in r.json():
                    if inv.get("type") == "pension" or (
                        inv.get("nickname") or ""
                    ).startswith("TEST_"):
                        requests.delete(
                            f"{API}/investments/{inv['investment_id']}",
                            headers=hdr,
                            timeout=10,
                        )
        except Exception:
            pass

    _purge()
    yield
    _purge()


# ------------------------------------------------------------ auth sanity
class TestAuthFlat:
    """POST /api/auth/login still returns flat shape."""

    def test_login_flat_shape(self):
        r = requests.post(
            f"{API}/auth/login",
            json={"email": EMAIL, "password": PASSWORD},
            timeout=20,
        )
        assert r.status_code == 200
        d = r.json()
        # Flat shape — NO nested 'user'
        assert "token" in d and isinstance(d["token"], str)
        assert d.get("email") == EMAIL
        assert "user_id" in d
        assert "full_name" in d
        assert "user" not in d  # NOT nested


# ---------------------------------------------------- POST validation tests
class TestInvestmentCreateValidation:
    def test_post_rejects_negative_balance(self, hdr):
        r = requests.post(
            f"{API}/investments",
            headers=hdr,
            json={"type": "brokerage", "balance": -100, "contribution_monthly": 0},
            timeout=15,
        )
        assert r.status_code == 400, r.text[:200]
        assert "Balance cannot be negative" in r.text

    def test_post_rejects_negative_contribution(self, hdr):
        r = requests.post(
            f"{API}/investments",
            headers=hdr,
            json={"type": "brokerage", "balance": 1000, "contribution_monthly": -5},
            timeout=15,
        )
        assert r.status_code == 400, r.text[:200]
        assert "Monthly contribution cannot be negative" in r.text

    def test_post_extended_fields_persist(self, hdr):
        nick = f"TEST_brokerage_{uuid.uuid4().hex[:6]}"
        payload = {
            "type": "brokerage",
            "balance": 2500.0,
            "contribution_monthly": 150.0,
            "employer_match_pct": 0,
            "nickname": nick,
            "institution": "Fidelity",
            "growth_rate_override": 0.085,
            "beneficiary_name": "Jane Doe",
            "notes": "Long-term VOO holdings.",
        }
        r = requests.post(f"{API}/investments", headers=hdr, json=payload, timeout=15)
        assert r.status_code == 200, r.text[:200]
        created = r.json()
        inv_id = created["investment_id"]
        # GET list and find it
        lst = requests.get(f"{API}/investments", headers=hdr, timeout=15).json()
        found = next((x for x in lst if x["investment_id"] == inv_id), None)
        assert found, "created investment not returned by GET"
        for k, v in payload.items():
            assert found.get(k) == v, f"field {k} mismatch: {found.get(k)} != {v}"
        # cleanup
        requests.delete(f"{API}/investments/{inv_id}", headers=hdr, timeout=10)


# ------------------------------------------- PUT (InvestmentUpdate) tests
class TestInvestmentUpdate:
    @pytest.fixture
    def fresh_account(self, hdr):
        r = requests.post(
            f"{API}/investments",
            headers=hdr,
            json={
                "type": "IRA",
                "balance": 1000.0,
                "contribution_monthly": 50.0,
                "nickname": "TEST_to_update",
            },
            timeout=15,
        )
        assert r.status_code == 200
        inv = r.json()
        yield inv
        requests.delete(
            f"{API}/investments/{inv['investment_id']}", headers=hdr, timeout=10
        )

    def test_put_updates_all_new_fields(self, hdr, fresh_account):
        inv_id = fresh_account["investment_id"]
        update = {
            "type": "brokerage",
            "balance": 9999.99,
            "contribution_monthly": 333.33,
            "employer_match_pct": 5,
            "nickname": "TEST_updated_nick",
            "institution": "Schwab",
            "growth_rate_override": 0.072,
            "beneficiary_name": "John Doe",
            "notes": "Updated notes content.",
        }
        r = requests.put(
            f"{API}/investments/{inv_id}", headers=hdr, json=update, timeout=15
        )
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        for k, v in update.items():
            assert data.get(k) == v, f"{k} not persisted: got {data.get(k)}"

        # Re-fetch to confirm persistence (Update → GET)
        lst = requests.get(f"{API}/investments", headers=hdr, timeout=15).json()
        found = next((x for x in lst if x["investment_id"] == inv_id), None)
        assert found, "updated investment not found in GET list"
        for k, v in update.items():
            assert found.get(k) == v, f"{k} not persisted in GET: got {found.get(k)}"

    def test_put_rejects_negative_balance(self, hdr, fresh_account):
        inv_id = fresh_account["investment_id"]
        r = requests.put(
            f"{API}/investments/{inv_id}",
            headers=hdr,
            json={"balance": -1},
            timeout=15,
        )
        assert r.status_code == 400
        assert "Balance cannot be negative" in r.text

    def test_put_rejects_negative_contribution(self, hdr, fresh_account):
        inv_id = fresh_account["investment_id"]
        r = requests.put(
            f"{API}/investments/{inv_id}",
            headers=hdr,
            json={"contribution_monthly": -0.01},
            timeout=15,
        )
        assert r.status_code == 400
        assert "Monthly contribution cannot be negative" in r.text

    def test_put_returns_404_when_not_found(self, hdr):
        bogus_id = f"nope-{uuid.uuid4().hex[:10]}"
        r = requests.put(
            f"{API}/investments/{bogus_id}",
            headers=hdr,
            json={"balance": 100},
            timeout=15,
        )
        assert r.status_code == 404, r.text[:200]


# --------------------------------------- DELETE + auto-recompute portfolio
class TestInvestmentDelete:
    def test_delete_removes_account_and_updates_portfolio(self, hdr):
        # Snapshot pre-create portfolio totals
        pre = requests.get(
            f"{API}/investments/portfolio", headers=hdr, timeout=15
        ).json()
        pre_total = pre["total_balance"]
        pre_contrib = pre["total_monthly_contribution"]

        # Create a transient brokerage
        r = requests.post(
            f"{API}/investments",
            headers=hdr,
            json={
                "type": "brokerage",
                "balance": 5000.0,
                "contribution_monthly": 100.0,
                "nickname": "TEST_delete_me",
            },
            timeout=15,
        )
        assert r.status_code == 200
        inv_id = r.json()["investment_id"]

        mid = requests.get(
            f"{API}/investments/portfolio", headers=hdr, timeout=15
        ).json()
        # Totals should bump by 5000 / 100 (within rounding tolerance)
        assert abs(mid["total_balance"] - (pre_total + 5000)) < 1, (
            mid["total_balance"],
            pre_total,
        )
        assert abs(mid["total_monthly_contribution"] - (pre_contrib + 100)) < 1

        # DELETE
        d = requests.delete(
            f"{API}/investments/{inv_id}", headers=hdr, timeout=15
        )
        assert d.status_code == 200
        assert d.json().get("ok") is True

        # Verify gone from list
        lst = requests.get(f"{API}/investments", headers=hdr, timeout=15).json()
        assert not any(x["investment_id"] == inv_id for x in lst)

        # Portfolio totals back to baseline
        post = requests.get(
            f"{API}/investments/portfolio", headers=hdr, timeout=15
        ).json()
        assert abs(post["total_balance"] - pre_total) < 1
        assert abs(post["total_monthly_contribution"] - pre_contrib) < 1


# ------------------------------------------- Pension type + override growth
class TestPensionAndGrowthOverride:
    def test_pension_account_projects_with_default_zero_growth(self, hdr):
        # default growth for pension is 0 → projection = balance + contrib*months
        r = requests.post(
            f"{API}/investments",
            headers=hdr,
            json={
                "type": "pension",
                "balance": 10000.0,
                "contribution_monthly": 100.0,
                "nickname": "TEST_pension_default",
            },
            timeout=15,
        )
        assert r.status_code == 200
        inv_id = r.json()["investment_id"]
        try:
            port = requests.get(
                f"{API}/investments/portfolio", headers=hdr, timeout=15
            ).json()
            mine = next(
                (x for x in port["investments"] if x["investment_id"] == inv_id), None
            )
            assert mine, "pension not in portfolio response"
            assert mine["annual_growth_rate"] == 0.0
            years = port["years_to_65"]
            expected = 10000.0 + 100.0 * 12 * years
            assert abs(mine["projected_at_65"] - expected) < 1, (
                mine["projected_at_65"],
                expected,
            )
        finally:
            requests.delete(
                f"{API}/investments/{inv_id}", headers=hdr, timeout=10
            )

    def test_growth_rate_override_used_when_set(self, hdr):
        r = requests.post(
            f"{API}/investments",
            headers=hdr,
            json={
                "type": "brokerage",  # default 0.08
                "balance": 1000.0,
                "contribution_monthly": 0,
                "growth_rate_override": 0.10,  # override to 10%
                "nickname": "TEST_override",
            },
            timeout=15,
        )
        assert r.status_code == 200
        inv_id = r.json()["investment_id"]
        try:
            port = requests.get(
                f"{API}/investments/portfolio", headers=hdr, timeout=15
            ).json()
            mine = next(
                (x for x in port["investments"] if x["investment_id"] == inv_id), None
            )
            assert mine
            assert abs(mine["annual_growth_rate"] - 0.10) < 1e-9, mine[
                "annual_growth_rate"
            ]
        finally:
            requests.delete(
                f"{API}/investments/{inv_id}", headers=hdr, timeout=10
            )

    def test_default_growth_rate_falls_back_when_override_absent(self, hdr):
        r = requests.post(
            f"{API}/investments",
            headers=hdr,
            json={
                "type": "TSP",
                "balance": 1000.0,
                "contribution_monthly": 0,
                "nickname": "TEST_default_tsp",
            },
            timeout=15,
        )
        assert r.status_code == 200
        inv_id = r.json()["investment_id"]
        try:
            port = requests.get(
                f"{API}/investments/portfolio", headers=hdr, timeout=15
            ).json()
            mine = next(
                (x for x in port["investments"] if x["investment_id"] == inv_id), None
            )
            assert mine
            assert abs(mine["annual_growth_rate"] - 0.07) < 1e-9
        finally:
            requests.delete(
                f"{API}/investments/{inv_id}", headers=hdr, timeout=10
            )


# ---------------------------------------- GET /api/investments/summary
class TestInvestmentSummary:
    def test_summary_shape(self, hdr):
        r = requests.get(f"{API}/investments/summary", headers=hdr, timeout=20)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        required = {
            "total_portfolio_value",
            "total_monthly_contributions",
            "projected_total_at_65",
            "retirement_readiness_score",
            "monthly_surplus_available_to_invest",
        }
        assert required.issubset(set(d.keys())), (
            f"missing keys: {required - set(d.keys())}"
        )
        # value sanity
        for k in required:
            assert isinstance(d[k], (int, float)), f"{k} not numeric: {type(d[k])}"
        assert 0 <= d["retirement_readiness_score"] <= 100
        assert d["total_portfolio_value"] >= 0
        assert d["monthly_surplus_available_to_invest"] >= 0

    def test_summary_consistent_with_portfolio(self, hdr):
        p = requests.get(
            f"{API}/investments/portfolio", headers=hdr, timeout=20
        ).json()
        s = requests.get(
            f"{API}/investments/summary", headers=hdr, timeout=20
        ).json()
        assert s["total_portfolio_value"] == p["total_balance"]
        assert s["total_monthly_contributions"] == p["total_monthly_contribution"]
        assert s["projected_total_at_65"] == p["total_projected_at_65"]
        assert s["retirement_readiness_score"] == p["retirement_readiness_score"]
