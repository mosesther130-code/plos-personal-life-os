"""
Career Module backend tests — iteration 4.
Covers pipeline, resume-analyze, generate, path-advisor, job-applications PUT, list enrichment.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL") or "https://life-os-hub-32.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")

EMAIL = "test1@plos.app"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def reseed(auth):
    # Re-seed canonical demo data before module
    r = requests.post(f"{BASE_URL}/api/seed-demo", headers=auth, timeout=60)
    assert r.status_code == 200


# ----- Pipeline -----
class TestPipeline:
    def test_pipeline_shape_and_counts(self, auth):
        r = requests.get(f"{BASE_URL}/api/career/pipeline", headers=auth, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "counts" in data
        for k in ["matched", "applied", "screening", "interview", "offer", "rejected"]:
            assert k in data["counts"], f"missing {k}"
        # derived
        c = data["counts"]
        assert data["new_matches"] == c["matched"]
        assert data["applications_sent"] == c["applied"] + c["screening"] + c["interview"] + c["offer"]
        assert data["interviews_pending"] == c["interview"]
        # Seed expectations: Vercel matched, Linear matched, Stripe applied, Notion screening, Anthropic interview
        assert c["matched"] >= 2
        assert c["interview"] >= 1
        assert c["screening"] >= 1


# ----- Job applications list enrichment -----
class TestJobApplicationsList:
    def test_list_has_enriched_fields(self, auth):
        r = requests.get(f"{BASE_URL}/api/job-applications", headers=auth, timeout=30)
        assert r.status_code == 200
        apps = r.json()
        assert isinstance(apps, list)
        assert len(apps) >= 4
        # Check enrichment on at least one
        enriched = [a for a in apps if a.get("location") or a.get("work_type") or a.get("salary_range")]
        assert len(enriched) >= 3, f"Expected enriched apps, got {apps}"
        # Verify employer names
        employers = {a["employer"] for a in apps}
        assert {"Anthropic", "Vercel", "Notion"}.issubset(employers)
        # Vercel should be 91 matched
        vercel = next(a for a in apps if a["employer"] == "Vercel")
        assert vercel["match_score"] == 91
        assert vercel["status"] == "matched"
        assert "Top Match" in (vercel.get("badges") or [])


# ----- PUT job-applications -----
class TestUpdateApplication:
    def test_update_status_notes_and_followup(self, auth):
        # Pick the Linear matched app to mutate
        r = requests.get(f"{BASE_URL}/api/job-applications", headers=auth, timeout=30)
        apps = r.json()
        target = next((a for a in apps if a["employer"] == "Linear"), apps[0])
        app_id = target["application_id"]
        payload = {"status": "applied", "notes": "TEST_note", "follow_up_date": "2026-02-01"}
        r = requests.put(f"{BASE_URL}/api/job-applications/{app_id}", json=payload, headers=auth, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "applied"
        assert data["notes"] == "TEST_note"
        assert data["follow_up_date"] == "2026-02-01"

        # GET verify persisted
        r = requests.get(f"{BASE_URL}/api/job-applications", headers=auth, timeout=30)
        apps = r.json()
        got = next(a for a in apps if a["application_id"] == app_id)
        assert got["status"] == "applied"
        assert got["notes"] == "TEST_note"

    def test_update_bogus_id_returns_404(self, auth):
        r = requests.put(
            f"{BASE_URL}/api/job-applications/does-not-exist-xyz",
            json={"status": "applied"},
            headers=auth,
            timeout=30,
        )
        assert r.status_code == 404


# ----- Resume Analyze (PLOS AI) -----
class TestResumeAnalyze:
    def test_resume_analyze_real_claude(self, auth):
        r = requests.post(f"{BASE_URL}/api/career/resume-analyze", headers=auth, json={}, timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "ats_score" in data and isinstance(data["ats_score"], int)
        assert 0 <= data["ats_score"] <= 100
        assert isinstance(data.get("strengths"), list)
        assert isinstance(data.get("gaps"), list)
        assert isinstance(data.get("improvements"), list)
        # Should have at least some content since master resume seeded
        assert len(data["strengths"]) + len(data["gaps"]) + len(data["improvements"]) >= 3
        # Persists ats_score to career_profile
        rc = requests.get(f"{BASE_URL}/api/career", headers=auth, timeout=30)
        assert rc.status_code == 200
        assert rc.json()["ats_score"] == data["ats_score"]


# ----- Generate (PLOS AI) -----
class TestGenerate:
    def test_generate_resume_and_cover(self, auth):
        payload = {
            "role_title": "Senior Full-Stack Engineer",
            "employer": "Vercel",
            "job_description": "Build Next.js platform. Need TypeScript, React, Node, AWS, serverless edge functions, observability.",
        }
        r = requests.post(f"{BASE_URL}/api/career/generate", headers=auth, json=payload, timeout=180)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("resume"), str) and len(data["resume"]) > 50
        assert isinstance(data.get("cover_letter"), str) and len(data["cover_letter"]) > 50
        assert isinstance(data.get("keywords_present"), list)
        assert isinstance(data.get("keywords_missing"), list)
        assert isinstance(data.get("match_score"), int)

    def test_generate_persists_to_application(self, auth):
        # Pick Vercel app
        apps = requests.get(f"{BASE_URL}/api/job-applications", headers=auth, timeout=30).json()
        vercel = next(a for a in apps if a["employer"] == "Vercel")
        payload = {
            "application_id": vercel["application_id"],
            "role_title": "Senior Full-Stack Engineer",
            "employer": "Vercel",
            "job_description": "TypeScript, Next.js, edge runtime. Strong CS fundamentals required.",
        }
        r = requests.post(f"{BASE_URL}/api/career/generate", headers=auth, json=payload, timeout=180)
        assert r.status_code == 200
        result = r.json()
        # Verify persisted to that application
        apps = requests.get(f"{BASE_URL}/api/job-applications", headers=auth, timeout=30).json()
        v = next(a for a in apps if a["application_id"] == vercel["application_id"])
        assert v.get("generated_resume") == result["resume"]
        assert v.get("generated_cover_letter") == result["cover_letter"]


# ----- Path Advisor (PLOS AI) -----
class TestPathAdvisor:
    def test_path_advisor_returns_3_paths(self, auth):
        r = requests.post(f"{BASE_URL}/api/career/path-advisor", headers=auth, json={}, timeout=180)
        assert r.status_code == 200, r.text
        data = r.json()
        paths = data.get("paths", [])
        assert isinstance(paths, list)
        assert len(paths) >= 3, f"Expected 3 paths, got {len(paths)}"
        for p in paths[:3]:
            for key in ["name", "description", "timeline", "target_salary_range", "required_skills", "certifications", "next_action"]:
                assert key in p, f"path missing {key}"
            assert isinstance(p["required_skills"], list)
            assert isinstance(p["certifications"], list)
            if p["certifications"]:
                cert = p["certifications"][0]
                assert "name" in cert and "provider" in cert
