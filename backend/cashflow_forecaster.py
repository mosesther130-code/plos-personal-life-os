"""PLOS — 90-Day Cash Flow Forecast.

Builds a day-by-day projected balance array from:
  - Starting balance (Plaid depository accounts)
  - Recurring income sources (from income_sources collection)
  - Recurring expenses (from expenses collection with due_day_of_month)
  - Debt minimum payments (from debts collection)
  - Variable expense estimates (from last 30-day Plaid averages)
"""
from __future__ import annotations

import calendar
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

DEFAULT_LOW_BALANCE_THRESHOLD = 500.0


def _add_days(d: date, n: int) -> date:
    return d + timedelta(days=n)


def _clamp_day_of_month(year: int, month: int, day: int) -> int:
    _, last = calendar.monthrange(year, month)
    return min(day, last)


def _project_monthly_events(
    start: date, days: int, day_of_month: int, amount: float, label: str, direction: str = "out",
) -> List[Dict[str, Any]]:
    events = []
    d = start
    while d <= _add_days(start, days):
        dom = _clamp_day_of_month(d.year, d.month, day_of_month)
        candidate = date(d.year, d.month, dom)
        if start <= candidate <= _add_days(start, days):
            events.append({
                "date": candidate.isoformat(),
                "label": label,
                "amount": float(amount),
                "direction": direction,
            })
        # Move to next month
        year, month = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
        d = date(year, month, 1)
    return events


def _project_biweekly(
    seed_date: date, start: date, days: int, amount: float, label: str, direction: str = "in",
) -> List[Dict[str, Any]]:
    """Project payments every 14 days from a known seed_date."""
    events = []
    d = seed_date
    # Fast-forward to first date in the window
    while d < start:
        d = _add_days(d, 14)
    end = _add_days(start, days)
    while d <= end:
        events.append({
            "date": d.isoformat(),
            "label": label,
            "amount": float(amount),
            "direction": direction,
        })
        d = _add_days(d, 14)
    return events


async def _get_starting_balance(user_id: str, db) -> float:
    total = 0.0
    async for it in db.plaid_items.find({"user_id": user_id}):
        for a in it.get("accounts", []):
            if a.get("type") == "depository":
                bal = (a.get("balances") or {}).get("current")
                if bal is not None:
                    total += float(bal)
    return total


async def _detect_paycheck_pattern(user_id: str, db) -> Optional[Dict[str, Any]]:
    """Find the most recent salary transactions (last 3) and infer the cadence."""
    txs = await db.transactions.find(
        {"user_id": user_id, "removed": {"$ne": True}},
        {"_id": 0, "date": 1, "amount": 1, "name": 1, "merchant_name": 1, "category_plos": 1},
    ).sort("date", -1).to_list(200)
    salary_txs = [
        t for t in txs
        if t.get("category_plos") == "Salary Income"
        or "payroll" in (t.get("name") or "").lower()
        or "georgia state" in (t.get("name") or "").lower()
    ]
    if len(salary_txs) < 2:
        return None
    latest_amt = abs(float(salary_txs[0].get("amount") or 0))
    latest_date = salary_txs[0].get("date")
    if not latest_date:
        return None
    try:
        seed = date.fromisoformat(latest_date[:10])
    except Exception:
        return None
    return {"seed_date": seed, "amount": latest_amt, "label": "GSU Paycheck"}


async def _get_expense_events(user_id: str, db, start: date, days: int) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    async for e in db.expenses.find({"user_id": user_id}):
        dom = e.get("due_day_of_month")
        amt = float(e.get("monthly_cost") or e.get("amount") or 0)
        label = e.get("vendor") or e.get("description") or "Expense"
        if dom and amt > 0:
            events.extend(_project_monthly_events(start, days, int(dom), amt, label, "out"))
    return events


async def _get_debt_events(user_id: str, db, start: date, days: int) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    async for d in db.debts.find({"user_id": user_id}):
        dom = d.get("due_day_of_month") or d.get("due_day") or 15
        amt = float(d.get("minimum_payment") or d.get("min_payment") or 0)
        label = d.get("name") or d.get("creditor") or "Debt Payment"
        if amt > 0:
            events.extend(_project_monthly_events(start, days, int(dom), amt, label, "out"))
    return events


async def _get_income_events(user_id: str, db, start: date, days: int) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    # Detected paycheck pattern (biweekly)
    pattern = await _detect_paycheck_pattern(user_id, db)
    if pattern:
        events.extend(_project_biweekly(
            pattern["seed_date"], start, days, pattern["amount"], pattern["label"], "in",
        ))
    # Also project any income_sources marked monthly
    async for s in db.income_sources.find({"user_id": user_id, "is_active": True}):
        net = float(s.get("net_monthly") or 0)
        if net <= 0:
            continue
        stype = (s.get("type") or "").lower()
        label = s.get("source_name") or "Income"
        if stype == "benefits":
            # Fixed-day monthly (day 5 default)
            events.extend(_project_monthly_events(start, days, 5, net, label, "in"))
        elif stype == "salary" and not pattern:
            # Fallback: split monthly amount into two biweekly deposits
            events.extend(_project_biweekly(start, start, days, net / 2, label, "in"))
        elif stype == "side":
            # Assume once a month on day 20
            events.extend(_project_monthly_events(start, days, 20, net, label, "in"))
    return events


