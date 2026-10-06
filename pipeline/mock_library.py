"""Dev-only: a full-structure library with estimated timings and placeholder audio, for UI testing
while the real render runs. Written to build/mocklib/ (served by devserver.py --mock), never published.
Every chapter points at one long silent file, so screens, seeking and timers behave realistically."""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import publish as pub  # noqa: E402
from script import PAUSE_AFTER_HEADING, PAUSE_BEFORE, load_book, track_units  # noqa: E402

OUT = pub.ROOT / "build" / "mocklib"
CPS = 15.0


def main():
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)
    shutil.copy(pub.LIB / "vault.json", OUT / "vault.json")
    key = pub.vault_key()
    book = load_book()
    bid = pub.book_id(book["title"])
    (OUT / bid).mkdir()
    with tempfile.TemporaryDirectory() as d:
        wav, m4a = Path(d) / "t.wav", Path(d) / "t.m4a"
        # 90 min of near-silence (longer than any chapter) so seeking and auto-advance behave like the real thing
        sf.write(wav, np.full(24000 * 90 * 60, 1e-4, np.float32), 24000)
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "16000", str(wav), str(m4a)], check=True)
        tone = pub.encrypt(key, m4a.read_bytes())
    (OUT / bid / "silence-mock.enc").write_bytes(tone)
    tracks = []
    for tr in book["tracks"]:
        now, secs, paras = 0.4, {0: 0.0}, []
        for u in track_units(tr):
            now += PAUSE_BEFORE.get(u.kind, 0)
            if u.kind == "section":
                secs[u.section] = round(now, 2)
            if u.para is not None:
                paras.append([round(now, 2), u.section, u.display])
            now += len(u.spoken) / CPS + (PAUSE_AFTER_HEADING if u.kind in ("part", "title", "section") else 0.3)
        name = "silence-mock.enc"
        tracks.append({"id": tr["id"], "title": tr["title"], "part": tr["part"], "file": name, "bytes": int(now * 6000),
                       "duration": round(now, 1), "paras": paras,
                       "sections": [{"title": s["title"], "t": secs.get(i, 0.0)} for i, s in enumerate(tr["sections"])]})
    total = sum(t["duration"] for t in tracks)
    cover = pub.hashed(OUT / bid, "cover", pub.encrypt(key, pub.cover_jpeg()))
    manifest = {"id": bid, "title": book["title"], "author": book["author"], "lang": "pt-BR", "voice": "mock",
                "duration": total, "cover": cover, "tracks": tracks}
    (OUT / bid / "book.enc").write_bytes(pub.encrypt(key, json.dumps(manifest, ensure_ascii=False).encode()))
    index = {"books": [{"id": bid, "title": book["title"], "author": book["author"], "duration": total,
                        "tracks": len(tracks), "bytes": sum(t["bytes"] for t in tracks)}]}
    (OUT / "index.enc").write_bytes(pub.encrypt(key, json.dumps(index, ensure_ascii=False).encode()))
    print(f"mock library: {len(tracks)} tracks, {total / 3600:.1f} h estimated -> {OUT}")


if __name__ == "__main__":
    main()
