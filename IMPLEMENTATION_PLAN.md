# OmniMeet AI — Milestone Implementation Plan: Small-Meeting Prototype

> **Objective:** Deliver an honest, functional small-meeting prototype for real-time multilingual communication, peer-to-peer WebRTC media sharing, and grounded meeting intelligence. Remove misleading simulated authentication and fabricated meeting content, and make transcripts, action items, summaries, and exports reflect actual room activity.

---

## 📌 Prototype Scope & Boundaries

### Included in this Milestone
1. **Local / Guest Profile Entry:** Transparent local entry flow without simulated Google/OAuth sign-in. Users choose a display name, room ID, spoken language, and subtitle target language.
2. **Actual Room Data as Source of Truth:**
   - Rooms start empty (`transcripts: []`, `action_items: []`).
   - Dialogue utterances captured via Web Speech API or local Faster-Whisper are recorded once and broadcast to room participants without duplicating the sender's entry.
   - Interactive action items maintain completion state across participants.
   - Meeting summaries, decisions, and exported Minutes of Meeting (MoM) derive strictly from recorded room transcripts.
3. **Explicitly Isolated Demo Mode:**
   - Multilingual simulated conversation is gated behind an explicit **"Demo"** action.
   - Demo content is marked with `[DEMO]` tags, isolated from real room data, and clearable via a "Clear Demo" button.
4. **Peer-to-Peer WebRTC Media Mesh:**
   - Browser `RTCPeerConnection` mesh with Google public STUN for audio, video, and screen sharing across 2–4 peers.
   - Signaling relayed over the FastAPI WebSocket hub.
5. **Per-Participant Subtitle Translation Routing:**
   - Subtitles translated and routed according to each connected peer's chosen target language.
6. **Honest UI Controls:**
   - Every visible control (mic, camera, screen share, hand raise, live transcript search, action item modals, export, dark/light theme) performs its advertised behavior.

### Outside this Milestone (Explicitly Excluded)
- **Database Persistence:** All room transcripts and action items are held in gateway memory during runtime and reset upon gateway restart.
- **TURN Relay Server:** Uses public STUN (`stun:stun.l.google.com:19302`). Symmetric NAT traversal requires a dedicated TURN server (e.g. coturn).
- **SFU / MCU Media Architecture:** Direct mesh is suited for small meetings (2–4 participants). Scaling beyond 4–6 participants requires an SFU (e.g. LiveKit or mediasoup).
- **Third-Party Authentication:** Real OAuth providers are omitted in favor of local guest profiles.

---

## 🏗️ Architecture & Data Flow

```
[Browser Client A]                         [Browser Client B]
   │    ▲                                     ▲    │
   │    │          WebRTC P2P Media Mesh      │    │
   │    └─────────────────────────────────────┘    │
   │          (Camera, Mic, Screen Share)          │
   │                                               │
   ▼ (Audio PCM / Subtitles / Signaling)           ▼
┌────────────────────────────────────────────────────────┐
│               FastAPI Gateway (Port 8000)              │
│  - WebSocket Signaling Hub (Offer, Answer, ICE)        │
│  - Per-User Target Language Translation Dispatcher     │
│  - In-Memory Canonical Room State (Transcripts & Tasks)│
│  - OmniCopilot (Gemini API or Local Grounded Search)   │
└────────────────────────────────────────────────────────┘
```

---

## 🛠️ Configuration & Secrets Management

- Secrets (such as `GEMINI_API_KEY`) are kept strictly in local `.env` files ignored by `.gitignore`.
- Template files `.env.example` and `backend-gateway/.env.example` contain only placeholder documentation.
- CORS is restricted to configured origins (`CORS_ORIGINS`).

---

## 🚀 Startup & Execution Steps

### 1. Gateway Startup
```bash
cd backend-gateway
pip install -r requirements.txt
python main.py
```
*Runs on `http://localhost:8000`.*

### 2. Joining & Testing
1. Navigate to `http://localhost:8000`.
2. Fill in display name and room ID, then join.
3. Open a second tab or window at `http://localhost:8000` with the same room ID to verify WebRTC P2P mesh calling.
