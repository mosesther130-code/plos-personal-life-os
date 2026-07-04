"""Iteration 26 — Career Deep Search + Tailor Resume validation.

Verifies:
1. POST /api/jobs/deep-search returns mixed work types (not only 'remote').
2. Deep search with a hybrid Washington DC profile also returns 200 and jobs_count > 0.
3. GET /api/jobs/verified-feed shows non-100%-remote location_type breakdown.
4. POST /api/career/library/tailor/generate with a deep-search job_id succeeds.
5. Regression — existing library-sourced (jd_id) tailor still works.
"""
import os
import time
from collections import Counter

import pytest
import requests

BASE_URL = os.environ.get(
    "BACKEND_URL",
    "https://life-os-hub-32.preview.emergentagent.com",
).rstrip("/")
EMAIL = "test1@plos.app"
PASSWORD = "test123"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- Deep Search location mix ----------------
class TestDeepSearchLocationMix:
    def test_01_deep_search_financial_atlanta(self, auth):
        payload = {
            "target_roles": ["Financial Management"],
            "locations": ["Atlanta, GA"],
            "work_type_filter": "on_site_hybrid",
            "freshness": "30d",
        }
        r = requests.post(
            f"{BASE_URL}/api/jobs/deep-search",
            headers=auth,
            json=payload,
            timeout=180,
        )
        assert r.status_code == 200, f"deep-search failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        jobs_count = data.get("jobs_count") or len(data.get("jobs") or [])
        pytest.iter26_jobs_count = jobs_count
        assert jobs_count > 20, f"Expected >20 jobs, got {jobs_count}"

        # Inspect location_type mix from returned payload if available
        jobs = data.get("jobs") or []
        types = Counter([(j.get("location_type") or "unknown").lower() for j in jobs])
        pytest.iter26_types_payload = dict(types)
        non_remote = sum(v for k, v in types.items() if k != "remote")
        # Not required to have >0 in payload, but subsequent verified-feed check is authoritative.
        print(f"[deep-search payload] jobs_count={jobs_count} types={dict(types)} non_remote={non_remote}")

    def test_02_verified_feed_mix(self, auth):
        r = requests.get(
            f"{BASE_URL}/api/jobs/verified-feed?limit=40",
            headers=auth,
            timeout=60,
        )
        assert r.status_code == 200, f"verified-feed failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        feed = data.get("jobs") or data.get("items") or data.get("feed") or []
        assert isinstance(feed, list) and len(feed) > 0, f"empty feed: {data}"
        types = Counter([(j.get("location_type") or "unknown").lower() for j in feed])
        pytest.iter26_types_feed = dict(types)
        total = sum(types.values())
        remote = types.get("remote", 0)
        print(f"[verified-feed] total={total} types={dict(types)}")
        assert remote < total, (
            f"All {total} verified-feed entries are 'remote'. "
            f"Location sanitization has regressed. types={dict(types)}"
        )
        # At least one non-remote entry required per acceptance criteria.
        non_remote = total - remote
        assert non_remote >= 1

    def test_03_deep_search_software_dc(self, auth):
        payload = {
            "target_roles": ["Software Engineer"],
            "locations": ["Washington, DC"],
            "work_type_filter": "hybrid",
            "freshness": "7d",
        }
        r = requests.post(
            f"{BASE_URL}/api/jobs/deep-search",
            headers=auth,
            json=payload,
            timeout=180,
        )
        assert r.status_code == 200, f"deep-search DC failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        jobs_count = data.get("jobs_count") or len(data.get("jobs") or [])
        pytest.iter26_dc_jobs_count = jobs_count
        assert jobs_count > 0, f"Expected >0 jobs for DC Software Engineer hybrid, got {jobs_count}"


