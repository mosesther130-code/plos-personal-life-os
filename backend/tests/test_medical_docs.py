"""
Backend tests for Enhancement 10 — Medical Documents CRUD
Tests new endpoints in /app/backend/medical_docs.py + regression smoke
for Insurance/Meds/Appointments.
"""
import io
import os
import base64
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://life-os-hub-32.preview.emergentagent.com",
).rstrip("/")

EMAIL = "test1@plos.app"
PASSWORD = "test123"


# ---------------- auth ----------------
@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def created_doc(headers):
    """Upload a doc once for the module; cleanup after."""
    files = {"file": ("lab.txt", io.BytesIO(b"hello world cholesterol panel"), "text/plain")}
    data = {
        "title": "TEST_Annual Lab 2026",
        "doc_type": "lab_result",
        "doc_date": "2026-05-12",
        "provider": "Emory",
        "notes": "Cholesterol panel",
    }
    r = requests.post(
        f"{BASE_URL}/api/health/medical-docs/upload",
        headers=headers,
        files=files,
        data=data,
        timeout=30,
    )
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
    doc = r.json()["doc"]
    yield doc
    # cleanup
    requests.delete(
        f"{BASE_URL}/api/health/medical-docs/{doc['doc_id']}",
        headers=headers,
        timeout=15,
    )


