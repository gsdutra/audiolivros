"""Render the book with one voice into a resumable cache, publishing each chapter as it completes.

usage: .venv/bin/python pipeline/synthesize.py <voice> [track ids...] [--no-publish]

Chunks are cached as FLAC under build/cache/<voice>/<sha1>.flac keyed by voice + text, so an
interrupted run (or a lexicon fix that changes a few chunks) only re-renders what changed.
Voices with `check=True` get every chunk transcribed by Whisper; failures are retried and logged
to build/qa/<voice>.jsonl.
"""
import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from normalize import chunk  # noqa: E402
from script import ROOT, load_book, track_units  # noqa: E402
from tts import SAMPLE_RATE, VOICES, Engine, trim  # noqa: E402

ATTEMPTS = 3


def cache_path(voice: str, text: str) -> Path:
    h = hashlib.sha1(f"{voice}\n{text}".encode()).hexdigest()
    return ROOT / "build" / "cache" / voice / h[:2] / f"{h}.flac"


def chunks_for(track: dict, voice) -> list[str]:
    return [c for u in track_units(track) if u.spoken for c in chunk(u.spoken, voice.max_chars)]


def render(engine, checker, text: str, log) -> np.ndarray | None:
    """Best of up to ATTEMPTS takes when a checker is present; first valid take otherwise."""
    best, best_q = None, -9.0
    for attempt in range(1, ATTEMPTS + 1):
        audio = engine.synth(text)
        if not len(audio) or not np.isfinite(audio).all():
            continue
        if checker is None:
            return audio
        r = checker.score(trim(audio), text)
        if r["quality"] > best_q:
            best, best_q = audio, r["quality"]
        if r["ok"]:
            return audio
        log.write(json.dumps({"attempt": attempt, "text": text, **r}, ensure_ascii=False) + "\n")
        log.flush()
    return best


def main(voice_name: str, only: list[str], publish: bool):
    voice = VOICES[voice_name]
    tracks = [t for t in load_book()["tracks"] if not only or t["id"] in only]
    plan = [(t, [c for c in chunks_for(t, voice) if not cache_path(voice_name, c).exists()]) for t in tracks]
    total_chars = sum(len(c) for _, cs in plan for c in cs)
    print(f"{sum(len(cs) for _, cs in plan)} chunks / {total_chars} chars to render with {voice.label}", flush=True)

    engine = Engine(voice) if total_chars else None
    checker = None
    if voice.check and total_chars:
        from qa import Checker
        checker = Checker()
    (ROOT / "build" / "qa").mkdir(parents=True, exist_ok=True)
    log = open(ROOT / "build" / "qa" / f"{voice_name}.jsonl", "a")

    done_chars, audio_s, t0, n = 0, 0.0, time.time(), 0
    for track, todo in plan:
        for text in todo:
            audio = render(engine, checker, text, log)
            n += 1
            if audio is None:
                print(f"  ! no usable audio, track {track['id']}: {text[:60]}", flush=True)
                continue
            p = cache_path(voice_name, text)
            p.parent.mkdir(parents=True, exist_ok=True)
            sf.write(p, audio, SAMPLE_RATE, format="FLAC")
            done_chars += len(text)
            audio_s += len(audio) / SAMPLE_RATE
            if n % 20 == 0:
                el = time.time() - t0
                eta = el / done_chars * (total_chars - done_chars)
                print(f"  [{n}] track {track['id']} · {audio_s / 60:.0f} min audio in {el / 60:.0f} min "
                      f"({audio_s / el:.2f}× real time) · ETA {eta / 3600:.1f} h", flush=True)
        if publish and all(cache_path(voice_name, c).exists() for c in chunks_for(track, voice)):
            import publish as pub
            pub.main(voice_name, [track["id"]])
    print("synthesis finished", flush=True)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    main(args[0], args[1:], "--no-publish" not in sys.argv)
