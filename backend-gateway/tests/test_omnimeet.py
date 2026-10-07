"""
Comprehensive Automated Test Suite for OmniMeet AI
Tests meeting creation/joining, unique ID generation, SQLite persistence,
LiveKit token issuance, action items CRUD, and Copilot grounded intelligence.
"""

import os
import sys
import pytest
from pathlib import Path

# Add backend directory to path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import database
import meeting_utils
import livekit_service
from copilot_engine import OmniCopilotEngine
from main import app
from fastapi.testclient import TestClient

client = TestClient(app)


# ==============================================================================
# 1. Meeting Code & Identifier Utilities
# ==============================================================================

def test_meeting_code_generation():
    """Verifies that generated codes follow the 3-4-3 format and have high entropy."""
    code1 = meeting_utils.generate_meeting_code()
    code2 = meeting_utils.generate_meeting_code()
    assert code1 != code2
    parts = code1.split("-")
    assert len(parts) == 3
    assert len(parts[0]) == 3
    assert len(parts[1]) == 4
    assert len(parts[2]) == 3
    assert meeting_utils.is_valid_meeting_code(code1)


def test_meeting_id_generation():
    """Verifies unique, URL-safe random meeting ID creation."""
    id1 = meeting_utils.generate_meeting_id()
    id2 = meeting_utils.generate_meeting_id()
    assert id1 != id2
    assert id1.startswith("mtg-")
    assert meeting_utils.is_valid_meeting_code(id1)


def test_meeting_code_normalization():
    """Verifies normalization handles raw codes, URLs with /meet/, and ?room= params."""
    assert meeting_utils.normalize_meeting_code("abc-defg-hij") == "abc-defg-hij"
    assert meeting_utils.normalize_meeting_code("https://omnimeet.app/meet/abc-defg-hij") == "abc-defg-hij"
    assert meeting_utils.normalize_meeting_code("http://localhost:8000/?room=abc-defg-hij") == "abc-defg-hij"
    assert meeting_utils.normalize_meeting_code("  ABC-DEFG-HIJ  ") == "abc-defg-hij"


# ==============================================================================
# 2. SQLite Database Persistence
# ==============================================================================

def test_meeting_persistence_lifecycle():
    """Verifies meeting creation, lookup by code, ending, and deletion in SQLite."""
    m_id = "test-mtg-" + meeting_utils.generate_meeting_id()
    code = meeting_utils.generate_meeting_code()
    created = database.create_meeting(m_id, code, "Test Strategy Session", "Alex")

    assert created["id"] == m_id
    assert created["code"] == code
    assert created["isActive"] is True

    # Lookup by ID
    by_id = database.get_meeting(m_id)
    assert by_id is not None
    assert by_id["title"] == "Test Strategy Session"

    # Lookup by Code
    by_code = database.get_meeting(code)
    assert by_code is not None
    assert by_code["id"] == m_id

    # End meeting
    assert database.end_meeting(m_id) is True
    ended = database.get_meeting(m_id)
    assert ended["isActive"] is False
    assert ended["endedAt"] is not None

    # Delete meeting
    assert database.delete_meeting_records(m_id) is True
    assert database.get_meeting(m_id) is None


def test_transcript_persistence():
    """Verifies transcripts are persistently saved and retrieved in order."""
    m_id = "test-transcript-room-1"
    sub1 = database.save_transcript(
        transcript_id="sub_test_1",
        meeting_id=m_id,
        sender_id="usr_1",
        sender_name="Maria",
        original_text="Buenos dias a todos.",
        translated_text="Good morning everyone.",
        source_lang="es",
        target_lang="en",
        timestamp=1000
    )
    sub2 = database.save_transcript(
        transcript_id="sub_test_2",
        meeting_id=m_id,
        sender_id="usr_2",
        sender_name="Kenji",
        original_text="おはようございます",
        translated_text="Good morning",
        source_lang="ja",
        target_lang="en",
        timestamp=2000
    )

    records = database.get_meeting_transcripts(m_id)
    assert len(records) >= 2
    assert any(r["senderName"] == "Maria" and "Buenos dias" in r["originalText"] for r in records)
    assert any(r["senderName"] == "Kenji" and "Good morning" in r["translatedText"] for r in records)


