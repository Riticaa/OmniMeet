# OmniMeet AI (PolyGlotMeet + OmniCopilot)

> **Ultra-Low-Latency Multilingual Video Conferencing Platform with Synchronized Cross-Language Subtitle Synthesis and Autonomous In-Meeting Intelligence Copilot.**

---

## 📌 Executive Summary

Conventional video conferencing tools (Zoom, Google Meet, Microsoft Teams) either offer delayed, monolingual transcription or require third-party paid extensions with significant latency ($>3{-}5$ seconds). In multilingual cross-border meetings, participants cannot follow along in real time. Furthermore, note-taking and action item tracking remain largely manual and error-prone.

**OmniMeet AI** solves both challenges concurrently through a unified streaming pipeline:
1. **Real-Time Cross-Language Subtitles (<800ms Latency):** Sub-second Voice Activity Detection (Silero VAD), quantized streaming speech-to-text (Faster-Whisper CTranslate2 INT8), and neural translation (NLLB-200 / MarianMT) project synchronized subtitles directly over each speaker's video tile.
2. **Autonomous Meeting Copilot:** Uses the continuous transcript stream to automatically extract action items, assignees, deadlines, and generate structured Minutes of the Meeting (MoM).

---

## 🏗️ System Architecture

```
[User A (Speaks Hindi / Spanish / French)]
                   │ (16kHz PCM Audio Chunks via Web Audio API)
                   ▼
       [FastAPI WebSocket Gateway]
                   │
                   ├──► [Silero VAD Filter] (Filters silence <10ms)
                   │             │
                   │             ▼
                   │    [Faster-Whisper (CTranslate2 INT8)]
                   │             │
                   │             ▼
                   │    [Neural Machine Translation (MarianMT/NLLB)]
                   │             │
                   ├──◄──────────┘ (SubtitleStreamPayload event)
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                      OmniMeet UI Clients                    │
├──────────────────────────────┬──────────────────────────────┤
│  Video Tiles Subtitle Overlay │  In-Meeting Copilot Sidebar  │
│  - Live Hindi / Spanish text  │  - Live Diarized Transcript  │
│  - Synchronized English subs  │  - Auto-extracted Action Items│
│  - Active speaker glow ring   │  - Instant AI Meeting Q&A    │
└──────────────────────────────┴──────────────────────────────┘
```

---

## 📂 Repository Structure

```text
OmniMeet/
├── contracts/
│   └── websocket_events.json        # Shared JSON Schema for streaming events
├── backend-gateway/
│   ├── requirements.txt             # FastAPI, websockets, uvicorn, pydantic
│   ├── main.py                      # WebSocket hub, room manager & event broadcaster
│   └── mock_streamer.py             # Multilingual conversational stream simulator
├── ai-services/
│   ├── requirements.txt             # faster-whisper, silero-vad, ctranslate2, torch
│   ├── vad_engine.py                # Silero VAD + Adaptive energy thresholding
│   ├── asr_engine.py                # Faster-Whisper (INT8 quantized inference)
│   ├── translator_engine.py         # Multi-language NMT translation engine
│   ├── pipeline.py                  # End-to-end streaming audio chunk pipeline
│   └── test_mic_cli.py              # Standalone microphone capture & pipeline test CLI
├── frontend/
│   ├── index.html                   # Glassmorphism dark-mode meeting room UI
│   ├── style.css                    # Responsive layout, animations & glowing accents
│   └── app.js                       # Web Audio API 16kHz PCM streamer & WebSocket handler
└── README.md                        # Master documentation
```

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- **Python:** 3.10, 3.11, 3.12, or 3.13
- **Node.js / Modern Browser:** Chrome, Edge, Firefox, or Safari

### 2. Start the Backend Gateway
```bash
cd backend-gateway
pip install -r requirements.txt
python main.py
```
*The gateway starts on `http://localhost:8000`.*

### 3. Open the Meeting Room
Navigate to **`http://localhost:8000`** in your browser.
- **Multilingual Demo Simulation:** Click the glowing **"Run Multilingual Demo"** button on the top right to watch simulated Hindi and Spanish speakers converse with live animated subtitles and auto-extracted action items!
- **Local Microphone Mode:** Unmute your microphone to stream real 16kHz PCM audio to the backend gateway.
- **Camera Stream:** Toggle your webcam on to preview your video tile.

### 4. Test the AI Inference Engine Locally (Optional)
```bash
cd ai-services
pip install -r requirements.txt
python test_mic_cli.py en
```
*Speak into your laptop microphone in Hindi, Spanish, or English to verify real-time speech transcription and translation speed.*

### 5. Run the Streaming Mock Generator
In a separate terminal window while the backend is running:
```bash
python backend-gateway/mock_streamer.py
```

---

## 👥 Sub-Team Roles & Task Breakdown

| Sub-Team | Assigned Modules | Deliverables |
| :--- | :--- | :--- |
| **Team A: Low-Latency AI & Speech** | `ai-services/` | Quantized Faster-Whisper, Silero VAD tuning, sub-500ms sliding-window buffer optimization. |
| **Team B: Network Gateway & Systems** | `backend-gateway/`, `contracts/` | FastAPI WebSockets, room state persistence, latency benchmarking, WebRTC signaling mesh. |
| **Team C: Frontend & User Experience** | `frontend/` | Web Audio API 16kHz resampler, subtitle rendering overlays, audio level meters, MoM export. |
| **Team D: Copilot & RAG Engine** | `backend-gateway/`, `ai-services/` | Diarization clustering, LLM structured action item extraction, downloadable meeting summaries. |

---

## 📄 License
Academic & Open Source Project for Capstone Exhibition.
