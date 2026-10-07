import asyncio
import base64
import json
import os
import re
import sys
import time
from typing import Dict, List, Optional
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables (.env in backend-gateway or root)
load_dotenv()
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, PlainTextResponse, JSONResponse
from pydantic import BaseModel

import database
import livekit_service
import meeting_utils

app = FastAPI(
    title="OmniMeet AI Gateway",
    description="Real-time WebRTC/SFU multi-user media transport, multilingual translation & AI meeting copilot",
    version="2.0.0"
)

# Restrict CORS to configured origins
ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:8000,http://127.0.0.1:8000,http://localhost:3000,http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in ALLOWED_ORIGINS if origin.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Input validation helper
ID_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]{1,64}$")

def validate_id(id_str: str, param_name: str = "id") -> str:
    if not id_str or not ID_PATTERN.match(id_str):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid {param_name}. Must be 1-64 alphanumeric characters, underscores, or hyphens."
        )
    return id_str

# Path configuration
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"
AI_SERVICES_DIR = BASE_DIR.parent / "ai-services"

if str(AI_SERVICES_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICES_DIR))

# Initialize AI Speech Pipeline & OmniCopilot Engine
try:
    from pipeline import OmniMeetAIPipeline
    ai_pipeline = OmniMeetAIPipeline()
    print(f"[OK] OmniMeet AI Speech Pipeline initialized. (Faster-Whisper ready: {ai_pipeline.is_asr_loaded()})")
except Exception as e:
    print(f"[!] AI Speech Pipeline deferred ({e}). Gateway running in standard streaming mode.")
    ai_pipeline = None

from copilot_engine import OmniCopilotEngine
copilot = OmniCopilotEngine()


class UserConnection:
    def __init__(self, websocket: WebSocket, user_id: str, user_name: str, language: str, target_language: str = "en"):
        self.websocket = websocket
        self.user_id = user_id
        self.user_name = user_name
        self.language = language
        self.target_language = target_language
        self.is_muted = False
        self.is_camera_on = False
        self.is_screen_sharing = False
        self.is_hand_raised = False


