"""
OmniCopilot Engine for OmniMeet AI
Provides context-aware meeting Q&A, automated action item extraction,
and structured Minutes of Meeting (MoM) synthesis.
"""

import os
import re
import time
from typing import List, Dict, Any, Optional
from pathlib import Path
from dotenv import load_dotenv

# Load .env variables
load_dotenv()
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

# Optional Gemini API client integration
try:
    from google import genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False


class OmniCopilotEngine:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        self.client = None
        if GEMINI_AVAILABLE and self.api_key:
            try:
                self.client = genai.Client(api_key=self.api_key)
                print("[OK] OmniCopilot: Gemini API client initialized successfully.")
            except Exception as e:
                print(f"[!] OmniCopilot: Gemini init deferred ({e}). Using local engine.")

    def extract_action_items_from_text(
        self, text: str, speaker_name: str, room_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Detects commitment, responsibility, or deadlines in spoken text.
        """
        if not text:
            return None

        lower = text.lower()
        triggers = [
            "will do", "will prepare", "will complete", "will document", "will share",
            "i will", "we will", "need to", "action item", "todo", "take care of",
            "make sure to", "assigned to", "by today", "by tomorrow", "by 6 pm",
            "shall ensure", "follow up on"
        ]

        if not any(t in lower for t in triggers):
            return None

        # Determine priority
        priority = "medium"
        if any(w in lower for w in ["urgent", "asap", "critical", "immediately", "today"]):
            priority = "high"
        elif any(w in lower for w in ["later", "low priority", "eventually", "optional"]):
            priority = "low"

        # Extract due date context if present
        due_match = re.search(r"(by\s+(?:today|tomorrow|\d{1,2}(?::\d{2})?\s*(?:am|pm)?|[a-zA-Z]+day))", lower)
        due_context = due_match.group(1) if due_match else "In-Meeting Commitment"

        return {
            "type": "action_item",
            "id": f"act_{int(time.time() * 1000)}",
            "roomId": room_id,
            "task": text.strip(),
            "assignee": speaker_name,
            "priority": priority,
            "dueContext": due_context,
            "sourceQuote": text.strip(),
            "completed": False,
            "isDemo": False,
            "timestamp": int(time.time() * 1000)
        }

    async def answer_copilot_query(
        self, query: str, room_id: str, transcripts: List[Dict[str, Any]], action_items: List[Dict[str, Any]]
    ) -> str:
        """
        Answers user inquiries based on the live meeting transcript history.
        Does not fabricate facts or invent decisions when no data exists.
        """
        if not transcripts and not action_items:
            return "OmniCopilot: No dialogue or action items have been recorded in this meeting room yet. As participants speak, transcripts and key discussions will appear here."

        # Refresh Gemini client if available and key configured
        if not self.client and GEMINI_AVAILABLE:
            api_key = os.environ.get("GEMINI_API_KEY")
            if api_key and api_key != "your_gemini_api_key_here":
                try:
                    self.client = genai.Client(api_key=api_key)
                except Exception:
                    pass

        # Format actual transcript context
        context_lines = []
        for t in transcripts[-30:]:  # Last 30 utterances
            spk = t.get("senderName", "Speaker")
            orig = t.get("originalText", "")
            trans = t.get("translatedText", orig)
            lang = t.get("sourceLanguage", "en").upper()
            context_lines.append(f"{spk} ({lang}): {trans}")
        transcript_context = "\n".join(context_lines)

        # 1. Try Gemini API if available with strict ground-truth prompt
        if self.client and transcript_context:
            try:
                prompt = (
                    "You are OmniMeet Copilot, an autonomous AI assistant embedded in a live video conference.\n"
                    "Answer the user's question concisely, helpfully, and professionally using ONLY the actual live meeting transcript below.\n"
                    "If the answer or information cannot be determined from the transcript, state clearly that it was not discussed in this meeting.\n"
                    "Do NOT make up any dates, decisions, attendees, or details that are not in the transcript.\n\n"
                    f"--- MEETING CONTEXT (Room: {room_id}) ---\n{transcript_context}\n\n"
                    f"--- USER QUESTION ---\n{query}\n\n"
                    "Provide a direct, honest answer in 2-3 sentences based strictly on the transcript."
                )
                for model_candidate in ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"]:
                    try:
                        response = self.client.models.generate_content(
                            model=model_candidate,
                            contents=prompt
                        )
                        if response and response.text:
                            return f"OmniCopilot (Gemini): {response.text.strip()}"
                    except Exception:
                        continue
            except Exception as e:
                print(f"[!] Gemini query generation notice: {e}")

        # 2. Honest Local Heuristic Search
        q_lower = query.lower()

        # Handle Action Item questions
        if any(w in q_lower for w in ["action", "todo", "task"]):
            if action_items:
                items_str = "\n".join([
                    f"• [{'DONE' if a.get('completed') else a.get('priority', 'medium').upper()}] {a['task']} (Assigned to @{a.get('assignee', 'Team')})"
                    for a in action_items[-6:]
                ])
                return f"OmniCopilot: Identified {len(action_items)} action item(s) in this room:\n{items_str}"
            return "OmniCopilot: No action items have been recorded in this meeting room yet."

        # Handle Speaker / Participant questions
        if any(w in q_lower for w in ["who", "speaker", "participant", "attendee"]):
            speakers = list({t.get("senderName", "Participant") for t in transcripts if t.get("senderName")})
            if speakers:
                return f"OmniCopilot: Recorded speakers in this room: {', '.join(speakers)}."
            return "OmniCopilot: No speaker utterances have been recorded yet."

        # Handle Decisions questions
        if any(w in q_lower for w in ["decision", "agreed", "decided"]):
            decision_matches = [
                line for line in context_lines
                if any(k in line.lower() for k in ["agreed", "decided", "will launch", "confirmed", "conclusion", "approved"])
            ]
            if decision_matches:
                return "OmniCopilot: Relevant agreements from dialogue:\n• " + "\n• ".join(decision_matches[-3:])
            return "OmniCopilot: No explicit decisions or agreements have been identified in the recorded dialogue so far."

        # Search matching transcript sentences
        query_words = [w for w in re.findall(r"\w+", q_lower) if len(w) > 3 and w not in ["what", "when", "where", "about", "this", "that", "meeting", "have"]]
        if query_words and context_lines:
            matching_lines = [line for line in context_lines if any(w in line.lower() for w in query_words)]
            if matching_lines:
                return f"OmniCopilot: Relevant dialogue found:\n\"{matching_lines[-1]}\""

        if transcripts:
            speakers = list({t.get("senderName", "Participant") for t in transcripts})
            return f"OmniCopilot: Searched {len(transcripts)} utterance(s) from {len(speakers)} participant(s), but could not find information regarding '{query}' in the recorded discussion."

        return "OmniCopilot: No dialogue has been recorded in this meeting room yet."

    def generate_minutes_of_meeting(
        self, room_id: str, transcripts: List[Dict[str, Any]], action_items: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Generates structured MoM based strictly on recorded meeting data.
        Does not fabricate decisions or attendees.
        """
        if not transcripts and not action_items:
            return {
                "roomId": room_id,
                "title": f"OmniMeet Meeting Minutes — Room {room_id}",
                "summary": "No meeting dialogue or action items recorded in this room yet.",
                "participants": [],
                "languages": [],
                "keyDecisions": [],
                "actionItems": [],
                "totalUtterances": 0,
                "generatedAt": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
            }

        speakers = sorted(list({t.get("senderName", "Participant") for t in transcripts if t.get("senderName")}))
        languages = sorted(list({t.get("sourceLanguage", "en").upper() for t in transcripts if t.get("sourceLanguage")}))

        summary_text = ""
        key_decisions = []

        # Try Gemini API for MoM synthesis if available
        if self.client and transcripts:
            try:
                transcript_text = "\n".join([
                    f"{t.get('senderName', 'Speaker')}: {t.get('translatedText') or t.get('originalText')}"
                    for t in transcripts[-40:]
                ])
                prompt = (
                    "You are OmniMeet MoM Synthesizer. Based strictly on the meeting dialogue below, generate:\n"
                    "1. A concise 2-sentence executive summary of what was actually discussed.\n"
                    "2. A bullet list of any key decisions explicitly made (or write 'None' if none were made).\n\n"
                    f"--- TRANSCRIPT ---\n{transcript_text}\n\n"
                    "Format:\nSUMMARY: <summary>\nDECISIONS:\n- <decision 1>"
                )
                for model_candidate in ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-flash-latest"]:
                    try:
                        res = self.client.models.generate_content(
                            model=model_candidate,
                            contents=prompt
                        )
                        if res and res.text:
                            text = res.text.strip()
                            if "SUMMARY:" in text:
                                parts = text.split("DECISIONS:")
                                summary_part = parts[0].replace("SUMMARY:", "").strip()
                                if summary_part:
                                    summary_text = summary_part
                                if len(parts) > 1:
                                    for line in parts[1].split("\n"):
                                        line = line.strip().lstrip("-•* ").strip()
                                        if line and line.lower() != "none":
                                            key_decisions.append(line)
                            break
                    except Exception:
                        continue
            except Exception as e:
                print(f"[!] Gemini MoM generation notice: {e}")

        # Local fallback if Gemini was not available or produced nothing
        if not summary_text:
            if transcripts:
                summary_text = (
                    f"Multilingual session in Room '{room_id}' with {len(speakers)} participant(s) "
                    f"({', '.join(speakers) if speakers else 'None'}) using {', '.join(languages) if languages else 'multilingual speech'}. "
                    f"A total of {len(transcripts)} utterance(s) were captured and processed."
                )
            else:
                summary_text = f"Session in Room '{room_id}' with {len(action_items)} action item(s) logged."

        if not key_decisions and transcripts:
            # Heuristic detection of explicit agreements in actual utterances
            for t in transcripts:
                text = (t.get("translatedText") or t.get("originalText") or "").strip()
                if any(w in text.lower() for w in ["we agreed", "agreed that", "decided to", "confirmed that", "approved"]):
                    key_decisions.append(f"{t.get('senderName', 'Team')}: {text}")

        return {
            "roomId": room_id,
            "title": f"OmniMeet Meeting Minutes — Room {room_id}",
            "summary": summary_text,
            "participants": speakers,
            "languages": languages,
            "keyDecisions": key_decisions,
            "actionItems": action_items,
            "totalUtterances": len(transcripts),
            "generatedAt": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
        }

