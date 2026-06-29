"""
Backend tests for Enhancement 12 — AI Document Summarizer.
"""
import io
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
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---- A. Metadata + History ----
def test_focuses_list(headers):
    r = requests.get(f"{API}/doc-summarizer/focuses", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "focuses" in data
    focuses = data["focuses"]
    assert len(focuses) >= 7
    values = {f["value"] for f in focuses}
    expected = {"general", "financial", "medical", "legal", "technical", "academic", "action_items"}
    assert expected.issubset(values), f"missing: {expected - values}"
    for f in focuses:
        assert "value" in f and "label" in f and "instruction" in f


def test_history_initial(headers):
    r = requests.get(f"{API}/doc-summarizer/history", headers=headers, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "history" in data and "total" in data
    assert isinstance(data["history"], list)


# ---- B. Summarize ----
FIN_TXT = (
    "ACME Bank Statement\nAccount: ****1234\nBalance: $4,250.18\n"
    "Interest YTD: $12.30\nFee: $5.00 wire fee\nDue date: 2026-07-15"
).encode()


@pytest.fixture(scope="module")
def saved_summary_id(headers):
    """Run a real Claude summarize with save=true; returns summary_id or None if budget exhausted."""
    files = {"file": ("acme_statement.txt", FIN_TXT, "text/plain")}
    data = {"focus": "financial", "save": "true"}
    r = requests.post(f"{API}/doc-summarizer/summarize", headers=headers, files=files, data=data, timeout=60)
    if r.status_code == 503:
        pytest.skip(f"LLM budget exhausted: {r.text[:200]}")
    assert r.status_code == 200, f"summarize failed: {r.status_code} {r.text[:400]}"
    body = r.json()
    assert body.get("focus") == "financial"
    assert body.get("focus_label") == "Financial"
    assert body.get("saved") is True
    assert body.get("summary_id")
    assert "tldr" in body and "summary" in body
    assert "key_points" in body and isinstance(body["key_points"], list)
    return body["summary_id"]


def test_summarize_financial(saved_summary_id):
    # fixture itself asserts; this just ensures it ran
    assert saved_summary_id is None or isinstance(saved_summary_id, str)


def test_summarize_invalid_focus(headers):
    files = {"file": ("a.txt", b"hello world", "text/plain")}
    data = {"focus": "bogus", "save": "false"}
    r = requests.post(f"{API}/doc-summarizer/summarize", headers=headers, files=files, data=data, timeout=30)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"


def test_summarize_no_file(headers):
    r = requests.post(f"{API}/doc-summarizer/summarize", headers=headers, data={"focus": "general"}, timeout=15)
    assert r.status_code == 422, f"expected 422, got {r.status_code}"


def test_summarize_empty_file(headers):
    files = {"file": ("empty.txt", b"", "text/plain")}
    data = {"focus": "general", "save": "false"}
    r = requests.post(f"{API}/doc-summarizer/summarize", headers=headers, files=files, data=data, timeout=20)
    assert r.status_code == 400


def test_summarize_oversized_file(headers):
    big = b"a" * (13 * 1024 * 1024)
    files = {"file": ("big.txt", big, "text/plain")}
    data = {"focus": "general", "save": "false"}
    r = requests.post(f"{API}/doc-summarizer/summarize", headers=headers, files=files, data=data, timeout=60)
    assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"


def test_summarize_unsupported_mime(headers):
    files = {"file": ("a.zip", b"PK\x03\x04zipdata", "application/zip")}
    data = {"focus": "general", "save": "false"}
    r = requests.post(f"{API}/doc-summarizer/summarize", headers=headers, files=files, data=data, timeout=20)
    assert r.status_code == 400
    assert "unsupported" in r.text.lower() or "type" in r.text.lower()


def test_summarize_save_false_no_history_entry(headers):
    # snapshot history first
    h0 = requests.get(f"{API}/doc-summarizer/history", headers=headers, timeout=15).json()
    ids_before = {h["summary_id"] for h in h0.get("history", [])}

    files = {"file": ("nosave.txt", b"This is a no-save doc with content about apples and oranges.", "text/plain")}
    data = {"focus": "general", "save": "false"}
    r = requests.post(f"{API}/doc-summarizer/summarize", headers=headers, files=files, data=data, timeout=60)
    if r.status_code == 503:
        pytest.skip("LLM budget exhausted")
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert body.get("saved") is False

    h1 = requests.get(f"{API}/doc-summarizer/history", headers=headers, timeout=15).json()
    ids_after = {h["summary_id"] for h in h1.get("history", [])}
    new_ids = ids_after - ids_before
    # The new (non-saved) summary's id should not be in history
    assert body["summary_id"] not in ids_after
    # Allow possibility that other parallel saves happened; explicit id check is the contract
    _ = new_ids


# ---- C. PDF smoke (best-effort) ----
def _make_minimal_pdf() -> bytes:
    try:
        from reportlab.pdfgen import canvas
        buf = io.BytesIO()
        c = canvas.Canvas(buf)
        c.drawString(72, 720, "Hello PLOS. This is a sample financial document.")
        c.drawString(72, 700, "Balance: $1000. Due 2026-07-15. Fee: $5.")
        c.showPage()
        c.save()
        return buf.getvalue()
    except Exception:
        return b""


def test_summarize_pdf(headers):
    pdf = _make_minimal_pdf()
    if not pdf:
        pytest.skip("reportlab not available")
    files = {"file": ("sample.pdf", pdf, "application/pdf")}
    data = {"focus": "general", "save": "false"}
    r = requests.post(f"{API}/doc-summarizer/summarize", headers=headers, files=files, data=data, timeout=60)
    if r.status_code == 503:
        pytest.skip(f"LLM budget exhausted: {r.text[:200]}")
    assert r.status_code == 200, r.text[:400]
    body = r.json()
    assert body.get("focus") == "general"
    assert "tldr" in body


# ---- D. History CRUD ----
def test_history_contains_saved(headers, saved_summary_id):
    r = requests.get(f"{API}/doc-summarizer/history", headers=headers, timeout=15)
    assert r.status_code == 200
    items = r.json()["history"]
    ids = [h["summary_id"] for h in items]
    assert saved_summary_id in ids
    for h in items:
        assert "extracted_text" not in h
        assert "content" not in h


def test_history_get_full(headers, saved_summary_id):
    r = requests.get(f"{API}/doc-summarizer/history/{saved_summary_id}", headers=headers, timeout=15)
    assert r.status_code == 200
    body = r.json()
    for k in ("tldr", "summary", "key_points", "action_items", "flags", "topics", "focus", "focus_label"):
        assert k in body, f"missing {k}"


def test_history_get_nonexistent(headers):
    r = requests.get(f"{API}/doc-summarizer/history/does-not-exist-xyz", headers=headers, timeout=15)
    assert r.status_code == 404


def test_history_delete_nonexistent(headers):
    r = requests.delete(f"{API}/doc-summarizer/history/does-not-exist-xyz", headers=headers, timeout=15)
    assert r.status_code == 404


def test_history_delete(headers, saved_summary_id):
    r = requests.delete(f"{API}/doc-summarizer/history/{saved_summary_id}", headers=headers, timeout=15)
    assert r.status_code == 200
    # verify gone
    g = requests.get(f"{API}/doc-summarizer/history/{saved_summary_id}", headers=headers, timeout=15)
    assert g.status_code == 404
    h = requests.get(f"{API}/doc-summarizer/history", headers=headers, timeout=15).json()
    ids = [x["summary_id"] for x in h["history"]]
    assert saved_summary_id not in ids
