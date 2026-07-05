"""Iteration 27 — Job Deep Search authenticity + employer verification pipeline.

Tests:
1. POST /api/jobs/deep-search returns authenticity metrics + employer verify.
2. GET /api/jobs/verified-feed only returns verified jobs on trusted domains
   with a mix of location_types and no blocklisted sources.
3. GET /api/jobs/verified-feed?require_employer_verified=false returns >= verified count.
4. Second deep-search call is idempotent.
"""
from __future__ import annotations

import os
import re
from urllib.parse import urlparse

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://life-os-hub-32.preview.emergentagent.com").rstrip("/")
EMAIL = "test1@plos.app"
PASSWORD = "test123"

BLOCKLIST_RE = re.compile(
    r"(halvolink|learn4good|salutemyjob|bebee|jobrapido|jobright|jobilize|"
    r"bandana|cazvid|trabajo\.org|dailyremote|learnun0n|mediabistro)",
    re.IGNORECASE,
)

TRUSTED_HOST_SUBSTRINGS = [
    "linkedin.com", "indeed.com", "glassdoor.com", "usajobs.gov",
    "governmentjobs.com", "higheredjobs.com", "chronicle.com",
    "workday.com", "myworkdayjobs.com", "greenhouse.io", "lever.co",
    "smartrecruiters.com", "workable.com", "icims.com", "ashbyhq.com",
    "jobaps.com", "devex.com", "reliefweb.int", "adb.org",
    "worldbank.org", "state.gov", "usaid.gov", "un.org", "unicef.org",
    "unhcr.org", "undp.org", "who.int", "imf.org", "iom.int",
    "wfp.org", "unops.org", "gavi.org", "gatesfoundation.org",
    "clearancejobs.com", "insidehighered.com", "monster.com",
    "successfactors.com", "taleo.net", "brassring.com",
    "recruiterbox.com", "bamboohr.com", "jobvite.com", "gr8people.com",
    "usda.gov", "cdc.gov", "hhs.gov", "va.gov", "opm.gov",
    # Employer-own ATS subdomains (.jobs TLD is reserved for employers via ICANN)
    ".jobs", ".edu", ".gov", ".org", ".mil",
]

DEEP_SEARCH_BODY = {
    "target_roles": [
        "Financial Control Specialist",
        "Financial Management Officer",
        "Budget Analyst",
        "Program Coordinator",
    ],
    "excluded_keywords": ["sales commission", "MLM"],
    "industries": [
        "Federal Government",
        "International Organizations",
        "Higher Education Administration",
    ],
    "locations": ["Atlanta, GA", "Washington, DC", "New York, NY"],
    "min_salary": 85000,
    "freshness": "30d",
    "priority_employers": [],
    "work_type_filter": "any",
}


@pytest.fixture(scope="module")
def token() -> str:
    resp = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert resp.status_code == 200, f"Login failed: {resp.status_code} {resp.text}"
    data = resp.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"Missing token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def deep_search_response(auth_headers: dict) -> dict:
    """Run deep search ONCE, share across tests to conserve SerpApi quota."""
    resp = requests.post(
        f"{BASE_URL}/api/jobs/deep-search",
        json=DEEP_SEARCH_BODY,
        headers=auth_headers,
        timeout=300,
    )
    assert resp.status_code == 200, f"Deep-search failed: {resp.status_code} {resp.text[:500]}"
    return resp.json()


# ---------------------------------------------------------------- Test 1
class TestDeepSearchAuthenticity:
    """POST /api/jobs/deep-search returns authenticity + employer_verify metrics."""

    def test_response_shape(self, deep_search_response: dict):
        data = deep_search_response
        assert "total_after_authenticity" in data, f"missing total_after_authenticity; keys={list(data)}"
        assert "total_after_employer_verify" in data, f"missing total_after_employer_verify"
        assert "rejection_counts" in data
        assert "stale_purged" in data

    def test_rejection_counts_shape(self, deep_search_response: dict):
        rc = deep_search_response["rejection_counts"]
        for key in ["blocklisted_source", "no_location", "untrusted_domain",
                    "inactive_url", "employer_unverified"]:
            assert key in rc, f"rejection_counts missing key {key}: {rc}"
            assert isinstance(rc[key], int), f"rejection_counts[{key}] not int: {rc[key]}"

    def test_verified_count_gt_20(self, deep_search_response: dict):
        n = deep_search_response["total_after_employer_verify"]
        assert n > 0, f"total_after_employer_verify not > 0: {n}"
        assert n > 20, f"total_after_employer_verify not > 20: {n}"

    def test_top_job_employer_verified(self, deep_search_response: dict):
        top = deep_search_response.get("top_job")
        assert top, "top_job missing"
        assert top.get("employer_verified") is True, (
            f"top_job.employer_verified not True: {top.get('employer_verified')}"
        )


