"""
OmniMeet Database Persistence Module
Implements persistent storage for meetings, transcripts, chat, action items,
and generated Minutes of Meeting (MoM) using SQLite.
"""

import sqlite3
import time
import json
from pathlib import Path
from typing import List, Dict, Any, Optional

DB_PATH = Path(__file__).parent / "omnimeet.db"


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    """Initializes tables and indexes."""
    with get_db_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS meetings (
                id TEXT PRIMARY KEY,
                code TEXT UNIQUE,
                title TEXT NOT NULL,
                created_by TEXT,
                created_at INTEGER NOT NULL,
                ended_at INTEGER,
                is_active INTEGER NOT NULL DEFAULT 1,
                passcode TEXT
            );

            CREATE TABLE IF NOT EXISTS transcripts (
                id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                sender_name TEXT NOT NULL,
                source_lang TEXT DEFAULT 'en',
                target_lang TEXT DEFAULT 'en',
                original_text TEXT NOT NULL,
                translated_text TEXT,
                timestamp INTEGER NOT NULL,
                FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                sender_name TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS action_items (
                id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL,
                task TEXT NOT NULL,
                assignee TEXT,
                priority TEXT DEFAULT 'medium',
                due_context TEXT,
                completed INTEGER DEFAULT 0,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS meeting_minutes (
                meeting_id TEXT PRIMARY KEY,
                summary TEXT NOT NULL,
                key_decisions TEXT,
                attendees TEXT,
                total_utterances INTEGER DEFAULT 0,
                generated_at INTEGER NOT NULL,
                FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_transcripts_meeting ON transcripts(meeting_id);
            CREATE INDEX IF NOT EXISTS idx_chat_meeting ON chat_messages(meeting_id);
            CREATE INDEX IF NOT EXISTS idx_action_items_meeting ON action_items(meeting_id);
        """)


# ==============================================================================
# Meetings CRUD
# ==============================================================================

def create_meeting(meeting_id: str, code: str, title: str, created_by: str = "Host", passcode: Optional[str] = None) -> Dict[str, Any]:
    now = int(time.time() * 1000)
    with get_db_connection() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO meetings (id, code, title, created_by, created_at, is_active, passcode)
            VALUES (?, ?, ?, ?, ?, 1, ?)
        """, (meeting_id, code, title, created_by, now, passcode))
    return {
        "id": meeting_id,
        "code": code,
        "title": title,
        "createdBy": created_by,
        "createdAt": now,
        "isActive": True,
        "hasPasscode": bool(passcode)
    }


def get_meeting(id_or_code: str) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        row = conn.execute("""
            SELECT * FROM meetings WHERE id = ? OR code = ? LIMIT 1
        """, (id_or_code, id_or_code)).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "code": row["code"],
            "title": row["title"],
            "createdBy": row["created_by"],
            "createdAt": row["created_at"],
            "endedAt": row["ended_at"],
            "isActive": bool(row["is_active"]),
            "hasPasscode": bool(row["passcode"])
        }


def end_meeting(meeting_id: str) -> bool:
    now = int(time.time() * 1000)
    with get_db_connection() as conn:
        cur = conn.execute("""
            UPDATE meetings SET is_active = 0, ended_at = ? WHERE id = ?
        """, (now, meeting_id))
        return cur.rowcount > 0


def delete_meeting_records(meeting_id: str) -> bool:
    with get_db_connection() as conn:
        cur = conn.execute("DELETE FROM meetings WHERE id = ?", (meeting_id,))
        return cur.rowcount > 0


# ==============================================================================
# Transcripts CRUD
# ==============================================================================

def save_transcript(
    transcript_id: str,
    meeting_id: str,
    sender_id: str,
    sender_name: str,
    original_text: str,
    translated_text: Optional[str] = None,
    source_lang: str = "en",
    target_lang: str = "en",
    timestamp: Optional[int] = None
) -> Dict[str, Any]:
    ts = timestamp or int(time.time() * 1000)
    with get_db_connection() as conn:
        # Ensure meeting row exists if user joined directly via ID
        conn.execute("""
            INSERT OR IGNORE INTO meetings (id, code, title, created_by, created_at, is_active)
            VALUES (?, ?, ?, 'Participant', ?, 1)
        """, (meeting_id, meeting_id, f"Meeting {meeting_id}", ts))

        conn.execute("""
            INSERT OR REPLACE INTO transcripts (
                id, meeting_id, sender_id, sender_name, source_lang, target_lang,
                original_text, translated_text, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            transcript_id, meeting_id, sender_id, sender_name, source_lang, target_lang,
            original_text, translated_text or original_text, ts
        ))

    return {
        "id": transcript_id,
        "meetingId": meeting_id,
        "senderId": sender_id,
        "senderName": sender_name,
        "sourceLanguage": source_lang,
        "targetLanguage": target_lang,
        "originalText": original_text,
        "translatedText": translated_text or original_text,
        "timestamp": ts
    }


def get_meeting_transcripts(meeting_id: str, limit: int = 150) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        rows = conn.execute("""
            SELECT * FROM transcripts WHERE meeting_id = ? ORDER BY timestamp ASC LIMIT ?
        """, (meeting_id, limit)).fetchall()
        return [
            {
                "id": r["id"],
                "meetingId": r["meeting_id"],
                "senderId": r["sender_id"],
                "senderName": r["sender_name"],
                "sourceLanguage": r["source_lang"],
                "targetLanguage": r["target_lang"],
                "originalText": r["original_text"],
                "translatedText": r["translated_text"],
                "timestamp": r["timestamp"]
            }
            for r in rows
        ]


# ==============================================================================
# Chat Messages CRUD
# ==============================================================================

def save_chat_message(
    msg_id: str,
    meeting_id: str,
    sender_id: str,
    sender_name: str,
    message: str,
    timestamp: Optional[int] = None
) -> Dict[str, Any]:
    ts = timestamp or int(time.time() * 1000)
    with get_db_connection() as conn:
        conn.execute("""
            INSERT OR IGNORE INTO meetings (id, code, title, created_by, created_at, is_active)
            VALUES (?, ?, ?, 'Participant', ?, 1)
        """, (meeting_id, meeting_id, f"Meeting {meeting_id}", ts))

        conn.execute("""
            INSERT OR REPLACE INTO chat_messages (id, meeting_id, sender_id, sender_name, message, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (msg_id, meeting_id, sender_id, sender_name, message, ts))

    return {
        "id": msg_id,
        "meetingId": meeting_id,
        "senderId": sender_id,
        "senderName": sender_name,
        "message": message,
        "timestamp": ts
    }


def get_meeting_chat_messages(meeting_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        rows = conn.execute("""
            SELECT * FROM chat_messages WHERE meeting_id = ? ORDER BY timestamp ASC LIMIT ?
        """, (meeting_id, limit)).fetchall()
        return [
            {
                "id": r["id"],
                "meetingId": r["meeting_id"],
                "senderId": r["sender_id"],
                "senderName": r["sender_name"],
                "message": r["message"],
                "timestamp": r["timestamp"]
            }
            for r in rows
        ]


# ==============================================================================
# Action Items CRUD
# ==============================================================================

def save_action_item(item: Dict[str, Any]) -> Dict[str, Any]:
    now = int(time.time() * 1000)
    meeting_id = item.get("roomId") or item.get("meetingId") or "default-room"
    item_id = item.get("id") or f"act_{now}"
    task = item.get("task", "")
    assignee = item.get("assignee", "Team")
    priority = item.get("priority", "medium")
    due_context = item.get("dueContext", "In-Meeting")
    completed = 1 if item.get("completed") else 0

    with get_db_connection() as conn:
        conn.execute("""
            INSERT OR IGNORE INTO meetings (id, code, title, created_by, created_at, is_active)
            VALUES (?, ?, ?, 'Participant', ?, 1)
        """, (meeting_id, meeting_id, f"Meeting {meeting_id}", now))

        conn.execute("""
            INSERT OR REPLACE INTO action_items (
                id, meeting_id, task, assignee, priority, due_context, completed, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (item_id, meeting_id, task, assignee, priority, due_context, completed, now))

    return {
        "id": item_id,
        "meetingId": meeting_id,
        "task": task,
        "assignee": assignee,
        "priority": priority,
        "dueContext": due_context,
        "completed": bool(completed),
        "createdAt": now
    }


def update_action_item(meeting_id: str, item_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        row = conn.execute("SELECT * FROM action_items WHERE id = ? AND meeting_id = ?", (item_id, meeting_id)).fetchone()
        if not row:
            return None

        task = updates.get("task", row["task"])
        assignee = updates.get("assignee", row["assignee"])
        priority = updates.get("priority", row["priority"])
        completed = (1 if updates["completed"] else 0) if "completed" in updates else row["completed"]

        conn.execute("""
            UPDATE action_items SET task = ?, assignee = ?, priority = ?, completed = ?
            WHERE id = ? AND meeting_id = ?
        """, (task, assignee, priority, completed, item_id, meeting_id))

        return {
            "id": item_id,
            "meetingId": meeting_id,
            "task": task,
            "assignee": assignee,
            "priority": priority,
            "dueContext": row["due_context"],
            "completed": bool(completed),
            "createdAt": row["created_at"]
        }


def delete_action_item(meeting_id: str, item_id: str) -> bool:
    with get_db_connection() as conn:
        cur = conn.execute("DELETE FROM action_items WHERE id = ? AND meeting_id = ?", (item_id, meeting_id))
        return cur.rowcount > 0


def get_meeting_action_items(meeting_id: str) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        rows = conn.execute("""
            SELECT * FROM action_items WHERE meeting_id = ? ORDER BY created_at ASC
        """, (meeting_id,)).fetchall()
        return [
            {
                "id": r["id"],
                "meetingId": r["meeting_id"],
                "task": r["task"],
                "assignee": r["assignee"],
                "priority": r["priority"],
                "dueContext": r["due_context"],
                "completed": bool(r["completed"]),
                "createdAt": r["created_at"]
            }
            for r in rows
        ]


# ==============================================================================
# Meeting Minutes CRUD
# ==============================================================================

def save_meeting_minutes(meeting_id: str, summary: str, key_decisions: List[str], attendees: List[str], utterances_count: int) -> Dict[str, Any]:
    now = int(time.time() * 1000)
    with get_db_connection() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO meeting_minutes (
                meeting_id, summary, key_decisions, attendees, total_utterances, generated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
        """, (
            meeting_id, summary, json.dumps(key_decisions), json.dumps(attendees), utterances_count, now
        ))
    return {
        "meetingId": meeting_id,
        "summary": summary,
        "keyDecisions": key_decisions,
        "attendees": attendees,
        "totalUtterances": utterances_count,
        "generatedAt": now
    }


def get_meeting_minutes(meeting_id: str) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        row = conn.execute("SELECT * FROM meeting_minutes WHERE meeting_id = ?", (meeting_id,)).fetchone()
        if not row:
            return None
        return {
            "meetingId": row["meeting_id"],
            "summary": row["summary"],
            "keyDecisions": json.loads(row["key_decisions"] or "[]"),
            "attendees": json.loads(row["attendees"] or "[]"),
            "totalUtterances": row["total_utterances"],
            "generatedAt": row["generated_at"]
        }


def get_full_meeting_records(meeting_id: str) -> Optional[Dict[str, Any]]:
    meeting = get_meeting(meeting_id)
    if not meeting:
        return None
    return {
        "meeting": meeting,
        "transcripts": get_meeting_transcripts(meeting_id),
        "chatMessages": get_meeting_chat_messages(meeting_id),
        "actionItems": get_meeting_action_items(meeting_id),
        "minutes": get_meeting_minutes(meeting_id)
    }

# Initialize database on module load
init_db()
