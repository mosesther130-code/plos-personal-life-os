"""
Phase 1 — Plaid bank account sync (Sandbox seed fallback) tests.

Covers:
- GET /api/plaid/status
- POST /api/plaid/create-link-token
- POST /api/plaid/sandbox/simulate (idempotent — second call returns already_exists=true)
- GET /api/plaid/items
- GET /api/plaid/transactions
- GET /api/plaid/summary
- POST /api/plaid/items/{item_id}/refresh
- POST /api/plaid/webhook (no auth required)
- DELETE /api/plaid/items/{item_id}
- AES-256-GCM encrypt/decrypt round-trip (module-level)
- Regression: GET /api/travel/trips
"""
import os
import sys
import pytest
import requests

# Allow importing backend module for the encryption round-trip test
sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://life-os-hub-32.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "test1@plos.app"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def session(token):
    s = requests.Session()
    s.headers.update(
        {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    )
    return s


@pytest.fixture(scope="module", autouse=True)
def _clean_plaid_items(session):
    """Purge existing sandbox items before running the suite so the
    idempotent simulate assertion is deterministic."""
    r = session.get(f"{API}/plaid/items", timeout=30)
    if r.status_code == 200:
        for it in r.json().get("items", []):
            if it.get("sandbox_seed"):
                session.delete(f"{API}/plaid/items/{it['item_id']}", timeout=20)
    yield
    # Post-run cleanup
    r = session.get(f"{API}/plaid/items", timeout=30)
    if r.status_code == 200:
        for it in r.json().get("items", []):
            if it.get("sandbox_seed"):
                session.delete(f"{API}/plaid/items/{it['item_id']}", timeout=20)


# ---------------------- 0. Module-level encryption round-trip ----------------------
class TestEncryption:
    def test_aes_gcm_round_trip(self):
        from plaid_service import encrypt_token, decrypt_token
        plaintext = "access-sandbox-test-abcdef123456"
        aad = b"user-id-42"
        enc = encrypt_token(plaintext, aad=aad)
        assert "ciphertext" in enc and "iv" in enc
        assert enc["ciphertext"] != plaintext
        decoded = decrypt_token(enc, aad=aad)
        assert decoded == plaintext

    def test_aes_gcm_bad_aad_fails(self):
        from plaid_service import encrypt_token, decrypt_token
        enc = encrypt_token("secret-x", aad=b"aad-a")
        with pytest.raises(Exception):
            decrypt_token(enc, aad=b"aad-b")


# ---------------------- 1. Status ----------------------
class TestStatus:
    def test_status_returns_expected_shape(self, session):
        r = session.get(f"{API}/plaid/status", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["has_real_keys"] is False, f"Expected has_real_keys=false, got {data}"
        assert data["env"] == "sandbox"
        assert data["android_package"] == "com.mosesndifon.plos"
        assert "webhook_configured" in data


# ---------------------- 2. Create Link Token ----------------------
class TestCreateLinkToken:
    def test_create_link_token_sandbox_fallback(self, session):
        r = session.post(f"{API}/plaid/create-link-token", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("sandbox_fallback") is True
        assert data.get("link_token", "").startswith("plos-sandbox-fake-")
        assert "expiration" in data


# ---------------------- 3. Sandbox Simulate (idempotent) ----------------------
class TestSandboxSimulate:
    def test_first_call_creates_item(self, session):
        r = session.post(f"{API}/plaid/sandbox/simulate", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data.get("already_exists") is not True, \
            f"first call should not report already_exists: {data}"
        assert data.get("sandbox_seed") is True
        assert data.get("accounts_synced") == 3
        assert data.get("transactions_synced") == 9
        assert data.get("item_id", "").startswith("sbx_item_")

    def test_second_call_returns_already_exists(self, session):
        r = session.post(f"{API}/plaid/sandbox/simulate", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data.get("already_exists") is True, \
            f"second call should be idempotent: {data}"
        assert data.get("item_id", "").startswith("sbx_item_")


# ---------------------- 4. Items ----------------------
class TestItems:
    def test_list_items_returns_seeded_item_with_3_accounts(self, session):
        r = session.get(f"{API}/plaid/items", timeout=30)
        assert r.status_code == 200, r.text
        items = r.json().get("items", [])
        sandbox_items = [it for it in items if it.get("sandbox_seed")]
        assert len(sandbox_items) == 1, f"expected 1 sandbox item, got {len(sandbox_items)}"
        item = sandbox_items[0]
        assert item["institution_name"] == "First Platypus Bank (Sandbox)"
        assert item["status"] == "healthy"
        # Must NOT leak encrypted access token
        assert "access_token_enc" not in item, "access_token_enc must be excluded from response"
        # 3 accounts: Checking, Savings, Credit Card
        accts = item.get("accounts", [])
        assert len(accts) == 3, f"expected 3 accounts, got {len(accts)}: {accts}"
        subtypes = {a["subtype"] for a in accts}
        assert {"checking", "savings", "credit card"}.issubset(subtypes), subtypes
        types = {a["type"] for a in accts}
        assert {"depository", "credit"}.issubset(types), types


# ---------------------- 5. Transactions ----------------------
class TestTransactions:
    def test_transactions_returned_sorted_desc(self, session):
        r = session.get(f"{API}/plaid/transactions", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        txs = data.get("transactions", [])
        assert data.get("count") == len(txs)
        assert len(txs) == 9, f"expected 9 seeded transactions, got {len(txs)}"
        # Sorted date desc
        dates = [t["date"] for t in txs]
        assert dates == sorted(dates, reverse=True), f"transactions not sorted date desc: {dates}"
        # First 3 include Kroger (d-1), Murphy Express (d-2), GSU payroll (d-2)
        top_names = " ".join(t["name"] for t in txs[:3]).upper()
        assert "KROGER" in top_names, f"Kroger missing in top-3: {top_names}"
        assert "MURPHY EXPRESS" in top_names, f"Murphy Express missing in top-3: {top_names}"
        assert "GEORGIA STATE UNIVERSITY" in top_names, \
            f"GSU payroll missing in top-3: {top_names}"


# ---------------------- 6. Summary ----------------------
class TestSummary:
    def test_summary_aggregates(self, session):
        r = session.get(f"{API}/plaid/summary", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()

        # Sandbox flag
        assert data.get("sandbox") is True
        assert data.get("items_connected") == 1
        assert data.get("accounts_count") == 3

        # income_30d = 2 paychecks (2920*2) + EBT (325) = 6165
        assert abs(data.get("income_30d", 0) - 6165.00) < 0.5, \
            f"income_30d expected ~6165, got {data.get('income_30d')}"

        # expenses_30d = 1680+95+145+195+127.43+54.20 = 2296.63
        assert abs(data.get("expenses_30d", 0) - 2296.63) < 0.5, \
            f"expenses_30d expected ~2296.63, got {data.get('expenses_30d')}"

        # monthly_surplus = 6165 - 2296.63 = 3868.37
        assert abs(data.get("monthly_surplus", 0) - 3868.37) < 1.0, \
            f"monthly_surplus expected ~3868.37, got {data.get('monthly_surplus')}"

        # total_balance = checking 2847.50 + savings 4200 = 7047.50
        assert abs(data.get("total_balance", 0) - 7047.50) < 0.5, \
            f"total_balance expected ~7047.50, got {data.get('total_balance')}"

        # credit_debt = credit card current 410
        assert abs(data.get("credit_debt", 0) - 410.00) < 0.5, \
            f"credit_debt expected 410, got {data.get('credit_debt')}"

        # by_category is a sorted list of {category, amount}
        by_cat = data.get("by_category", [])
        assert isinstance(by_cat, list) and len(by_cat) > 0
        amounts = [c["amount"] for c in by_cat]
        assert amounts == sorted(amounts, reverse=True), \
            f"by_category not sorted desc: {amounts}"


# ---------------------- 7. Refresh ----------------------
class TestRefresh:
    def test_refresh_sandbox_skip(self, session):
        items = session.get(f"{API}/plaid/items", timeout=30).json()["items"]
        item_id = [it for it in items if it.get("sandbox_seed")][0]["item_id"]
        r = session.post(f"{API}/plaid/items/{item_id}/refresh", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        # sandbox_seed short-circuit
        assert data.get("sandbox_seed") is True
        assert data.get("added") == 0
        assert data.get("modified") == 0
        assert data.get("removed") == 0
        assert data.get("total") == 9

    def test_refresh_unknown_item_returns_404(self, session):
        r = session.post(f"{API}/plaid/items/does-not-exist/refresh", timeout=20)
        assert r.status_code == 404


# ---------------------- 8. Webhook (no auth) ----------------------
class TestWebhook:
    def test_webhook_accepts_json_no_auth(self):
        payload = {
            "webhook_type": "TRANSACTIONS",
            "webhook_code": "SYNC_UPDATES_AVAILABLE",
            "item_id": "nonexistent-item-id",
        }
        # No Authorization header used
        r = requests.post(f"{API}/plaid/webhook", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        assert r.json() == {"status": "ok"}

    def test_webhook_no_item_id_ok(self):
        r = requests.post(f"{API}/plaid/webhook", json={"webhook_type": "ITEM"}, timeout=20)
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}


# ---------------------- 9. Delete ----------------------
class TestDelete:
    def test_delete_removes_item_and_transactions(self, session):
        items = session.get(f"{API}/plaid/items", timeout=30).json()["items"]
        sandbox = [it for it in items if it.get("sandbox_seed")]
        assert len(sandbox) == 1
        item_id = sandbox[0]["item_id"]

        r = session.delete(f"{API}/plaid/items/{item_id}", timeout=30)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

        # Confirm item gone
        r2 = session.get(f"{API}/plaid/items", timeout=30)
        remaining = [it for it in r2.json()["items"] if it["item_id"] == item_id]
        assert remaining == [], f"item still present after delete: {remaining}"

        # Confirm transactions gone
        txr = session.get(f"{API}/plaid/transactions", timeout=30).json()
        remaining_txs = [t for t in txr["transactions"] if t.get("item_id") == item_id]
        assert remaining_txs == [], f"transactions still present after delete: {remaining_txs}"

    def test_delete_unknown_returns_404(self, session):
        r = session.delete(f"{API}/plaid/items/does-not-exist", timeout=20)
        assert r.status_code == 404


# ---------------------- 10. Regression: existing endpoints still work ----------------------
class TestRegression:
    def test_travel_trips_still_works(self, session):
        r = session.get(f"{API}/travel/trips", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "trips" in data
        assert isinstance(data["trips"], list)

    def test_auth_me_still_works(self, session):
        r = session.get(f"{API}/auth/me", timeout=20)
        assert r.status_code == 200
        assert r.json().get("email") == EMAIL
