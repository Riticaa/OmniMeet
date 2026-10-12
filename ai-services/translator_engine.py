"""
Neural Machine Translation (NMT) Engine for OmniMeet AI
Translates multilingual speech transcripts (Hindi, Spanish, French, German, etc.)
into synchronized English subtitles.
"""

import time
import json
import os
import threading
import urllib.parse
import urllib.request
from typing import Dict, Any, Optional


class TranslationEngine:
    def __init__(self, default_target_lang: str = "en"):
        self.default_target_lang = default_target_lang
        self.translation_provider = os.getenv("TRANSLATION_PROVIDER", "argos").strip().lower()
        self.argos_auto_install = os.getenv("ARGOS_AUTO_INSTALL_MODELS", "true").lower() in {"1", "true", "yes", "on"}
        self.google_cloud_api_key = os.getenv("GOOGLE_TRANSLATE_API_KEY", "").strip()
        self._argos_install_lock = threading.Lock()

    def _translate_with_argos(self, text: str, source_lang: str, target_lang: str) -> Optional[str]:
        """Translate offline with Argos, installing only the needed pair(s) on first use."""
        if source_lang == "auto":
            return None
        try:
            from argostranslate import package as argos_package
            from argostranslate import translate as argos_translate
        except Exception:
            return None

        def get_translation():
            try:
                source = argos_translate.get_language_from_code(source_lang)
                target = argos_translate.get_language_from_code(target_lang)
                return source.get_translation(target) if source and target else None
            except Exception:
                return None

        translation = get_translation()
        if translation or not self.argos_auto_install:
            return translation.translate(text) if translation else None

        pair = (source_lang, target_lang)
        with self._argos_install_lock:
            # Another request may have installed the package while this one waited.
            translation = get_translation()
            if translation:
                return translation.translate(text)

            try:
                available = argos_package.get_available_packages()
                available_pairs = {(item.from_code, item.to_code): item for item in available}
                installed_pairs = {
                    (item.from_code, item.to_code)
                    for item in argos_package.get_installed_packages()
                }

                # Prefer a direct model. If Argos has no direct model, it can chain
                # source→English→target when those two packages are installed.
                routes = [(pair,)]
                if source_lang != "en" and target_lang != "en":
                    routes.append(((source_lang, "en"), ("en", target_lang)))

                for route in routes:
                    if all(
                        step in installed_pairs or step in available_pairs
                        for step in route
                    ):
                        for step in route:
                            if step not in installed_pairs and step in available_pairs:
                                available_pairs[step].install()
                                installed_pairs.add(step)
                        translation = get_translation()
                        if translation:
                            return translation.translate(text)
            except Exception as exc:
                print(f"[Translation] Argos model unavailable for {source_lang}→{target_lang}: {exc}")

        return None

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

        # Free, local translation is the default. The paid Google option is only
        # used when explicitly selected in the server environment.
        translated = None
        if self.translation_provider == "google":
            translated = self._translate_with_google_cloud(text, norm_src, target_lang.lower())
        else:
            translated = self._translate_with_argos(text, norm_src, target_lang.lower())

        translated_fallback = translated or f"[Translated to {target_lang.upper()}]: {text}"

        return {
            "translated_text": translated_fallback,
            "source_lang": source_lang,
            "target_lang": target_lang,
            "latency_ms": (time.time() - start_time) * 1000
        }