class RoomManager:
    def __init__(self):
        # room_id -> Dict[user_id, UserConnection]
        self.rooms: Dict[str, Dict[str, UserConnection]] = {}
        # In-memory fast cache mirrors the SQLite database
        self.transcripts: Dict[str, List[dict]] = {}
        self.action_items: Dict[str, List[dict]] = {}

    def get_room_transcripts(self, room_id: str) -> List[dict]:
        if room_id not in self.transcripts or not self.transcripts[room_id]:
            self.transcripts[room_id] = database.get_meeting_transcripts(room_id)
        return self.transcripts[room_id]

    def get_room_action_items(self, room_id: str) -> List[dict]:
        if room_id not in self.action_items or not self.action_items[room_id]:
            self.action_items[room_id] = database.get_meeting_action_items(room_id)
        return self.action_items[room_id]

    async def connect(
        self,
        room_id: str,
        user_id: str,
        user_name: str,
        language: str,
        target_language: str,
        websocket: WebSocket
    ):
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = {}
            # Hydrate from persistent SQLite database
            self.transcripts[room_id] = database.get_meeting_transcripts(room_id)
            self.action_items[room_id] = database.get_meeting_action_items(room_id)

        conn = UserConnection(websocket, user_id, user_name, language, target_language)
        self.rooms[room_id][user_id] = conn

        # 1. Immediately send current room state and persistent chat history to joining participant
        ai_pipeline_status = {
            "initialized": ai_pipeline is not None,
            "asrLoaded": ai_pipeline.is_asr_loaded() if ai_pipeline else False
        }
        chat_history = database.get_meeting_chat_messages(room_id)

        await websocket.send_json({
            "type": "room_state",
            "roomId": room_id,
            "participants": self.get_participants(room_id),
            "transcripts": self.get_room_transcripts(room_id),
            "actionItems": self.get_room_action_items(room_id),
            "chatMessages": chat_history,
            "aiPipeline": ai_pipeline_status,
            "mediaConfig": livekit_service.get_media_transport_config(room_id, user_id, user_name),
            "timestamp": int(time.time() * 1000)
        })

        # 2. Broadcast user_joined event to all OTHER participants in the room
        await self.broadcast(
            room_id,
            {
                "type": "room_event",
                "event": "user_joined",
                "userId": user_id,
                "userName": user_name,
                "preferredLanguage": language,
                "targetLanguage": target_language,
                "participants": self.get_participants(room_id),
                "timestamp": int(time.time() * 1000)
            },
            exclude_user_id=user_id
        )

    def disconnect(self, room_id: str, user_id: str):
        if room_id in self.rooms and user_id in self.rooms[room_id]:
            del self.rooms[room_id][user_id]
            if ai_pipeline:
                ai_pipeline.cleanup_speaker(user_id)
            if not self.rooms[room_id]:
                del self.rooms[room_id]

    def get_participants(self, room_id: str) -> List[dict]:
        if room_id not in self.rooms:
            return []
        return [
            {
                "userId": conn.user_id,
                "userName": conn.user_name,
                "preferredLanguage": conn.language,
                "targetLanguage": conn.target_language,
                "isMuted": conn.is_muted,
                "isCameraOn": conn.is_camera_on,
                "isScreenSharing": conn.is_screen_sharing,
                "isHandRaised": conn.is_hand_raised
            }
            for conn in self.rooms[room_id].values()
        ]

    async def broadcast(self, room_id: str, message: dict, exclude_user_id: Optional[str] = None):
        if room_id not in self.rooms:
            return
        dead_connections = []
        for uid, conn in self.rooms[room_id].items():
            if exclude_user_id and uid == exclude_user_id:
                continue
            try:
                await conn.websocket.send_json(message)
            except Exception:
                dead_connections.append(uid)

        for uid in dead_connections:
            self.disconnect(room_id, uid)

    async def send_to_user(self, room_id: str, target_user_id: str, message: dict):
        if room_id in self.rooms and target_user_id in self.rooms[room_id]:
            try:
                await self.rooms[room_id][target_user_id].websocket.send_json(message)
            except Exception:
                self.disconnect(room_id, target_user_id)

    def record_transcript(self, room_id: str, subtitle: dict):
        if room_id not in self.transcripts:
            self.transcripts[room_id] = []
        self.transcripts[room_id].append(subtitle)
        # Persist to SQLite
        database.save_transcript(
            transcript_id=subtitle.get("id") or f"sub_{int(time.time() * 1000)}",
            meeting_id=room_id,
            sender_id=subtitle.get("senderId", "unknown"),
            sender_name=subtitle.get("senderName", "Participant"),
            original_text=subtitle.get("originalText", ""),
            translated_text=subtitle.get("translatedText"),
            source_lang=subtitle.get("sourceLanguage", "en"),
            target_lang=subtitle.get("targetLanguage", "en"),
            timestamp=subtitle.get("timestamp")
        )

    def add_action_item(self, room_id: str, item: dict):
        if room_id not in self.action_items:
            self.action_items[room_id] = []
        # Prevent exact duplicate tasks
        existing_ids = {a.get("id") for a in self.action_items[room_id]}
        if item.get("id") not in existing_ids:
            self.action_items[room_id].append(item)
        # Persist to SQLite
        item["meetingId"] = room_id
        database.save_action_item(item)

    def update_action_item(self, room_id: str, item_id: str, updates: dict) -> Optional[dict]:
        if room_id in self.action_items:
            for item in self.action_items[room_id]:
                if item.get("id") == item_id:
                    item.update(updates)
                    database.update_action_item(room_id, item_id, updates)
                    return item
        return database.update_action_item(room_id, item_id, updates)

    def delete_action_item(self, room_id: str, item_id: str) -> bool:
        if room_id in self.action_items:
            self.action_items[room_id] = [a for a in self.action_items[room_id] if a.get("id") != item_id]
        return database.delete_action_item(room_id, item_id)

    async def dispatch_subtitle_to_room(self, room_id: str, sub_event: dict):
        """
        Translates subtitle according to each participant's target-language setting
        and routes personalized subtitle events to each user.
        """
        if room_id not in self.rooms:
            return

        orig_text = sub_event.get("originalText", "")
        src_lang = sub_event.get("sourceLanguage", "auto")

        # Collect target languages present in this room
        target_langs = {conn.target_language for conn in self.rooms[room_id].values() if conn.target_language}
        target_langs.add("en")

        translations = sub_event.get("translations", {})
        if ai_pipeline:
            for tgt in target_langs:
                if tgt not in translations:
                    translations[tgt] = ai_pipeline.translate_text(orig_text, src_lang, tgt)

        sub_event["translations"] = translations

        # Record canonical entry once
        self.record_transcript(room_id, sub_event)

        # Send personalized translation to each participant
        for uid, conn in list(self.rooms[room_id].items()):
            personal_copy = dict(sub_event)
            user_tgt = conn.target_language or "en"
            personal_copy["targetLanguage"] = user_tgt
            personal_copy["translatedText"] = translations.get(user_tgt, sub_event.get("translatedText", orig_text))
            try:
                await conn.websocket.send_json(personal_copy)
            except Exception:
                self.disconnect(room_id, uid)


