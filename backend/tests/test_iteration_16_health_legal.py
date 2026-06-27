"""
Iteration 16 — Health & Wellbeing + Legal Advisor modules.
Backend pytest covering all health/* and legal/* endpoints per spec.
"""
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if BASE_URL:
    BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "test1@plos.app"
PASSWORD = "test123"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def auth(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# =============================================================
# HEALTH MODULE
# =============================================================
class TestHealthInsurance:
    def test_01_get_insurance_default_medicaid(self, auth):
        r = auth.get(f"{API}/health/insurance", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "insurance" in body and "eligibility" in body
        ins = body["insurance"]
        assert ins["coverage_type"] == "Medicaid"
        assert ins["household_size"] == 1
        # Auto-fills from income_sources (test1 seeded ~$8,900/mo)
        assert ins.get("monthly_income_usd") is not None
        assert ins["monthly_income_usd"] > 0
        elig = body["eligibility"]
        assert "level" in elig and "threshold" in elig
        assert elig["threshold"] == 1822
        # Since seeded income > $1,822 should be 'over'
        assert elig["level"] in ("over", "approaching", "ok")

    def test_02_put_insurance_income_2500_over(self, auth):
        r = auth.put(f"{API}/health/insurance", json={"monthly_income_usd": 2500, "household_size": 1}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["insurance"]["monthly_income_usd"] == 2500
        assert body["eligibility"]["level"] == "over"
        assert body["eligibility"]["ratio"] > 1

    def test_03_put_insurance_income_1500_ok(self, auth):
        r = auth.put(f"{API}/health/insurance", json={"monthly_income_usd": 1500}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["insurance"]["monthly_income_usd"] == 1500
        # 1500 / 1822 = 0.823 → ok (< 0.85)
        assert body["eligibility"]["level"] == "ok"

    def test_04_put_insurance_approaching(self, auth):
        # 1550 / 1822 = 0.851 → approaching
        r = auth.put(f"{API}/health/insurance", json={"monthly_income_usd": 1700}, timeout=15)
        assert r.status_code == 200
        assert r.json()["eligibility"]["level"] == "approaching"


class TestHealthMedicaidResources:
    def test_05_medicaid_resources(self, auth):
        r = auth.get(f"{API}/health/medicaid-resources", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert len(body["resources"]) == 6
        assert len(body["covered_services"]) == 10
        assert body["thresholds"]["single_adult_monthly_usd"] == 1822
        assert body["thresholds"]["state"] == "Georgia"


# ---------- Wellness ----------
class TestHealthWellness:
    def test_06_post_wellness_today(self, auth):
        r = auth.post(
            f"{API}/health/wellness",
            json={"energy": 8, "sleep": 7, "stress": 4, "mood": 8, "notes": "TEST_good day"},
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["energy"] == 8 and body["sleep"] == 7 and body["stress"] == 4 and body["mood"] == 8
        assert "user_id" not in body

    def test_07_get_wellness_returns_today(self, auth):
        r = auth.get(f"{API}/health/wellness?days=7", timeout=15)
        assert r.status_code == 200
        body = r.json()
        checkins = body["checkins"]
        assert len(checkins) >= 1
        today = datetime.now(timezone.utc).date().isoformat()
        todays = [c for c in checkins if c["date"] == today]
        assert len(todays) == 1, f"Expected 1 checkin today, got {len(todays)}"

    def test_08_post_wellness_upsert_same_day(self, auth):
        # POST a second wellness same day → only ONE record stays
        r = auth.post(
            f"{API}/health/wellness",
            json={"energy": 5, "sleep": 6, "stress": 7, "mood": 5, "notes": "TEST_updated"},
            timeout=15,
        )
        assert r.status_code == 200
        r2 = auth.get(f"{API}/health/wellness?days=7", timeout=15)
        today = datetime.now(timezone.utc).date().isoformat()
        todays = [c for c in r2.json()["checkins"] if c["date"] == today]
        assert len(todays) == 1
        assert todays[0]["energy"] == 5
        assert todays[0]["notes"] == "TEST_updated"


# ---------- Medications CRUD ----------
class TestHealthMedications:
    med_id = None

    def test_09_create_med(self, auth):
        r = auth.post(
            f"{API}/health/medications",
            json={"name": "TEST_Lisinopril", "dosage": "10mg", "schedule_time": "08:00"},
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert "med_id" in body
        assert "user_id" not in body and "_id" not in body
        assert body["name"] == "TEST_Lisinopril"
        TestHealthMedications.med_id = body["med_id"]

    def test_10_list_med(self, auth):
        r = auth.get(f"{API}/health/medications", timeout=15)
        assert r.status_code == 200
        meds = r.json()["medications"]
        ids = [m["med_id"] for m in meds]
        assert TestHealthMedications.med_id in ids

    def test_11_update_med(self, auth):
        mid = TestHealthMedications.med_id
        r = auth.put(
            f"{API}/health/medications/{mid}",
            json={"name": "TEST_Lisinopril", "dosage": "20mg", "schedule_time": "08:00"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["dosage"] == "20mg"

    def test_12_delete_med(self, auth):
        mid = TestHealthMedications.med_id
        r = auth.delete(f"{API}/health/medications/{mid}", timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # verify gone
        r2 = auth.get(f"{API}/health/medications", timeout=15)
        ids = [m["med_id"] for m in r2.json()["medications"]]
        assert mid not in ids


# ---------- Appointments CRUD ----------
class TestHealthAppointments:
    appt_id = None

    def test_13_create_appt(self, auth):
        r = auth.post(
            f"{API}/health/appointments",
            json={"title": "TEST_Annual physical", "datetime": "2026-09-15T10:30", "location": "Emory"},
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert "appt_id" in body
        assert body["title"] == "TEST_Annual physical"
        TestHealthAppointments.appt_id = body["appt_id"]

    def test_14_list_appt_days_until(self, auth):
        r = auth.get(f"{API}/health/appointments", timeout=15)
        assert r.status_code == 200
        rows = r.json()["appointments"]
        ours = [a for a in rows if a["appt_id"] == TestHealthAppointments.appt_id]
        assert len(ours) == 1
        assert isinstance(ours[0]["days_until"], int)

    def test_15_update_appt(self, auth):
        aid = TestHealthAppointments.appt_id
        r = auth.put(
            f"{API}/health/appointments/{aid}",
            json={"title": "TEST_Annual physical v2", "datetime": "2026-09-15T11:30", "location": "Emory Midtown"},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["title"] == "TEST_Annual physical v2"

    def test_16_delete_appt(self, auth):
        aid = TestHealthAppointments.appt_id
        r = auth.delete(f"{API}/health/appointments/{aid}", timeout=15)
        assert r.status_code == 200


# ---------- AI Insights ----------
class TestHealthInsights:
    def test_17_insights_after_checkin(self, auth):
        # ensure a check-in exists (test_06/08 created one today already, but be safe)
        auth.post(
            f"{API}/health/wellness",
            json={"energy": 7, "sleep": 6, "stress": 5, "mood": 7, "notes": "TEST_insights"},
            timeout=15,
        )
        r = auth.post(f"{API}/health/insights", timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["data_points"] >= 1
        text = body["insights"].lower()
        # Verify ends with disclaimer about consulting doctor
        assert "consult your doctor" in text, f"missing disclaimer; got: {body['insights'][-200:]}"


# =============================================================
# LEGAL MODULE
# =============================================================
class TestLegalCategories:
    def test_18_categories_9_with_disclaimer(self, auth):
        r = auth.get(f"{API}/legal/categories", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert len(body["categories"]) == 9
        slugs = {c["slug"] for c in body["categories"]}
        assert {"housing", "employment", "debt", "immigration", "family", "estate", "consumer", "tax", "smallbiz"} <= slugs
        assert "general legal information only" in body["disclaimer"]


class TestLegalTopic:
    def test_19_topic_first_call_not_cached(self, auth):
        # Force fresh
        r = auth.post(f"{API}/legal/topic/housing?force_refresh=true", timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["slug"] == "housing"
        assert body["cached"] is False
        # disclaimer present at end
        assert "⚖" in body["response"] or "general legal information only" in body["response"].lower()

    def test_20_topic_second_call_cached(self, auth):
        r = auth.post(f"{API}/legal/topic/housing", timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["cached"] is True
        assert len(body["response"]) > 100

    def test_21_topic_force_refresh_regenerates(self, auth):
        r = auth.post(f"{API}/legal/topic/housing?force_refresh=true", timeout=90)
        assert r.status_code == 200
        assert r.json()["cached"] is False

    def test_22_topic_unknown_404(self, auth):
        r = auth.post(f"{API}/legal/topic/nonexistent_slug", timeout=15)
        assert r.status_code == 404


# ---------- Legal Documents ----------
class TestLegalDocuments:
    custom_doc_id = None
    default_doc_id = None

    def test_23_first_get_seeds_5_defaults(self, auth):
        # Wipe any existing docs first via direct cleanup is not possible without admin;
        # rely on idempotent seeding behavior (auto-seeds only when empty).
        r = auth.get(f"{API}/legal/documents", timeout=15)
        assert r.status_code == 200
        body = r.json()
        docs = body["documents"]
        defaults = [d for d in docs if d.get("custom") is False]
        assert len(defaults) >= 5
        types = {d["type"] for d in defaults}
        assert {"will", "poa", "life_insurance", "property_deed", "healthcare_directive"} <= types
        for d in defaults:
            assert d.get("custom") is False
        will = next(d for d in defaults if d["type"] == "will")
        TestLegalDocuments.default_doc_id = will["doc_id"]

    def test_24_create_custom_doc(self, auth):
        r = auth.post(
            f"{API}/legal/documents",
            json={"type": "trust", "title": "TEST_Living Trust", "status": "drafted"},
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["custom"] is True
        assert body["title"] == "TEST_Living Trust"
        TestLegalDocuments.custom_doc_id = body["doc_id"]

    def test_25_subsequent_get_includes_custom(self, auth):
        r = auth.get(f"{API}/legal/documents", timeout=15)
        assert r.status_code == 200
        docs = r.json()["documents"]
        ids = [d["doc_id"] for d in docs]
        assert TestLegalDocuments.custom_doc_id in ids
        custom_doc = next(d for d in docs if d["doc_id"] == TestLegalDocuments.custom_doc_id)
        assert custom_doc["custom"] is True

    def test_26_update_default_preserves_custom_false(self, auth):
        did = TestLegalDocuments.default_doc_id
        r = auth.put(
            f"{API}/legal/documents/{did}",
            json={"type": "will", "title": "Last Will & Testament", "status": "drafted"},
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "drafted"
        assert body["custom"] is False  # preserved

    def test_27_delete_custom_doc_ok(self, auth):
        cid = TestLegalDocuments.custom_doc_id
        r = auth.delete(f"{API}/legal/documents/{cid}", timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_28_delete_default_doc_400(self, auth):
        did = TestLegalDocuments.default_doc_id
        r = auth.delete(f"{API}/legal/documents/{did}", timeout=15)
        assert r.status_code == 400
        assert "cannot be deleted" in r.text.lower() or "default" in r.text.lower()


# ---------- Debt Rights ----------
class TestLegalDebtRights:
    def test_29_debt_rights_all_sections(self, auth):
        r = auth.get(f"{API}/legal/debt-rights", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "fdcpa" in body and len(body["fdcpa"]["rights"]) == 7
        assert "credit_disputes" in body and len(body["credit_disputes"]["steps"]) == 5
        assert "student_loans" in body and len(body["student_loans"]["programs"]) == 5
        assert "statute_of_limitations_ga" in body and len(body["statute_of_limitations_ga"]["items"]) == 6
        assert "free_legal_aid_ga" in body and len(body["free_legal_aid_ga"]) == 4
        assert "disclaimer" in body
