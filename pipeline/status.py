"""Where the audiobook render stands: per-chapter progress, speed, ETA, and the QA check.

usage: .venv/bin/python pipeline/status.py [voice]     (default: voxtral-male)
"""
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from script import ROOT, load_book  # noqa: E402
from synthesize import cache_path, chunks_for  # noqa: E402
from tts import VOICES  # noqa: E402

voice_name = sys.argv[1] if len(sys.argv) > 1 else "voxtral-male"
voice = VOICES[voice_name]
book = load_book()

published = set()
for d in (ROOT / "app" / "library").iterdir():
    if d.is_dir():
        published |= {f.name.split("-")[0] for f in d.glob("[0-9][0-9]-*.enc")}

total_chars = done_chars = 0
rows = []
for t in book["tracks"]:
    chunks = chunks_for(t, voice)
    have = [c for c in chunks if cache_path(voice_name, c).exists()]
    tc, dc = sum(map(len, chunks)), sum(map(len, have))
    total_chars += tc
    done_chars += dc
    state = "online-ready" if t["id"] in published else ("rendering" if 0 < dc < tc else ("rendered" if dc == tc else ""))
    rows.append(f"  {t['id']} {t['title'][:30]:30} {dc / tc * 100:5.0f}%  {state}")

# Recent speed from cache file timestamps (last hour)
files = sorted((ROOT / "build" / "cache" / voice_name).rglob("*.flac"), key=lambda p: p.stat().st_mtime)
recent = [p for p in files if p.stat().st_mtime > time.time() - 3600]
rate = None
if len(recent) > 3:
    span = recent[-1].stat().st_mtime - recent[0].stat().st_mtime
    import soundfile as sf
    audio = sum(sf.info(p).duration for p in recent[1:])
    rate = audio / span if span else None

running = subprocess.run(["pgrep", "-f", f"synthesize.py {voice_name}"], capture_output=True).returncode == 0
flagged = (ROOT / "build" / "qa" / f"{voice_name}.jsonl")
n_flagged = sum(1 for _ in flagged.open()) if flagged.exists() else 0

print(f"\n{book['title']} · {voice.label}")
print("\n".join(rows))
pct = done_chars / total_chars * 100
print(f"\nOverall: {pct:.1f}% · {len(published)}/{len(book['tracks'])} chapters published locally")
if rate:
    remaining_audio_h = (total_chars - done_chars) / 15.0 / 3600  # ~15 chars per second of speech
    print(f"Speed (last hour): {rate:.2f}× real time · ETA ≈ {remaining_audio_h / rate:.1f} h")
print(f"Renderer: {'running' if running else 'NOT running (restart: nohup pipeline/run_book.sh ' + voice_name + ' > build/synth.log 2>&1 &)'}")
print(f"QA retries logged: {n_flagged} (build/qa/{voice_name}.jsonl)")
print(f"Last activity: {time.strftime('%H:%M', time.localtime(files[-1].stat().st_mtime)) if files else '-'}\n")
