"""
Identity & Security Module backend tests — iteration 7.
Covers: overview, brokers (list/rescan/opt-out/letter), credit (get/put/refresh-tip),
breach (list/resolve, HIBP key), identity-theft-guide (get/check).

Notes:
- Reseeds canonical demo data before this module so values are deterministic.
- Real PLOS AI call in test_refresh_tip — sleeps up to ~120s.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_BACKEND_URL") or "https://life-os-hub-32.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")

EMAIL = "test1@plos.app"
PASSWORD = "test123"


# ---------------------------- Fixtures ----------------------------
@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    assert "token" in body and "user_id" in body  # flat shape regression
    return body["token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def reseed(auth):
    r = requests.post(f"{BASE_URL}/api/seed-demo", headers=auth, timeout=60)
    assert r.status_code == 200, f"Seed failed: {r.status_code} {r.text}"
    # Clear any leftover HIBP key from previous runs (so has_hibp_key starts False)
    requests.put(
        f"{BASE_URL}/api/profile/hibp-key",
        headers=auth,
        json={"hibp_api_key": ""},
        timeout=15,
    )
    yield


# ---------------------------- Overview ----------------------------
class TestSecurityOverview:
    def test_overview_shape_and_stats(self, auth):
        r = requests.get(f"{BASE_URL}/api/security/overview", headers=auth, timeout=30)
        assert r.status_code == 200
        data = r.json()
        # Required fields
        for key in ("threat_score", "security_health_score", "active_threats_count",
                    "stats", "alerts", "top_brokers"):
            assert key in data, f"missing {key} in overview"
        # Threat score expectation (~8.5 per PRD)
        assert 7.5 <= data["threat_score"] <= 10, f"threat_score={data['threat_score']}"
        # Health score clamped 0..100
        assert 0 <= data["security_health_score"] <= 100
        stats = data["stats"]
        assert stats["brokers_with_data"] == 4
        assert stats["opt_outs_pending"] == 1
        assert stats["confirmed_removals"] == 2
        assert stats["active_breaches"] == 3
        # alerts non-empty list
        assert isinstance(data["alerts"], list) and len(data["alerts"]) >= 1
        # top brokers up to 6
        assert isinstance(data["top_brokers"], list) and len(data["top_brokers"]) <= 6


# ---------------------------- Brokers ----------------------------
class TestBrokers:
    def test_list_brokers_distribution(self, auth):
        r = requests.get(f"{BASE_URL}/api/security/brokers", headers=auth, timeout=30)
        assert r.status_code == 200
        brokers = r.json()["brokers"]
        assert len(brokers) == 11, f"expected 11 brokers, got {len(brokers)}"
        counts = {}
        for b in brokers:
            counts[b["status"]] = counts.get(b["status"], 0) + 1
        assert counts.get("pii_found") == 4
        assert counts.get("opt_out_pending") == 1
        assert counts.get("removed") == 2
        assert counts.get("scanning") == 2
        assert counts.get("clear") == 2

    def test_rescan_updates_last_scanned(self, auth):
        before = requests.get(f"{BASE_URL}/api/security/brokers", headers=auth, timeout=30).json()["brokers"]
        before_map = {b["broker_id"]: b["last_scanned_at"] for b in before}
        r = requests.post(f"{BASE_URL}/api/security/brokers/rescan", headers=auth, timeout=30)
        assert r.status_code == 200
        after = requests.get(f"{BASE_URL}/api/security/brokers", headers=auth, timeout=30).json()["brokers"]
        # at least one broker timestamp should have advanced
        changed = sum(
            1 for b in after
            if b["broker_id"] in before_map and b["last_scanned_at"] != before_map[b["broker_id"]]
        )
        assert changed >= 1, "rescan did not update any last_scanned_at"

    def test_opt_out_letter_get(self, auth):
        brokers = requests.get(f"{BASE_URL}/api/security/brokers", headers=auth, timeout=30).json()["brokers"]
        pii = next(b for b in brokers if b["status"] == "pii_found")
        r = requests.get(
            f"{BASE_URL}/api/security/brokers/{pii['broker_id']}/opt-out-letter",
            headers=auth, timeout=30,
        )
        assert r.status_code == 200
        body = r.json()
        assert "letter" in body
        letter = body["letter"]
        assert "CCPA" in letter and "Right to Delete" in letter
        # User full name from credentials/profile should appear
        # We don't know exact name; just assert it isn't empty placeholder.
        assert len(letter) > 100

    def test_opt_out_submit_transitions_status(self, auth):
        brokers = requests.get(f"{BASE_URL}/api/security/brokers", headers=auth, timeout=30).json()["brokers"]
        pii_list = [b for b in brokers if b["status"] == "pii_found"]
        assert len(pii_list) >= 1
        target = pii_list[0]
        # alerts before
        ov_before = requests.get(f"{BASE_URL}/api/security/overview", headers=auth, timeout=30).json()
        alerts_before = len(ov_before["alerts"])
        r = requests.post(
            f"{BASE_URL}/api/security/brokers/{target['broker_id']}/opt-out",
            headers=auth, timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert data.get("ok") is True
        assert "letter" in data and isinstance(data["letter"], str) and len(data["letter"]) > 50
        # Verify status transitioned via GET
        after = requests.get(f"{BASE_URL}/api/security/brokers", headers=auth, timeout=30).json()["brokers"]
        updated = next(b for b in after if b["broker_id"] == target["broker_id"])
        assert updated["status"] == "opt_out_pending"
        # Alert appended
        ov_after = requests.get(f"{BASE_URL}/api/security/overview", headers=auth, timeout=30).json()
        assert len(ov_after["alerts"]) == alerts_before + 1

    def test_opt_out_404_bad_id(self, auth):
        r = requests.post(
            f"{BASE_URL}/api/security/brokers/does-not-exist-zzz/opt-out",
            headers=auth, timeout=30,
        )
        assert r.status_code == 404

    def test_opt_out_letter_404_bad_id(self, auth):
        r = requests.get(
            f"{BASE_URL}/api/security/brokers/does-not-exist-zzz/opt-out-letter",
            headers=auth, timeout=30,
        )
        assert r.status_code == 404


# ---------------------------- Credit ----------------------------
class TestCredit:
    def test_get_credit_shape(self, auth):
        r = requests.get(f"{BASE_URL}/api/security/credit", headers=auth, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert len(data["scores"]) == 3
        bureaus = {s["bureau"] for s in data["scores"]}
        assert bureaus == {"equifax", "transunion", "experian"}
        assert len(data["history"]) == 18  # 3 bureaus * 6 months
        assert len(data["hard_inquiries"]) >= 1
        assert data["is_demo"] is True

    def test_put_credit_out_of_range(self, auth):
        r = requests.put(
            f"{BASE_URL}/api/security/credit",
            headers=auth, json={"equifax": 200}, timeout=15,
        )
        assert r.status_code == 400

    def test_put_credit_partial_flips_is_demo(self, auth):
        # Use real-ish value; will flip is_demo to False
        r = requests.put(
            f"{BASE_URL}/api/security/credit",
            headers=auth, json={"equifax": 720}, timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert "equifax" in body["updated"]
        # GET re-read verifies persistence + is_demo flipped
        g = requests.get(f"{BASE_URL}/api/security/credit", headers=auth, timeout=30).json()
        eq = next(s for s in g["scores"] if s["bureau"] == "equifax")
        assert eq["current_score"] == 720
        assert eq["is_demo"] is False
        # any() over scores: at least one still demo, but PRD wants flip to false overall
        # Since other 2 are still is_demo:True the doc-level is_demo will remain True.
        # Update the other two as well to ensure global flip.
        r2 = requests.put(
            f"{BASE_URL}/api/security/credit",
            headers=auth,
            json={"transunion": 715, "experian": 705}, timeout=15,
        )
        assert r2.status_code == 200
        g2 = requests.get(f"{BASE_URL}/api/security/credit", headers=auth, timeout=30).json()
        assert g2["is_demo"] is False

    @pytest.mark.timeout(180)
    def test_refresh_tip_and_cache(self, auth):
        """Real PLOS AI call — ~60-90s. Verifies cache via GET /security/credit."""
        r = requests.post(
            f"{BASE_URL}/api/security/credit/refresh-tip",
            headers=auth, timeout=180,
        )
        assert r.status_code == 200, f"refresh-tip failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("ok") is True
        assert "tip" in body and isinstance(body["tip"], dict)
        tip = body["tip"]
        assert "tip" in tip and isinstance(tip["tip"], str) and len(tip["tip"]) > 10
        # generated_at returned
        assert "generated_at" in body
        # Now verify it's cached and returned by GET
        g = requests.get(f"{BASE_URL}/api/security/credit", headers=auth, timeout=30).json()
        assert g.get("tip") is not None
        assert isinstance(g["tip"], dict)
        assert g["tip"].get("tip") == tip["tip"]
        assert g.get("tip_generated_at") == body["generated_at"]


# ---------------------------- Breach Monitor ----------------------------
class TestBreach:
    def test_get_breach_demo(self, auth):
        r = requests.get(f"{BASE_URL}/api/security/breach", headers=auth, timeout=30)
        assert r.status_code == 200
        data = r.json()
        actives = [b for b in data["breaches"] if b.get("status") == "active"]
        # 3 active demo breaches (or all 3 if resolve hasn't fired yet)
        assert len(actives) == 3
        assert data["is_demo"] is True
        assert data["has_hibp_key"] is False
        assert data.get("checked_email") == EMAIL

    def test_hibp_key_toggle(self, auth):
        r = requests.put(
            f"{BASE_URL}/api/profile/hibp-key",
            headers=auth, json={"hibp_api_key": "test-fake-hibp-key-123"}, timeout=15,
        )
        assert r.status_code == 200
        g = requests.get(f"{BASE_URL}/api/security/breach", headers=auth, timeout=30).json()
        assert g["has_hibp_key"] is True
        # cleanup so other tests aren't affected
        requests.put(
            f"{BASE_URL}/api/profile/hibp-key",
            headers=auth, json={"hibp_api_key": ""}, timeout=15,
        )
        g2 = requests.get(f"{BASE_URL}/api/security/breach", headers=auth, timeout=30).json()
        assert g2["has_hibp_key"] is False

    def test_resolve_breach(self, auth):
        breaches = requests.get(f"{BASE_URL}/api/security/breach", headers=auth, timeout=30).json()["breaches"]
        target = next(b for b in breaches if b["status"] == "active")
        r = requests.post(
            f"{BASE_URL}/api/security/breach/{target['breach_id']}/resolve",
            headers=auth, timeout=15,
        )
        assert r.status_code == 200
        # Verify status transitioned
        after = requests.get(f"{BASE_URL}/api/security/breach", headers=auth, timeout=30).json()["breaches"]
        updated = next(b for b in after if b["breach_id"] == target["breach_id"])
        assert updated["status"] == "resolved"

    def test_resolve_breach_404(self, auth):
        r = requests.post(
            f"{BASE_URL}/api/security/breach/bogus-id-xyz/resolve",
            headers=auth, timeout=15,
        )
        assert r.status_code == 404


# ---------------------------- Identity Theft Guide ----------------------------
EXPECTED_STEP_IDS = [
    "freeze_credit", "ftc_report", "police_report",
    "contact_financial", "change_passwords", "fraud_alert",
]


class TestIdentityTheftGuide:
    def test_get_guide_steps(self, auth):
        r = requests.get(f"{BASE_URL}/api/security/identity-theft-guide", headers=auth, timeout=30)
        assert r.status_code == 200
        steps = r.json()["steps"]
        assert len(steps) == 6
        got_ids = [s["step_id"] for s in steps]
        for expected in EXPECTED_STEP_IDS:
            assert expected in got_ids
        # contact_financial mentions a real lender from debts
        contact = next(s for s in steps if s["step_id"] == "contact_financial")
        desc = contact["description"]
        # at least one of the seeded lenders should appear
        seeded_lenders = ["Chase Sapphire", "Wells Fargo", "Nelnet", "Toyota Financial"]
        assert any(name in desc for name in seeded_lenders), f"no seeded lender in: {desc}"

    def test_check_step_persists(self, auth):
        # toggle on
        r = requests.post(
            f"{BASE_URL}/api/security/identity-theft-guide/check",
            headers=auth, json={"step_id": "freeze_credit", "completed": True}, timeout=15,
        )
        assert r.status_code == 200
        g = requests.get(f"{BASE_URL}/api/security/identity-theft-guide", headers=auth, timeout=30).json()
        freeze = next(s for s in g["steps"] if s["step_id"] == "freeze_credit")
        assert freeze.get("completed") is True
        assert "completed_at" in freeze
        # toggle off
        r2 = requests.post(
            f"{BASE_URL}/api/security/identity-theft-guide/check",
            headers=auth, json={"step_id": "freeze_credit", "completed": False}, timeout=15,
        )
        assert r2.status_code == 200
        g2 = requests.get(f"{BASE_URL}/api/security/identity-theft-guide", headers=auth, timeout=30).json()
        freeze2 = next(s for s in g2["steps"] if s["step_id"] == "freeze_credit")
        assert not freeze2.get("completed", False)

    def test_check_step_missing_step_id(self, auth):
        r = requests.post(
            f"{BASE_URL}/api/security/identity-theft-guide/check",
            headers=auth, json={}, timeout=15,
        )
        assert r.status_code == 400
