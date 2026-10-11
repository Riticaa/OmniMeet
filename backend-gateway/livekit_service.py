"""
OmniMeet Media Transport & SFU / TURN Service
Handles LiveKit token issuance for SFU room transport and WebRTC ICE server
(STUN/TURN) configuration for mesh fallback.
"""

import os
import time
from typing import Dict, Any, Optional
from urllib.parse import urlsplit
import jwt

LIVEKIT_URL = os.environ.get("LIVEKIT_URL", "").strip()
LIVEKIT_API_KEY = os.environ.get("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.environ.get("LIVEKIT_API_SECRET", "")

# STUN / TURN Configuration
STUN_SERVER_1 = os.environ.get("STUN_SERVER_1", "stun:stun.l.google.com:19302")
STUN_SERVER_2 = os.environ.get("STUN_SERVER_2", "stun:stun1.l.google.com:19302")
TURN_SERVER_URL = os.environ.get("TURN_SERVER_URL", "")
TURN_USERNAME = os.environ.get("TURN_USERNAME", "")
TURN_CREDENTIAL = os.environ.get("TURN_CREDENTIAL", "")


def is_livekit_configured() -> bool:
    """Return True only when credentials and an explicit WebSocket URL are valid."""
    if not (LIVEKIT_API_KEY and LIVEKIT_API_SECRET and LIVEKIT_URL):
        return False

    try:
        parsed_url = urlsplit(LIVEKIT_URL)
        return parsed_url.scheme in {"ws", "wss"} and bool(parsed_url.hostname)
    except ValueError:
        return False


def generate_livekit_token(room_name: str, identity: str, name: str) -> str:
    """
    Generates a signed LiveKit Access Token JWT.
    Compatible with the LiveKit SFU server standard.
    """
    if not is_livekit_configured():
        raise ValueError("LiveKit credentials not configured in environment.")

    now = int(time.time())
    payload = {
        "exp": now + (24 * 3600),  # 24 hours
        "iss": LIVEKIT_API_KEY,
        "nbf": now - 5,
        "sub": identity,
        "name": name,
        "video": {
            "room": room_name,
            "roomJoin": True,
            "canPublish": True,
            "canSubscribe": True,
            "canPublishData": True
        }
    }

    token = jwt.encode(payload, LIVEKIT_API_SECRET, algorithm="HS256")
    return token if isinstance(token, str) else token.decode("utf-8")


def get_ice_servers() -> list:
    """
    Constructs the list of RTCIceServer configurations including public STUN
    and optional TURN relay.
    """
    servers = [
        {"urls": [STUN_SERVER_1, STUN_SERVER_2]}
    ]
    if TURN_SERVER_URL:
        turn_cfg: Dict[str, Any] = {"urls": TURN_SERVER_URL}
        if TURN_USERNAME:
            turn_cfg["username"] = TURN_USERNAME
        if TURN_CREDENTIAL:
            turn_cfg["credential"] = TURN_CREDENTIAL
        servers.append(turn_cfg)
    return servers


def get_media_transport_config(room_id: str, user_id: str, user_name: str) -> Dict[str, Any]:
    """
    Returns media transport settings: LiveKit SFU token if configured,
    plus ICE servers for WebRTC connectivity.
    """
    configured = is_livekit_configured()
    token = None
    if configured:
        try:
            token = generate_livekit_token(room_id, user_id, user_name)
        except Exception as e:
            print(f"[!] LiveKit token error: {e}")

    return {
        "mode": "sfu" if (configured and token) else "p2p_mesh",
        "livekitUrl": LIVEKIT_URL if (configured and token) else None,
        "token": token,
        "iceServers": get_ice_servers(),
        "sfuAvailable": bool(configured and token)
    }
