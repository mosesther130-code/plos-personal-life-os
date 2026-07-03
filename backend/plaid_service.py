"""PLOS × Plaid — bank/investment/liabilities sync service.

Design principles:
- Access tokens are AES-256-GCM encrypted at rest (PLAID_ENC_KEY).
- Tokens are NEVER returned to the frontend.
- All secrets live in env vars. PLAID_ENV switches between sandbox/dev/prod
  with a single value change and no code edits.
- Sandbox fallback: if PLAID_CLIENT_ID or PLAID_SECRET_* is missing, endpoints
  return seed data so the UI/backend can be validated without real credentials.
"""
from __future__ import annotations

import base64
import logging
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

load_dotenv()
logger = logging.getLogger(__name__)

PLAID_CLIENT_ID = os.getenv("PLAID_CLIENT_ID", "").strip()
PLAID_ENV = os.getenv("PLAID_ENV", "sandbox").strip().lower()
PLAID_SECRET = (
    os.getenv("PLAID_SECRET_SANDBOX") if PLAID_ENV == "sandbox"
    else os.getenv("PLAID_SECRET_DEVELOPMENT") if PLAID_ENV == "development"
    else os.getenv("PLAID_SECRET_PRODUCTION")
) or ""
PLAID_SECRET = PLAID_SECRET.strip()
PLAID_ENC_KEY_B64 = os.getenv("PLAID_ENC_KEY", "").strip()
PLAID_ANDROID_PACKAGE = os.getenv("PLAID_ANDROID_PACKAGE", "com.mosesndifon.plos")
PLAID_WEBHOOK_URL = os.getenv("PLAID_WEBHOOK_URL", "").strip()

HAS_REAL_KEYS = bool(PLAID_CLIENT_ID and PLAID_SECRET)


def _get_enc_key() -> bytes:
    if not PLAID_ENC_KEY_B64:
        raise RuntimeError("PLAID_ENC_KEY missing")
    key = base64.b64decode(PLAID_ENC_KEY_B64)
    if len(key) != 32:
        raise RuntimeError("PLAID_ENC_KEY must be 32 bytes (base64)")
    return key


def encrypt_token(plaintext: str, aad: Optional[bytes] = None) -> Dict[str, str]:
    aes = AESGCM(_get_enc_key())
    iv = os.urandom(12)
    ct = aes.encrypt(iv, plaintext.encode("utf-8"), aad)
    return {"ciphertext": base64.b64encode(ct).decode(), "iv": base64.b64encode(iv).decode()}


def decrypt_token(enc: Dict[str, str], aad: Optional[bytes] = None) -> str:
    aes = AESGCM(_get_enc_key())
    iv = base64.b64decode(enc["iv"])
    ct = base64.b64decode(enc["ciphertext"])
    return aes.decrypt(iv, ct, aad).decode("utf-8")


# -------------------- Plaid client (lazy) --------------------
_plaid_client = None


def _client():
    global _plaid_client
    if _plaid_client is not None:
        return _plaid_client
    if not HAS_REAL_KEYS:
        return None
    from plaid import ApiClient, Configuration
    from plaid.api import plaid_api
    host_map = {
        "sandbox": "https://sandbox.plaid.com",
        "development": "https://development.plaid.com",
        "production": "https://production.plaid.com",
    }
    cfg = Configuration(
        host=host_map.get(PLAID_ENV, host_map["sandbox"]),
        api_key={"clientId": PLAID_CLIENT_ID, "secret": PLAID_SECRET},
    )
    _plaid_client = plaid_api.PlaidApi(ApiClient(cfg))
    return _plaid_client


# -------------------- Sandbox seed data --------------------
SANDBOX_SEED_ACCOUNTS = [
    {"account_id": "sbx_chk_001", "name": "Plaid Checking", "mask": "0000",
     "type": "depository", "subtype": "checking",
     "balances": {"available": 2847.50, "current": 2847.50, "iso_currency_code": "USD"}},
    {"account_id": "sbx_sav_001", "name": "Plaid Savings", "mask": "1111",
     "type": "depository", "subtype": "savings",
     "balances": {"available": 4200.00, "current": 4200.00, "iso_currency_code": "USD"}},
    {"account_id": "sbx_cc_001", "name": "Plaid Credit Card", "mask": "3333",
     "type": "credit", "subtype": "credit card",
     "balances": {"available": 8500.00, "current": 410.00, "limit": 8910.00, "iso_currency_code": "USD"}},
]


