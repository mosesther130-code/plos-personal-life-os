"""PLOS — Monthly Spending Summary (Claude-generated narrative).

Called monthly (via scheduler) or on-demand from the frontend. Uses the
response_cache manager so repeated views on the same month don't re-hit
Claude.
"""
from __future__ import annotations

import logging
import os
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)


def _month_range(month_iso: Optional[str]) -> Tuple[str, str, str]:
    """Return (start_iso, end_iso, label) for a given YYYY-MM (or previous month)."""
    if month_iso:
        try:
            y, m = month_iso.split("-")
            y, m = int(y), int(m)
        except Exception:
            y, m = date.today().year, date.today().month
    else:
        today = date.today()
        if today.month == 1:
            y, m = today.year - 1, 12
        else:
            y, m = today.year, today.month - 1
    import calendar as _cal
    start = date(y, m, 1)
    last_day = _cal.monthrange(y, m)[1]
    end = date(y, m, last_day)
    label = start.strftime("%B %Y")
    return start.isoformat(), end.isoformat(), label


async def _fetch_month_transactions(user_id: str, db, start_iso: str, end_iso: str) -> List[Dict[str, Any]]:
    return await db.transactions.find(
        {"user_id": user_id, "removed": {"$ne": True},
         "date": {"$gte": start_iso, "$lte": end_iso}},
        {"_id": 0},
    ).to_list(1000)


def _aggregate(txs: List[Dict[str, Any]]) -> Dict[str, Any]:
    total_in = 0.0
    total_out = 0.0
    by_cat: Dict[str, float] = {}
    by_merchant: Dict[str, float] = {}
    recurring_candidates: Counter = Counter()
    for t in txs:
        if t.get("pending"):
            continue
        amt = float(t.get("amount") or 0)
        merchant = (t.get("merchant_name") or t.get("name") or "Unknown").strip()
        cat = t.get("category_plos") or "Uncategorized"
        if amt < 0:
            total_in += -amt
        else:
            total_out += amt
            by_cat[cat] = by_cat.get(cat, 0) + amt
            by_merchant[merchant] = by_merchant.get(merchant, 0) + amt
            recurring_candidates[merchant] += 1
    top_merchants = sorted(by_merchant.items(), key=lambda x: x[1], reverse=True)[:5]
    top_cats = sorted(by_cat.items(), key=lambda x: x[1], reverse=True)[:8]
    subscriptions = [m for m, c in recurring_candidates.items() if c == 1 and by_merchant.get(m, 0) < 40]
    return {
        "total_income": round(total_in, 2),
        "total_expenses": round(total_out, 2),
        "net": round(total_in - total_out, 2),
        "top_merchants": [{"merchant": m, "amount": round(a, 2)} for m, a in top_merchants],
        "by_category": [{"category": c, "amount": round(a, 2)} for c, a in top_cats],
        "single_charge_subscriptions": subscriptions[:5],
        "transaction_count": len(txs),
    }


