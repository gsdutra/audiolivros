"""Thin wrapper over mlx-audio so the bake-off and the full-book run share one code path."""
import subprocess
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

SAMPLE_RATE = 24000


@dataclass
class Voice:
    name: str            # id used for file names
    label: str           # human-readable, shown on the comparison page
    repo: str | None     # Hugging Face repo, or None for macOS `say`
    kwargs: dict = field(default_factory=dict)
    max_chars: int = 280  # chunk size fed to the model per call
    check: bool = False   # autoregressive voices: verify every chunk with Whisper (pipeline/qa.py)


VOICES = {
    v.name: v
    for v in [
        Voice("kokoro-dora", "Kokoro 82M · pf_dora (feminina)", "mlx-community/Kokoro-82M-bf16",
              {"voice": "pf_dora", "lang_code": "p"}),
        Voice("kokoro-alex", "Kokoro 82M · pm_alex (masculina)", "mlx-community/Kokoro-82M-bf16",
              {"voice": "pm_alex", "lang_code": "p"}),
        Voice("voxtral-female", "Voxtral 4B (Mistral) · pt_female", "mlx-community/Voxtral-4B-TTS-2603-mlx-6bit",
              {"voice": "pt_female"}, max_chars=400, check=True),
        Voice("voxtral-male", "Voxtral 4B (Mistral) · pt_male", "mlx-community/Voxtral-4B-TTS-2603-mlx-6bit",
              {"voice": "pt_male"}, max_chars=400, check=True),
        Voice("qwen3-female", "Qwen3-TTS 1.7B VoiceDesign · narradora", "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit",
              {"lang_code": "portuguese", "instruct": "A warm, clear adult female audiobook narrator speaking Brazilian "
               "Portuguese with a neutral São Paulo accent, calm and steady pace, engaged but not theatrical."},
              max_chars=400),
        Voice("qwen3-male", "Qwen3-TTS 1.7B VoiceDesign · narrador", "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit",
              {"lang_code": "portuguese", "instruct": "A warm, deep adult male audiobook narrator speaking Brazilian "
               "Portuguese with a neutral São Paulo accent, calm and steady pace, engaged but not theatrical."},
              max_chars=400),
        # Chatterbox only clones; the reference is a clip of the synthetic Qwen3 narrator, not a real person.
        Voice("chatterbox", "Chatterbox Multilingual v3 (Resemble AI) · referência: narradora sintética",
              "mlx-community/chatterbox-multilingual-v3",
              {"lang_code": "pt", "ref_audio": str(Path(__file__).resolve().parent.parent / "bakeoff/ref/narradora-sintetica.wav")}),
        Voice("macos-luciana", "macOS Luciana (voz do sistema, referência)", None, {"voice": "Luciana"}),
    ]
}


class Engine:
    def __init__(self, voice: Voice):
        self.voice = voice
        self.model = None
        if voice.repo:
            from mlx_audio.tts.utils import load
            self.model = load(_local(voice.repo))

    def synth(self, text: str) -> np.ndarray:
        """Synthesize one chunk -> float32 mono at SAMPLE_RATE."""
        if self.model is None:
            return _macos_say(text, self.voice.kwargs["voice"])
        parts, sr = [], SAMPLE_RATE
        for r in self.model.generate(text=text, verbose=False, **self.voice.kwargs):
            parts.append(np.array(r.audio, dtype=np.float32).reshape(-1))
            sr = r.sample_rate
        audio = np.concatenate(parts) if parts else np.zeros(0, np.float32)
        return audio if sr == SAMPLE_RATE else _resample(audio, sr, SAMPLE_RATE)


def _local(repo: str) -> str:
    """Prefer the already-downloaded snapshot: the Hub's listing API rate-limits anonymous calls."""
    snaps = Path.home() / ".cache/huggingface/hub" / f"models--{repo.replace('/', '--')}" / "snapshots"
    found = sorted(snaps.glob("*"), key=lambda d: sum(1 for _ in d.rglob("*")), reverse=True) if snaps.exists() else []
    return found[0] if found else repo  # a Path lets mlx-audio infer the model type from the cache dir name


def _resample(a: np.ndarray, sr: int, to: int) -> np.ndarray:
    n = int(round(len(a) * to / sr))
    return np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a).astype(np.float32)


def _macos_say(text: str, voice: str) -> np.ndarray:
    import soundfile as sf
    with tempfile.TemporaryDirectory() as d:
        aiff, wav = Path(d) / "a.aiff", Path(d) / "a.wav"
        subprocess.run(["say", "-v", voice, "-o", str(aiff), text], check=True)
        subprocess.run(["afconvert", "-f", "WAVE", "-d", f"LEI16@{SAMPLE_RATE}", "-c", "1", str(aiff), str(wav)], check=True)
        a, _ = sf.read(wav, dtype="float32")
    return a


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(SAMPLE_RATE * seconds), np.float32)


def trim(a: np.ndarray, thresh: float = 0.01, pad: float = 0.04) -> np.ndarray:
    """Strip leading/trailing near-silence so our own pauses control the rhythm."""
    idx = np.where(np.abs(a) > thresh)[0]
    if not len(idx):
        return a
    p = int(SAMPLE_RATE * pad)
    return a[max(0, idx[0] - p): idx[-1] + p]


def timed(fn, *a):
    t = time.time()
    out = fn(*a)
    return out, time.time() - t