manager = RoomManager()


# ==============================================================================
# REST API: Meeting Creation & Management
# ==============================================================================

class CreateMeetingRequest(BaseModel):
    title: Optional[str] = "OmniMeet Conference"
    createdBy: Optional[str] = "Host"
    passcode: Optional[str] = None


class ActionItemCreate(BaseModel):
    task: str
    assignee: Optional[str] = "Team"
    priority: Optional[str] = "medium"
    dueContext: Optional[str] = "In-Meeting Commitment"
    completed: Optional[bool] = False


class ActionItemUpdate(BaseModel):
    task: Optional[str] = None
    assignee: Optional[str] = None
    priority: Optional[str] = None
    completed: Optional[bool] = None


class CopilotAskRequest(BaseModel):
    query: str


@app.get("/health")
@app.get("/api/health")
async def health_check():
    return {
        "status": "online",
        "service": "OmniMeet AI Gateway",
        "version": "2.0.0",
        "active_rooms": len(manager.rooms),
        "ai_pipeline_active": ai_pipeline is not None,
        "asr_model_loaded": ai_pipeline.is_asr_loaded() if ai_pipeline else False,
        "gemini_copilot_ready": copilot.client is not None,
        "livekit_sfu_configured": livekit_service.is_livekit_configured(),
        "database_persistence": True,
        "timestamp": int(time.time() * 1000)
    }


@app.get("/api/config/webrtc")
async def get_webrtc_config():
    """Returns ICE server configuration (STUN/TURN) and SFU availability."""
    return {
        "iceServers": livekit_service.get_ice_servers(),
        "sfuAvailable": livekit_service.is_livekit_configured(),
        "sfuMode": "livekit" if livekit_service.is_livekit_configured() else "p2p_mesh"
    }


@app.post("/api/meetings")
async def create_new_meeting(req: CreateMeetingRequest):
    """
    Creates a new meeting with a unique, cryptographically random meeting ID
    and a human-friendly meeting code (e.g. abc-defg-hij).
    """
    meeting_id = meeting_utils.generate_meeting_id()
    code = meeting_utils.generate_meeting_code()
    meeting = database.create_meeting(
        meeting_id=meeting_id,
        code=code,
        title=req.title or "OmniMeet Conference",
        created_by=req.createdBy or "Host",
        passcode=req.passcode
    )
    meeting["shareUrl"] = f"/meet/{code}"
    return meeting


@app.get("/api/meetings/{id_or_code}")
async def get_meeting_endpoint(id_or_code: str):
    """Validates and retrieves meeting information by unique ID or code."""
    cleaned = meeting_utils.normalize_meeting_code(id_or_code)
    meeting = database.get_meeting(cleaned)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found or expired.")
    return meeting