async def generate_monthly_summary(user_id: str, db, month_iso: Optional[str] = None,
                                    use_cache: bool = True) -> Dict[str, Any]:
    """Generate (or fetch cached) monthly narrative summary for a user."""
    start_iso, end_iso, label = _month_range(month_iso)
    key_month = start_iso[:7]

    # Check stored summary
    if use_cache:
        cached = await db.monthly_summaries.find_one(
            {"user_id": user_id, "month": key_month}, {"_id": 0},
        )
        if cached:
            return cached

    # Aggregate current + previous month
    current_txs = await _fetch_month_transactions(user_id, db, start_iso, end_iso)
    current_agg = _aggregate(current_txs)

    prev_start_iso, prev_end_iso, _ = _month_range(
        (datetime.fromisoformat(start_iso) - timedelta(days=1)).strftime("%Y-%m"),
    )
    prev_txs = await _fetch_month_transactions(user_id, db, prev_start_iso, prev_end_iso)
    prev_agg = _aggregate(prev_txs)

    # Call Claude for narrative
    narrative = await _claude_narrative(label, current_agg, prev_agg)

    doc = {
        "user_id": user_id,
        "month": key_month,
        "month_label": label,
        "start_date": start_iso,
        "end_date": end_iso,
        "aggregates": current_agg,
        "previous_month_aggregates": prev_agg,
        "narrative": narrative,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.monthly_summaries.replace_one(
        {"user_id": user_id, "month": key_month}, doc, upsert=True,
    )
    return doc


async def _claude_narrative(month_label: str, cur: Dict[str, Any], prev: Dict[str, Any]) -> str:
    """Ask Claude for a 3-4 paragraph conversational financial summary."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.getenv("EMERGENT_LLM_KEY")
        if not api_key:
            return _fallback_narrative(month_label, cur, prev)

        prompt = (
            f"Analyze this user's transactions for {month_label} and write a 3-4 paragraph "
            "plain-language financial summary. The user is Moses Ndifon, a GSU Department "
            "Coordinator with a monthly net salary of approximately $5,840.\n\n"
            f"CURRENT MONTH ({month_label}):\n"
            f"- Total income: ${cur['total_income']:,.2f}\n"
            f"- Total expenses: ${cur['total_expenses']:,.2f}\n"
            f"- Net: ${cur['net']:,.2f}\n"
            f"- By category: {cur['by_category']}\n"
            f"- Top merchants: {cur['top_merchants']}\n"
            f"- Single-charge subscriptions (possibly unused): {cur['single_charge_subscriptions']}\n"
            f"- Transaction count: {cur['transaction_count']}\n\n"
            f"PREVIOUS MONTH:\n"
            f"- Total expenses: ${prev['total_expenses']:,.2f}\n"
            f"- By category: {prev['by_category']}\n\n"
            "Cover: total spending by category vs last month, the top 3 merchants by amount, "
            "any unusual or one-time charges, subscriptions that appear unused, and ONE specific "
            "actionable recommendation for next month. Write conversationally, addressing the user "
            "directly. Include specific dollar amounts. DO NOT use bullet points — write in flowing "
            "paragraphs. Keep it under 350 words."
        )
        chat = (
            LlmChat(api_key=api_key, session_id=f"plos-monthly-{month_label}",
                    system_message="You are a warm, direct personal financial coach.")
            .with_model("anthropic", "claude-sonnet-4-5-20250929")
            .with_max_tokens(2000)
        )
        resp = await chat.send_message(UserMessage(text=prompt))
        return resp if isinstance(resp, str) else str(resp)
    except Exception as e:
        logger.warning("Monthly narrative Claude call failed: %s", e)
        return _fallback_narrative(month_label, cur, prev)


def _fallback_narrative(month_label: str, cur: Dict[str, Any], prev: Dict[str, Any]) -> str:
    top = cur["top_merchants"][:3]
    top_str = ", ".join([f"{m['merchant']} (${m['amount']:,.0f})" for m in top]) or "none recorded"
    delta = cur["total_expenses"] - prev["total_expenses"]
    trend = f"up ${delta:,.0f} versus last month" if delta > 0 else f"down ${-delta:,.0f} versus last month"
    return (
        f"In {month_label} you earned ${cur['total_income']:,.2f} and spent "
        f"${cur['total_expenses']:,.2f}, leaving you "
        f"{'a surplus' if cur['net'] >= 0 else 'a shortfall'} of "
        f"${abs(cur['net']):,.2f}. Your spending was {trend}. Your top three spending destinations "
        f"were {top_str}. "
        + (f"There were {len(cur['single_charge_subscriptions'])} small recurring charges worth reviewing. "
           if cur['single_charge_subscriptions'] else "")
        + "Consider setting aside your surplus toward high-interest debt or an emergency fund for next month."
    )
