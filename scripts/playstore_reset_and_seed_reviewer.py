"""Play Store pre-submission database reset.

- Wipes all documents from the listed collections (structure preserved)
- Also wipes users + a few auxiliary user-scoped collections so no seed data
  from earlier test accounts leaks into production
- Creates the sole reviewer account with the exact profile requested

Run:  python /app/scripts/playstore_reset_and_seed_reviewer.py
"""
import os
import sys
import uuid
import bcrypt
from datetime import datetime, timezone

from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "test_database")

# Collections explicitly listed by the user
LISTED = [
    "income_sources", "expenses", "debts", "assets", "investments",
    "career_profile", "job_applications", "health_profile", "transactions",
    "plaid_items", "jobs_feed", "resume_versions", "job_descriptions",
    "resumes", "cashflow_forecasts", "ai_decisions_log", "family_locations",
    "travel_trips", "user_profile",
]

# Additional user-scoped collections that would otherwise leak stale data.
# These are wiped so the reviewer account starts with a truly empty state.
AUX = [
    "users",  # so only the reviewer user exists
    "alerts", "alert_settings", "notifications_outbox",
    "chat_conversations", "chat_messages",
    "credit_scores", "credit_history", "credit_tips", "hard_inquiries",
    "breach_records", "monitored_accounts", "identity_theft_checklist",
    "data_brokers",
    "wellness_checkins", "medications", "appointments", "medical_docs",
    "trips", "trip_checklists", "travel_saved_routes",  # travel_trips alias
    "family_members", "sos_events",
    "career_files", "user_resumes", "user_career_criteria",
    "job_filter_profiles", "target_employers", "job_intel_runs",
    "career_seed_state",
    "debt_extras", "loan_servicers", "mortgage_servicers",
    "monthly_summaries", "planned_expenses",
    "ai_router_cache", "ai_usage_log",
    "daily_advice_cache", "response_cache",
    "audit_logs", "gps_alert_settings", "offline_maps",
    "shopping_prefs", "deal_searches", "dismissed_deals",
    "eden_heights", "business_ideas",
    "saved_vehicles", "registered_products",
    "plaid_webhook_events", "trusted_merchants", "user_merchant_rules",
    "world_clocks", "rate_alerts",
    "doc_summaries", "legal_documents",
    "money_tips",
]


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=12)).decode()