# ---------------------------------------------------------------- Test 2
class TestVerifiedFeedFiltering:
    """GET /api/jobs/verified-feed enforces authenticity + employer verification."""

    def test_verified_feed(self, auth_headers: dict, deep_search_response: dict):
        # Ensure deep-search has populated the feed
        _ = deep_search_response
        resp = requests.get(
            f"{BASE_URL}/api/jobs/verified-feed",
            params={"work_type_filter": "any", "limit": 60},
            headers=auth_headers,
            timeout=60,
        )
        assert resp.status_code == 200, f"{resp.status_code} {resp.text[:300]}"
        data = resp.json()
        count = data.get("count", 0)
        jobs = data.get("jobs") or []

        assert count > 20, f"verified-feed count not > 20: {count}"

        # All jobs must be employer_verified
        unverified = [j for j in jobs if not j.get("employer_verified")]
        assert not unverified, (
            f"{len(unverified)} jobs missing employer_verified=True; sample: "
            f"{[u.get('title') for u in unverified[:3]]}"
        )

        # No blocklisted sources
        blocklisted = [j for j in jobs if BLOCKLIST_RE.search(str(j.get("source_platform") or ""))]
        assert not blocklisted, (
            f"{len(blocklisted)} blocklisted source_platform found: "
            f"{[j.get('source_platform') for j in blocklisted[:5]]}"
        )

        # Location type distribution — must be mixed, not 100% remote
        lts = [j.get("location_type", "unknown") for j in jobs]
        distinct = set(lts)
        assert len(distinct) >= 2, f"location_type not diverse: {distinct}"
        remote_pct = sum(1 for lt in lts if lt == "remote") / max(1, len(lts))
        assert remote_pct < 1.0, f"100% remote (not mixed): counts={ {lt: lts.count(lt) for lt in distinct} }"

        # Every apply_url_final host must contain a trusted substring
        untrusted = []
        for j in jobs:
            url = j.get("apply_url_final") or j.get("apply_url") or ""
            if not url:
                untrusted.append((j.get("title"), "no url"))
                continue
            host = (urlparse(url).netloc or "").lower()
            employer_domain = ""
            # Employer's own domain from website field also acceptable
            website = (j.get("website") or "").lower()
            if website:
                employer_domain = urlparse(website if "://" in website else f"http://{website}").netloc.lower()
            if any(sub in host for sub in TRUSTED_HOST_SUBSTRINGS):
                continue
            if employer_domain and (employer_domain in host or host in employer_domain):
                continue
            # Permissive: allow if any employer_domain root token appears
            untrusted.append((j.get("title"), host))
        assert not untrusted, f"{len(untrusted)} untrusted hosts: {untrusted[:5]}"


# ---------------------------------------------------------------- Test 3
class TestVerifiedFeedOptOut:
    """Passing require_employer_verified=false should not shrink the feed."""

    def test_opt_out_count(self, auth_headers: dict, deep_search_response: dict):
        # Verified count (default)
        r_verified = requests.get(
            f"{BASE_URL}/api/jobs/verified-feed",
            params={"work_type_filter": "any", "limit": 100},
            headers=auth_headers,
            timeout=60,
        )
        assert r_verified.status_code == 200
        verified_count = r_verified.json().get("count", 0)

        # Opt-out (require_employer_verified=false)
        r_all = requests.get(
            f"{BASE_URL}/api/jobs/verified-feed",
            params={"require_employer_verified": "false", "limit": 100},
            headers=auth_headers,
            timeout=60,
        )
        assert r_all.status_code == 200, r_all.text[:300]
        all_count = r_all.json().get("count", 0)
        assert all_count >= verified_count, (
            f"opt-out count {all_count} < verified count {verified_count}"
        )


# ---------------------------------------------------------------- Test 4
class TestDeepSearchIdempotency:
    """Second deep-search with same body still succeeds."""

    def test_second_deep_search(self, auth_headers: dict, deep_search_response: dict):
        _ = deep_search_response  # ensures the first run completed
        resp = requests.post(
            f"{BASE_URL}/api/jobs/deep-search",
            json=DEEP_SEARCH_BODY,
            headers=auth_headers,
            timeout=300,
        )
        assert resp.status_code == 200, f"{resp.status_code} {resp.text[:300]}"
        data = resp.json()
        purged = data.get("stale_purged")
        assert isinstance(purged, int) and purged >= 0, f"stale_purged not non-neg int: {purged}"
        assert data.get("jobs_count", 0) > 0, f"jobs_count not > 0: {data.get('jobs_count')}"