# ---------------- types & list ----------------
class TestTypesAndList:
    def test_get_types(self, headers):
        r = requests.get(
            f"{BASE_URL}/api/health/medical-docs/types", headers=headers, timeout=15
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "doc_types" in body
        types = body["doc_types"]
        assert isinstance(types, list)
        assert len(types) >= 10
        for required in ("lab_result", "imaging", "prescription",
                         "vaccine_record", "insurance_card"):
            assert required in types

    def test_list_empty_or_ok(self, headers):
        r = requests.get(f"{BASE_URL}/api/health/medical-docs", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "docs" in body and "total" in body
        assert isinstance(body["docs"], list)
        assert body["total"] == len(body["docs"])


# ---------------- upload ----------------
class TestUpload:
    def test_upload_returns_clean_metadata(self, created_doc):
        for k in ("doc_id", "title", "doc_type", "doc_date",
                  "provider", "notes", "filename", "mime", "size", "uploaded_at"):
            assert k in created_doc, f"missing {k}"
        # must NOT leak
        for forbidden in ("content_b64", "user_id", "_id"):
            assert forbidden not in created_doc
        assert created_doc["doc_type"] == "lab_result"
        assert created_doc["title"] == "TEST_Annual Lab 2026"
        assert created_doc["size"] > 0
        assert created_doc["mime"].startswith("text/")

    def test_upload_invalid_doc_type(self, headers):
        files = {"file": ("x.txt", io.BytesIO(b"abc"), "text/plain")}
        data = {"title": "TEST_bad", "doc_type": "foobar"}
        r = requests.post(
            f"{BASE_URL}/api/health/medical-docs/upload",
            headers=headers, files=files, data=data, timeout=15,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"

    def test_upload_empty_file(self, headers):
        files = {"file": ("empty.txt", io.BytesIO(b""), "text/plain")}
        data = {"title": "TEST_empty", "doc_type": "lab_result"}
        r = requests.post(
            f"{BASE_URL}/api/health/medical-docs/upload",
            headers=headers, files=files, data=data, timeout=15,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text}"


# ---------------- list filtered / get / download ----------------
class TestGetDownload:
    def test_list_filter_by_doc_type(self, headers, created_doc):
        r = requests.get(
            f"{BASE_URL}/api/health/medical-docs?doc_type=lab_result",
            headers=headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        docs = r.json()["docs"]
        assert any(d["doc_id"] == created_doc["doc_id"] for d in docs)
        for d in docs:
            assert d["doc_type"] == "lab_result"
            assert "content_b64" not in d
            assert "user_id" not in d

    def test_list_filter_invalid_doc_type(self, headers):
        r = requests.get(
            f"{BASE_URL}/api/health/medical-docs?doc_type=foobar",
            headers=headers, timeout=15,
        )
        assert r.status_code == 400

    def test_get_single_doc(self, headers, created_doc):
        r = requests.get(
            f"{BASE_URL}/api/health/medical-docs/{created_doc['doc_id']}",
            headers=headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["doc_id"] == created_doc["doc_id"]
        assert "content_b64" not in body
        assert "user_id" not in body

    def test_download(self, headers, created_doc):
        r = requests.get(
            f"{BASE_URL}/api/health/medical-docs/{created_doc['doc_id']}/download",
            headers=headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("filename", "mime_type", "content_base64", "size_bytes"):
            assert k in body
        assert body["content_base64"]
        decoded = base64.b64decode(body["content_base64"])
        assert decoded == b"hello world cholesterol panel"
        assert body["size_bytes"] == len(decoded)


# ---------------- update ----------------
class TestUpdate:
    def test_update_doc(self, headers, created_doc):
        payload = {
            "title": "TEST_Annual Lab 2026 (Updated)",
            "provider": "Emory Decatur",
            "notes": "Updated",
        }
        r = requests.put(
            f"{BASE_URL}/api/health/medical-docs/{created_doc['doc_id']}",
            headers=headers, json=payload, timeout=15,
        )
        assert r.status_code == 200, r.text

        # GET to verify persistence
        g = requests.get(
            f"{BASE_URL}/api/health/medical-docs/{created_doc['doc_id']}",
            headers=headers, timeout=15,
        )
        assert g.status_code == 200
        body = g.json()
        assert body["title"] == payload["title"]
        assert body["provider"] == payload["provider"]
        assert body["notes"] == payload["notes"]

    def test_update_invalid_doc_type(self, headers, created_doc):
        r = requests.put(
            f"{BASE_URL}/api/health/medical-docs/{created_doc['doc_id']}",
            headers=headers, json={"doc_type": "foobar"}, timeout=15,
        )
        assert r.status_code == 400

    def test_update_nonexistent(self, headers):
        r = requests.put(
            f"{BASE_URL}/api/health/medical-docs/nonexistent-id-xyz",
            headers=headers, json={"title": "x"}, timeout=15,
        )
        assert r.status_code == 404


# ---------------- delete ----------------
class TestDelete:
    def test_delete_flow(self, headers):
        # create a fresh doc to delete
        files = {"file": ("delme.txt", io.BytesIO(b"to be deleted"), "text/plain")}
        data = {"title": "TEST_delete_me", "doc_type": "other"}
        up = requests.post(
            f"{BASE_URL}/api/health/medical-docs/upload",
            headers=headers, files=files, data=data, timeout=15,
        )
        assert up.status_code == 200
        doc_id = up.json()["doc"]["doc_id"]

        d = requests.delete(
            f"{BASE_URL}/api/health/medical-docs/{doc_id}", headers=headers, timeout=15,
        )
        assert d.status_code == 200

        g = requests.get(
            f"{BASE_URL}/api/health/medical-docs/{doc_id}", headers=headers, timeout=15,
        )
        assert g.status_code == 404

    def test_delete_nonexistent(self, headers):
        r = requests.delete(
            f"{BASE_URL}/api/health/medical-docs/nonexistent-id-xyz",
            headers=headers, timeout=15,
        )
        assert r.status_code == 404


# ---------------- regression smoke ----------------
class TestRegressionSmoke:
    def test_medications_get(self, headers):
        r = requests.get(f"{BASE_URL}/api/health/medications", headers=headers, timeout=15)
        assert r.status_code == 200, r.text

    def test_appointments_get(self, headers):
        r = requests.get(f"{BASE_URL}/api/health/appointments", headers=headers, timeout=15)
        assert r.status_code == 200, r.text

    def test_insurance_get(self, headers):
        r = requests.get(f"{BASE_URL}/api/health/insurance", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
