"""Global Tools module API tests — Translator + Currency Exchange."""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://life-os-hub-32.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "test1@plos.app"
PASSWORD = "test123"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def token(client):
    r = client.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, f"login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module", autouse=True)
def seeded(client, headers):
    """Ensure demo seed runs before alerts/check test so USD/PHP alert exists."""
    r = client.post(f"{API}/seed-demo", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    return True


# ===================== Languages / Phrase Book =====================
def test_languages(client, headers):
    r = client.get(f"{API}/global/languages", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body.get("languages"), list)
    assert len(body["languages"]) == 12
    for lang in ["English", "Filipino", "French", "Spanish", "Swahili"]:
        assert lang in body["languages"]
    assert isinstance(body.get("quick_phrases"), list)
    assert len(body["quick_phrases"]) == 10


def test_phrase_book(client, headers):
    r = client.get(f"{API}/global/phrase-book", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["categories"] == ["Emergency", "Travel", "Food", "Money", "Health"]
    pb = body["phrase_book"]
    assert len(pb["Emergency"]) == 8
    # Spot-check seeded rows
    eng_texts = [row["English"] for row in pb["Emergency"]]
    assert "Help" in eng_texts
    assert "Fire" in eng_texts
    assert "Call an ambulance" in eng_texts
    # Each row has 4 languages
    for row in pb["Emergency"]:
        for k in ("English", "Filipino", "French", "Spanish"):
            assert k in row and row[k]


# ===================== Translator =====================
def test_translate_validation_empty_text(client, headers):
    r = client.post(f"{API}/global/translate",
                    json={"text": "  ", "target_language": "Filipino"},
                    headers=headers)
    assert r.status_code == 400


def test_translate_validation_bad_target(client, headers):
    r = client.post(f"{API}/global/translate",
                    json={"text": "Hello", "target_language": "Klingon"},
                    headers=headers)
    assert r.status_code == 400


def test_translate_explicit_source(client, headers):
    r = client.post(
        f"{API}/global/translate",
        json={
            "text": "Where is the nearest hospital? I need a doctor.",
            "source_language": "English",
            "target_language": "Filipino",
        },
        headers=headers,
        timeout=60,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ("translation_id", "source_language", "target_language",
              "source_text", "translated_text", "created_at"):
        assert k in body, f"missing {k}"
    assert body["target_language"] == "Filipino"
    assert body["source_language"] == "English"
    assert body["translated_text"] and len(body["translated_text"]) > 3
    # Filipino typically has letters / vowels — sanity check
    assert any(c.isalpha() for c in body["translated_text"])


def test_translate_auto_detect(client, headers):
    r = client.post(
        f"{API}/global/translate",
        json={
            "text": "Bonjour, comment allez-vous ?",
            "target_language": "English",
        },
        headers=headers,
        timeout=60,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("detected_language"), "detected_language should be set on auto"
    # French should be detected
    assert "french" in body["detected_language"].lower() or "fr" in body["detected_language"].lower()


def test_detect_language(client, headers):
    r = client.post(
        f"{API}/global/detect-language",
        json={"text": "Kumusta ka? Magandang umaga."},
        headers=headers,
        timeout=60,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "language" in body and isinstance(body["language"], str)
    assert "filipino" in body["language"].lower() or "tagalog" in body["language"].lower()


def test_translations_history_listing(client, headers):
    r = client.get(f"{API}/global/translations", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body.get("translations"), list)
    # At least the two translations above
    assert len(body["translations"]) >= 1
    # Sorted desc by created_at
    if len(body["translations"]) >= 2:
        assert body["translations"][0]["created_at"] >= body["translations"][1]["created_at"]
    # No leaked _id / user_id
    for t in body["translations"]:
        assert "_id" not in t
        assert "user_id" not in t


def test_translations_clear(client, headers):
    r = client.delete(f"{API}/global/translations", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
    # Verify empty
    r2 = client.get(f"{API}/global/translations", headers=headers)
    assert r2.json()["translations"] == []


# ===================== Currency =====================
def test_currencies(client, headers):
    r = client.get(f"{API}/global/currencies", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["currencies"]) == 13
    codes = [c["code"] for c in body["currencies"]]
    for code in ["USD", "PHP", "EUR", "NGN", "GBP", "JPY", "XAF", "SGD"]:
        assert code in codes
    for c in body["currencies"]:
        assert "name" in c and "flag" in c


def test_rates_live_or_fallback(client, headers):
    r = client.get(f"{API}/global/rates", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["base"] == "USD"
    assert "PHP" in body["rates"]
    assert "EUR" in body["rates"]
    assert "is_live" in body
    # Whether live or fallback, USD->PHP should be plausible (>= 40)
    assert float(body["rates"]["PHP"]) >= 40.0


def test_rate_history_seeded(client, headers):
    r = client.get(f"{API}/global/rate-history?base=USD&target=PHP", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["base"] == "USD"
    assert body["target"] == "PHP"
    assert isinstance(body["series"], list)
    assert len(body["series"]) == 30
    for k in ("low", "high", "avg", "current"):
        assert k in body
    assert body["low"] <= body["avg"] <= body["high"]
    # Seeded final value
    assert body["current"] == pytest.approx(57.32, abs=0.01)


# ===================== Rate Alerts =====================
def test_alerts_seeded_two(client, headers):
    r = client.get(f"{API}/global/alerts", headers=headers)
    assert r.status_code == 200, r.text
    items = r.json()["alerts"]
    labels = [a.get("label") for a in items]
    assert any("Eden Heights" in (lbl or "") for lbl in labels)
    assert any("Travel to Europe" in (lbl or "") for lbl in labels)


def test_alert_create_validation_bad_direction(client, headers):
    r = client.post(
        f"{API}/global/alerts",
        json={"base": "USD", "target": "PHP", "rate_target": 60, "direction": "sideways"},
        headers=headers,
    )
    assert r.status_code == 400


def test_alert_create_validation_bad_target(client, headers):
    r = client.post(
        f"{API}/global/alerts",
        json={"base": "USD", "target": "PHP", "rate_target": -5, "direction": "above"},
        headers=headers,
    )
    assert r.status_code == 400


def test_alert_crud_flow(client, headers):
    # Create
    create = client.post(
        f"{API}/global/alerts",
        json={
            "base": "USD", "target": "GBP", "rate_target": 0.85,
            "direction": "above", "label": "TEST_alert_flow",
        },
        headers=headers,
    )
    assert create.status_code == 200, create.text
    alert = create.json()
    aid = alert["alert_id"]

    # Update
    upd = client.put(
        f"{API}/global/alerts/{aid}",
        json={"rate_target": 0.9, "label": "TEST_updated"},
        headers=headers,
    )
    assert upd.status_code == 200
    # Verify via list
    lst = client.get(f"{API}/global/alerts", headers=headers).json()["alerts"]
    found = next((a for a in lst if a["alert_id"] == aid), None)
    assert found and found["rate_target"] == 0.9 and found["label"] == "TEST_updated"

    # Delete
    dele = client.delete(f"{API}/global/alerts/{aid}", headers=headers)
    assert dele.status_code == 200
    assert dele.json()["deleted"] == 1

    # 404 on bad id update
    bad = client.put(f"{API}/global/alerts/nonexistent-xyz", json={"label": "x"}, headers=headers)
    assert bad.status_code == 404


def test_alerts_check_triggers_usd_php(client, headers):
    """Live USD/PHP ~57+. Seeded alert is direction=above target=58.
    Either it triggers OR (if live rate <58) it stays watching — both acceptable.
    The endpoint must always return 200 with valid structure."""
    r = client.post(f"{API}/global/alerts/check", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "checked" in body and "triggered" in body and "current_rates" in body
    assert body["checked"] >= 2  # at least 2 seeded alerts
    # Get current PHP rate from response
    php_rate = body["current_rates"]["rates"].get("PHP", 0)
    # If live rate >= 58, USD/PHP alert MUST be in triggered
    if php_rate >= 58.0:
        php_triggered = [a for a in body["triggered"]
                        if a.get("base") == "USD" and a.get("target") == "PHP"]
        assert len(php_triggered) >= 1, f"Expected USD/PHP triggered at rate {php_rate}"
        # And it should be marked triggered in alerts list now
        lst = client.get(f"{API}/global/alerts", headers=headers).json()["alerts"]
        php_alert = next((a for a in lst
                         if a.get("base") == "USD" and a.get("target") == "PHP"), None)
        assert php_alert and php_alert.get("status") == "triggered"
        # ai_decision logged
        decisions = client.get(f"{API}/ai-decisions", headers=headers).json()
        assert any(d.get("module") == "global_tools" and d.get("priority") == "action"
                   for d in decisions)


# ===================== Money Tips =====================
def test_money_tips_static_default(client, headers):
    # Re-seed to clear any custom tips from previous runs
    client.post(f"{API}/seed-demo", headers=headers, timeout=30)
    r = client.get(f"{API}/global/money-tips", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["tips"]) == 5
    assert body["is_custom"] is False
    joined = " ".join(body["tips"])
    # Spot-check seeded text
    assert "Wise" in joined or "Remitly" in joined
    assert "Schwab" in joined or "SoFi" in joined


def test_money_tips_refresh(client, headers):
    r = client.post(f"{API}/global/money-tips/refresh", headers=headers, timeout=60)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_custom"] is True
    assert len(body["tips"]) == 5
    # Each tip should be non-trivial
    for t in body["tips"]:
        assert isinstance(t, str) and len(t) > 10
    # Subsequent GET should now return custom
    g = client.get(f"{API}/global/money-tips", headers=headers).json()
    assert g["is_custom"] is True


# ===================== Auth Guards =====================
@pytest.mark.parametrize("method,path", [
    ("get", "/global/translations"),
    ("get", "/global/rates"),
    ("get", "/global/rate-history"),
    ("get", "/global/alerts"),
    ("post", "/global/translate"),
    ("post", "/global/alerts/check"),
])
def test_endpoints_require_auth(client, method, path):
    fn = getattr(client, method)
    r = fn(f"{API}{path}")
    assert r.status_code in (401, 403), f"{path} returned {r.status_code}"