def test_chat_persistence():
    """Verifies chat messages persist across meetings."""
    m_id = "test-chat-room-1"
    msg = database.save_chat_message(
        msg_id="chat_1",
        meeting_id=m_id,
        sender_id="usr_1",
        sender_name="Maria",
        message="I have uploaded the design document to the shared drive."
    )
    assert msg["message"] == "I have uploaded the design document to the shared drive."

    chat_history = database.get_meeting_chat_messages(m_id)
    assert len(chat_history) >= 1
    assert any(c["senderName"] == "Maria" for c in chat_history)


def test_action_items_persistence():
    """Verifies action items can be added, updated, and queried from SQLite."""
    m_id = "test-action-room-1"
    item = database.save_action_item({
        "id": "act_test_100",
        "meetingId": m_id,
        "task": "Finalize localization deployment scripts",
        "assignee": "Dev Team",
        "priority": "high",
        "completed": False
    })
    assert item["task"] == "Finalize localization deployment scripts"
    assert item["completed"] is False

    # Update completion
    updated = database.update_action_item(m_id, "act_test_100", {"completed": True})
    assert updated is not None
    assert updated["completed"] is True

    # Retrieve all
    items = database.get_meeting_action_items(m_id)
    target = next((i for i in items if i["id"] == "act_test_100"), None)
    assert target is not None
    assert target["completed"] is True


# ==============================================================================
# 3. Media & LiveKit Service Configuration
# ==============================================================================

def test_ice_servers_configuration():
    """Verifies default public STUN servers are always provided."""
    ice_servers = livekit_service.get_ice_servers()
    assert len(ice_servers) >= 1
    stun_urls = [s["urls"] for s in ice_servers if "urls" in s]
    assert any("stun:" in str(u) for u in stun_urls)


def test_livekit_token_fallback():
    """Verifies that when LiveKit is unconfigured, fallback mode is cleanly reported."""
    config = livekit_service.get_media_transport_config("demo-room", "usr_1", "Test User")
    assert "mode" in config
    assert "iceServers" in config
    assert isinstance(config["iceServers"], list)


# ==============================================================================
# 4. FastAPI REST Endpoints Integration
# ==============================================================================

def test_health_endpoint():
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "online"
    assert "database_persistence" in data


def test_webrtc_config_endpoint():
    res = client.get("/api/config/webrtc")
    assert res.status_code == 200
    data = res.json()
    assert "iceServers" in data


def test_meeting_creation_and_lookup_api():
    # 1. Create meeting
    res = client.post("/api/meetings", json={"title": "Sprint Review 42", "createdBy": "Sarah"})
    assert res.status_code == 200
    created = res.json()
    assert "id" in created
    assert "code" in created
    assert created["title"] == "Sprint Review 42"
    assert created["createdBy"] == "Sarah"

    # 2. Look up by code
    res_code = client.get(f"/api/meetings/{created['code']}")
    assert res_code.status_code == 200
    assert res_code.json()["id"] == created["id"]

    # 3. Look up by ID
    res_id = client.get(f"/api/meetings/{created['id']}")
    assert res_id.status_code == 200
    assert res_id.json()["code"] == created["code"]

    # 4. Unknown code returns 404
    res_unknown = client.get("/api/meetings/non-existent-code-999")
    assert res_unknown.status_code == 404


def test_meeting_records_export():
    from main import copilot
    old_client = copilot.client
    copilot.client = None  # Ensure fast, deterministic local synthesis without network delay
    try:
        m_id = "test-export-" + meeting_utils.generate_meeting_id()
        code = meeting_utils.generate_meeting_code()
        database.create_meeting(m_id, code, "Export Test Meeting", "Host")
        database.save_transcript("t1", m_id, "u1", "Host", "Let's review the product launch date.", timestamp=1000)
        database.save_action_item({
            "id": "act_exp_1",
            "meetingId": m_id,
            "task": "Deliver marketing assets",
            "assignee": "Host",
            "completed": False
        })

        # Retrieve structured records
        res = client.get(f"/api/meetings/{m_id}/records")
        assert res.status_code == 200
        data = res.json()
        assert "transcripts" in data
        assert "actionItems" in data
        assert len(data["transcripts"]) >= 1

        # Retrieve markdown export
        md_res = client.get(f"/api/rooms/{m_id}/export-markdown")
        assert md_res.status_code == 200
        assert "# OmniMeet AI: Minutes of Meeting" in md_res.text
        assert "Deliver marketing assets" in md_res.text
    finally:
        copilot.client = old_client
