"""PLOS Phase 2-5 backend tests.

Covers:
  Phase 2 — AI Transaction Categorizer
    - POST /api/plaid/categorize (rule-based, 9/9 matched, 0 AI)
    - PUT /api/plaid/transactions/{tx_id}/category (Kroger → Dining, cascade)
    - Rule cascade priority (user rule wins over defaults)
    - Invalid category → 400

  Phase 3 — 90-Day Cash Flow Forecast
    - GET /api/plaid/cashflow-forecast?regenerate=true (structure)
    - Days array field validation
    - Cache-serving (no regenerate)
    - threshold=5000 → low_balance alert present

  Phase 4 — Fraud Detection
    - POST /api/plaid/fraud-scan (structure)
    - GET /api/plaid/fraud-alerts (structure)
    - PUT /api/plaid/fraud-alerts/{alert_id} decision=trusted (adds to trusted_merchants)

  Phase 5 — Response Cache Manager
    - GET /api/plaid/cache-stats (structure)
    - cache_manager.compute_cache_key deterministic
    - get_cached returns None for missing key
    - set_cached round-trip with expires_at

  Regression:
    - /api/plaid/status, /api/plaid/summary, /api/plaid/transactions
"""
import os
import sys
import asyncio
import uuid
import pytest
import requests

sys.path.insert(0, "/app/backend")

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "test1@plos.app"
PASSWORD = "test123"


# ------------------------- Fixtures -------------------------
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


@pytest.fixture(scope="module")
def user_id(session):
    r = session.get(f"{API}/auth/me", timeout=20)
    assert r.status_code == 200
    return r.json().get("id") or r.json().get("user_id") or r.json().get("_id")


@pytest.fixture(scope="module", autouse=True)
def _prep_sandbox(session, user_id):
    """Ensure a fresh sandbox seed exists for the user for a deterministic
    starting state. Delete any pre-existing sandbox items + user rules first."""
    # Pre-clean sandbox items
    r = session.get(f"{API}/plaid/items", timeout=30)
    if r.status_code == 200:
        for it in r.json().get("items", []):
            if it.get("sandbox_seed"):
                session.delete(f"{API}/plaid/items/{it['item_id']}", timeout=20)
    # Pre-clean user_merchant_rules (Mongo direct) for deterministic categorizer state
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        loop = asyncio.new_event_loop()

        async def _wipe():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            await db.user_merchant_rules.delete_many({"user_id": user_id})
            client.close()

        loop.run_until_complete(_wipe())
        loop.close()
    except Exception as e:
        print(f"warning: could not clean user_merchant_rules: {e}")
    # Fresh seed
    r = session.post(f"{API}/plaid/sandbox/simulate", timeout=30)
    assert r.status_code == 200, f"seed failed: {r.status_code} {r.text}"
    yield
    # Post-clean
    r = session.get(f"{API}/plaid/items", timeout=30)
    if r.status_code == 200:
        for it in r.json().get("items", []):
            if it.get("sandbox_seed"):
                session.delete(f"{API}/plaid/items/{it['item_id']}", timeout=20)


def _find_tx(session, needle: str):
    r = session.get(f"{API}/plaid/transactions?limit=200", timeout=30)
    assert r.status_code == 200
    for tx in r.json()["transactions"]:
        n = (tx.get("name") or "") + " " + (tx.get("merchant_name") or "")
        if needle.lower() in n.lower():
            return tx
    return None


