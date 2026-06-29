"""
Backend tests for Enhancement 6 — Identity & Security (security_extras.py)
Tests: Monitored Accounts CRUD + Jurisdiction Lookup + dynamic identity-theft police step
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://life-os-hub-32.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "test1@plos.app"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data
    return data["token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- Monitored Accounts CRUD ----------------
class TestMonitoredAccounts:
    created_ids = {}

    def test_01_list_initial_autoseed(self, auth):
        r = requests.get(f"{API}/security/monitored-accounts", headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "accounts" in data and isinstance(data["accounts"], list)
        # autoseed at least 1 email on first call (for empty users)
        # (might already have entries from prior runs; just assert list)

    def test_02_create_email(self, auth):
        body = {"account_type": "email", "identifier": "alice@example.com", "label": "Work"}
        r = requests.post(f"{API}/security/monitored-accounts", headers=auth, json=body, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "account_id" in d and d["account_id"]
        TestMonitoredAccounts.created_ids["email"] = d["account_id"]

    def test_03_create_phone(self, auth):
        body = {"account_type": "phone", "identifier": "4045551234", "label": "Cell"}
        r = requests.post(f"{API}/security/monitored-accounts", headers=auth, json=body, timeout=20)
        assert r.status_code == 200, r.text
        TestMonitoredAccounts.created_ids["phone"] = r.json()["account_id"]

    def test_04_create_ssn(self, auth):
        body = {"account_type": "ssn_last4", "identifier": "1234"}
        r = requests.post(f"{API}/security/monitored-accounts", headers=auth, json=body, timeout=20)
        assert r.status_code == 200, r.text
        TestMonitoredAccounts.created_ids["ssn"] = r.json()["account_id"]

    def test_05_create_invalid_type(self, auth):
        body = {"account_type": "foo", "identifier": "x"}
        r = requests.post(f"{API}/security/monitored-accounts", headers=auth, json=body, timeout=20)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_06_list_masks_sensitive(self, auth):
        r = requests.get(f"{API}/security/monitored-accounts", headers=auth, timeout=20)
        assert r.status_code == 200
        accounts = r.json()["accounts"]
        # find phone and ssn entries
        phone_e = [a for a in accounts if a.get("account_type") == "phone"]
        ssn_e = [a for a in accounts if a.get("account_type") == "ssn_last4"]
        assert phone_e, "phone account not returned"
        assert ssn_e, "ssn account not returned"
        for a in phone_e:
            assert "identifier" not in a, f"raw identifier leaked in phone: {a}"
            assert a.get("masked_identifier", "").endswith("1234")
            assert "***" in a["masked_identifier"]
        for a in ssn_e:
            assert "identifier" not in a, f"raw identifier leaked in ssn: {a}"
            assert a["masked_identifier"].startswith("XXX-XX-")
            assert a["masked_identifier"].endswith("1234")

    def test_07_update(self, auth):
        aid = TestMonitoredAccounts.created_ids.get("email")
        assert aid, "no email account_id from earlier test"
        body = {"account_type": "email", "identifier": "alice2@example.com", "label": "Work Updated"}
        r = requests.put(f"{API}/security/monitored-accounts/{aid}", headers=auth, json=body, timeout=20)
        assert r.status_code == 200, r.text

        # verify via list
        rl = requests.get(f"{API}/security/monitored-accounts", headers=auth, timeout=20)
        accounts = rl.json()["accounts"]
        match = [a for a in accounts if a.get("account_id") == aid]
        assert match and match[0].get("label") == "Work Updated"
        assert match[0].get("identifier") == "alice2@example.com"

    def test_08_delete(self, auth):
        aid = TestMonitoredAccounts.created_ids.get("email")
        r = requests.delete(f"{API}/security/monitored-accounts/{aid}", headers=auth, timeout=20)
        assert r.status_code == 200, r.text

        # verify gone
        rl = requests.get(f"{API}/security/monitored-accounts", headers=auth, timeout=20)
        accounts = rl.json()["accounts"]
        assert not any(a.get("account_id") == aid for a in accounts)

    def test_09_cleanup(self, auth):
        # cleanup phone + ssn
        for k in ("phone", "ssn"):
            aid = TestMonitoredAccounts.created_ids.get(k)
            if aid:
                requests.delete(f"{API}/security/monitored-accounts/{aid}", headers=auth, timeout=20)


# ---------------- Jurisdiction Lookup ----------------
class TestJurisdiction:
    def test_10_get_jurisdiction_initial(self, auth):
        """Before setting county, may match or fallback — accept both shapes."""
        r = requests.get(f"{API}/security/jurisdiction", headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "found" in d
        if d["found"]:
            assert d.get("department")
            assert d.get("non_emergency_phone")
        else:
            assert d.get("fallback_message")

    def test_11_set_dekalb_and_lookup(self, auth):
        # update profile to DeKalb, GA
        r = requests.put(f"{API}/profile", headers=auth, json={"home_county": "DeKalb", "home_state": "GA"}, timeout=20)
        assert r.status_code == 200, r.text

        # now jurisdiction should match
        rj = requests.get(f"{API}/security/jurisdiction", headers=auth, timeout=20)
        assert rj.status_code == 200
        j = rj.json()
        assert j.get("found") is True, f"expected matched, got {j}"
        assert j["department"] == "DeKalb County Police Department"
        assert "non_emergency_phone" in j and j["non_emergency_phone"]
        assert "online_report_url" in j

    def test_12_police_step_dynamic(self, auth):
        r = requests.get(f"{API}/security/identity-theft/police-step", headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("step_id") == "police_report"
        assert "DeKalb County Police Department" in d.get("title", "")
        assert d.get("jurisdiction", {}).get("found") is True

    def test_13_identity_theft_guide_step_overridden(self, auth):
        r = requests.get(f"{API}/security/identity-theft-guide", headers=auth, timeout=20)
        assert r.status_code == 200, r.text
        steps = r.json().get("steps", [])
        pr = [s for s in steps if s.get("step_id") == "police_report"]
        assert pr, "police_report step missing"
        s = pr[0]
        assert "DeKalb County Police Department" in s.get("title", ""), f"title not overridden: {s.get('title')}"
        # links should include the online_report_url
        links = s.get("links", [])
        assert any("dekalbcountyga" in (l.get("url", "") or "") for l in links), f"links not updated: {links}"
