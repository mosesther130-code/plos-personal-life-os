"""PLOS — AI Transaction Categorizer.

Two-layer approach:
  Layer 1: rule-based instant categorization (merchant → PLOS category).
  Layer 2: PLOS AI batch categorization for unmatched transactions.

Learning: user corrections priority over defaults; corrections propagate to
all other transactions from the same merchant in the same user's history.
"""
from __future__ import annotations

import json as _json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

PLOS_CATEGORIES = [
    "Housing", "Utilities", "Insurance", "Transport", "Gas", "Groceries",
    "Dining", "Healthcare", "Education", "Entertainment", "Subscriptions",
    "Clothing", "Personal Care", "Debt Payment", "Student Loan",
    "Investment", "Savings", "Income", "Salary Income", "Business Expense",
    "Charity", "Gifts", "Travel", "Other",
]

# Default merchant rules (case-insensitive partial match). User rules override.
MERCHANT_RULES: Dict[str, str] = {
    # Housing
    "mortgage": "Housing", "hoa": "Housing", "rent": "Housing",
    # Utilities
    "georgia power": "Utilities", "dekalb": "Utilities", "water": "Utilities",
    "at&t": "Utilities", "att ": "Utilities", "comcast": "Utilities",
    "verizon": "Utilities", "t-mobile": "Utilities",
    # Insurance
    "life insurance": "Insurance", "car insurance": "Insurance",
    "geico": "Insurance", "state farm": "Insurance", "allstate": "Insurance",
    "progressive": "Insurance",
    # Transport & Gas
    "shell": "Gas", " bp ": "Gas", "chevron": "Gas", "exxon": "Gas",
    "murphy": "Gas", "quicktrip": "Gas", "qt ": "Gas", "racetrac": "Gas",
    "costco gas": "Gas", "marathon": "Gas", "sunoco": "Gas",
    "uber": "Transport", "lyft": "Transport", "marta": "Transport",
    # Food
    "kroger": "Groceries", "publix": "Groceries", "aldi": "Groceries",
    "walmart": "Groceries", "whole foods": "Groceries", "target": "Groceries",
    "trader joe": "Groceries", "costco": "Groceries",
    "mcdonald": "Dining", "chick-fil-a": "Dining", "starbucks": "Dining",
    "chipotle": "Dining", "wendy": "Dining", "burger king": "Dining",
    "doordash": "Dining", "grubhub": "Dining", "ubereats": "Dining",
    "waffle house": "Dining", "olive garden": "Dining",
    # Debt / Student Loan
    "chase": "Debt Payment", "wells fargo payment": "Debt Payment",
    "capital one": "Debt Payment", "discover": "Debt Payment",
    "credit card payment": "Debt Payment", "amex": "Debt Payment",
    "navient": "Student Loan", "mohela": "Student Loan",
    "aidvantage": "Student Loan", "nelnet": "Student Loan",
    # Savings / Investment
    "tsp": "Investment", "vanguard": "Investment", "fidelity": "Investment",
    "schwab": "Investment", "robinhood": "Investment", "coinbase": "Investment",
    # Healthcare
    "cvs": "Healthcare", "walgreens": "Healthcare", "pharmacy": "Healthcare",
    "kaiser": "Healthcare", "hospital": "Healthcare",
    # Entertainment / Subscriptions
    "netflix": "Subscriptions", "spotify": "Subscriptions",
    "amazon prime": "Subscriptions", "hulu": "Subscriptions",
    "apple.com/bill": "Subscriptions", "disney": "Subscriptions",
    "youtube premium": "Subscriptions", "nyt": "Subscriptions",
    # Income
    "georgia state university": "Salary Income", "gsu": "Salary Income",
    "payroll": "Salary Income", "direct deposit": "Salary Income",
    "ebt": "Income", "snap": "Income",
    # Travel
    "airbnb": "Travel", "delta air": "Travel", "southwest": "Travel",
    "marriott": "Travel", "hilton": "Travel", "expedia": "Travel",
}


