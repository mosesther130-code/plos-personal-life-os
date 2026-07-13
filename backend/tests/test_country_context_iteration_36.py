"""
Iteration 36 — Country Context integration tests for Legal Advisor
and Shopping & Deals modules, plus PLOS AI → PLOS rebrand check.
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or os.environ.get(
    "EXPO_BACKEND_URL", ""
).rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "reviewer@plos-demo.com"
PASSWORD = "PLOSReview2026"


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ============================================================
# Legal Advisor — POST /api/legal/topic/{slug}?country=...
# ============================================================
class TestLegalTopicCountry:

    def test_legal_topic_ph_employment(self, auth_headers):
        r = requests.post(
            f"{API}/legal/topic/employment?country=PH&force_refresh=true",
            headers=auth_headers,
            timeout=120,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["country"] == "PH"
        assert j["country_name"] == "Philippines"
        assert j["flag"] == "🇵🇭"
        assert "response" in j and len(j["response"]) > 100
        body = j["response"].lower()
        # Look for PH signals — at least one should be present
        signals = ["labor code", "dole", "republic act", " ra ", "philippine", "₱"]
        assert any(s in body for s in signals), (
            f"PH signals missing. Response preview: {j['response'][:400]}"
        )
        # Must NOT dominate with US Georgia-specific references
        assert "georgia" not in body or "philippine" in body

    def test_legal_topic_us_default_backward_compat(self, auth_headers):
        # No country -> defaults to US; must cite Georgia
        r = requests.post(
            f"{API}/legal/topic/employment?force_refresh=true",
            headers=auth_headers,
            timeout=120,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["country"] == "US"
        assert j["country_name"] == "United States"
        assert j["flag"] == "🇺🇸"
        body = j["response"].lower()
        assert "georgia" in body or "state" in body
        # Standard attorney disclaimer must be present at the end
        assert "attorney" in body

    def test_legal_topic_gb_housing(self, auth_headers):
        r = requests.post(
            f"{API}/legal/topic/housing?country=GB&force_refresh=true",
            headers=auth_headers,
            timeout=120,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["country"] == "GB"
        assert j["country_name"] == "United Kingdom"
        body = j["response"].lower()
        assert any(
            s in body for s in ["£", "consumer rights act", "united kingdom", "uk ", "landlord and tenant"]
        )

    def test_legal_topic_be_consumer(self, auth_headers):
        r = requests.post(
            f"{API}/legal/topic/consumer?country=BE&force_refresh=true",
            headers=auth_headers,
            timeout=120,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["country"] == "BE"
        assert j["country_name"] == "Belgium"
        body = j["response"].lower()
        assert any(s in body for s in ["€", "belgian", "belgium", "eu ", "spf economie"])

    def test_legal_topic_unknown_country_falls_back(self, auth_headers):
        # Unknown code should fall back to US context (per get_country logic)
        r = requests.post(
            f"{API}/legal/topic/tax?country=XX&force_refresh=true",
            headers=auth_headers,
            timeout=120,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        # Response echoes back the code but content is US fallback
        assert j["country"] == "XX"
        assert j["country_name"] == "United States"

    def test_legal_topic_ph_caching(self, auth_headers):
        # First call warms cache
        r1 = requests.post(
            f"{API}/legal/topic/family?country=PH&force_refresh=true",
            headers=auth_headers,
            timeout=120,
        )
        assert r1.status_code == 200
        # Second call without force_refresh should return cached
        r2 = requests.post(
            f"{API}/legal/topic/family?country=PH",
            headers=auth_headers,
            timeout=30,
        )
        assert r2.status_code == 200
        assert r2.json().get("cached") is True

    def test_legal_topic_unknown_slug_404(self, auth_headers):
        r = requests.post(
            f"{API}/legal/topic/not-a-real-slug?country=US",
            headers=auth_headers,
            timeout=30,
        )
        assert r.status_code == 404


# ============================================================
# Legal — GET /api/legal/debt-rights
# ============================================================
class TestLegalDebtRights:

    def test_us_full_structure(self, auth_headers):
        r = requests.get(f"{API}/legal/debt-rights?country=US", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("country") == "US"
        for key in ("fdcpa", "credit_disputes", "student_loans", "statute_of_limitations_ga", "free_legal_aid_ga"):
            assert key in j, f"missing {key} in US debt-rights"
        assert "localised" not in j

    def test_ph_localised(self, auth_headers):
        r = requests.get(f"{API}/legal/debt-rights?country=PH", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("country") == "PH"
        assert j.get("country_name") == "Philippines"
        assert j.get("localised") is True
        for key in ("jurisdiction", "regulator", "consumer_law_ref", "notice"):
            assert key in j and j[key], f"missing {key} in PH debt-rights"
        # Must NOT include US-specific structures
        assert "fdcpa" not in j
        assert "statute_of_limitations_ga" not in j


# ============================================================
# Shopping — /api/shopping/deals & /api/shopping/utilities
# ============================================================
class TestShoppingCountry:

    def test_deals_us(self, auth_headers):
        r = requests.get(f"{API}/shopping/deals?country=US", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["country"] == "US"
        assert j["country_name"] == "United States"
        assert isinstance(j["deals"], list)
        # US should have seeded deals
        assert len(j["deals"]) > 0
        assert j["currency"] == "USD"

    def test_deals_ph_empty_with_notice(self, auth_headers):
        r = requests.get(f"{API}/shopping/deals?country=PH", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["country"] == "PH"
        assert j["country_name"] == "Philippines"
        assert j["currency"] == "PHP"
        assert j["deals"] == []
        assert "notice" in j and j["notice"]
        assert "philippines" in j["notice"].lower()
        assert "ai deal finder" in j["notice"].lower()

    def test_utilities_us(self, auth_headers):
        r = requests.get(f"{API}/shopping/utilities?country=US", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["country"] == "US"
        assert isinstance(j["utilities"], list)
        assert len(j["utilities"]) > 0

    def test_utilities_ph_empty_with_notice(self, auth_headers):
        r = requests.get(f"{API}/shopping/utilities?country=PH", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["country"] == "PH"
        assert j["country_name"] == "Philippines"
        assert j["currency"] == "PHP"
        assert j["utilities"] == []
        assert "notice" in j and j["notice"]


# ============================================================
# Utilities Find-Better
# ============================================================
class TestFindBetterRate:

    def test_find_better_us(self, auth_headers):
        r = requests.post(
            f"{API}/shopping/utilities/ga_power/find-better?country=US",
            headers=auth_headers,
            timeout=180,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["country"] == "US"
        assert j["country_name"] == "United States"
        assert j["currency"] == "USD"
        assert "recommendation" in j and len(j["recommendation"]) > 50

    def test_find_better_ph(self, auth_headers):
        r = requests.post(
            f"{API}/shopping/utilities/ga_power/find-better?country=PH",
            headers=auth_headers,
            timeout=180,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["country"] == "PH"
        assert j["country_name"] == "Philippines"
        assert j["currency"] == "PHP"
        rec = j["recommendation"].lower()
        # Should adapt to PH — expect at least mention of Meralco, Philippines, PHP, or ₱
        assert any(s in rec for s in ["meralco", "philippine", "php", "₱", "erc"]), (
            f"PH recommendation should adapt. Preview: {j['recommendation'][:400]}"
        )

    def test_find_better_unknown_utility_404(self, auth_headers):
        r = requests.post(
            f"{API}/shopping/utilities/not_a_real_util/find-better?country=US",
            headers=auth_headers,
            timeout=30,
        )
        assert r.status_code == 404


# ============================================================
# Deal Finder — /api/shopping/deal-finder/find
# ============================================================
class TestDealFinder:

    def test_deal_finder_ph(self, auth_headers):
        body = {
            "product": "55 inch smart TV",
            "country": "PH",
            "urgency": "this_month",
            "quality_preference": "balanced",
        }
        r = requests.post(
            f"{API}/shopping/deal-finder/find",
            headers=auth_headers,
            json=body,
            timeout=180,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("country") == "PH"
        assert j.get("country_name") == "Philippines"
        assert j.get("currency") == "PHP"
        assert "currency_symbol" in j
        # deals should reference PH retailers or PHP
        deals_blob = str(j.get("deals", "")) + " " + (j.get("summary") or "")
        assert any(
            s in deals_blob.lower()
            for s in ["lazada", "shopee", "sm ", "robinsons", "php", "₱", "philippine"]
        ), f"PH deal-finder should reference PH retailers. Preview: {deals_blob[:400]}"

    def test_deal_finder_default_us(self, auth_headers):
        # No country field -> defaults to US per DealSearchIn
        body = {
            "product": "55 inch smart TV",
            "urgency": "this_month",
            "quality_preference": "balanced",
        }
        r = requests.post(
            f"{API}/shopping/deal-finder/find",
            headers=auth_headers,
            json=body,
            timeout=180,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("country") == "US"
        assert j.get("country_name") == "United States"
        assert j.get("currency") == "USD"

    def test_deal_finder_invalid_product(self, auth_headers):
        r = requests.post(
            f"{API}/shopping/deal-finder/find",
            headers=auth_headers,
            json={"product": "ab"},
            timeout=30,
        )
        assert r.status_code == 400


# ============================================================
# Regression — backward-compat endpoints
# ============================================================
class TestRegression:

    def test_legal_categories(self, auth_headers):
        r = requests.get(f"{API}/legal/categories", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "categories" in j and len(j["categories"]) > 0
        assert "disclaimer" in j

    def test_legal_documents_get(self, auth_headers):
        r = requests.get(f"{API}/legal/documents", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "documents" in j and isinstance(j["documents"], list)

    def test_legal_documents_post(self, auth_headers):
        body = {
            "type": "custom",
            "title": "TEST_iter36_doc",
            "description": "Country context regression test doc",
            "status": "not_started",
        }
        r = requests.post(f"{API}/legal/documents", headers=auth_headers, json=body, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["title"] == "TEST_iter36_doc"
        # Cleanup
        doc_id = j.get("doc_id")
        if doc_id:
            requests.delete(f"{API}/legal/documents/{doc_id}", headers=auth_headers, timeout=30)

    def test_shopping_preferences(self, auth_headers):
        r = requests.get(f"{API}/shopping/preferences", headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text

    def test_deals_dismiss(self, auth_headers):
        # Fetch US deals, dismiss the first one
        r = requests.get(f"{API}/shopping/deals?country=US", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        deals = r.json().get("deals", [])
        if not deals:
            pytest.skip("no seed deals to dismiss")
        deal_id = deals[0]["deal_id"]
        r2 = requests.post(
            f"{API}/shopping/deals/{deal_id}/dismiss", headers=auth_headers, timeout=30
        )
        assert r2.status_code == 200
        assert r2.json().get("ok") is True


# ============================================================
# PLOS AI → PLOS rebrand
# ============================================================
class TestClaudeToPlosRebrand:

    def test_helper_error_message_uses_plos(self, auth_headers):
        """Trigger a career-files resume-generate with invalid data to see
        whether the error string says PLOS AI (not PLOS AI)."""
        # Send obviously invalid payload; expect 4xx/5xx with 'PLOS' in detail
        r = requests.post(
            f"{API}/career/files/resume-generate",
            headers=auth_headers,
            json={"foo": "bar"},
            timeout=30,
        )
        # We don't strictly enforce a specific code — we just want to see if
        # any 'PLOS AI error' string leaked. Skip if endpoint doesn't exist.
        if r.status_code == 404:
            pytest.skip("resume-generate endpoint not present in this build")
        detail = ""
        try:
            detail = r.json().get("detail", "")
        except Exception:
            detail = r.text
        # Assertion: 'PLOS AI error' string must NOT be in the response
        assert "PLOS AI error" not in str(detail), (
            f"Found unpatched 'PLOS AI error' in response: {detail}"
        )

    def test_grep_no_claude_error_strings_in_code(self):
        """Grep-level guarantee: no user-facing 'Claude error' strings remain
        in the files listed in the change note."""
        import subprocess

        files = [
            "/app/backend/career_files.py",
            "/app/backend/career_intelligence.py",
            "/app/backend/career_tailor.py",
            "/app/backend/mortgage_loans.py",
            "/app/backend/student_loans.py",
            "/app/backend/travel_search.py",
        ]
        offenders = []
        for f in files:
            if not os.path.exists(f):
                continue
            try:
                out = subprocess.check_output(
                    ["grep", "-n", "Claude error", f], stderr=subprocess.DEVNULL
                ).decode()
                if out.strip():
                    offenders.append(f"{f}:\n{out}")
            except subprocess.CalledProcessError:
                pass  # no match
        assert not offenders, (
            "Found lingering 'Claude error' strings that should be 'PLOS AI error':\n"
            + "\n".join(offenders)
        )


# =============================================================================
# Navigation Address Autocomplete (iteration 37)
# =============================================================================
class TestNavigationAutocomplete:
    def test_autocomplete_us(self, auth_headers):
        r = requests.get(
            f"{API}/navigation/autocomplete",
            params={"q": "Central Park", "country": "US"},
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200
        j = r.json()
        assert j["provider"] in ("google", "osm"), j
        assert len(j["predictions"]) > 0
        first = j["predictions"][0]
        assert first["description"], "prediction must have description"

    def test_autocomplete_ph_country_filter(self, auth_headers):
        r = requests.get(
            f"{API}/navigation/autocomplete",
            params={"q": "SM Mall", "country": "PH"},
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200
        j = r.json()
        assert len(j["predictions"]) > 0
        joined = " | ".join(p.get("description", "") for p in j["predictions"])
        assert "Philippines" in joined or "PH" in joined.upper(), (
            f"PH filter should return PH-based results: {joined}"
        )

    def test_autocomplete_min_length_validation(self, auth_headers):
        r = requests.get(
            f"{API}/navigation/autocomplete",
            params={"q": "a"},
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 422

    def test_place_details_google(self, auth_headers):
        r = requests.get(
            f"{API}/navigation/autocomplete",
            params={"q": "Empire State Building"},
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200
        preds = r.json().get("predictions") or []
        assert preds, "should have at least one prediction"
        place_id = preds[0]["place_id"]
        r2 = requests.get(
            f"{API}/navigation/place-details",
            params={"place_id": place_id},
            headers=auth_headers,
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert d.get("lat") and d.get("lng"), d
        assert 30 < d["lat"] < 45
        assert -80 < d["lng"] < -70
