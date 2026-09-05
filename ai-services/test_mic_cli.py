"""
Standalone Microphone & AI Pipeline CLI Test Utility
Allows quick verification of audio capture, VAD, Faster-Whisper, and Translation.
"""

import sys
import time
import numpy as np

try:
    from pipeline import OmniMeetAIPipeline
except ImportError:
    from .pipeline import OmniMeetAIPipeline


def run_mic_test(duration_sec: int = 4, target_lang: str = "en"):
    print("==================================================")
    print("   OmniMeet AI: Real-Time Audio Capture Test      ")
    print("==================================================")

    pipeline = OmniMeetAIPipeline(target_lang=target_lang)

    try:
        import sounddevice as sd
        sample_rate = 16000
        print(f"\n[*] Microphone ready. Recording {duration_sec} seconds of speech...")
        print("    --> Speak now in Hindi, Spanish, French, or English! <--\n")

        recording = sd.rec(int(duration_sec * sample_rate), samplerate=sample_rate, channels=1, dtype='int16')
        for i in range(duration_sec, 0, -1):
            print(f"    Recording... {i}s remaining", end="\r")
            time.sleep(1)
        sd.wait()
        print("\n[✓] Audio captured. Running AI transcription & translation...")

        # Process as PCM bytes
        raw_bytes = recording.tobytes()
        event = pipeline.process_raw_pcm_chunk(raw_bytes, speaker_name="LocalTester")

        if event:
            print("\n----------------- PIPELINE OUTPUT -----------------")
            print(f"Original Text    : {event['originalText']}")
            print(f"Detected Lang    : {event['sourceLanguage'].upper()}")
            print(f"Translated (EN)  : {event['translatedText']}")
            print(f"Processing Speed : {event['latencyMs']} ms")
            print("---------------------------------------------------\n")
        else:
            print("[!] No speech detected by VAD. Try speaking closer to the microphone.")

    except ImportError:
        print("[!] 'sounddevice' not installed. Running synthetic audio self-test...")
        # Create a synthetic 16kHz audio buffer
        t = np.linspace(0, 2, 32000, False)
        synthetic_speech = (np.sin(2 * np.pi * 440 * t) * 15000).astype(np.int16)
        event = pipeline.process_raw_pcm_chunk(synthetic_speech.tobytes(), speaker_name="SyntheticSpeaker")
        print("\n[✓] Synthetic Self-Test Pipeline Output:")
        print(event or "Pipeline processed successfully.")

    except Exception as e:
        print(f"[!] Test error: {e}")


if __name__ == "__main__":
    lang = sys.argv[1] if len(sys.argv) > 1 else "en"
    run_mic_test(target_lang=lang)
