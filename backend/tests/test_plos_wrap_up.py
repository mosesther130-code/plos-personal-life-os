"""PLOS Wrap-up Phase backend tests.

Covers:
  1. GET /api/plaid/snapshot-fusion            — manual + Plaid data fusion
  2. GET /api/plaid/monthly-summary            — PLOS AI / fallback narrative
  3. GET /api/plaid/monthly-summaries          — list of summaries
  4. GET /api/plaid/alert-settings             — default doc & persistence
  5. PUT /api/plaid/alert-settings             — patch + allow-list filtering
  6. GET /api/plaid/alert-history?days=90      — notifications_outbox listing
  7. POST /api/plaid/pregen/trigger-now        — 4 tasks completed, no ObjectId error
  8. GET /api/plaid/pregen/log                 — list of previous runs
  9. Scheduler registration verification (via backend log inspection)
 10. Regression: existing Plaid endpoints

NOTE: This test suite is idempotent w.r.t sandbox seed (per playbook contract:
"Sandbox seed already exists for test user. Do NOT delete it during your tests.").
It creates a seed only if none exists, and it does NOT delete it on teardown.
"""
import os
import sys
import subprocess
import pytest
import requests

sys.path.insert(0, "/app/backend")

# Load frontend/.env explicitly (pytest doesn't pick it up)
from dotenv import load_dotenv  # noqa: E402
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "test1@plos.app"
PASSWORD = "test123"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def session(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}",
                      "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module", autouse=True)
def _ensure_sandbox(session):
    """Ensure at least one sandbox item exists (do NOT delete existing)."""
    r = session.get(f"{API}/plaid/items", timeout=30)
    if r.status_code == 200 and not r.json().get("items"):
        r = session.post(f"{API}/plaid/sandbox/simulate", timeout=30)
        assert r.status_code == 200, f"seed failed: {r.status_code} {r.text}"
    yield  # do NOT delete on teardown per playbook contract


