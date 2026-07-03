"""PLOS — Real-time transaction fraud detection.

Evaluates each new (or existing) transaction against 7 fraud signals.
Any transaction matching 2+ signals triggers a Potential Fraud alert
that is stored in security_alerts (shared with the Identity module)
and surfaces on the Dashboard.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

USER_HOME_COUNTRY_DEFAULT = "US"


async def _historical_avg(user_id: str, merchant: str, db) -> Tuple[int, float]:
    if not merchant:
        return 0, 0.0
    docs = await db.transactions.find(
        {"user_id": user_id,
         "$or": [
             {"merchant_name": {"$regex": f"^{merchant}$", "$options": "i"}},
             {"name": {"$regex": merchant, "$options": "i"}},
         ],
         "amount": {"$gt": 0}},
        {"_id": 0, "amount": 1},
    ).to_list(200)
    if not docs:
        return 0, 0.0
    total = sum(float(d.get("amount") or 0) for d in docs)
    return len(docs), total / len(docs)


async def evaluate_transaction(tx: Dict[str, Any], user_id: str, db,
                                user_country: str = USER_HOME_COUNTRY_DEFAULT,
                                trusted_merchants: Optional[List[str]] = None,
                                ) -> List[Dict[str, Any]]:
    """Return list of triggered fraud signal dicts."""
    signals: List[Dict[str, Any]] = []
    trusted = {m.lower() for m in (trusted_merchants or [])}
    amt = float(tx.get("amount") or 0)
    merchant = (tx.get("merchant_name") or tx.get("name") or "").strip()
    if merchant.lower() in trusted:
        return []
    location = tx.get("location") or {}
    tx_country = (location.get("country") or "").upper() if isinstance(location, dict) else ""
    date_str = tx.get("date") or ""

    # Signal 1 — International transaction while not traveling
    if tx_country and tx_country != user_country:
        active_trip = await db.trips.find_one({
            "user_id": user_id, "status": {"$in": ["booked", "active"]},
            "departure_date": {"$lte": date_str},
            "return_date": {"$gte": date_str},
        })
        if not active_trip:
            signals.append({"code": "international_no_travel",
                            "desc": f"Charge in {tx_country} but no active travel logged."})

    # Signal 2 — Duplicate charge (same merchant + amount within 7 days)
    if amt > 0 and merchant:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()
        dup = await db.transactions.find_one({
            "user_id": user_id,
            "plaid_transaction_id": {"$ne": tx.get("plaid_transaction_id")},
            "amount": amt,
            "date": {"$gte": cutoff},
            "$or": [
                {"merchant_name": {"$regex": f"^{merchant}$", "$options": "i"}},
                {"name": {"$regex": merchant, "$options": "i"}},
            ],
        })
        if dup:
            signals.append({"code": "duplicate_charge",
                            "desc": f"Same ${amt:.2f} charge from {merchant} within 7 days."})

    # Signal 3 — Unusual amount for known merchant (>3x historical avg)
    if amt > 20:
        n, avg = await _historical_avg(user_id, merchant, db)
        if n >= 3 and avg > 0 and amt > 3 * avg:
            signals.append({"code": "unusual_amount",
                            "desc": f"${amt:.0f} is {amt/avg:.1f}x your typical ${avg:.0f} at {merchant}."})

    # Signal 4 — Round number > $200 from an unknown merchant
    if amt > 200 and amt == round(amt) and merchant:
        n, _ = await _historical_avg(user_id, merchant, db)
        if n <= 1:
            signals.append({"code": "round_unknown",
                            "desc": f"Round ${amt:.0f} charge from unfamiliar merchant '{merchant}'."})

    # Signal 5 — Rapid sequential transactions (3+ debits > $20 in 5 mins)
    if amt > 20 and tx.get("authorized_datetime") or tx.get("datetime"):
        try:
            ts_str = tx.get("authorized_datetime") or tx.get("datetime")
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            window_start = (ts - timedelta(minutes=5)).isoformat()
            window_end = (ts + timedelta(minutes=5)).isoformat()
            recent = await db.transactions.count_documents({
                "user_id": user_id,
                "amount": {"$gt": 20},
                "$or": [
                    {"authorized_datetime": {"$gte": window_start, "$lte": window_end}},
                    {"datetime": {"$gte": window_start, "$lte": window_end}},
                ],
            })
            if recent >= 3:
                signals.append({"code": "rapid_sequential",
                                "desc": f"{recent} debits >$20 within 5 minutes (card-testing pattern)."})
        except Exception:
            pass

    # Signal 6 — New merchant at unusual hour (1-5 AM)
    ts_str = tx.get("authorized_datetime") or tx.get("datetime")
    if ts_str:
        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            if 1 <= ts.hour <= 5:
                n, _ = await _historical_avg(user_id, merchant, db)
                if n <= 1:
                    signals.append({"code": "new_merchant_night",
                                    "desc": f"First-ever charge from '{merchant}' between 1-5 AM."})
        except Exception:
            pass

    # Signal 7 — Credit card charge exceeding available credit
    account_id = tx.get("account_id")
    if amt > 0 and account_id:
        async for it in db.plaid_items.find({"user_id": user_id}):
            for a in it.get("accounts", []):
                if a.get("account_id") == account_id and a.get("type") == "credit":
                    limit = (a.get("balances") or {}).get("limit")
                    curr = (a.get("balances") or {}).get("current") or 0
                    if limit and (curr + amt) / limit > 0.95:
                        signals.append({"code": "credit_utilization_spike",
                                        "desc": f"Charge would push {a.get('name')} to {((curr+amt)/limit)*100:.0f}% utilization."})

    return signals


async def scan_recent_transactions(user_id: str, db, days: int = 30) -> Dict[str, Any]:
    """Scan the last N days of transactions for fraud and store alerts."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
    txs = await db.transactions.find(
        {"user_id": user_id, "removed": {"$ne": True}, "date": {"$gte": cutoff},
         "amount": {"$gt": 0}},
        {"_id": 0},
    ).to_list(500)

    trusted_docs = await db.trusted_merchants.find({"user_id": user_id}).to_list(200)
    trusted = [d["merchant_name"] for d in trusted_docs]

    alerts_created = 0
    total_flagged = 0
    for tx in txs:
        signals = await evaluate_transaction(tx, user_id, db, trusted_merchants=trusted)
        if len(signals) >= 2:
            total_flagged += 1
            existing = await db.security_alerts.find_one({
                "user_id": user_id,
                "module": "financial",
                "transaction_id": tx.get("plaid_transaction_id"),
            })
            if existing:
                continue
            alert = {
                "alert_id": f"fraud_{uuid.uuid4().hex[:12]}",
                "user_id": user_id,
                "module": "financial",
                "priority": "urgent",
                "transaction_id": tx.get("plaid_transaction_id"),
                "amount": float(tx.get("amount") or 0),
                "merchant_name": tx.get("merchant_name") or tx.get("name"),
                "date": tx.get("date"),
                "signals": signals,
                "signal_count": len(signals),
                "status": "open",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "message": (
                    f"\ud83d\udea8 Potential fraud \u2014 ${float(tx.get('amount') or 0):.2f} at "
                    f"{tx.get('merchant_name') or tx.get('name')}. "
                    + " ".join(s["desc"] for s in signals)
                ),
            }
            await db.security_alerts.insert_one(alert)
            alerts_created += 1
    return {"scanned": len(txs), "flagged": total_flagged, "alerts_created": alerts_created}