def _sandbox_seed_transactions(user_id: str) -> List[Dict[str, Any]]:
    today = date.today()

    def d(days_back: int) -> str:
        return (today - timedelta(days=days_back)).isoformat()
    return [
        {"transaction_id": f"sbx_tx_{user_id}_01", "account_id": "sbx_chk_001",
         "amount": -2920.00, "date": d(2), "name": "GEORGIA STATE UNIVERSITY PAYROLL DIRECT DEPOSIT",
         "merchant_name": "Georgia State University", "category": ["Transfer", "Payroll"], "pending": False,
         "payment_channel": "other"},
        {"transaction_id": f"sbx_tx_{user_id}_02", "account_id": "sbx_chk_001",
         "amount": -2920.00, "date": d(16), "name": "GEORGIA STATE UNIVERSITY PAYROLL DIRECT DEPOSIT",
         "merchant_name": "Georgia State University", "category": ["Transfer", "Payroll"], "pending": False,
         "payment_channel": "other"},
        {"transaction_id": f"sbx_tx_{user_id}_03", "account_id": "sbx_chk_001",
         "amount": -325.00, "date": d(5), "name": "EBT BENEFIT DEPOSIT",
         "merchant_name": "SNAP EBT", "category": ["Government", "Benefits"], "pending": False,
         "payment_channel": "other"},
        {"transaction_id": f"sbx_tx_{user_id}_04", "account_id": "sbx_chk_001",
         "amount": 1680.00, "date": d(3), "name": "MORTGAGE PAYMENT - WELLS FARGO",
         "merchant_name": "Wells Fargo Mortgage", "category": ["Payment", "Loan"], "pending": False,
         "payment_channel": "online"},
        {"transaction_id": f"sbx_tx_{user_id}_05", "account_id": "sbx_chk_001",
         "amount": 95.00, "date": d(4), "name": "CHASE CREDIT CARD PAYMENT",
         "merchant_name": "Chase", "category": ["Payment", "Credit Card"], "pending": False,
         "payment_channel": "online"},
        {"transaction_id": f"sbx_tx_{user_id}_06", "account_id": "sbx_chk_001",
         "amount": 145.00, "date": d(6), "name": "GEORGIA POWER BILL PAY",
         "merchant_name": "Georgia Power", "category": ["Payment", "Utilities"], "pending": False,
         "payment_channel": "online"},
        {"transaction_id": f"sbx_tx_{user_id}_07", "account_id": "sbx_chk_001",
         "amount": 195.00, "date": d(7), "name": "AT&T WIRELESS + INTERNET",
         "merchant_name": "AT&T", "category": ["Payment", "Utilities"], "pending": False,
         "payment_channel": "online"},
        {"transaction_id": f"sbx_tx_{user_id}_08", "account_id": "sbx_chk_001",
         "amount": 127.43, "date": d(1), "name": "KROGER #501 ATLANTA",
         "merchant_name": "Kroger", "category": ["Food", "Groceries"], "pending": False,
         "payment_channel": "in_store"},
        {"transaction_id": f"sbx_tx_{user_id}_09", "account_id": "sbx_chk_001",
         "amount": 54.20, "date": d(2), "name": "MURPHY EXPRESS #7823",
         "merchant_name": "Murphy Express", "category": ["Transportation", "Gas Stations"], "pending": False,
         "payment_channel": "in_store"},
    ]


# -------------------- Core service functions --------------------
async def create_link_token(user_id: str, db) -> Dict[str, Any]:
    if not HAS_REAL_KEYS:
        # Sandbox fallback: return a fake link_token that the frontend can use
        # to trigger the sandbox seed flow via /plaid/sandbox/simulate.
        return {"link_token": f"plos-sandbox-fake-{uuid.uuid4().hex[:12]}",
                "expiration": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
                "sandbox_fallback": True,
                "message": "Plaid credentials not configured — using sandbox seed fallback."}
    from plaid.model.link_token_create_request import LinkTokenCreateRequest
    from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
    from plaid.model.country_code import CountryCode
    from plaid.model.products import Products
    products = [Products("transactions"), Products("auth"), Products("identity"),
                Products("investments"), Products("liabilities")]
    req_args: Dict[str, Any] = dict(
        client_name="PLOS — Personal Life OS",
        language="en",
        country_codes=[CountryCode("US")],
        user=LinkTokenCreateRequestUser(client_user_id=user_id),
        products=products,
        android_package_name=PLAID_ANDROID_PACKAGE,
    )
    if PLAID_WEBHOOK_URL:
        req_args["webhook"] = PLAID_WEBHOOK_URL
    resp = _client().link_token_create(LinkTokenCreateRequest(**req_args))
    return {"link_token": resp["link_token"], "expiration": str(resp.get("expiration", ""))}


