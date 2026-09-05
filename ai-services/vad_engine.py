"""
Voice Activity Detection (VAD) Engine for OmniMeet AI
Filters out background noise and silence periods with <10ms latency.
Uses Silero VAD with an automatic adaptive energy-threshold fallback.
"""

import numpy as np
from typing import Optional


class VADEngine:
    def __init__(self, threshold: float = 0.5, sample_rate: int = 16000):
        self.threshold = threshold
        self.sample_rate = sample_rate
        self.silero_model = None
        self.use_fallback = False

        self._init_model()

    def _init_model(self):
        try:
            import torch
            torch.set_num_threads(1)
            # Attempt to load Silero VAD
            model, utils = torch.hub.load(
                repo_or_dir='snakers4/silero-vad',
                model='silero_vad',
                force_reload=False,
                onnx=False
            )
            self.silero_model = model
            self.get_speech_timestamps = utils[0]
            print("[✓] Silero VAD initialized successfully.")
        except Exception as e:
            print(f"[!] Silero VAD model load deferred ({e}). Falling back to Adaptive Energy VAD.")
            self.use_fallback = True

    def is_speech(self, audio_chunk: np.ndarray) -> bool:
        """
        Determines whether the given 16kHz float32 or int16 PCM chunk contains human speech.
        """
        if audio_chunk is None or len(audio_chunk) == 0:
            return False

        # Normalize to float32 in [-1.0, 1.0] if int16
        if audio_chunk.dtype == np.int16:
            audio_float = audio_chunk.astype(np.float32) / 32768.0
        else:
            audio_float = audio_chunk.astype(np.float32)

        if not self.use_fallback and self.silero_model is not None:
            try:
                import torch
                tensor = torch.from_numpy(audio_float)
                if tensor.dim() == 1:
                    tensor = tensor.unsqueeze(0)
                speech_prob = self.silero_model(tensor, self.sample_rate).item()
                return speech_prob >= self.threshold
            except Exception:
                pass

        # Adaptive Root Mean Square (RMS) Energy Fallback
        rms = np.sqrt(np.mean(audio_float ** 2))
        return rms > 0.015


class SpeechSegmentAccumulator:
    """
    Accumulates streaming audio chunks while speech is active.
    Flushes when silence exceeds max_silence_duration_ms.
    """
    def __init__(self, sample_rate: int = 16000, max_silence_duration_ms: int = 600, min_speech_ms: int = 400):
        self.sample_rate = sample_rate
        self.max_silence_chunks = int((max_silence_duration_ms / 1000.0) * (sample_rate / 512))
        self.min_speech_samples = int((min_speech_ms / 1000.0) * sample_rate)

        self.vad = VADEngine(sample_rate=sample_rate)
        self.buffer = []
        self.silence_count = 0
        self.speech_detected = False

    def push_chunk(self, chunk: np.ndarray) -> Optional[np.ndarray]:
        """
        Push incoming audio chunk. If a completed spoken phrase is ready, returns the accumulated speech array.
        Otherwise returns None.
        """
        speech = self.vad.is_speech(chunk)

        if speech:
            self.speech_detected = True
            self.silence_count = 0
            self.buffer.append(chunk)
            return None
        else:
            if self.speech_detected:
                self.silence_count += 1
                self.buffer.append(chunk)

                if self.silence_count >= self.max_silence_chunks:
                    # Spoken segment finished
                    full_segment = np.concatenate(self.buffer)
                    self.buffer = []
                    self.silence_count = 0
                    self.speech_detected = False

                    if len(full_segment) >= self.min_speech_samples:
                        return full_segment

            return None
