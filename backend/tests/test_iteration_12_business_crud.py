"""
Iteration 12 — Business Ideas + Eden Heights CRUD regression tests.
Covers:
 - GET /api/business/ideas (seed persistence + uuid idea_ids)
 - POST /api/business/ideas
 - PUT /api/business/ideas/{id}
 - DELETE /api/business/ideas/{id} (incl. 404)
 - GET /api/business/eden-heights (defaults)
 - PUT /api/business/eden-heights (new fields: name, location, breakeven_year)
 - DELETE /api/business/eden-heights (factory reset)
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://life-os-hub-32.preview.emergentagent.com").rstrip("/")
EMAIL = "test1@plos.app"
PASSWORD = "test123"


# ---------------------- shared session / auth ----------------------
@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def session(token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


# ---------------------- Business Ideas tests -----------------------
class TestBusinessIdeasCRUD:
    """Business Ideas Advisor CRUD"""

    @pytest.fixture(scope="class", autouse=True)
    def _clean_ideas(self, session):
        # Best-effort: delete all current ideas so seed-persistence path is exercised cleanly.
        r = session.get(f"{BASE_URL}/api/business/ideas", timeout=30)
        if r.status_code == 200:
            for it in r.json().get("ideas", []):
                iid = it.get("idea_id")
                if iid:
                    session.delete(f"{BASE_URL}/api/business/ideas/{iid}", timeout=15)
        yield

    def test_01_get_ideas_first_call_seeds(self, session):
        r = session.get(f"{BASE_URL}/api/business/ideas", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("is_seed") is True, f"expected is_seed True, got {data.get('is_seed')}"
        ideas = data.get("ideas", [])
        assert len(ideas) == 3, f"expected 3 seed ideas, got {len(ideas)}"
        for it in ideas:
            assert it.get("source") == "seed", f"expected source=seed, got {it.get('source')}"
            iid = it.get("idea_id", "")
            # uuid v4 has 36 chars, hyphen at known offsets — must NOT be 'seed-1'/'seed-2'/'seed-3'
            assert iid not in ("seed-1", "seed-2", "seed-3"), f"idea_id must be uuid, got {iid}"
            assert len(iid) >= 30 and "-" in iid, f"idea_id not uuid-shaped: {iid}"
            assert "_id" not in it
            assert "user_id" not in it

    def test_02_get_ideas_second_call_persisted(self, session):
        r = session.get(f"{BASE_URL}/api/business/ideas", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data.get("is_seed") is False, "second read should not be seed"
        assert len(data.get("ideas", [])) == 3

    def test_03_create_idea(self, session, request):
        body = {
            "business_name": "TEST_Test Co",
            "timeline_tag": "3-6 Months",
            "risk_level": "Moderate",
            "description": "Testing CRUD create flow.",
            "startup_cost_range": "$0–$500",
            "estimated_monthly_revenue_range": "$1,000–$3,000",
            "time_to_first_revenue": "60 days",
            "next_steps": ["A", "B"],
        }
        r = session.post(f"{BASE_URL}/api/business/ideas", json=body, timeout=30)
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["business_name"] == "TEST_Test Co"
        assert out["source"] == "custom"
        assert "_id" not in out
        assert "user_id" not in out
        iid = out["idea_id"]
        assert len(iid) >= 30 and "-" in iid
        # stash for later tests
        request.cls.created_id = iid
        request.cls.created_created_at = out.get("created_at")

    def test_04_update_idea(self, session, request):
        iid = getattr(request.cls, "created_id", None)
        assert iid, "need created_id from prior test"
        # Small sleep so updated_at differs from created_at at second-resolution.
        time.sleep(1.1)
        body = {
            "business_name": "TEST_Test Co Updated",
            "timeline_tag": "3-6 Months",
            "risk_level": "Moderate",
            "description": "Updated.",
            "startup_cost_range": "$0–$500",
            "estimated_monthly_revenue_range": "$1,000–$3,000",
            "time_to_first_revenue": "60 days",
            "next_steps": ["A", "B", "C"],
        }
        r = session.put(f"{BASE_URL}/api/business/ideas/{iid}", json=body, timeout=30)
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["business_name"] == "TEST_Test Co Updated"
        assert out.get("created_at") == request.cls.created_created_at
        assert out.get("updated_at") and out.get("updated_at") != request.cls.created_created_at, \
            f"updated_at should differ from created_at: {out.get('updated_at')} vs {request.cls.created_created_at}"
        assert "_id" not in out

    def test_05_get_includes_updated(self, session, request):
        iid = request.cls.created_id
        r = session.get(f"{BASE_URL}/api/business/ideas", timeout=30)
        assert r.status_code == 200
        ideas = r.json().get("ideas", [])
        match = next((i for i in ideas if i.get("idea_id") == iid), None)
        assert match is not None, "created idea missing from GET"
        assert match["business_name"] == "TEST_Test Co Updated"
        assert match["source"] == "custom"

    def test_06_delete_idea(self, session, request):
        iid = request.cls.created_id
        r = session.delete(f"{BASE_URL}/api/business/ideas/{iid}", timeout=30)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}
        # Verify gone
        r2 = session.get(f"{BASE_URL}/api/business/ideas", timeout=30)
        ids = [i.get("idea_id") for i in r2.json().get("ideas", [])]
        assert iid not in ids, "idea still present after delete"

    def test_07_delete_non_existent_returns_404(self, session):
        r = session.delete(f"{BASE_URL}/api/business/ideas/non-existent-id-12345", timeout=15)
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"


# ---------------------- Eden Heights tests -------------------------
class TestEdenHeightsCRUD:
    """Eden Heights Tracker — extended PUT + DELETE"""

    def test_10_get_initial(self, session):
        r = session.get(f"{BASE_URL}/api/business/eden-heights", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # Either defaults or a previous PUT — must contain key fields.
        for k in ("size_hectares", "current_value_usd", "phases", "checklist"):
            assert k in data, f"missing field {k}"

    def test_11_put_with_new_fields(self, session):
        body = {"name": "TEST_Eden Heights 2.0", "breakeven_year": 5, "current_value_usd": 15000}
        r = session.put(f"{BASE_URL}/api/business/eden-heights", json=body, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        # GET reflects changes
        g = session.get(f"{BASE_URL}/api/business/eden-heights", timeout=30).json()
        assert g.get("name") == "TEST_Eden Heights 2.0"
        assert g.get("breakeven_year") == 5
        assert g.get("current_value_usd") == 15000

    def test_12_delete_resets_to_factory(self, session):
        r = session.delete(f"{BASE_URL}/api/business/eden-heights", timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        # Subsequent GET → factory defaults
        g = session.get(f"{BASE_URL}/api/business/eden-heights", timeout=30).json()
        assert g.get("size_hectares") == 4, f"expected 4 ha factory default, got {g.get('size_hectares')}"
        assert g.get("current_value_usd") == 12000, f"expected $12000 default, got {g.get('current_value_usd')}"
        assert g.get("name") == "Eden Heights Sanctuary Resort", f"got {g.get('name')}"
        assert g.get("breakeven_year") == 4, f"expected breakeven_year=4, got {g.get('breakeven_year')}"
        assert isinstance(g.get("phases"), list) and len(g["phases"]) == 3
        assert isinstance(g.get("checklist"), list) and len(g["checklist"]) == 8
