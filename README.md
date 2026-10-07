# OmniMeet AI — Multilingual Video Meetings & Meeting Intelligence

> **Real-time multilingual video conferencing web application inspired by Google Meet's core flow, featuring unique shareable meeting codes, pre-join audio/video preview, LiveKit SFU & WebRTC P2P mesh media transport, live cross-language subtitles, persistent room-scoped chat, action items, and grounded AI meeting copilot.**

---

## 📌 Architecture & Design Choices

OmniMeet provides real-time cross-language communication and grounded meeting intelligence without fabricating room data or misleading users with fake cloud integrations.

```
                  ┌──────────────────────────────────────────────┐
                  │           Browser A (Alex Morgan)            │
                  │  - Camera Preview & Audio Level Meter        │
                  │  - Live Subtitles (EN Spoken -> ES Subtitles)│
                  │  - In-Meeting Chat & Action Items Drawer     │
                  └──────────────┬───────────────────────────────┘
                                 │
           ┌─────────────────────┴─────────────────────┐
           ▼                                           ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────┐
│     FastAPI Gateway (Port 8000) │   │     LiveKit SFU / P2P Mesh      │
│  - SQLite WAL Database          │   │  - Selective Forwarding Unit    │
│  - REST & WebSocket Signaling   │   │  - Audio & Video Media Tracks   │
│  - Dynamic Subtitle Router      │   │  - Screen Sharing Streaming     │
│  - Gemini 3.5 Flash Copilot     │   │  - STUN / TURN NAT Traversal    │
└────────────────┬────────────────┘   └────────────────┬────────────────┘
                 │                                     │
           ┌─────┴─────────────────────────────────────┘
           ▼
┌──────────────────────────────────────────────┐
│           Browser B (Sofia Martinez)         │
│  - Remote Video Tile & Active Speaker Wave   │
│  - Live Subtitles (ES Spoken -> EN Subtitles)│
│  - Persistent Meeting Records Review         │
└──────────────────────────────────────────────┘
```

### Core Architecture Components
1. **Meeting Creation & URL Routing:**
   - Every new meeting generates a cryptographically random meeting ID (`mtg-xxxx-yyyy`) and a human-friendly Google Meet–style code (`xxx-yyyy-zzz`).
   - Shareable URLs (`/meet/{code}` or `?room={code}`) allow one-click joining.
   - Code validation endpoint (`GET /api/meetings/{id_or_code}`) verifies active rooms and maps friendly codes to persistent meeting records.
2. **Pre-Join Screen ("Green Room"):**
   - Live camera preview and microphone test.
   - Real-time audio signal visualizer meter driven by Web Audio `AnalyserNode`.
   - Audio output test chime 🔔 to verify speakers before entering.
   - Device selector for cameras and microphones.
   - Spoken language and subtitle translation target selection.
3. **Multi-User Real-Time Audio & Video:**
   - **SFU Transport Mode:** Integrates LiveKit SFU client SDK with server-side JWT authentication (`/api/meetings/{id}/token`).
   - **WebRTC P2P Mesh Fallback:** Standard browser `RTCPeerConnection` mesh with Google public STUN (`stun:stun.l.google.com:19302`) and optional TURN credentials.
   - Live camera toggle, mic mute, screen sharing with automatic camera track restoration, and active speaker detection.
4. **Multilingual Subtitles & Translation:**
   - Speech pipeline with Faster-Whisper (INT8 quantized) or browser Web Speech API.
   - Real-time cross-language translation routed individually to each participant's target language.
   - Bilingual display toggle (original + translated).
5. **In-Meeting Chat & Collaborative Tasks:**
   - Room-scoped persistent chat saved directly to SQLite.
   - Synchronized action items with task description, assignee, priority, and real-time completion state.
6. **Grounded AI Copilot & Meeting Minutes:**
   - OmniCopilot powered by Google Gemini (`gemini-3.5-flash`), strictly grounded in the meeting's real recorded dialogue. If evidence is lacking, it explicitly states so.
   - Export Minutes of Meeting (.md) with genuine attendee lists, action items, and dialogue.
