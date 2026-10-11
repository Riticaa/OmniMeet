# OmniMeet

OmniMeet is a browser-based meeting application with shareable meeting codes, real-time audio/video, room chat, captions and translation, collaborative action items, meeting records, and an AI copilot.

This guide covers the current architecture, local setup, environment configuration, and deployment to Render. The web app and signaling API run together as one FastAPI service. For reliable calls between people on different networks, use a public LiveKit server such as LiveKit Cloud; the local Docker Compose LiveKit server is for development.

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Run locally](#run-locally)
- [Configuration](#configuration)
- [Deploy to Render](#deploy-to-render)
- [Limitations and production notes](#limitations-and-production-notes)
- [Troubleshooting](#troubleshooting)

## Features

- Create a meeting with a unique ID and human-friendly code, then share its URL.
- Join a meeting with a code or link and preview camera and microphone before joining.
- Use LiveKit SFU media or the WebRTC mesh fallback.
- Use in-meeting chat and room-scoped action items.
- View meeting records, including saved chat, transcripts, and action items.
- Use browser speech recognition or the optional local speech pipeline for captions; translation and the Gemini-powered copilot depend on the configured services and keys.

Feature availability depends on browser support, device permissions, network connectivity, and optional service credentials. A local installation is not publicly reachable by invitees unless it is exposed through a hosting provider or secure tunnel.

## Architecture

| Component | Purpose |
| --- | --- |
| Frontend | HTML, CSS, and JavaScript served by the gateway |
| Gateway | FastAPI REST and WebSocket endpoints for meetings, signaling, chat, and records |
| Database | SQLite storage for meeting records, chat, transcripts, and action items |
| Media | LiveKit SFU for cloud calls; WebRTC mesh fallback for small/local sessions |
| Optional AI | Gemini API for copilot features; local Faster-Whisper pipeline can be enabled for speech recognition |

## Requirements

### For local development

- Python 3.11 or newer
- pip and a modern browser (Chrome, Edge, or Firefox recommended)
- A microphone and camera for audio/video features
- Docker Desktop only if using the Docker Compose setup

### For hosted meetings

- A GitHub repository connected to Render
- A LiveKit Cloud project (or another publicly reachable LiveKit deployment) with its WebSocket URL, API key, and API secret
- Optional: a Gemini API key for hosted copilot responses
- A Render paid web-service plan for the persistent disk configured in the Blueprint

## Run locally

### Python setup

From the repository root, create an environment and install gateway requirements:

```bash
python -m venv .venv
# Windows PowerShell
.venv\Scripts\python -m pip install -r backend-gateway/requirements.txt
# macOS/Linux: .venv/bin/python -m pip install -r backend-gateway/requirements.txt
```

Start the gateway:

```bash
# Windows PowerShell
.venv\Scripts\python -m uvicorn main:app --app-dir backend-gateway --host 127.0.0.1 --port 8000
# macOS/Linux: .venv/bin/python -m uvicorn main:app --app-dir backend-gateway --host 127.0.0.1 --port 8000
```

Open [http://localhost:8000](http://localhost:8000). Do not open `frontend/index.html` as a file; meeting features require the gateway. On Windows, `run_omnimeet.bat` can start the local service.

### Docker Compose with local LiveKit

```bash
docker compose up --build
```

The gateway is available at `http://localhost:8000`; the local LiveKit service is available to the local development stack. The local LiveKit address is not usable by people outside your machine or Docker network.

## Configuration

Set environment variables in a local `.env` file (copy `.env.example` as a starting point). Never commit real secrets.

| Variable | Purpose | Local default / note |
| --- | --- | --- |
| `PORT` | HTTP and WebSocket listening port | `8000`; Render provides its own port |
| `HOST` | Address the gateway binds to | `0.0.0.0` |
| `SQLITE_DB_PATH` | SQLite database file path | Project database by default; Render uses `/app/data/omnimeet.db` |
| `PUBLIC_APP_URL` | Public origin used in meeting invite links | Optional; Render falls back to its service URL |
| `MEDIA_TRANSPORT_MODE` | Select media transport | `mesh` locally; `sfu` on Render |
| `LIVEKIT_URL` | LiveKit signaling WebSocket URL | Local Docker URL for local stack; public `wss://` URL when hosted |
| `LIVEKIT_API_KEY` | LiveKit API key used to issue room tokens | Keep secret outside source control |
| `LIVEKIT_API_SECRET` | LiveKit signing secret | Keep secret outside source control |
| `GEMINI_API_KEY` | Optional Gemini copilot key | Omit to use the available fallback behavior |
| `GEMINI_MODEL` | Gemini model name | `gemini-3.5-flash` |
| `GOOGLE_TRANSLATE_API_KEY` | Google Cloud Translation Basic API key | Required for dependable hosted translation; configure only on the server |
| `TURN_SERVER_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | Optional TURN credentials for mesh fallback | Configure only with a TURN provider |

The full variable template is in `.env.example`. Keep production values in Render's environment-variable settings, not in GitHub.

### Enable translated subtitles

For real translated captions, create a Google Cloud project, enable the Cloud Translation API, configure billing, and create an API key restricted to that API. Set `GOOGLE_TRANSLATE_API_KEY` in your local `.env` file or the Render service's environment settings. The key is used by the gateway and is never sent to meeting participants' browsers. Without a provider key or network access, OmniMeet still shows the source caption and marks the translation as unavailable. See Google's [Cloud Translation setup](https://cloud.google.com/translate/docs/setup) and [API authentication guide](https://cloud.google.com/translate/docs/authentication).

## Deploy to Render

The repository includes `render.yaml`, a Render Blueprint for one Docker web service in the Singapore region. It mounts a 1 GB persistent disk at `/app/data` for the SQLite database. Render assigns a public HTTPS URL, which the app uses when generating share links.

1. Push the project, including `render.yaml`, to a GitHub repository.
2. In Render, create a **New Blueprint Instance** and select that repository and branch.
3. Provide `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` when Render prompts for the Blueprint secrets. To enable translated captions, also provide `GOOGLE_TRANSLATE_API_KEY`. Use the public `wss://` URL from LiveKit Cloud; do not use the local Docker hostname.
4. Deploy and wait for the `/health` check to pass. Open the assigned `https://<service-name>.onrender.com` URL, create a meeting, then share that meeting's generated URL.
5. Optionally set `GEMINI_API_KEY` in the Render service settings. For a custom domain, configure it in Render and set `PUBLIC_APP_URL` to its HTTPS origin.

The gateway handles web traffic and signaling; browsers connect to LiveKit separately for media. Render supports web-service WebSockets. A persistent disk is limited to one service instance and prevents horizontal scaling, so this SQLite setup is intended for a small deployment. Review Render's [Blueprint](https://render.com/docs/blueprint-spec), [disk](https://render.com/docs/disks), and [WebSocket](https://render.com/docs/websocket) documentation and current pricing before deployment.

## Limitations and production notes

- **Network reachability:** LiveKit Cloud or another public SFU/TURN-capable service is needed for reliable media across different networks. Device permissions, unsupported browsers, or restrictive networks can still prevent a call.
- **Database scale:** SQLite on a Render disk supports one service instance. For multiple gateway instances, migrate to a shared database such as PostgreSQL and add shared coordination for room state.
- **Service credentials:** Do not commit `.env` files or paste production secrets into source files. Configure secrets in Render.
- **AI features:** Copilot and speech/translation behavior depend on the relevant API key, browser capabilities, and model/service availability.

## Troubleshooting

- **A shared link opens locally:** Confirm the guest uses the deployed HTTPS URL, not `localhost` or a LAN address.
- **Meeting opens but media does not connect:** Check that the Render `LIVEKIT_URL` is the public secure WebSocket URL and that both LiveKit credentials are correct.
- **Meeting records disappear after restart:** Confirm the Render disk is mounted at `/app/data` and `SQLITE_DB_PATH` is `/app/data/omnimeet.db`.
- **Copilot has no hosted responses:** Configure `GEMINI_API_KEY` in the environment and redeploy/restart the service.
- **Camera or microphone is unavailable:** Allow browser permissions, select the correct device, and use HTTPS for remote access.