async def exchange_public_token(user_id: str, public_token: str, db) -> Dict[str, Any]:
    if not HAS_REAL_KEYS or public_token.startswith("plos-sandbox-fake-"):
        return await _create_sandbox_item(user_id, db)
    from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
    resp = _client().item_public_token_exchange(ItemPublicTokenExchangeRequest(public_token=public_token))
    access_token = resp["access_token"]
    item_id = resp["item_id"]
    inst_id, inst_name, inst_logo = await _fetch_institution(access_token)
    enc = encrypt_token(access_token, aad=user_id.encode("utf-8"))
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "user_id": user_id, "item_id": item_id, "institution_id": inst_id,
        "institution_name": inst_name, "institution_logo_url": inst_logo,
        "access_token_enc": enc, "cursor": None, "status": "healthy",
        "error_code": None, "consent_expiration_time": None,
        "products": ["transactions", "auth", "identity", "investments", "liabilities"],
        "created_at": now, "last_synced": None, "sandbox_seed": False,
    }
    await db.plaid_items.insert_one(doc)
    return {"item_id": item_id, "institution_name": inst_name}


async def _fetch_institution(access_token: str) -> tuple:
    try:
        from plaid.model.item_get_request import ItemGetRequest
        from plaid.model.institutions_get_by_id_request import InstitutionsGetByIdRequest
        from plaid.model.country_code import CountryCode
        item_resp = _client().item_get(ItemGetRequest(access_token=access_token))
        inst_id = item_resp["item"]["institution_id"]
        inst_resp = _client().institutions_get_by_id(
            InstitutionsGetByIdRequest(institution_id=inst_id, country_codes=[CountryCode("US")]),
        )
        inst = inst_resp["institution"]
        return inst_id, inst["name"], inst.get("logo")
    except Exception as e:
        logger.warning("Institution fetch failed: %s", e)
        return None, "Unknown Institution", None


async def _create_sandbox_item(user_id: str, db) -> Dict[str, Any]:
    """Create a PLOS-only sandbox item with realistic seed data — no Plaid call."""
    now = datetime.now(timezone.utc).isoformat()
    item_id = f"sbx_item_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id, "item_id": item_id,
        "institution_id": "ins_109508",
        "institution_name": "First Platypus Bank (Sandbox)",
        "institution_logo_url": None,
        "access_token_enc": encrypt_token(f"access-sandbox-{item_id}", aad=user_id.encode("utf-8")),
        "cursor": None, "status": "healthy", "error_code": None,
        "products": ["transactions", "auth", "investments"],
        "created_at": now, "last_synced": now, "sandbox_seed": True,
        "accounts": SANDBOX_SEED_ACCOUNTS,
    }
    await db.plaid_items.insert_one(doc)
    # Seed transactions
    txs = _sandbox_seed_transactions(user_id)
    now_iso = datetime.now(timezone.utc).isoformat()
    for tx in txs:
        tx.update({
            "user_id": user_id, "plaid_transaction_id": tx["transaction_id"],
            "item_id": item_id, "institution_name": doc["institution_name"],
            "category_plaid": tx.pop("category", []),
            "category_plos": None, "user_note": "",
            "user_category_override": None, "synced_at": now_iso,
        })
        await db.transactions.update_one(
            {"plaid_transaction_id": tx["plaid_transaction_id"], "user_id": user_id},
            {"$set": tx}, upsert=True,
        )
    return {"item_id": item_id, "institution_name": doc["institution_name"],
            "sandbox_seed": True, "accounts_synced": len(SANDBOX_SEED_ACCOUNTS),
            "transactions_synced": len(txs)}


