"""Render the same ~90 s passage with each candidate voice.

usage: .venv/bin/python bakeoff/run.py kokoro-dora voxtral-male ...   (no args = all)
"""
import gc
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "pipeline"))
from normalize import chunk, normalize  # noqa: E402
from tts import SAMPLE_RATE, VOICES, Engine, silence, timed, trim  # noqa: E402

OUT = ROOT / "bakeoff" / "samples"


def passage() -> list[str]:
    book = json.loads((ROOT / "build" / "book.json").read_text())
    by_id = {t["id"]: t for t in book["tracks"]}
    find = lambda tid, start: next(p for s in by_id[tid]["sections"] for p in s["paragraphs"] if p.startswith(start))
    return [
        "Capítulo um. Começar.",
        find("02", "Desenvolver uma startup"),
        find("05", "Desde então, a Village"),
        find("04", "Imaginemos uma garota"),
    ]


def render(name: str):
    voice = VOICES[name]
    engine, load_s = timed(Engine, voice)
    pieces, gen_s = [], 0.0
    for i, para in enumerate(passage()):
        for c in chunk(normalize(para), voice.max_chars):
            audio, s = timed(engine.synth, c)
            gen_s += s
            pieces += [trim(audio), silence(0.25)]
        pieces.append(silence(1.0 if i == 0 else 0.5))
    audio = np.concatenate(pieces)
    peak = np.max(np.abs(audio)) or 1.0
    audio = audio / peak * 0.89
    OUT.mkdir(parents=True, exist_ok=True)
    sf.write(OUT / f"{name}.wav", audio, SAMPLE_RATE)
    dur = len(audio) / SAMPLE_RATE
    meta = {"name": name, "label": voice.label, "repo": voice.repo, "audio_s": round(dur, 1),
            "gen_s": round(gen_s, 1), "load_s": round(load_s, 1), "speed_x": round(dur / gen_s, 2)}
    (OUT / f"{name}.json").write_text(json.dumps(meta, ensure_ascii=False))
    print(json.dumps(meta, ensure_ascii=False), flush=True)
    del engine
    gc.collect()


if __name__ == "__main__":
    for n in sys.argv[1:] or list(VOICES):
        try:
            render(n)
        except Exception as e:  # keep going so one broken model doesn't block the rest
            print(f"FAILED {n}: {type(e).__name__}: {e}", flush=True)