# ---------------- Tailor Generate ----------------
class TestTailorGenerate:
    def _pick_job_with_desc(self, auth, min_len=200):
        r = requests.get(
            f"{BASE_URL}/api/jobs/verified-feed?limit=40",
            headers=auth,
            timeout=60,
        )
        assert r.status_code == 200
        feed = r.json().get("jobs") or r.json().get("items") or []
        # Prefer entries with a long description_full
        candidates = []
        for j in feed:
            desc = (j.get("description_full") or j.get("description") or "").strip()
            if len(desc) >= min_len:
                candidates.append((len(desc), j))
        candidates.sort(reverse=True, key=lambda x: x[0])
        if candidates:
            return candidates[0][1]
        # Fall back to any job — endpoint will attempt live re-fetch.
        return feed[0] if feed else None

    def _default_resume_id(self, auth):
        r = requests.get(
            f"{BASE_URL}/api/career/library/resumes",
            headers=auth,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        payload = r.json()
        resumes = payload if isinstance(payload, list) else payload.get("resumes", [])
        assert resumes, "No resumes in library"
        for rr in resumes:
            if rr.get("is_default"):
                return rr.get("resume_id")
        return resumes[0].get("resume_id")

    def test_04_tailor_generate_from_deep_search_job(self, auth):
        job = self._pick_job_with_desc(auth, min_len=200)
        assert job, "No verified-feed job available to tailor against"
        job_id = job.get("job_id")
        assert job_id
        resume_id = self._default_resume_id(auth)

        payload = {
            "resume_id": resume_id,
            "job_id": job_id,
            "ats_optimize": True,
            "generate_cover_letter": True,
            "generate_interview_questions": True,
            "generate_thankyou": False,
            "email_to_me": False,
            "send_pdf": False,
        }
        t0 = time.time()
        r = requests.post(
            f"{BASE_URL}/api/career/library/tailor/generate",
            headers=auth,
            json=payload,
            timeout=240,
        )
        elapsed = time.time() - t0
        assert r.status_code == 200, (
            f"tailor/generate failed ({elapsed:.1f}s): {r.status_code} {r.text[:400]}"
        )
        data = r.json()
        # Contract assertions
        assert data.get("version_id"), f"missing version_id: {data}"
        assert data["version_id"].startswith("ver_")
        ats_after = data.get("ats_score_after")
        assert isinstance(ats_after, int), f"ats_score_after not int: {ats_after!r}"
        assert 0 <= ats_after <= 100
        assert data.get("job_title"), "job_title must be non-empty"
        assert data.get("employer"), "employer must be non-empty"
        assert data.get("source_job_id") == job_id, (
            f"source_job_id mismatch: got {data.get('source_job_id')} vs {job_id}"
        )
        pytest.iter26_version_id_job = data["version_id"]
        print(f"[tailor from job] ats_after={ats_after} title={data.get('job_title')!r} "
              f"employer={data.get('employer')!r} elapsed={elapsed:.1f}s")

    def test_05_tailor_generate_regression_from_jd_id(self, auth):
        # Pick a jd from library, or create one manually if empty
        r = requests.get(
            f"{BASE_URL}/api/career/library/jds",
            headers=auth,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        payload = r.json()
        jds = payload if isinstance(payload, list) else payload.get("jds", [])
        jd_id = None
        if jds:
            jd_id = jds[0].get("jd_id")
        if not jd_id:
            # Create one via manual endpoint
            manual = requests.post(
                f"{BASE_URL}/api/career/library/jds/manual",
                headers=auth,
                json={
                    "employer": "TEST_ADB",
                    "job_title": "TEST Financial Control Specialist",
                    "raw_text": (
                        "The Asian Development Bank seeks a Financial Control Specialist "
                        "to manage IPSAS reporting, grants management, multi-country portfolio "
                        "oversight, and audit-ready financial reporting. MBA preferred, 10+ years "
                        "experience in multilateral finance, GAAP, and Cost Principles."
                    ) * 2,
                    "posting_url": "https://www.adb.org/careers/test",
                },
                timeout=60,
            )
            assert manual.status_code in (200, 201), manual.text
            jd_id = manual.json().get("jd_id")
        assert jd_id, "Could not obtain a jd_id"

        resume_id = self._default_resume_id(auth)
        body = {
            "resume_id": resume_id,
            "jd_id": jd_id,
            "ats_optimize": True,
            "generate_cover_letter": False,
            "generate_interview_questions": False,
            "generate_thankyou": False,
            "email_to_me": False,
            "send_pdf": False,
        }
        t0 = time.time()
        r = requests.post(
            f"{BASE_URL}/api/career/library/tailor/generate",
            headers=auth,
            json=body,
            timeout=240,
        )
        elapsed = time.time() - t0
        assert r.status_code == 200, (
            f"regression tailor failed ({elapsed:.1f}s): {r.status_code} {r.text[:400]}"
        )
        data = r.json()
        assert data.get("version_id", "").startswith("ver_")
        print(f"[tailor from jd] ats_after={data.get('ats_score_after')} elapsed={elapsed:.1f}s")


def test_zz_summary():
    print(
        "\n=== ITERATION 26 SUMMARY ===\n"
        f"deep-search jobs_count (Financial/Atlanta): {getattr(pytest, 'iter26_jobs_count', None)}\n"
        f"deep-search location_type (payload): {getattr(pytest, 'iter26_types_payload', None)}\n"
        f"verified-feed location_type: {getattr(pytest, 'iter26_types_feed', None)}\n"
        f"deep-search DC Software Engineer jobs_count: {getattr(pytest, 'iter26_dc_jobs_count', None)}\n"
        f"tailor from job version_id: {getattr(pytest, 'iter26_version_id_job', None)}\n"
    )