async def generate_forecast(user_id: str, db, days: int = 90,
                            low_balance_threshold: float = DEFAULT_LOW_BALANCE_THRESHOLD,
                            ) -> Dict[str, Any]:
    start = date.today()
    starting_balance = await _get_starting_balance(user_id, db)

    income_events = await _get_income_events(user_id, db, start, days)
    expense_events = await _get_expense_events(user_id, db, start, days)
    debt_events = await _get_debt_events(user_id, db, start, days)
    all_events = income_events + expense_events + debt_events

    events_by_date: Dict[str, List[Dict[str, Any]]] = {}
    for e in all_events:
        events_by_date.setdefault(e["date"], []).append(e)

    days_array: List[Dict[str, Any]] = []
    balance = starting_balance
    for i in range(days):
        d = _add_days(start, i)
        d_iso = d.isoformat()
        opening = balance
        cash_in = [e for e in events_by_date.get(d_iso, []) if e["direction"] == "in"]
        cash_out = [e for e in events_by_date.get(d_iso, []) if e["direction"] == "out"]
        net_change = sum(e["amount"] for e in cash_in) - sum(e["amount"] for e in cash_out)
        closing = opening + net_change
        balance = closing
        days_array.append({
            "date": d_iso,
            "day_number": i + 1,
            "opening_balance": round(opening, 2),
            "closing_balance": round(closing, 2),
            "net_change": round(net_change, 2),
            "cash_in": cash_in,
            "cash_out": cash_out,
            "is_low_balance_day": closing < low_balance_threshold,
            "has_income": len(cash_in) > 0,
            "has_large_outflow": any(e["amount"] >= 500 for e in cash_out),
            "events": [f"{e['label']} {'+' if e['direction']=='in' else '-'}${e['amount']:.0f}" for e in cash_in + cash_out],
        })

    alerts = _generate_alerts(days_array, low_balance_threshold)
    generated_at = datetime.now(timezone.utc).isoformat()
    forecast = {
        "user_id": user_id,
        "generated_at": generated_at,
        "days": days_array,
        "starting_balance": round(starting_balance, 2),
        "low_balance_threshold": low_balance_threshold,
        "alerts": alerts,
        "summary": {
            "min_balance": min((d["closing_balance"] for d in days_array), default=starting_balance),
            "max_balance": max((d["closing_balance"] for d in days_array), default=starting_balance),
            "ending_balance": days_array[-1]["closing_balance"] if days_array else starting_balance,
            "total_income": round(sum(sum(e["amount"] for e in d["cash_in"]) for d in days_array), 2),
            "total_outflow": round(sum(sum(e["amount"] for e in d["cash_out"]) for d in days_array), 2),
            "low_balance_days": sum(1 for d in days_array if d["is_low_balance_day"]),
        },
    }
    await db.cashflow_forecasts.replace_one({"user_id": user_id}, forecast, upsert=True)
    return forecast


def _generate_alerts(days_array: List[Dict[str, Any]], threshold: float) -> List[Dict[str, Any]]:
    alerts: List[Dict[str, Any]] = []
    # Alert 1 — Low balance warning
    for d in days_array:
        if d["is_low_balance_day"]:
            top_outflow = max(d["cash_out"], key=lambda e: e["amount"], default=None)
            # Find days until next income
            idx = days_array.index(d)
            days_to_income = None
            for j in range(idx + 1, len(days_array)):
                if days_array[j]["has_income"]:
                    days_to_income = j - idx
                    break
            alerts.append({
                "type": "low_balance", "severity": "warning",
                "date": d["date"],
                "message": (
                    f"\u26a0\ufe0f Cash flow alert \u2014 your balance may drop to "
                    f"${d['closing_balance']:.0f} on {d['date']}"
                    + (f" due to {top_outflow['label']}" if top_outflow else "")
                    + (f". Your next paycheck is {days_to_income} days away." if days_to_income else ".")
                ),
            })
            break  # first only

    # Alert 2 — Expense cluster (3-day window > $1500)
    for i in range(len(days_array) - 2):
        window = days_array[i:i + 3]
        total_out = sum(sum(e["amount"] for e in d["cash_out"]) for d in window)
        if total_out > 1500:
            labels = list({e["label"] for d in window for e in d["cash_out"]})[:3]
            alerts.append({
                "type": "expense_cluster", "severity": "info",
                "date": window[0]["date"],
                "message": (
                    f"\u26a0\ufe0f Heavy spending window {window[0]['date']} to {window[-1]['date']} \u2014 "
                    f"${total_out:.0f} in bills due including {', '.join(labels)}."
                ),
            })
            break

    # Alert 3 — Safe-to-save (7-day window all above $1500)
    for i in range(len(days_array) - 6):
        window = days_array[i:i + 7]
        if all(d["closing_balance"] > 1500 for d in window):
            min_bal = min(d["closing_balance"] for d in window)
            suggested = max(100, round((min_bal - 1500) / 100) * 100)
            alerts.append({
                "type": "safe_to_save", "severity": "success",
                "date": window[0]["date"],
                "message": (
                    f"\u2705 Good saving opportunity \u2014 balance stays above $1,500 "
                    f"from {window[0]['date']} to {window[-1]['date']}. "
                    f"Consider moving ${suggested:.0f} to savings."
                ),
            })
            break

    return alerts