@app.post("/api/meetings/{id_or_code}/token")
@app.post("/api/rooms/{id_or_code}/token")
async def get_room_token(
    id_or_code: str,
    user_id: Optional[str] = Query(None),
    user_name: Optional[str] = Query(None)
):
    """
    Issues media transport tokens (LiveKit SFU token if configured, plus ICE servers).
    """
    cleaned = meeting_utils.normalize_meeting_code(id_or_code)
    uid = user_id or f"usr_{secrets.token_hex(4)}"
    name = user_name or "Participant"
    return livekit_service.get_media_transport_config(cleaned, uid, name)


@app.get("/api/meetings/{id_or_code}/records")
async def get_meeting_records_endpoint(id_or_code: str):
    """Retrieves full persistent meeting records (transcripts, chat, action items, minutes)."""
    cleaned = meeting_utils.normalize_meeting_code(id_or_code)
    meeting = database.get_meeting(cleaned)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found.")
    records = database.get_full_meeting_records(meeting["id"])
    return records or {"detail": "No records found for this meeting."}


@app.post("/api/meetings/{id_or_code}/end")
async def end_meeting_endpoint(id_or_code: str):
    """Marks meeting inactive and broadcasts end notification to connected peers."""
    cleaned = meeting_utils.normalize_meeting_code(id_or_code)
    meeting = database.get_meeting(cleaned)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found.")

    m_id = meeting["id"]
    database.end_meeting(m_id)
    await manager.broadcast(m_id, {
        "type": "room_event",
        "event": "meeting_ended",
        "roomId": m_id,
        "message": "The host has ended this meeting."
    })
    return {"status": "ended", "meetingId": m_id}


@app.delete("/api/meetings/{id_or_code}")
async def delete_meeting_endpoint(id_or_code: str):
    """Deletes all persistent records associated with a meeting."""
    cleaned = meeting_utils.normalize_meeting_code(id_or_code)
    meeting = database.get_meeting(cleaned)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found.")
    database.delete_meeting_records(meeting["id"])
    return {"status": "deleted", "meetingId": meeting["id"]}


# Legacy / room-scoped endpoints (fully preserved and backed by SQLite)
@app.get("/api/rooms/{room_id}/transcript")
async def get_room_transcript(room_id: str):
    validate_id(room_id, "room_id")
    transcripts = manager.get_room_transcripts(room_id)
    return {"roomId": room_id, "transcripts": transcripts}


@app.get("/api/rooms/{room_id}/chat")
async def get_room_chat(room_id: str):
    validate_id(room_id, "room_id")
    return {"roomId": room_id, "chatMessages": database.get_meeting_chat_messages(room_id)}


@app.get("/api/rooms/{room_id}/action-items")
async def get_room_action_items(room_id: str):
    validate_id(room_id, "room_id")
    return {"roomId": room_id, "actionItems": manager.get_room_action_items(room_id)}


@app.post("/api/rooms/{room_id}/action-items")
async def create_action_item_endpoint(room_id: str, item: ActionItemCreate):
    validate_id(room_id, "room_id")
    act = {
        "type": "action_item",
        "id": f"act_{int(time.time() * 1000)}",
        "roomId": room_id,
        "task": item.task.strip(),
        "assignee": (item.assignee or "Team").strip(),
        "priority": item.priority or "medium",
        "dueContext": item.dueContext or "In-Meeting Commitment",
        "completed": bool(item.completed),
        "isDemo": False,
        "timestamp": int(time.time() * 1000)
    }
    manager.add_action_item(room_id, act)
    await manager.broadcast(room_id, act)
    return act


@app.patch("/api/rooms/{room_id}/action-items/{item_id}")
async def update_action_item_endpoint(room_id: str, item_id: str, updates: ActionItemUpdate):
    validate_id(room_id, "room_id")
    validate_id(item_id, "item_id")
    up_dict = {k: v for k, v in updates.model_dump().items() if v is not None}
    updated = manager.update_action_item(room_id, item_id, up_dict)
    if not updated:
        raise HTTPException(status_code=404, detail="Action item not found in this room")
    await manager.broadcast(room_id, {
        "type": "action_item_update",
        "roomId": room_id,
        "id": item_id,
        **up_dict
    })
    return updated