async def sync_transactions(user_id: str, item_doc: Dict[str, Any], db) -> Dict[str, Any]:
    if item_doc.get("sandbox_seed"):
        # Nothing new to sync — return current counts.
        count = await db.transactions.count_documents({"user_id": user_id, "item_id": item_doc["item_id"]})
        await db.plaid_items.update_one(
            {"item_id": item_doc["item_id"]},
            {"$set": {"last_synced": datetime.now(timezone.utc).isoformat()}},
        )
        return {"added": 0, "modified": 0, "removed": 0, "total": count, "sandbox_seed": True}
    from plaid.model.transactions_sync_request import TransactionsSyncRequest
    access_token = decrypt_token(item_doc["access_token_enc"], aad=user_id.encode("utf-8"))
    cursor = item_doc.get("cursor")
    added, modified, removed = 0, 0, 0
    has_more = True
    while has_more:
        req_args: Dict[str, Any] = {"access_token": access_token}
        if cursor:
            req_args["cursor"] = cursor
        resp = _client().transactions_sync(TransactionsSyncRequest(**req_args))
        for tx in resp.get("added", []):
            doc = _plaid_tx_to_doc(tx, user_id, item_doc)
            await db.transactions.update_one(
                {"plaid_transaction_id": doc["plaid_transaction_id"]},
                {"$set": doc}, upsert=True,
            )
            added += 1
        for tx in resp.get("modified", []):
            doc = _plaid_tx_to_doc(tx, user_id, item_doc)
            await db.transactions.update_one(
                {"plaid_transaction_id": doc["plaid_transaction_id"]},
                {"$set": doc}, upsert=True,
            )
            modified += 1
        for tx in resp.get("removed", []):
            await db.transactions.update_one(
                {"plaid_transaction_id": tx["transaction_id"]},
                {"$set": {"removed": True}},
            )
            removed += 1
        cursor = resp.get("next_cursor")
        has_more = resp.get("has_more", False)
    await db.plaid_items.update_one(
        {"item_id": item_doc["item_id"]},
        {"$set": {"cursor": cursor, "last_synced": datetime.now(timezone.utc).isoformat()}},
    )
    return {"added": added, "modified": modified, "removed": removed}


def _plaid_tx_to_doc(tx: Any, user_id: str, item_doc: Dict[str, Any]) -> Dict[str, Any]:
    def g(name, default=None):
        return getattr(tx, name, tx.get(name, default) if hasattr(tx, "get") else default)
    return {
        "user_id": user_id, "item_id": item_doc["item_id"],
        "institution_name": item_doc.get("institution_name"),
        "plaid_transaction_id": g("transaction_id"),
        "account_id": g("account_id"),
        "amount": float(g("amount", 0) or 0),
        "date": str(g("date")),
        "name": g("name", ""),
        "merchant_name": g("merchant_name") or g("name", ""),
        "category_plaid": list(g("category") or []),
        "category_plos": None,
        "pending": bool(g("pending", False)),
        "payment_channel": g("payment_channel", "other"),
        "logo_url": g("logo_url"),
        "website": g("website"),
        "user_note": "", "user_category_override": None,
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }


async def get_balances(user_id: str, item_doc: Dict[str, Any]) -> List[Dict[str, Any]]:
    if item_doc.get("sandbox_seed"):
        return item_doc.get("accounts", SANDBOX_SEED_ACCOUNTS)
    from plaid.model.accounts_balance_get_request import AccountsBalanceGetRequest
    access_token = decrypt_token(item_doc["access_token_enc"], aad=user_id.encode("utf-8"))
    resp = _client().accounts_balance_get(AccountsBalanceGetRequest(access_token=access_token))
    return [
        {"account_id": a["account_id"], "name": a["name"], "mask": a.get("mask"),
         "type": str(a.get("type", "")), "subtype": str(a.get("subtype", "")),
         "balances": {"available": a["balances"].get("available"),
                      "current": a["balances"].get("current"),
                      "limit": a["balances"].get("limit"),
                      "iso_currency_code": a["balances"].get("iso_currency_code", "USD")}}
        for a in resp["accounts"]
    ]