7. **Persistence & Lifecycle:**
   - SQLite database (`omnimeet.db`) in WAL mode survives gateway restarts.
   - Full post-meeting archive review (`GET /api/meetings/{id}/records`).

---

## 🛠️ Configuration & Environment Variables

Copy `.env.example` to create your local `.env`:
```bash
cp .env.example backend-gateway/.env
```

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Gateway HTTP & WebSocket port | `8000` |
| `HOST` | Bind host address | `0.0.0.0` |
| `SQLITE_DB_PATH` | Path to persistent SQLite database | `omnimeet.db` |
| `GEMINI_API_KEY` | Google Gemini API key for meeting summaries & Copilot | *Optional (Falls back to local search)* |
| `GEMINI_MODEL` | Gemini model name | `gemini-3.5-flash` |
| `MEDIA_TRANSPORT_MODE` | Media transport mode: `sfu` or `mesh` | `mesh` |
| `LIVEKIT_URL` | LiveKit SFU server WebSocket URL | `ws://localhost:7880` |
| `LIVEKIT_API_KEY` | LiveKit API Key for JWT tokens | `devkey` |
| `LIVEKIT_API_SECRET` | LiveKit API Secret for JWT tokens | `secret` |
| `STUN_SERVER_1` | Primary STUN server | `stun:stun.l.google.com:19302` |
| `STUN_SERVER_2` | Secondary STUN server | `stun:stun1.l.google.com:19302` |
| `TURN_SERVER_URL` | Optional TURN server URL (RFC 5766) | *None* |
| `TURN_USERNAME` | TURN username | *None* |
| `TURN_CREDENTIAL` | TURN password / credential | *None* |

> **Security Note:** Secrets like `GEMINI_API_KEY` and TURN credentials are kept strictly out of source control. Never commit `.env` files.

---

## 🚀 Running OmniMeet Locally

### Quick Start (Local Python)

1. **Install dependencies:**
   ```bash
   cd backend-gateway
   pip install -r requirements.txt
   ```

2. **Run the gateway:**
   ```bash
   python main.py
   ```
   Or:
   ```bash
   python -m uvicorn main:app --host 0.0.0.0 --port 8000
   ```

3. **Open the application:**
   Navigate to `http://localhost:8000` in your browser.

### Docker Compose Setup (with LiveKit SFU)

To run both OmniMeet Gateway and a local LiveKit SFU server:
```bash
docker-compose up --build
```
This starts:
- OmniMeet Gateway on `http://localhost:8000`
- LiveKit SFU Server on `http://localhost:7880` (signaling) and `7882/udp` (media)

---

## 🧪 Testing & Verification

Run the automated test suite covering meeting creation, code validation, SQLite persistence, chat persistence, and ICE configuration:

```bash
cd backend-gateway
pytest tests/test_omnimeet.py -v
```

All 13 test suites execute and pass deterministically.

---

## 📱 User Workflow Walkthrough

1. **Landing Screen:**
   - Enter your display name and spoken language.
   - Click **"New meeting"** to generate a unique code (e.g. `abc-defg-hij`) and shareable link.
   - Or paste a code or link into **"Enter a code or link"** and click **Join**.
2. **Pre-Join Green Room:**
   - Check your camera video and speak to see the live audio level meter.
   - Toggle microphone or camera off if desired.
   - Click **"Join now"** or **"Present"** to join and immediately share your screen.
3. **In-Meeting Call:**
   - Top header displays the unique meeting code, active transport pill, participant count, and call duration.
   - Bottom dock controls for Mic, Camera, Screen Sharing, Raise Hand, Captions, Chat, Copilot, and Leave.
   - Subtitles stream in real time with speaker attribution and translation.
   - In-meeting Chat messages are synchronized and saved to the meeting database.
4. **Leave & Meeting Archive:**
   - Click **"Leave"** to exit the room safely.
   - On the post-meeting screen, click **"View meeting records & notes"** to review persistent transcripts, chat history, action items, and export a Markdown MoM document.
