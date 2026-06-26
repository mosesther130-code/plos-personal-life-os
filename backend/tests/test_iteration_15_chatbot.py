"""Iteration 15 — AI Life Advisor Chatbot end-to-end backend tests.

Covers:
- /api/chat with mode overlays (financial, legal, general)
- Conversation metadata persistence + listing
- Search, quick-actions endpoints
- Delete single + delete-all flows
"""
import os
import time
import pytest
import requests

BASE_URL = "https://life-os-hub-32.preview.emergentagent.com"
EMAIL = "test1@plos.app"
PASSWORD = "test123"
TIMEOUT_CHAT = 60


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    return data["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def state():
    """Shared mutable state across tests in this module."""
    return {}


# ----------------------- chat + mode overlays -------------------------

def test_01_chat_financial_mode_first_message(headers, state):
    """Step 1 — POST /api/chat with financial mode returns string response + session_id."""
    payload = {
        "message": "Give me one quick finance tip in 1 sentence.",
        "mode": "financial",
    }
    r = requests.post(
        f"{BASE_URL}/api/chat", json=payload, headers=headers, timeout=TIMEOUT_CHAT
    )
    assert r.status_code == 200, f"chat failed: {r.status_code} {r.text}"
    data = r.json()
    assert isinstance(data.get("response"), str) and len(data["response"]) > 0
    assert isinstance(data.get("session_id"), str) and data["session_id"].startswith("chat-")
    state["fin_session"] = data["session_id"]
    state["fin_first_msg"] = payload["message"]


def test_02_conversations_contains_financial_session(headers, state):
    r = requests.get(f"{BASE_URL}/api/chatbot/conversations", headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    conversations = r.json().get("conversations", [])
    target = next((c for c in conversations if c["session_id"] == state["fin_session"]), None)
    assert target is not None, "financial session not found in conversations list"
    assert target["mode"] == "financial"
    assert target["message_count"] == 2, f"expected 2 messages, got {target['message_count']}"
    # Title derived from first user message; length <60 so no ellipsis required
    assert state["fin_first_msg"].startswith(target["title"].rstrip("…"))


def test_03_chat_second_message_same_session_updates_count(headers, state):
    payload = {
        "message": "And what's my biggest expense category?",
        "session_id": state["fin_session"],
        "mode": "financial",
    }
    r = requests.post(
        f"{BASE_URL}/api/chat", json=payload, headers=headers, timeout=TIMEOUT_CHAT
    )
    assert r.status_code == 200, r.text
    assert r.json()["session_id"] == state["fin_session"]

    # message_count should now be 4
    r2 = requests.get(f"{BASE_URL}/api/chatbot/conversations", headers=headers, timeout=20)
    assert r2.status_code == 200
    target = next(
        (c for c in r2.json()["conversations"] if c["session_id"] == state["fin_session"]),
        None,
    )
    assert target is not None
    assert target["message_count"] == 4


def test_04_chat_legal_mode_includes_attorney_disclaimer(headers, state):
    payload = {
        "message": "Should I be worried about my landlord raising rent next month? Keep it under 60 words.",
        "mode": "legal",
    }
    r = requests.post(
        f"{BASE_URL}/api/chat", json=payload, headers=headers, timeout=TIMEOUT_CHAT
    )
    assert r.status_code == 200, r.text
    data = r.json()
    txt = data["response"].lower()
    assert "attorney" in txt or "⚖" in data["response"], (
        f"legal disclaimer missing in response: {data['response'][:300]}"
    )
    state["legal_session"] = data["session_id"]


def test_05_chat_general_mode_no_attorney_disclaimer(headers, state):
    payload = {
        "message": "Hello. Reply with a short greeting only.",
        "mode": "general",
    }
    r = requests.post(
        f"{BASE_URL}/api/chat", json=payload, headers=headers, timeout=TIMEOUT_CHAT
    )
    assert r.status_code == 200, r.text
    data = r.json()
    txt = data["response"].lower()
    assert "attorney" not in txt and "⚖" not in data["response"], (
        f"general response unexpectedly contains attorney disclaimer: {data['response'][:300]}"
    )
    state["general_session"] = data["session_id"]


# ----------------------- search + quick-actions ----------------------

def test_06_search_finance_returns_results(headers, state):
    r = requests.get(
        f"{BASE_URL}/api/chatbot/search", params={"q": "finance"}, headers=headers, timeout=20
    )
    assert r.status_code == 200, r.text
    results = r.json().get("results", [])
    assert isinstance(results, list) and len(results) >= 1
    # All results must include the query substring (case-insensitive)
    assert all("finance" in (it.get("content") or "").lower() for it in results)


def test_07_search_too_short_returns_empty(headers):
    r = requests.get(
        f"{BASE_URL}/api/chatbot/search", params={"q": "a"}, headers=headers, timeout=20
    )
    assert r.status_code == 200
    assert r.json() == {"results": []}


def test_08_quick_actions_returns_eight_prompts(headers):
    r = requests.get(f"{BASE_URL}/api/chatbot/quick-actions", headers=headers, timeout=20)
    assert r.status_code == 200
    prompts = r.json().get("prompts", [])
    assert isinstance(prompts, list)
    assert len(prompts) == 8, f"expected 8 prompts, got {len(prompts)}"
    expected = [
        "Analyze my finances today",
        "Am I on track for retirement?",
        "Should I refinance my mortgage?",
        "What job should I apply to next?",
        "How do I improve my credit score?",
        "What business should I start?",
        "Is my debt payoff plan optimal?",
        "Review my investment strategy",
    ]
    assert prompts == expected


# ----------------------- delete flows --------------------------------

def test_09_delete_one_conversation(headers, state):
    sid = state["fin_session"]
    r = requests.delete(
        f"{BASE_URL}/api/chatbot/conversations/{sid}", headers=headers, timeout=20
    )
    assert r.status_code == 200
    assert r.json().get("ok") is True

    # Verify gone
    r2 = requests.get(f"{BASE_URL}/api/chatbot/conversations", headers=headers, timeout=20)
    sessions = [c["session_id"] for c in r2.json()["conversations"]]
    assert sid not in sessions


def test_10_clear_all_conversations(headers):
    r = requests.delete(f"{BASE_URL}/api/chatbot/conversations", headers=headers, timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True
    assert "messages_deleted" in body and "conversations_deleted" in body

    # Verify empty
    r2 = requests.get(f"{BASE_URL}/api/chatbot/conversations", headers=headers, timeout=20)
    assert r2.status_code == 200
    assert r2.json()["conversations"] == []