def main():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    print(f"[reset] connected to {DB_NAME}")

    # ---- WIPE -----------------------------------------------------------
    total = 0
    print("\n== Clearing collections requested by the user ==")
    for name in LISTED:
        try:
            res = db[name].delete_many({})
            print(f"  cleared {name:26s}  {res.deleted_count} docs")
            total += res.deleted_count
        except Exception as e:
            print(f"  ERR   {name:26s}  {e}")

    print("\n== Clearing auxiliary user-scoped collections ==")
    for name in AUX:
        try:
            res = db[name].delete_many({})
            print(f"  cleared {name:26s}  {res.deleted_count} docs")
            total += res.deleted_count
        except Exception as e:
            print(f"  ERR   {name:26s}  {e}")
    print(f"\n[reset] total docs deleted: {total}")

    # ---- SEED REVIEWER --------------------------------------------------
    print("\n== Creating reviewer demo account ==")
    email = "reviewer@plos-demo.com"
    password = "PLOSReview2026"
    full_name = "Alex Demo"
    user_id = str(uuid.uuid4())
    ts = now()

    # users
    db.users.insert_one({
        "user_id": user_id, "email": email,
        "password_hash": hash_password(password),
        "full_name": full_name, "created_at": ts,
    })
    print(f"  \u2713 users              user_id={user_id}")

    # user_profile
    db.user_profile.insert_one({
        "user_id": user_id, "email": email, "full_name": full_name,
        "date_of_birth": None,
        "location_primary": "Atlanta, GA",
        "location_city": "Atlanta",
        "location_state": "GA",
        "location_country": "US",
        "financial_health_score": 0, "net_worth_usd": 0.0,
        "last_updated": ts,
    })
    print("  \u2713 user_profile       Atlanta, GA")

    # career_profile + health_profile placeholders
    db.career_profile.insert_one({
        "user_id": user_id, "career_id": str(uuid.uuid4()),
        "current_title": None, "current_employer": None,
        "resume_master_text": None, "ats_score": 0,
        "target_roles": [], "target_locations": [], "min_salary": 0,
        "auto_apply_enabled": False,
    })
    db.health_profile.insert_one({
        "user_id": user_id, "health_id": str(uuid.uuid4()),
        "conditions": [], "medications": [],
        "primary_insurance": None, "wellness_score": 0,
    })
    print("  \u2713 career_profile + health_profile")

    # Income $5,500/mo
    db.income_sources.insert_one({
        "user_id": user_id, "income_id": str(uuid.uuid4()),
        "source_name": "Primary Salary", "employer": "Demo Employer",
        "amount_usd": 5500.0, "frequency": "monthly", "is_active": True,
        "created_at": ts,
    })
    print("  \u2713 income_sources     $5,500/mo salary")

    # Expenses: mortgage 1400, utilities 300, insurance 150
    expenses = [
        {"category": "Housing",   "name": "Mortgage",    "amount": 1400.0},
        {"category": "Utilities", "name": "Utilities",   "amount": 300.0},
        {"category": "Insurance", "name": "Insurance",   "amount": 150.0},
    ]
    for e in expenses:
        db.expenses.insert_one({
            "user_id": user_id, "expense_id": str(uuid.uuid4()),
            "category": e["category"], "name": e["name"],
            "amount_usd": e["amount"], "frequency": "monthly",
            "is_active": True, "created_at": ts,
        })
    print(f"  \u2713 expenses           {len(expenses)} rows (mortgage 1400 / utilities 300 / insurance 150)")

    # Debt: credit card $2,000 @ 18% APR
    db.debts.insert_one({
        "user_id": user_id, "debt_id": str(uuid.uuid4()),
        "creditor": "Chase", "account_name": "Chase Freedom Credit Card",
        "debt_type": "credit_card",
        "balance_usd": 2000.0, "original_balance_usd": 2000.0,
        "interest_rate_apr": 18.0,
        "min_payment_usd": 60.0,
        "due_day": 15, "is_active": True,
        "created_at": ts,
    })
    print("  \u2713 debts              Chase credit card $2,000 @ 18% APR")

    # Investment: TSP $25,000
    db.investments.insert_one({
        "user_id": user_id, "investment_id": str(uuid.uuid4()),
        "account_name": "Thrift Savings Plan (TSP)",
        "account_type": "TSP",
        "provider": "Federal Retirement Thrift Investment Board",
        "balance_usd": 25000.0,
        "annual_contribution_usd": 0.0,
        "risk_profile": "moderate",
        "is_active": True, "created_at": ts,
    })
    print("  \u2713 investments        TSP $25,000")

    # Verify
    print("\n== Verification ==")
    users_ct = db.users.count_documents({})
    print(f"  users total: {users_ct} (should be 1)")
    print(f"  reviewer income: ${db.income_sources.find_one({'user_id':user_id})['amount_usd']}")
    print(f"  reviewer expenses count: {db.expenses.count_documents({'user_id':user_id})}")
    print(f"  reviewer debt: {db.debts.find_one({'user_id':user_id})['creditor']} ${db.debts.find_one({'user_id':user_id})['balance_usd']}")
    print(f"  reviewer investment: {db.investments.find_one({'user_id':user_id})['account_name']} ${db.investments.find_one({'user_id':user_id})['balance_usd']}")

    print("\n[DONE] Database reset + reviewer account seeded.")
    print(f"       Email:    {email}")
    print(f"       Password: {password}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FATAL:", e)
        sys.exit(1)