async def get_investments(user_id: str, item_doc: Dict[str, Any]) -> Dict[str, Any]:
    if item_doc.get("sandbox_seed"):
        return {"holdings": [], "securities": [], "sandbox_seed": True}
    from plaid.model.investments_holdings_get_request import InvestmentsHoldingsGetRequest
    access_token = decrypt_token(item_doc["access_token_enc"], aad=user_id.encode("utf-8"))
    resp = _client().investments_holdings_get(InvestmentsHoldingsGetRequest(access_token=access_token))
    return {"holdings": list(resp.get("holdings", [])), "securities": list(resp.get("securities", []))}


# -------------------- Router --------------------
class ExchangeBody(BaseModel):
    public_token: str


def make_router(db, get_current_user_id, notify_user=None):
    r = APIRouter(prefix="/plaid", tags=["plaid"])

    @r.get("/status")
    async def status():
        return {"has_real_keys": HAS_REAL_KEYS, "env": PLAID_ENV,
                "webhook_configured": bool(PLAID_WEBHOOK_URL),
                "android_package": PLAID_ANDROID_PACKAGE}

    @r.post("/create-link-token")
    async def create_link_token_ep(user_id: str = Depends(get_current_user_id)):
        return await create_link_token(user_id, db)

    @r.post("/exchange-token")
    async def exchange_ep(body: ExchangeBody, user_id: str = Depends(get_current_user_id)):
        res = await exchange_public_token(user_id, body.public_token, db)
        # Trigger first sync + push notification
        item = await db.plaid_items.find_one({"item_id": res["item_id"], "user_id": user_id})
        if item and not item.get("sandbox_seed"):
            try:
                await sync_transactions(user_id, item, db)
            except Exception as e:
                logger.warning("Initial sync failed: %s", e)
        if notify_user:
            try:
                await notify_user(user_id, "plaid_connection_success",
                                  {"institution_name": res.get("institution_name"),
                                   "transactions_synced": res.get("transactions_synced", 0)})
            except Exception:
                pass
        return res

    @r.get("/items")
    async def list_items(user_id: str = Depends(get_current_user_id)):
        items = await db.plaid_items.find({"user_id": user_id}, {"_id": 0, "access_token_enc": 0}).to_list(50)
        # Attach current balances per item (from stored accounts or live fetch)
        out = []
        for it in items:
            accts = it.get("accounts", [])
            if not accts and not it.get("sandbox_seed") and HAS_REAL_KEYS:
                try:
                    accts = await get_balances(user_id, {**it, "access_token_enc": it.get("access_token_enc")})
                except Exception:
                    accts = []
            it["accounts"] = accts
            out.append(it)
        return {"items": out}

    @r.post("/items/{item_id}/refresh")
    async def refresh(item_id: str, user_id: str = Depends(get_current_user_id)):
        item = await db.plaid_items.find_one({"item_id": item_id, "user_id": user_id})
        if not item:
            raise HTTPException(404, "Item not found")
        result = await sync_transactions(user_id, item, db)
        return {"ok": True, **result}

    @r.delete("/items/{item_id}")
    async def disconnect(item_id: str, user_id: str = Depends(get_current_user_id)):
        item = await db.plaid_items.find_one({"item_id": item_id, "user_id": user_id})
        if not item:
            raise HTTPException(404, "Item not found")
        # Best-effort revoke on Plaid side
        if HAS_REAL_KEYS and not item.get("sandbox_seed"):
            try:
                from plaid.model.item_remove_request import ItemRemoveRequest
                at = decrypt_token(item["access_token_enc"], aad=user_id.encode("utf-8"))
                _client().item_remove(ItemRemoveRequest(access_token=at))
            except Exception as e:
                logger.warning("Plaid item_remove failed: %s", e)
        await db.plaid_items.delete_one({"item_id": item_id, "user_id": user_id})
        await db.transactions.delete_many({"item_id": item_id, "user_id": user_id})
        return {"ok": True}

    @r.get("/transactions")
    async def list_transactions(user_id: str = Depends(get_current_user_id), limit: int = 100):
        txs = await db.transactions.find(
            {"user_id": user_id, "removed": {"$ne": True}},
            {"_id": 0},
        ).sort("date", -1).limit(limit).to_list(limit)
        return {"transactions": txs, "count": len(txs)}

    @r.post("/webhook")
    async def webhook(request: Request):
        body = await request.json()
        webhook_type = body.get("webhook_type")
        webhook_code = body.get("webhook_code")
        item_id = body.get("item_id")
        await db.plaid_webhook_events.insert_one(
            {**body, "received_at": datetime.now(timezone.utc).isoformat()},
        )
        if not item_id:
            return {"status": "ok"}
        item = await db.plaid_items.find_one({"item_id": item_id})
        if not item:
            return {"status": "ok"}
        user_id = item["user_id"]
        try:
            if webhook_type == "TRANSACTIONS" and webhook_code == "SYNC_UPDATES_AVAILABLE":
                await sync_transactions(user_id, item, db)
                if notify_user:
                    await notify_user(user_id, "plaid_sync_complete", {"silent": True})
            elif webhook_code == "ITEM_LOGIN_REQUIRED":
                await db.plaid_items.update_one({"item_id": item_id},
                                                {"$set": {"status": "login_required"}})
                if notify_user:
                    await notify_user(user_id, "plaid_login_required",
                                      {"institution_name": item.get("institution_name")})
            elif webhook_code == "PENDING_EXPIRATION":
                await db.plaid_items.update_one({"item_id": item_id},
                                                {"$set": {"status": "pending_expiration"}})
                if notify_user:
                    await notify_user(user_id, "plaid_pending_expiration",
                                      {"institution_name": item.get("institution_name")})
            elif webhook_type == "ERROR":
                await db.plaid_items.update_one({"item_id": item_id},
                                                {"$set": {"status": "error",
                                                          "error_code": body.get("error", {}).get("error_code")}})
        except Exception as e:
            logger.exception("Webhook handler error: %s", e)
        return {"status": "ok"}

    @r.post("/sandbox/simulate")
    async def sandbox_simulate(user_id: str = Depends(get_current_user_id)):
        """Testing helper — creates a sandbox item with seed data."""
        # Prevent duplicate sandbox items for the same user
        existing = await db.plaid_items.find_one({"user_id": user_id, "sandbox_seed": True})
        if existing:
            return {"ok": True, "item_id": existing["item_id"], "already_exists": True}
        res = await _create_sandbox_item(user_id, db)
        if notify_user:
            try:
                await notify_user(user_id, "plaid_connection_success",
                                  {"institution_name": res.get("institution_name"),
                                   "transactions_synced": res.get("transactions_synced", 0)})
            except Exception:
                pass
        return {"ok": True, **res}

    @r.get("/summary")
    async def summary(user_id: str = Depends(get_current_user_id)):
        """Aggregate Plaid data for the Financial Snapshot: total balance,
        income + expense totals for the last 30 days, and per-category expense
        breakdown."""
        items = await db.plaid_items.find({"user_id": user_id}).to_list(50)
        total_balance = 0.0
        credit_debt = 0.0
        accounts_count = 0
        for it in items:
            for a in it.get("accounts", []):
                bal = a.get("balances", {}) or {}
                current = bal.get("current") or 0
                if a.get("type") == "credit":
                    credit_debt += float(current)
                elif a.get("type") in ("depository", "investment"):
                    total_balance += float(current)
                accounts_count += 1

        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
        txs = await db.transactions.find(
            {"user_id": user_id, "removed": {"$ne": True}, "date": {"$gte": cutoff}},
            {"_id": 0, "amount": 1, "date": 1, "name": 1, "merchant_name": 1,
             "category_plaid": 1, "pending": 1},
        ).to_list(1000)
        income_30d = 0.0
        expenses_30d = 0.0
        by_category: Dict[str, float] = {}
        for t in txs:
            if t.get("pending"):
                continue
            amt = float(t.get("amount", 0) or 0)
            if amt < 0:
                income_30d += -amt
            else:
                expenses_30d += amt
                cat = (t.get("category_plaid") or ["Uncategorized"])[0]
                by_category[cat] = by_category.get(cat, 0) + amt
        by_cat_sorted = sorted(
            [{"category": k, "amount": round(v, 2)} for k, v in by_category.items()],
            key=lambda x: x["amount"], reverse=True,
        )
        return {
            "items_connected": len(items),
            "accounts_count": accounts_count,
            "total_balance": round(total_balance, 2),
            "credit_debt": round(credit_debt, 2),
            "income_30d": round(income_30d, 2),
            "expenses_30d": round(expenses_30d, 2),
            "monthly_surplus": round(income_30d - expenses_30d, 2),
            "by_category": by_cat_sorted[:10],
            "sandbox": any(it.get("sandbox_seed") for it in items),
        }


    return r
