"""Regression tests for iteration 11 fixes:
1. Cloudflare 60s timeout on PLOS AI calls (business plan + utility find-better)
2. Verified via public preview URL.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://life-os-hub-32.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "test1@plos.app", "password": "test123"},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# Fix 1a: Business plan endpoint should return UNDER 60s via public URL
def test_business_plan_under_60s_via_public_url(auth_headers):
    start = time.time()
    r = requests.post(
        f"{BASE_URL}/api/business/ideas/seed-1/plan",
        headers=auth_headers,
        timeout=70,
    )
    elapsed = time.time() - start
    print(f"\n[business plan] status={r.status_code} elapsed={elapsed:.1f}s body_len={len(r.text)}")
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:300]}"
    assert elapsed < 60, f"endpoint took {elapsed:.1f}s — must be under 60s for Cloudflare"
    data = r.json()
    assert "plan" in data and isinstance(data["plan"], str) and len(data["plan"]) > 200, \
        f"plan field missing or too short: {data}"
    assert data.get("business_name"), "business_name missing"
    # Sanity: check it's markdown-ish
    assert "##" in data["plan"], "plan should contain markdown headings"


# Fix 1b: Utility find-better endpoint should return UNDER 60s via public URL
def test_utility_find_better_under_60s_via_public_url(auth_headers):
    start = time.time()
    r = requests.post(
        f"{BASE_URL}/api/shopping/utilities/ga_power/find-better",
        headers=auth_headers,
        timeout=70,
    )
    elapsed = time.time() - start
    print(f"\n[find-better] status={r.status_code} elapsed={elapsed:.1f}s body_len={len(r.text)}")
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:300]}"
    assert elapsed < 60, f"endpoint took {elapsed:.1f}s — must be under 60s for Cloudflare"
    data = r.json()
    assert "recommendation" in data and isinstance(data["recommendation"], str) and len(data["recommendation"]) > 50, \
        f"recommendation missing or too short: {data}"
    assert data.get("provider"), "provider missing"
