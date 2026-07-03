"""PLOS — APScheduler-based morning pre-generation.

Runs every day at 6:00 AM America/New_York. Pre-warms:
  - Daily financial advice per user
  - 90-day cash flow forecast per user (fires push if new low-balance day appears)
  - Categorize any un-categorized transactions
  - Monthly summary (only on the 1st of the month)

Logs to pregeneration_log for observability.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import date, datetime, timezone
from typing import Any, Dict, List

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None

SCHEDULER_TZ = os.getenv("PLOS_SCHEDULER_TZ", "America/New_York")


async def _run_for_all_users(db, task_name: str, task_fn) -> Dict[str, Any]:
    started = time.time()
    users = await db.users.find({}, {"_id": 0, "user_id": 1, "id": 1}).to_list(1000)
    ran = 0
    failed: List[str] = []
    for u in users:
        uid = u.get("user_id") or u.get("id")
        if not uid:
            continue
        try:
            await task_fn(uid)
            ran += 1
        except Exception as e:
            failed.append(f"{uid}:{type(e).__name__}")
            logger.warning("[%s] failed for %s: %s", task_name, uid, e)
    duration = time.time() - started
    result = {
        "task": task_name, "users_run": ran, "users_failed": len(failed),
        "failed_details": failed[:10], "duration_s": round(duration, 2),
    }
    logger.info("[pregen] %s", result)
    return result


async def run_morning_pregen(db):
    """Main entrypoint — runs all pregeneration tasks in parallel."""
    from transaction_categorizer import categorize_user_transactions
    from cashflow_forecaster import generate_forecast
    from monthly_summary import generate_monthly_summary

    started = datetime.now(timezone.utc)
    log_doc: Dict[str, Any] = {
        "run_date": started.date().isoformat(),
        "start_time": started.isoformat(),
        "tasks_completed": [],
        "tasks_failed": [],
    }

    # Task 1 — Categorize any uncategorized transactions
    async def _cat(uid):
        await categorize_user_transactions(uid, db, only_uncategorized=True)

    # Task 2 — Cash flow forecast refresh (also fires low-balance alerts)
    async def _cf(uid):
        prev = await db.cashflow_forecasts.find_one({"user_id": uid}, {"alerts": 1, "_id": 0})
        prev_alert_dates = {a.get("date") for a in (prev or {}).get("alerts", []) if a}
        forecast = await generate_forecast(uid, db, days=90)
        new_alert_dates = {a.get("date") for a in forecast.get("alerts", [])}
        # Fire push for new alerts
        for a in forecast.get("alerts", []):
            if a.get("date") not in prev_alert_dates:
                await db.notifications_outbox.insert_one({
                    "user_id": uid, "event": "cashflow_alert",
                    "message": a.get("message"),
                    "data": a,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
        _ = new_alert_dates

    # Task 3 — Monthly summary (only on the 1st)
    async def _monthly(uid):
        if date.today().day == 1:
            summary = await generate_monthly_summary(uid, db, use_cache=False)
            await db.notifications_outbox.insert_one({
                "user_id": uid, "event": "monthly_summary_ready",
                "message": (
                    f"\ud83d\udcca Your {summary.get('month_label')} financial summary is ready "
                    f"\u2014 tap to see where your money went."
                ),
                "data": {"month": summary.get("month")},
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

    # Task 4 — Fraud scan
    async def _fraud(uid):
        from fraud_detector import scan_recent_transactions
        await scan_recent_transactions(uid, db, days=7)

    tasks = [
        ("categorize", _cat),
        ("cashflow_forecast", _cf),
        ("monthly_summary", _monthly),
        ("fraud_scan", _fraud),
    ]

    for name, fn in tasks:
        try:
            r = await _run_for_all_users(db, name, fn)
            log_doc["tasks_completed"].append(r)
        except Exception as e:
            log_doc["tasks_failed"].append({"task": name, "error": str(e)})

    log_doc["end_time"] = datetime.now(timezone.utc).isoformat()
    log_doc["total_duration_s"] = round((datetime.now(timezone.utc) - started).total_seconds(), 2)
    try:
        await db.pregeneration_log.insert_one(log_doc)
    except Exception as e:
        logger.warning("pregen log write failed: %s", e)
    # Strip mongo ObjectId before returning (FastAPI can't serialize it)
    log_doc.pop("_id", None)
    return log_doc


def start_scheduler(db):
    """Attach the scheduler to the running event loop and register jobs."""
    global _scheduler
    if _scheduler:
        return _scheduler
    _scheduler = AsyncIOScheduler(timezone=SCHEDULER_TZ)
    _scheduler.add_job(
        run_morning_pregen, CronTrigger(hour=6, minute=0, timezone=SCHEDULER_TZ),
        args=[db], id="morning_pregen", replace_existing=True,
        misfire_grace_time=1800,
    )
    _scheduler.start()
    logger.info("[pregen] scheduler started — next run: %s", _scheduler.get_job("morning_pregen").next_run_time)
    return _scheduler


def stop_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None


async def trigger_now(db):
    """On-demand trigger for testing / manual refresh."""
    return await run_morning_pregen(db)
