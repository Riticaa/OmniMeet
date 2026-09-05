"""
Mock Streamer for OmniMeet AI
Simulates a live multi-speaker cross-lingual video call conversation.
Transmits sliding-window partial hypotheses and finalized translated subtitles,
triggering automatic Copilot action item extraction.
"""

import asyncio
import json
import time
import websockets

DEMO_SCRIPT = [
    {
        "speaker": "Aarav Sharma",
        "lang": "hi",
        "steps": [
            ("नमस्ते टीम, आज हम प्रोजेक्ट के आर्किटेक्चर पर चर्चा करेंगे।", "Hello team, today we will discuss the project architecture.", False, 1.2),
            ("नमस्ते टीम, आज हम प्रोजेक्ट के आर्किटेक्चर पर चर्चा करेंगे।", "Hello team, today we will discuss the project architecture.", True, 0.8),
        ]
    },
    {
        "speaker": "Elena Rodriguez",
        "lang": "es",
        "steps": [
            ("Perfecto, revisé los requisitos del backend...", "Great, I reviewed the backend requirements...", False, 1.0),
            ("Perfecto, revisé los requisitos del backend y la latencia debe ser menor a 800 ms.", "Great, I reviewed the backend requirements and latency must be under 800 ms.", True, 1.0),
        ]
    },
    {
        "speaker": "Aarav Sharma",
        "lang": "hi",
        "steps": [
            ("मैं आज शाम तक Faster-Whisper का बेंचमार्क पूरा करूँगा।", "I will complete the Faster-Whisper benchmark by this evening.", True, 1.5),
        ]
    },
    {
        "speaker": "Jean Dupont",
        "lang": "fr",
        "steps": [
            ("De mon côté, je prépare le composant WebRTC pour l'interface.", "On my end, I am preparing the WebRTC component for the UI.", False, 1.1),
            ("De mon côté, je prépare le composant WebRTC pour l'interface utilisateur.", "On my end, I am preparing the WebRTC component for the user interface.", True, 0.9),
        ]
    },
    {
        "speaker": "Elena Rodriguez",
        "lang": "es",
        "steps": [
            ("Excelente, necesitamos preparar las diapositivas de la revisión 0.", "Excellent, we need to prepare the review 0 slides tomorrow.", True, 1.2),
        ]
    }
]


async def run_mock_stream(room_id: str = "demo", ws_url: str = "ws://localhost:8000/ws/room"):
    url = f"{ws_url}/{room_id}/mock_bot?name=SimulatedSpeaker&lang=auto"
    print(f"[*] Connecting to {url}...")

    try:
        async with websockets.connect(url) as ws:
            print("[✓] Connected to OmniMeet Gateway! Starting multilingual stream simulation...\n")

            for turn in DEMO_SCRIPT:
                speaker = turn["speaker"]
                lang = turn["lang"]

                for orig, trans, is_final, delay in turn["steps"]:
                    await asyncio.sleep(delay)

                    payload = {
                        "type": "subtitle_stream",
                        "roomId": room_id,
                        "senderId": f"mock_{speaker.replace(' ', '_')}",
                        "senderName": speaker,
                        "sourceLanguage": lang,
                        "targetLanguage": "en",
                        "isFinal": is_final,
                        "originalText": orig,
                        "translatedText": trans,
                        "latencyMs": 420.0,
                        "timestamp": int(time.time() * 1000)
                    }

                    await ws.send(json.dumps(payload))
                    tag = "[FINAL]" if is_final else "[INTERIM]"
                    print(f" {tag} {speaker} ({lang.upper()} -> EN): {trans}")

            print("\n[✓] Simulation completed successfully!")

    except Exception as e:
        print(f"[!] Connection failed: {e}")
        print("    Ensure the backend-gateway is running: python main.py")


if __name__ == "__main__":
    asyncio.run(run_mock_stream())
