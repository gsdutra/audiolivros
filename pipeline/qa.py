"""Automatic listening check for LLM-style TTS: transcribe a chunk with Whisper and compare it to the text.

Catches the failure modes of autoregressive voices: cut-off endings, skipped clauses, loops, mumbling.
"""
import re
import tempfile
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

import numpy as np
import soundfile as sf
from num2words import num2words

from tts import SAMPLE_RATE, _local

WHISPER = "mlx-community/whisper-large-v3-turbo-asr-6bit"
CHARS_PER_SEC = 15.0  # measured on the bake-off passage for Voxtral pt_male


def canon(text: str) -> list[str]:
    """Lowercase, digits spelled out, accents/punctuation/hyphens removed -> comparable word list."""
    words = lambda n: num2words(int(n), lang="pt_BR")  # noqa: E731
    t = re.sub(r"(?<=\d)\.(?=\d{3})", "", text)  # 1.500 -> 1500
    t = re.sub(r"(\d+),(\d+)", lambda m: f"{words(m.group(1))} virgula {words(m.group(2))}", t)
    t = re.sub(r"\d+", lambda m: words(m.group(0)), t).replace("%", " por cento")
    t = unicodedata.normalize("NFKD", t.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"[-‐–—]", " ", t)
    return re.findall(r"[a-z]+", t)


class Checker:
    def __init__(self):
        from mlx_audio.stt.utils import load_model
        self.model = load_model(_local(WHISPER))

    def transcribe(self, audio: np.ndarray) -> str:
        with tempfile.NamedTemporaryFile(suffix=".wav") as f:
            sf.write(f.name, audio, SAMPLE_RATE)
            return self.model.generate(f.name, language="pt").text.strip()

    def score(self, audio: np.ndarray, text: str) -> dict:
        """0..1 similarity (1 = matches), plus why it was flagged."""
        dur = len(audio) / SAMPLE_RATE
        expected = len(text) / CHARS_PER_SEC
        heard = self.transcribe(audio)
        a, b = canon(text), canon(heard)
        # Word-level match, or letter-level for names Whisper splits/respells ("Wealthfront" -> "Wealth Front").
        words_sim = SequenceMatcher(None, a, b, autojunk=False).ratio() if a else 1.0
        chars_sim = SequenceMatcher(None, "".join(a), "".join(b), autojunk=False).ratio() if a else 1.0
        sim = max(words_sim, chars_sim)
        short = len(a) < 5
        tail_ok = short or bool(set(a[-3:]) & set(b[-6:]))
        reasons = []
        if sim < (0.55 if short else 0.8):
            reasons.append(f"similarity {sim:.2f}")
        if not tail_ok:
            reasons.append("ending missing")
        if dur < 0.55 * expected:
            reasons.append(f"too short {dur:.1f}s vs ~{expected:.1f}s")
        if dur > 1.8 * expected + 1.5:
            reasons.append(f"too long {dur:.1f}s vs ~{expected:.1f}s")
        quality = sim - 0.15 * (not tail_ok) - 0.3 * bool(reasons and "too" in " ".join(reasons))
        return {"ok": not reasons, "quality": round(quality, 3), "sim": round(sim, 3), "reasons": reasons, "heard": heard}
