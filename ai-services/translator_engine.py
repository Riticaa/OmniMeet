"""
Neural Machine Translation (NMT) Engine for OmniMeet AI
Translates multilingual speech transcripts (Hindi, Spanish, French, German, etc.)
into synchronized English subtitles.
"""

import time
import json
import os
import urllib.parse
import urllib.request
from typing import Dict, Any, Optional


class TranslationEngine:
    def __init__(self, default_target_lang: str = "en"):
        self.default_target_lang = default_target_lang
        self.google_cloud_api_key = os.getenv("GOOGLE_TRANSLATE_API_KEY", "").strip()
        self.models: Dict[str, Any] = {}
        self.tokenizers: Dict[str, Any] = {}

    def _translate_with_google_cloud(self, text: str, source_lang: str, target_lang: str) -> Optional[str]:
        """Use the authenticated Cloud Translation Basic API when configured."""
        if not self.google_cloud_api_key:
            return None

        query = urllib.parse.urlencode({"key": self.google_cloud_api_key})
        body = {"q": text, "target": target_lang, "format": "text"}
        if source_lang != "auto":
            body["source"] = source_lang
        request = urllib.request.Request(
            f"https://translation.googleapis.com/language/translate/v2?{query}",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=6.0) as response:
                result = json.loads(response.read().decode("utf-8"))
            translations = result.get("data", {}).get("translations", [])
            translated = translations[0].get("translatedText", "").strip() if translations else ""
            return translated or None
        except Exception:
            # Do not log request URLs because they contain the API key.
            return None

    def _get_marian_model(self, src: str, tgt: str):
        pair = f"{src}-{tgt}"
        if pair in self.models:
            return self.models[pair], self.tokenizers[pair]

        try:
            from transformers import MarianMTModel, MarianTokenizer
            model_name = f"Helsinki-NLP/opus-mt-{src}-{tgt}"
            print(f"[*] Loading MarianMT model: {model_name}...")
            tokenizer = MarianTokenizer.from_pretrained(model_name)
            model = MarianMTModel.from_pretrained(model_name)
            self.models[pair] = model
            self.tokenizers[pair] = tokenizer
            print(f"[OK] Loaded {pair} translator.")
            return model, tokenizer
        except Exception as e:
            # Model loading deferred or unavailable
            return None, None

    def translate(self, text: str, source_lang: str = "auto", target_lang: str = "en") -> Dict[str, Any]:
        """
        Translates text from source_lang to target_lang.
        Returns: { 'translated_text': str, 'source_lang': str, 'target_lang': str, 'latency_ms': float }
        """
        start_time = time.time()
        text = text.strip()

        if not text:
            return {
                "translated_text": "",
                "source_lang": source_lang,
                "target_lang": target_lang,
                "latency_ms": 0.0
            }

        # If source language is already target language, pass through
        if source_lang.lower() == target_lang.lower():
            return {
                "translated_text": text,
                "source_lang": source_lang,
                "target_lang": target_lang,
                "latency_ms": (time.time() - start_time) * 1000
            }

        # Normalize language codes
        src_map = {"hi": "hi", "hindi": "hi", "es": "es", "spanish": "es", "fr": "fr", "french": "fr", "de": "de", "german": "de"}
        norm_src = src_map.get(source_lang.lower(), source_lang.lower())

        # Prefer Google's supported, authenticated API in configured environments.
        cloud_translation = self._translate_with_google_cloud(text, norm_src, target_lang.lower())
        if cloud_translation:
            return {
                "translated_text": cloud_translation,
                "source_lang": norm_src,
                "target_lang": target_lang,
                "latency_ms": (time.time() - start_time) * 1000
            }

        # Attempt HuggingFace MarianMT for supported pairs
        model, tokenizer = self._get_marian_model(norm_src, target_lang.lower())
        if model is not None and tokenizer is not None:
            try:
                inputs = tokenizer([text], return_tensors="pt", padding=True)
                translated_tokens = model.generate(**inputs, max_length=128)
                result = tokenizer.decode(translated_tokens[0], skip_special_tokens=True)
                return {
                    "translated_text": result,
                    "source_lang": norm_src,
                    "target_lang": target_lang,
                    "latency_ms": (time.time() - start_time) * 1000
                }
            except Exception as e:
                print(f"[!] Translation inference error: {e}")

        # Lightweight fallback: Deep Translator if installed
        try:
            from deep_translator import GoogleTranslator
            translated = GoogleTranslator(source=norm_src if norm_src != 'auto' else 'auto', target=target_lang).translate(text)
            return {
                "translated_text": translated,
                "source_lang": norm_src,
                "target_lang": target_lang,
                "latency_ms": (time.time() - start_time) * 1000
            }
        except Exception:
            pass

        # Standard HTTP translation fallback for real end-to-end translations without heavy models
        try:
            import urllib.request
            import urllib.parse
            import json
            sl = norm_src if norm_src != 'auto' else 'auto'
            tl = target_lang.lower()
            url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl={sl}&tl={tl}&dt=t&q={urllib.parse.quote(text)}"
            req = urllib.request.Request(url, headers={"User-Agent": "OmniMeet/1.0"})
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                if data and data[0]:
                    translated_str = "".join([seg[0] for seg in data[0] if seg and seg[0]])
                    if translated_str:
                        return {
                            "translated_text": translated_str,
                            "source_lang": norm_src,
                            "target_lang": target_lang,
                            "latency_ms": (time.time() - start_time) * 1000
                        }
        except Exception:
            pass

        # Built-in instant dictionary demonstration fallback
        demo_dict = {
            "नमस्ते": "Hello",
            "नमस्ते टीम": "Hello team",
            "धन्यवाद": "Thank you",
            "हाँ": "Yes",
            "नहीं": "No",
            "hola": "hello",
            "gracias": "thank you",
            "bonjour": "hello",
            "merci": "thank you"
        }

        translated_fallback = demo_dict.get(text.lower(), f"[Translated to {target_lang.upper()}]: {text}")

        return {
            "translated_text": translated_fallback,
            "source_lang": source_lang,
            "target_lang": target_lang,
            "latency_ms": (time.time() - start_time) * 1000
        }

