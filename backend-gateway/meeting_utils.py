"""
OmniMeet Meeting Code & Identifier Utilities
Generates cryptographically random, human-friendly meeting codes (e.g. abc-defg-hij)
and URL-safe meeting IDs.
"""

import secrets
import string
import re
from typing import Tuple

# Human-friendly alphabet (lowercase, avoiding ambiguous characters like 0/o, 1/l)
CHAR_POOL = "abcdefghjkmnpqrstuvwxyz"


def generate_meeting_code() -> str:
    """
    Generates a 3-4-3 format meeting code (e.g., 'wkm-tyqa-pxz').
    Similar to Google Meet codes for human ease-of-use.
    """
    part1 = "".join(secrets.choice(CHAR_POOL) for _ in range(3))
    part2 = "".join(secrets.choice(CHAR_POOL) for _ in range(4))
    part3 = "".join(secrets.choice(CHAR_POOL) for _ in range(3))
    return f"{part1}-{part2}-{part3}"


def generate_meeting_id() -> str:
    """
    Generates a cryptographically random URL-safe meeting ID.
    Example: 'mtg-9x4k8m2p-c7q1'
    """
    token = secrets.token_hex(6)
    return f"mtg-{token[:6]}-{token[6:]}"


def normalize_meeting_code(raw: str) -> str:
    """
    Normalizes a meeting code by removing whitespace and protocol/URL wrappers.
    Accepts full URLs (e.g., https://.../meet/abc-defg-hij or ?room=abc-defg-hij)
    or bare codes.
    """
    if not raw:
        return ""

    cleaned = raw.strip().lower()

    # Extract query param ?room=... if passed
    if "room=" in cleaned:
        match = re.search(r"room=([a-z0-9_-]+)", cleaned)
        if match:
            cleaned = match.group(1)

    # Extract path /meet/... if passed
    if "/meet/" in cleaned:
        match = re.search(r"/meet/([a-z0-9_-]+)", cleaned)
        if match:
            cleaned = match.group(1)

    # Remove unwanted symbols
    cleaned = re.sub(r"[^a-z0-9-]", "", cleaned)
    return cleaned


def is_valid_meeting_code(code: str) -> bool:
    """
    Validates that a meeting code or ID contains only valid URL-safe characters
    and is between 4 and 64 characters long.
    """
    if not code:
        return False
    return bool(re.match(r"^[a-z0-9][a-z0-9_-]{3,63}$", code))