def _matches(text: str, rule_key: str) -> bool:
    text_l = (text or "").lower()
    key_l = rule_key.strip().lower()
    # Space-padded keys require word-boundary match to avoid false positives
    if key_l.startswith(" ") or key_l.endswith(" "):
        return key_l.strip() in re.findall(r"[a-z0-9&]+", text_l)
    return key_l in text_l


def _apply_rules(tx: Dict[str, Any], user_rules: Dict[str, str]) -> Optional[Tuple[str, bool]]:
    """Return (category, is_user_rule) or None if no match.

    User rules take priority over defaults.
    """
    candidate_text = " ".join([
        str(tx.get("merchant_name") or ""),
        str(tx.get("name") or ""),
    ])
    for merchant, cat in (user_rules or {}).items():
        if _matches(candidate_text, merchant):
            return cat, True
    for rule_key, cat in MERCHANT_RULES.items():
        if _matches(candidate_text, rule_key):
            return cat, False
    # Also try Plaid category hierarchy for a coarse-grained match
    plaid_cats = tx.get("category_plaid") or []
    joined = " ".join(str(c).lower() for c in plaid_cats)
    if "payroll" in joined or "benefits" in joined:
        return "Salary Income", False
    if "groceries" in joined:
        return "Groceries", False
    if "gas stations" in joined:
        return "Gas", False
    if "utilities" in joined:
        return "Utilities", False
    if "loan" in joined:
        return "Debt Payment", False
    return None


async def _load_user_rules(user_id: str, db) -> Dict[str, str]:
    rules = await db.user_merchant_rules.find({"user_id": user_id}).to_list(500)
    return {r["merchant_name"]: r["user_assigned_category"] for r in rules}


async def _claude_batch_categorize(txs: List[Dict[str, Any]]) -> Dict[str, str]:
    """Send a batch of transactions to PLOS AI and return a {tx_id: category} map."""
    if not txs:
        return {}
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.getenv("EMERGENT_LLM_KEY")
        if not api_key:
            return {}
        payload = [
            {
                "transaction_id": t["plaid_transaction_id"],
                "amount": t.get("amount"),
                "name": t.get("name", "")[:120],
                "merchant_name": (t.get("merchant_name") or "")[:80],
                "category_plaid": t.get("category_plaid", []),
                "payment_channel": t.get("payment_channel"),
                "date": t.get("date"),
            }
            for t in txs
        ]
        prompt = (
            "Categorize each transaction into exactly one of these PLOS categories: "
            + ", ".join(PLOS_CATEGORIES)
            + ". Use the merchant name and Plaid category to determine the correct PLOS category. "
            "Return a JSON array only, one object per input: {transaction_id, category_plos}. "
            "No explanation, no markdown fences.\n\nTransactions:\n"
            + _json.dumps(payload)
        )
        chat = (
            LlmChat(api_key=api_key, session_id="plos-categorize",
                    system_message="You are a strict financial-transaction categorizer. Output valid JSON only.")
            .with_model("anthropic", "claude-sonnet-4-5-20250929")
        )
        resp = await chat.send_message(UserMessage(text=prompt))
        text = resp if isinstance(resp, str) else str(resp)
        m = re.search(r"\[[\s\S]*\]", text)
        if not m:
            return {}
        arr = _json.loads(m.group(0))
        out = {}
        for item in arr:
            tid = item.get("transaction_id")
            cat = item.get("category_plos")
            if tid and cat in PLOS_CATEGORIES:
                out[tid] = cat
        return out
    except Exception as e:
        logger.warning("PLOS AI batch categorize failed: %s", e)
        return {}