@app.get("/api/rooms/{room_id}/summary")
@app.post("/api/rooms/{room_id}/generate-summary")
async def generate_summary(room_id: str):
    validate_id(room_id, "room_id")
    transcripts = manager.get_room_transcripts(room_id)
    action_items = manager.get_room_action_items(room_id)
    mom = copilot.generate_minutes_of_meeting(room_id, transcripts, action_items)
    # Persist generated minutes
    database.save_meeting_minutes(
        meeting_id=room_id,
        summary=mom["summary"],
        key_decisions=mom["keyDecisions"],
        attendees=mom["participants"],
        utterances_count=mom.get("totalUtterances", len(transcripts))
    )
    return mom


@app.post("/api/rooms/{room_id}/copilot/ask")
async def copilot_ask_endpoint(room_id: str, req: CopilotAskRequest):
    validate_id(room_id, "room_id")
    transcripts = manager.get_room_transcripts(room_id)
    action_items = manager.get_room_action_items(room_id)
    answer = await copilot.answer_copilot_query(
        query=req.query,
        room_id=room_id,
        transcripts=transcripts,
        action_items=action_items
    )
    return {"roomId": room_id, "query": req.query, "answer": answer}


@app.get("/api/rooms/{room_id}/export-markdown")
async def export_markdown(room_id: str):
    validate_id(room_id, "room_id")
    transcripts = manager.get_room_transcripts(room_id)
    action_items = manager.get_room_action_items(room_id)

    mom_data = copilot.generate_minutes_of_meeting(room_id, transcripts, action_items)

    lines = [
        f"# OmniMeet AI: Minutes of Meeting (MoM)",
        f"**Room ID:** `{room_id}`  ",
        f"**Generated:** {mom_data['generatedAt']}  ",
        f"**Participants:** {', '.join(mom_data['participants']) if mom_data['participants'] else 'None recorded'}  ",
        f"**Spoken Languages:** {', '.join(mom_data['languages']) if mom_data['languages'] else 'None recorded'}  ",
        f"> **Notice:** Persisted meeting data. Records are stored in OmniMeet SQLite persistence layer.",
        "\n---\n",
        "## 1. Executive Summary",
        mom_data["summary"],
        "\n---\n",
        "## 2. Key Decisions & Agreements",
    ]

    if not mom_data["keyDecisions"]:
        lines.append("_No decisions or agreements explicitly identified in this session._\n")
    else:
        for dec in mom_data["keyDecisions"]:
            lines.append(f"- [x] {dec}")

    lines.append("\n---\n## 3. Action Items\n")
    if not action_items:
        lines.append("_No action items logged in this session._\n")
    else:
        for item in action_items:
            chk = "[x]" if item.get("completed") else "[ ]"
            prio = item.get("priority", "medium").upper()
            assignee = item.get("assignee", "Team")
            task = item.get("task", "")
            due = item.get("dueContext", "Commitment")
            lines.append(f"- {chk} **[{prio}]** {task} *(Assigned to: @{assignee} | Context: {due})*")

    lines.append("\n---\n## 4. Recorded Dialogue Transcripts\n")
    if not transcripts:
        lines.append("_No dialogue recorded in this room._\n")
    else:
        for t in transcripts:
            ts = time.strftime('%H:%M:%S', time.localtime(t.get("timestamp", 0) / 1000))
            sender = t.get("senderName", "Speaker")
            lang = t.get("sourceLanguage", "auto").upper()
            orig = t.get("originalText", "")
            trans = t.get("translatedText", "")
            lines.append(f"- `[{ts}]` **{sender}** (`{lang}`): {orig}")
            if trans and trans.lower() != orig.lower():
                lines.append(f"  > *Translation:* {trans}")

    return PlainTextResponse(content="\n".join(lines), media_type="text/markdown")