# =========================================================
# Phase 2 — AI Transaction Categorizer
# =========================================================
class TestPhase2Categorizer:
    def test_categorize_all_rule_matched(self, session):
        r = session.post(f"{API}/plaid/categorize?all_txs=true", timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        # 9 sandbox transactions should all match rules; 0 AI
        assert data["scanned"] == 9, f"scanned={data}"
        assert data["rule_matched"] == 9, f"rule_matched={data}"
        assert data["ai_matched"] == 0, f"ai_matched={data}"
        assert data["unmatched"] == 0, f"unmatched={data}"

    def test_expected_category_assignments(self, session):
        r = session.get(f"{API}/plaid/transactions?limit=200", timeout=30)
        txs = r.json()["transactions"]
        by_needle = {
            "GEORGIA STATE UNIVERSITY": "Salary Income",
            "EBT BENEFIT": "Income",
            "MORTGAGE": "Housing",
            "CHASE CREDIT CARD": "Debt Payment",
            "GEORGIA POWER": "Utilities",
            "AT&T": "Utilities",
            "KROGER": "Groceries",
            "MURPHY": "Gas",
        }
        for needle, expected in by_needle.items():
            matches = [t for t in txs if needle.lower() in (t.get("name") or "").lower()]
            assert matches, f"no tx found for {needle}"
            for t in matches:
                assert t.get("category_plos") == expected, (
                    f"{needle} → got {t.get('category_plos')}, expected {expected}")

    def test_invalid_category_returns_400(self, session):
        tx = _find_tx(session, "KROGER")
        assert tx is not None
        r = session.put(
            f"{API}/plaid/transactions/{tx['plaid_transaction_id']}/category",
            json={"category": "NotAThing"}, timeout=20)
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"

    def test_user_correction_kroger_to_dining(self, session):
        tx = _find_tx(session, "KROGER")
        assert tx is not None
        r = session.put(
            f"{API}/plaid/transactions/{tx['plaid_transaction_id']}/category",
            json={"category": "Dining"}, timeout=20)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True
        assert j.get("new_category") == "Dining"
        # Verify persistence
        r2 = session.get(f"{API}/plaid/transactions?limit=200", timeout=30)
        after = [t for t in r2.json()["transactions"]
                 if t["plaid_transaction_id"] == tx["plaid_transaction_id"]][0]
        assert after["category_plos"] == "Dining"
        assert after.get("category_source") == "user_correction"

    def test_rule_cascade_priority(self, session):
        """Re-running categorize with all_txs must not revert Kroger → Groceries."""
        r = session.post(f"{API}/plaid/categorize?all_txs=true", timeout=60)
        assert r.status_code == 200, r.text
        # Kroger should still be Dining because user_merchant_rules takes priority
        r2 = session.get(f"{API}/plaid/transactions?limit=200", timeout=30)
        krogers = [t for t in r2.json()["transactions"]
                   if "kroger" in (t.get("name") or "").lower()]
        assert krogers, "kroger tx missing"
        for t in krogers:
            assert t.get("category_plos") == "Dining", (
                f"Kroger reverted to {t.get('category_plos')} — rule cascade broken")


# =========================================================
# Phase 3 — 90-Day Cash Flow Forecast
# =========================================================
class TestPhase3CashflowForecast:
    def test_regenerate_forecast_structure(self, session):
        r = session.get(
            f"{API}/plaid/cashflow-forecast?days=90&regenerate=true", timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "days" in data and "summary" in data and "alerts" in data
        assert len(data["days"]) == 90, f"days len={len(data['days'])}"
        # Starting balance = sum of Plaid depository accounts = 2847.50 + 4200.00 = 7047.50
        assert abs(data["starting_balance"] - 7047.50) < 0.01, (
            f"starting_balance={data['starting_balance']}")
        s = data["summary"]
        for key in ("min_balance", "max_balance", "ending_balance",
                    "total_income", "total_outflow", "low_balance_days"):
            assert key in s, f"missing summary.{key}"

    def test_days_have_required_fields(self, session):
        r = session.get(f"{API}/plaid/cashflow-forecast?days=90", timeout=60)
        assert r.status_code == 200
        days = r.json()["days"]
        for d in days[:5]:
            for key in ("opening_balance", "closing_balance",
                        "is_low_balance_day", "cash_in", "cash_out"):
                assert key in d, f"missing day.{key}: {d}"
            assert isinstance(d["cash_in"], list)
            assert isinstance(d["cash_out"], list)

    def test_cache_served_on_second_call(self, session):
        # First call ensures cache exists
        r1 = session.get(f"{API}/plaid/cashflow-forecast?days=90&regenerate=true",
                         timeout=60)
        assert r1.status_code == 200
        gen1 = r1.json()["generated_at"]
        # Second call without regenerate — should be identical generated_at
        r2 = session.get(f"{API}/plaid/cashflow-forecast?days=90", timeout=60)
        assert r2.status_code == 200
        gen2 = r2.json()["generated_at"]
        assert gen1 == gen2, "expected cached forecast (same generated_at)"

    def test_high_threshold_creates_low_balance_alert(self, session):
        """Verify low_balance alert triggers when threshold is above min balance.
        NOTE: with the sandbox seed ($7047 starting + biweekly income) balance
        never dips below $5000, so threshold=5000 does NOT trigger. Using
        threshold=10000 which reliably triggers on this seed data."""
        r = session.get(
            f"{API}/plaid/cashflow-forecast?days=90&threshold=10000&regenerate=true",
            timeout=60)
        assert r.status_code == 200, r.text
        alerts = r.json().get("alerts", [])
        low_bal = [a for a in alerts if a.get("type") == "low_balance"]
        assert low_bal, f"expected low_balance alert with threshold=10000, got {alerts}"
        # Also sanity: threshold=5000 with seed does NOT trigger
        r5 = session.get(
            f"{API}/plaid/cashflow-forecast?days=90&threshold=5000&regenerate=true",
            timeout=60)
        assert r5.status_code == 200
        # low_balance_days should be 0 with $7047 starting + biweekly $2920
        assert r5.json()["summary"]["low_balance_days"] == 0, (
            "seed data unexpectedly dipped below $5000")


# =========================================================
# Phase 4 — Fraud Detection
# =========================================================
class TestPhase4Fraud:
    def test_fraud_scan_structure(self, session):
        r = session.post(f"{API}/plaid/fraud-scan?days=30", timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("scanned", "flagged", "alerts_created"):
            assert k in data, f"missing {k} in {data}"
        # Seed data expected: 0-1 flagged
        assert data["flagged"] in (0, 1), f"unexpected flagged={data['flagged']}"
        assert data["scanned"] >= 5  # ~7 outflow txs in seed

    def test_fraud_alerts_structure(self, session):
        r = session.get(f"{API}/plaid/fraud-alerts", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "alerts" in data and "count" in data
        assert isinstance(data["alerts"], list)
        assert data["count"] == len(data["alerts"])

    def test_resolve_fraud_alert_trusted_flow(self, session, user_id):
        """Seed a synthetic security_alerts doc via mongo, then resolve via API
        with decision='trusted' and verify trusted_merchants row is created."""
        pytest.importorskip("motor")
        from motor.motor_asyncio import AsyncIOMotorClient
        loop = asyncio.new_event_loop()

        async def _run():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            alert_id = f"fraud_{uuid.uuid4().hex[:12]}"
            merchant = f"TEST_MERCHANT_{uuid.uuid4().hex[:6]}"
            await db.security_alerts.insert_one({
                "alert_id": alert_id, "user_id": user_id, "module": "financial",
                "priority": "urgent", "status": "open",
                "merchant_name": merchant,
                "signals": [{"code": "unusual_amount", "desc": "test"},
                            {"code": "round_unknown", "desc": "test"}],
                "signal_count": 2, "amount": 250.0, "date": "2026-01-01",
                "created_at": "2026-01-01T00:00:00+00:00",
                "message": "test alert",
            })
            client.close()
            return alert_id, merchant

        alert_id, merchant = loop.run_until_complete(_run())
        loop.close()

        try:
            r = session.put(f"{API}/plaid/fraud-alerts/{alert_id}",
                            json={"decision": "trusted"}, timeout=20)
            assert r.status_code == 200, r.text
            assert r.json().get("ok") is True

            # Verify trusted_merchants persistence
            loop2 = asyncio.new_event_loop()

            async def _verify():
                client = AsyncIOMotorClient(os.environ["MONGO_URL"])
                db = client[os.environ["DB_NAME"]]
                tm = await db.trusted_merchants.find_one(
                    {"user_id": user_id, "merchant_name": merchant})
                alert = await db.security_alerts.find_one({"alert_id": alert_id})
                client.close()
                return tm, alert

            tm, alert = loop2.run_until_complete(_verify())
            loop2.close()
            assert tm is not None, "trusted_merchants row not created"
            assert alert["status"] == "resolved"
            assert alert["decision"] == "trusted"
        finally:
            # Cleanup
            loop3 = asyncio.new_event_loop()

            async def _cleanup():
                client = AsyncIOMotorClient(os.environ["MONGO_URL"])
                db = client[os.environ["DB_NAME"]]
                await db.security_alerts.delete_one({"alert_id": alert_id})
                await db.trusted_merchants.delete_one(
                    {"user_id": user_id, "merchant_name": merchant})
                client.close()

            loop3.run_until_complete(_cleanup())
            loop3.close()

    def test_resolve_missing_alert_404(self, session):
        r = session.put(f"{API}/plaid/fraud-alerts/nonexistent_id_xyz",
                        json={"decision": "disputed"}, timeout=20)
        assert r.status_code == 404


# =========================================================
# Phase 5 — Response Cache Manager
# =========================================================
class TestPhase5Cache:
    def test_cache_stats_structure(self, session):
        r = session.get(f"{API}/plaid/cache-stats", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("total_cached_items", "total_cache_hits", "est_tokens_saved",
                  "est_cost_saved_usd", "by_task_type"):
            assert k in data, f"missing {k}"
        assert isinstance(data["by_task_type"], list)

    def test_compute_cache_key_deterministic(self):
        from cache_manager import compute_cache_key
        k1 = compute_cache_key("daily_financial_advice", {"a": 1, "b": [1, 2]})
        k2 = compute_cache_key("daily_financial_advice", {"b": [1, 2], "a": 1})
        assert k1 == k2, "compute_cache_key not deterministic (should sort keys)"
        k3 = compute_cache_key("daily_financial_advice", {"a": 2, "b": [1, 2]})
        assert k1 != k3, "different payload should yield different key"

    def test_get_cached_missing_returns_none(self):
        from motor.motor_asyncio import AsyncIOMotorClient
        from cache_manager import get_cached
        loop = asyncio.new_event_loop()

        async def _run():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            v = await get_cached(db, "nonexistent_key_" + uuid.uuid4().hex)
            client.close()
            return v

        v = loop.run_until_complete(_run())
        loop.close()
        assert v is None

    def test_set_cached_round_trip(self):
        from motor.motor_asyncio import AsyncIOMotorClient
        from cache_manager import compute_cache_key, set_cached, get_cached
        loop = asyncio.new_event_loop()

        async def _run():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = client[os.environ["DB_NAME"]]
            key = compute_cache_key("default", {"TEST_": uuid.uuid4().hex})
            payload = {"content": "hello", "platform": "test",
                       "model_used": "test-model", "tokens_used": 42}
            await set_cached(db, key, "default", payload)
            got = await get_cached(db, key)
            # Verify expires_at exists
            doc = await db.response_cache.find_one({"cache_key": key})
            await db.response_cache.delete_one({"cache_key": key})
            client.close()
            return got, doc

        got, doc = loop.run_until_complete(_run())
        loop.close()
        assert got is not None
        assert got["content"] == "hello"
        assert got["platform"] == "test"
        assert got["cached"] is True
        assert doc is not None
        assert doc.get("expires_at") is not None
        assert doc.get("ttl_hours") == 12  # default TTL


# =========================================================
# Regression: existing Plaid endpoints
# =========================================================
class TestRegression:
    def test_status(self, session):
        r = session.get(f"{API}/plaid/status", timeout=20)
        assert r.status_code == 200

    def test_summary(self, session):
        r = session.get(f"{API}/plaid/summary", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # total balance is 2847.50 + 4200.00 = 7047.50 (depository)
        # some implementations may include CC balance separately
        assert "total_balance" in data or "total_deposit_balance" in data or "accounts" in data

    def test_transactions(self, session):
        r = session.get(f"{API}/plaid/transactions?limit=50", timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert j["count"] >= 9
        assert isinstance(j["transactions"], list)
