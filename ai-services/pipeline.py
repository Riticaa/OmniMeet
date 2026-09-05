"""
Streaming Speech-to-Translation Pipeline for OmniMeet AI
Orchestrates VAD segmentation, Faster-Whisper ASR, and NMT translation into real-time subtitle events.
"""

import time
import base64
import numpy as np
from typing import Optional, Dict, Any

from vad_engine import SpeechSegmentAccumulator
from asr_engine import ASREngine
from translator_engine import TranslationEngine


class OmniMeetAIPipeline:
    def __init__(self, target_lang: str = "en", asr_model_size: str = "base"):
        self.target_lang = target_lang
        self.vad_accumulator = SpeechSegmentAccumulator()
        self.asr = ASREngine(model_size=asr_model_size)
        self.translator = TranslationEngine(default_target_lang=target_lang)

    def process_raw_pcm_chunk(
        self,
        pcm_bytes: bytes,
        speaker_id: str = "local_user",
        speaker_name: str = "User",
        source_lang: str = "auto"
    ) -> Optional[Dict[str, Any]]:
        """
        Ingests a raw 16-bit 16kHz PCM audio chunk (e.g., 512-2048 samples).
        If a speech segment is completed by VAD, transcribes & translates it immediately.
        Returns a SubtitleStreamPayload event dictionary or None.
        """
        start_ts = time.time()

        # Convert bytes to int16 numpy array
        chunk_i16 = np.frombuffer(pcm_bytes, dtype=np.int16)

        # Push to VAD segmenter
        speech_segment = self.vad_accumulator.push_chunk(chunk_i16)

        if speech_segment is not None:
            # 1. Transcribe speech
            asr_res = self.asr.transcribe(speech_segment, language=source_lang)
            text = asr_res.get("text", "").strip()

            if not text:
                return None

            detected_lang = asr_res.get("language", source_lang)

            # 2. Translate to target language
            trans_res = self.translator.translate(
                text=text,
                source_lang=detected_lang,
                target_lang=self.target_lang
            )
            translated_text = trans_res.get("translated_text", text)

            total_latency = (time.time() - start_ts) * 1000 + asr_res.get("latency_ms", 0) + trans_res.get("latency_ms", 0)

            # 3. Format into standardized WebSocket contract event
            return {
                "type": "subtitle_stream",
                "roomId": "active_room",
                "senderId": speaker_id,
                "senderName": speaker_name,
                "sourceLanguage": detected_lang,
                "targetLanguage": self.target_lang,
                "isFinal": True,
                "originalText": text,
                "translatedText": translated_text,
                "latencyMs": round(total_latency, 1),
                "timestamp": int(time.time() * 1000)
            }

        return None