# ==============================================================================
# WebSocket Gateway
# ==============================================================================

@app.websocket("/ws/room/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    # Validate IDs
    if not ID_PATTERN.match(room_id) or not ID_PATTERN.match(user_id):
        await websocket.close(code=4000, reason="Invalid roomId or userId")
        return

    user_name = websocket.query_params.get("name", f"User_{user_id[:4]}")
    language = websocket.query_params.get("lang", "en")
    target_language = websocket.query_params.get("target_lang", "en")

    await manager.connect(room_id, user_id, user_name, language, target_language, websocket)

    try:
        while True:
            raw_text = await websocket.receive_text()
            if len(raw_text) > 2_000_000:
                print(f"[!] Rejected oversized message from {user_id}")
                continue

            try:
                data = json.loads(raw_text)
            except Exception:
                continue

            msg_type = data.get("type")

            # 1. Real-time 16kHz PCM audio chunk ingestion
            if msg_type == "audio_chunk":
                audio_b64 = data.get("audioData")
                if audio_b64 and ai_pipeline:
                    try:
                        raw_pcm = base64.b64decode(audio_b64)
                        result = ai_pipeline.process_pcm_chunk(raw_pcm, user_id)
                        if result:
                            sub_event = {
                                "type": "subtitle_stream",
                                "id": f"sub_{int(time.time() * 1000)}",
                                "roomId": room_id,
                                "senderId": user_id,
                                "senderName": user_name,
                                "sourceLanguage": result["sourceLanguage"],
                                "originalText": result["text"],
                                "isFinal": True,
                                "timestamp": int(time.time() * 1000)
                            }
                            await manager.dispatch_subtitle_to_room(room_id, sub_event)
                    except Exception as e:
                        print(f"[!] PCM processing error: {e}")

            # 2. Text Speech Utterance Dispatch
            elif msg_type == "speech_utterance":
                raw_speech = data.get("text", "").strip()
                if raw_speech:
                    source_l = data.get("sourceLanguage", language)
                    sub_event = {
                        "type": "subtitle_stream",
                        "id": data.get("id") or f"sub_{int(time.time() * 1000)}",
                        "roomId": room_id,
                        "senderId": user_id,
                        "senderName": user_name,
                        "sourceLanguage": source_l,
                        "originalText": raw_speech,
                        "isFinal": True,
                        "timestamp": data.get("timestamp") or int(time.time() * 1000)
                    }
                    await manager.dispatch_subtitle_to_room(room_id, sub_event)

                    # Autonomous action item extraction
                    extracted_action = copilot.extract_action_items_from_text(raw_speech, user_name, room_id)
                    if extracted_action:
                        manager.add_action_item(room_id, extracted_action)
                        await manager.broadcast(room_id, extracted_action)

            # 3. WebRTC Signaling Relays (Mesh Fallback / STUN-TURN)
            elif msg_type in ["webrtc_offer", "webrtc_answer", "webrtc_ice_candidate"]:
                target_id = data.get("targetUserId")
                data["senderId"] = user_id
                data["roomId"] = room_id
                if target_id:
                    await manager.send_to_user(room_id, target_id, data)

            # 4. Peer State Updates (mute, camera, screen sharing, hand raise)
            elif msg_type == "peer_state_update":
                if room_id in manager.rooms and user_id in manager.rooms[room_id]:
                    conn = manager.rooms[room_id][user_id]
                    if "isMuted" in data:
                        conn.is_muted = bool(data["isMuted"])
                    if "isCameraOn" in data:
                        conn.is_camera_on = bool(data["isCameraOn"])
                    if "isScreenSharing" in data:
                        conn.is_screen_sharing = bool(data["isScreenSharing"])
                    if "isHandRaised" in data:
                        conn.is_hand_raised = bool(data["isHandRaised"])
                data["senderId"] = user_id
                data["roomId"] = room_id
                await manager.broadcast(room_id, data, exclude_user_id=user_id)

            # 5. Language setting update
            elif msg_type == "language_update":
                if room_id in manager.rooms and user_id in manager.rooms[room_id]:
                    conn = manager.rooms[room_id][user_id]
                    if "preferredLanguage" in data:
                        conn.language = data["preferredLanguage"]
                    if "targetLanguage" in data:
                        conn.target_language = data["targetLanguage"]
                await manager.broadcast(room_id, {
                    "type": "room_event",
                    "event": "language_switched",
                    "userId": user_id,
                    "preferredLanguage": data.get("preferredLanguage", language),
                    "targetLanguage": data.get("targetLanguage", target_language),
                    "participants": manager.get_participants(room_id),
                    "timestamp": int(time.time() * 1000)
                })

            # 6. Action Items Sync
            elif msg_type == "action_item":
                data["roomId"] = room_id
                if "completed" not in data:
                    data["completed"] = False
                manager.add_action_item(room_id, data)
                await manager.broadcast(room_id, data)

            elif msg_type == "action_item_update":
                item_id = data.get("id")
                if item_id:
                    up_dict = {k: v for k, v in data.items() if k not in ["type", "id", "roomId"]}
                    updated = manager.update_action_item(room_id, item_id, up_dict)
                    if updated:
                        await manager.broadcast(room_id, data)

            elif msg_type == "action_item_delete":
                item_id = data.get("id")
                if item_id and manager.delete_action_item(room_id, item_id):
                    await manager.broadcast(room_id, data)

            # 7. In-meeting Chat Message Relay (Persisted in SQLite)
            elif msg_type == "chat_message":
                msg_text = data.get("message", "").strip()
                if msg_text:
                    ts = data.get("timestamp") or int(time.time() * 1000)
                    msg_id = data.get("id") or f"chat_{ts}"
                    saved_chat = database.save_chat_message(
                        msg_id=msg_id,
                        meeting_id=room_id,
                        sender_id=user_id,
                        sender_name=user_name,
                        message=msg_text,
                        timestamp=ts
                    )
                    payload = {
                        "type": "chat_message",
                        "id": saved_chat["id"],
                        "roomId": room_id,
                        "senderId": user_id,
                        "senderName": user_name,
                        "message": msg_text,
                        "timestamp": ts
                    }
                    await manager.broadcast(room_id, payload)

            # 8. Context-aware Copilot query
            elif msg_type == "copilot_query":
                query = data.get("query", "")
                transcripts = manager.get_room_transcripts(room_id)
                action_items = manager.get_room_action_items(room_id)
                answer_text = await copilot.answer_copilot_query(
                    query=query,
                    room_id=room_id,
                    transcripts=transcripts,
                    action_items=action_items
                )
                await websocket.send_json({
                    "type": "copilot_answer",
                    "roomId": room_id,
                    "query": query,
                    "answer": answer_text,
                    "timestamp": int(time.time() * 1000)
                })

    except WebSocketDisconnect:
        manager.disconnect(room_id, user_id)
        await manager.broadcast(
            room_id,
            {
                "type": "room_event",
                "event": "user_left",
                "userId": user_id,
                "participants": manager.get_participants(room_id),
                "timestamp": int(time.time() * 1000)
            }
        )
    except Exception as e:
        manager.disconnect(room_id, user_id)


# ==============================================================================
# Frontend Static Routing & Meeting URL Resolution
# ==============================================================================

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")
    if (FRONTEND_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="assets")

    @app.get("/")
    async def serve_index():
        return FileResponse(FRONTEND_DIR / "index.html")

    @app.get("/meet/{code}")
    async def serve_meeting_link(code: str):
        """Allows direct joining via /meet/abc-defg-hij URL path."""
        return FileResponse(FRONTEND_DIR / "index.html")

    @app.get("/style.css")
    async def serve_css():
        return FileResponse(FRONTEND_DIR / "style.css", media_type="text/css")

    @app.get("/app.js")
    async def serve_js():
        return FileResponse(FRONTEND_DIR / "app.js", media_type="application/javascript")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