# =========================================================
# 1. Snapshot Fusion
# =========================================================
class TestSnapshotFusion:
    def test_structure_and_plaid_totals(self, session):
        r = session.get(f"{API}/plaid/snapshot-fusion", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()

        # Top-level shape
        for k in ("has_plaid_data", "items_connected", "plaid", "manual",
                  "variance", "recommended_source"):
            assert k in d, f"missing key {k}"

        # Sandbox seed should be present -> plaid should be recommended
        assert d["has_plaid_data"] is True
        assert d["items_connected"] >= 1
        assert d["recommended_source"] == "plaid"

        p = d["plaid"]
        for k in ("income_30d", "expenses_30d", "monthly_surplus", "assets",
                  "liabilities", "estimated_net_worth", "by_category",
                  "transaction_count"):
            assert k in p, f"plaid.{k} missing"

        # Sandbox seed expectations (allow some tolerance)
        assert p["income_30d"] == pytest.approx(6165, abs=1500), p["income_30d"]
        assert p["expenses_30d"] == pytest.approx(2296, abs=1500), p["expenses_30d"]
        assert p["assets"] == pytest.approx(7047.5, abs=1500), p["assets"]
        assert p["liabilities"] == pytest.approx(410, abs=200), p["liabilities"]
        assert p["monthly_surplus"] == pytest.approx(
            p["income_30d"] - p["expenses_30d"], abs=0.5)
        assert p["estimated_net_worth"] == pytest.approx(
            p["assets"] - p["liabilities"], abs=0.5)
        assert isinstance(p["by_category"], list)
        assert p["transaction_count"] >= 1

        m = d["manual"]
        for k in ("income", "expenses", "net_worth", "monthly_surplus"):
            assert k in m

        v = d["variance"]
        assert "income_delta" in v and "expenses_delta" in v


# =========================================================
# 2 & 3. Monthly Summary(s)
# =========================================================
class TestMonthlySummary:
    def test_generate_monthly_summary(self, session):
        r = session.get(f"{API}/plaid/monthly-summary?refresh=true", timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("month", "month_label", "aggregates",
                  "previous_month_aggregates", "narrative", "generated_at"):
            assert k in d, f"missing {k}"
        # aggregates structure
        a = d["aggregates"]
        for k in ("total_income", "total_expenses", "net", "top_merchants",
                  "by_category", "transaction_count"):
            assert k in a, f"aggregates.{k} missing"
        assert isinstance(d["narrative"], str) and len(d["narrative"]) > 20

    def test_cached_monthly_summary(self, session):
        # No refresh -> should return the same doc quickly
        r1 = session.get(f"{API}/plaid/monthly-summary", timeout=30)
        assert r1.status_code == 200
        r2 = session.get(f"{API}/plaid/monthly-summary", timeout=30)
        assert r2.status_code == 200
        assert r1.json().get("month") == r2.json().get("month")
        assert r1.json().get("generated_at") == r2.json().get("generated_at")

    def test_list_monthly_summaries(self, session):
        r = session.get(f"{API}/plaid/monthly-summaries", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "summaries" in d and "count" in d
        assert isinstance(d["summaries"], list)
        assert d["count"] == len(d["summaries"])
        if d["count"] >= 2:
            months = [s["month"] for s in d["summaries"]]
            assert months == sorted(months, reverse=True), "not desc-sorted"


# =========================================================
# 4 & 5. Alert Settings
# =========================================================
class TestAlertSettings:
    def test_default_settings_created_on_first_get(self, session):
        r = session.get(f"{API}/plaid/alert-settings", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # Required fields
        for k in ("large_tx_enabled", "large_tx_threshold_usd",
                  "budget_alerts_enabled", "budget_threshold_pct",
                  "income_alerts_enabled", "new_subscription_alerts_enabled",
                  "fraud_alerts_enabled", "quiet_hours_start", "quiet_hours_end"):
            assert k in d, f"missing {k}"
        # Second call returns the same doc (persistence)
        r2 = session.get(f"{API}/plaid/alert-settings", timeout=30)
        assert r2.status_code == 200
        # Compare a stable subset (avoid _id / user_id differences)
        for k in ("large_tx_threshold_usd", "budget_threshold_pct",
                  "quiet_hours_start", "quiet_hours_end"):
            assert d[k] == r2.json()[k]

    def test_update_settings_patch(self, session):
        # Reset to a known state
        r = session.put(
            f"{API}/plaid/alert-settings",
            json={"large_tx_threshold_usd": 50, "budget_threshold_pct": 80},
            timeout=30,
        )
        assert r.status_code == 200

        r = session.put(
            f"{API}/plaid/alert-settings",
            json={
                "large_tx_threshold_usd": 75,
                "budget_threshold_pct": 90,
                "bogus_field": "should_be_ignored",
            },
            timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["large_tx_threshold_usd"] == 75
        assert d["budget_threshold_pct"] == 90
        assert "bogus_field" not in d

        # Persistence check
        r = session.get(f"{API}/plaid/alert-settings", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["large_tx_threshold_usd"] == 75
        assert d["budget_threshold_pct"] == 90


# =========================================================
# 6. Alert History
# =========================================================
class TestAlertHistory:
    def test_alert_history_shape(self, session):
        r = session.get(f"{API}/plaid/alert-history?days=90", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "alerts" in d and "count" in d
        assert isinstance(d["alerts"], list)
        assert d["count"] == len(d["alerts"])
        # if any alerts exist, sort should be desc by created_at
        if d["count"] >= 2:
            times = [a.get("created_at") for a in d["alerts"] if a.get("created_at")]
            assert times == sorted(times, reverse=True), "alerts not desc-sorted"


# =========================================================
# 7 & 8. Pregen trigger + log
# =========================================================
class TestPregen:
    def test_trigger_now_all_four_tasks(self, session):
        r = session.post(f"{API}/plaid/pregen/trigger-now", timeout=180)
        assert r.status_code == 200, r.text
        d = r.json()
        # Must NOT contain any ObjectId serialization surprise
        assert "tasks_completed" in d
        assert isinstance(d["tasks_completed"], list)
        # 4 tasks: categorize, cashflow_forecast, monthly_summary, fraud_scan
        names = {t.get("task") for t in d["tasks_completed"]}
        expected = {"categorize", "cashflow_forecast", "monthly_summary", "fraud_scan"}
        assert names == expected, f"got tasks: {names}"
        assert d.get("total_duration_s", 0) >= 0.0
        # None serialization error: ensure "_id" not leaked
        assert "_id" not in d

    def test_pregen_log_lists_previous_runs(self, session):
        r = session.get(f"{API}/plaid/pregen/log", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "log" in d and "count" in d
        assert d["count"] >= 1, "no pregen runs logged"
        first = d["log"][0]
        assert "tasks_completed" in first
        # Each task entry has metric fields
        for t in first["tasks_completed"]:
            for k in ("task", "users_run", "users_failed", "duration_s"):
                assert k in t


# =========================================================
# 9. Scheduler registered verification (via log inspection)
# =========================================================
class TestSchedulerRegistered:
    def test_scheduler_started_log_present(self):
        try:
            out = subprocess.check_output(
                ["grep", "-a", "-h", "-F",
                 "[pregen] scheduler started",
                 "/var/log/supervisor/backend.err.log"],
                stderr=subprocess.STDOUT,
                timeout=10,
            ).decode()
        except subprocess.CalledProcessError:
            out = ""
        assert "scheduler started" in out, (
            "Expected '[pregen] scheduler started' log line not found — "
            "server startup hook may not have registered morning_pregen job"
        )
        # next_run_time is included in the log after 'next run:'
        assert "next run:" in out, "next_run_time missing from scheduler log"


# =========================================================
# 10. Regression — Phase 1-5 endpoints still work
# =========================================================
class TestRegression:
    def test_plaid_status(self, session):
        r = session.get(f"{API}/plaid/status", timeout=30)
        assert r.status_code == 200, r.text

    def test_plaid_items(self, session):
        r = session.get(f"{API}/plaid/items", timeout=30)
        assert r.status_code == 200, r.text
        assert "items" in r.json()

    def test_plaid_summary(self, session):
        r = session.get(f"{API}/plaid/summary", timeout=30)
        assert r.status_code == 200, r.text

    def test_plaid_transactions(self, session):
        r = session.get(f"{API}/plaid/transactions?limit=50", timeout=30)
        assert r.status_code == 200, r.text
        assert "transactions" in r.json()

    def test_plaid_categorize(self, session):
        r = session.post(f"{API}/plaid/categorize", timeout=60)
        assert r.status_code == 200, r.text

    def test_plaid_cashflow_forecast(self, session):
        r = session.get(f"{API}/plaid/cashflow-forecast", timeout=60)
        assert r.status_code == 200, r.text

    def test_plaid_fraud_scan(self, session):
        r = session.post(f"{API}/plaid/fraud-scan", timeout=60)
        assert r.status_code == 200, r.text

    def test_plaid_cache_stats(self, session):
        r = session.get(f"{API}/plaid/cache-stats", timeout=30)
        assert r.status_code == 200, r.text