async def categorize_user_transactions(user_id: str, db, only_uncategorized: bool = True) -> Dict[str, Any]:
    """Run rule → PLOS AI categorization over the user's transactions."""
    query: Dict[str, Any] = {"user_id": user_id, "removed": {"$ne": True}}
    if only_uncategorized:
        query["category_plos"] = None
    txs = await db.transactions.find(query).to_list(500)
    if not txs:
        return {"scanned": 0, "rule_matched": 0, "ai_matched": 0, "unmatched": 0}

    user_rules = await _load_user_rules(user_id, db)
    unmatched: List[Dict[str, Any]] = []
    rule_hits = 0
    for t in txs:
        r = _apply_rules(t, user_rules)
        if r:
            cat, is_user_rule = r
            await db.transactions.update_one(
                {"plaid_transaction_id": t["plaid_transaction_id"], "user_id": user_id},
                {"$set": {"category_plos": cat, "is_rule_based": True,
                          "categorized_at": datetime.now(timezone.utc).isoformat(),
                          "category_source": "user_rule" if is_user_rule else "default_rule"}},
            )
            rule_hits += 1
        else:
            unmatched.append(t)

    ai_hits = 0
    # Batch of 20 to keep prompts tight
    for i in range(0, len(unmatched), 20):
        chunk = unmatched[i:i + 20]
        cats = await _claude_batch_categorize(chunk)
        for tid, cat in cats.items():
            await db.transactions.update_one(
                {"plaid_transaction_id": tid, "user_id": user_id},
                {"$set": {"category_plos": cat, "is_rule_based": False,
                          "categorized_at": datetime.now(timezone.utc).isoformat(),
                          "category_source": "ai"}},
            )
            ai_hits += 1

    return {
        "scanned": len(txs),
        "rule_matched": rule_hits,
        "ai_matched": ai_hits,
        "unmatched": len(txs) - rule_hits - ai_hits,
    }


async def apply_user_correction(
    user_id: str, plaid_transaction_id: str, new_category: str, db,
) -> Dict[str, Any]:
    """Persist a user-assigned category and cascade to same-merchant transactions."""
    if new_category not in PLOS_CATEGORIES:
        raise ValueError(f"Unknown category: {new_category}")
    tx = await db.transactions.find_one(
        {"plaid_transaction_id": plaid_transaction_id, "user_id": user_id})
    if not tx:
        raise ValueError("Transaction not found")
    now = datetime.now(timezone.utc).isoformat()
    merchant = (tx.get("merchant_name") or tx.get("name") or "").strip()
    old_category = tx.get("category_plos")

    await db.transactions.update_one(
        {"plaid_transaction_id": plaid_transaction_id, "user_id": user_id},
        {"$set": {"category_plos": new_category,
                  "user_category_override": new_category,
                  "correction_date": now,
                  "category_source": "user_correction"}},
    )

    # Add / bump user rule
    if merchant:
        existing = await db.user_merchant_rules.find_one({"user_id": user_id, "merchant_name": merchant})
        if existing:
            await db.user_merchant_rules.update_one(
                {"_id": existing["_id"]},
                {"$set": {"user_assigned_category": new_category, "last_corrected": now},
                 "$inc": {"times_corrected": 1}},
            )
        else:
            await db.user_merchant_rules.insert_one({
                "user_id": user_id, "merchant_name": merchant,
                "user_assigned_category": new_category,
                "times_corrected": 1, "last_corrected": now,
            })

    # Cascade to other same-merchant transactions with the old category
    cascade_query: Dict[str, Any] = {
        "user_id": user_id,
        "plaid_transaction_id": {"$ne": plaid_transaction_id},
        "$or": [
            {"merchant_name": {"$regex": f"^{re.escape(merchant)}$", "$options": "i"}},
            {"name": {"$regex": re.escape(merchant), "$options": "i"}},
        ],
        "category_plos": old_category,
        "user_category_override": None,
    }
    cascade_count = await db.transactions.count_documents(cascade_query)
    if cascade_count > 0:
        await db.transactions.update_many(
            cascade_query,
            {"$set": {"category_plos": new_category,
                      "category_source": "user_rule_cascade",
                      "categorized_at": now}},
        )
    return {
        "ok": True, "new_category": new_category,
        "cascade_count": cascade_count,
        "merchant": merchant,
    }
