"""Assemble chapters from the chunk cache, encode AAC, encrypt, and write the app's library files.

usage: .venv/bin/python pipeline/publish.py <voice> [track ids...]

Writes (all book content AES-256-GCM encrypted; only vault.json is readable):
  app/library/vault.json         KDF salt/iterations + a check blob for the passphrase
  app/library/index.enc          the list of books
  app/library/<book>/book.enc    chapters, sections and paragraph timings (read-along text)
  app/library/<book>/cover-<hash>.enc   cover image
  app/library/<book>/<track>-<hash>.enc chapter audio (AAC in .m4a); hashed names = safe to cache forever
The passphrase lives in .secrets/passphrase (gitignored); it is created on first run.
"""
import base64
import hashlib
import io
import json
import os
import secrets
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

import numpy as np
import soundfile as sf
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

sys.path.insert(0, str(Path(__file__).resolve().parent))
from normalize import chunk  # noqa: E402
from script import (PAUSE_AFTER_HEADING, PAUSE_BEFORE, PAUSE_BREAK, PAUSE_CHUNK, ROOT, TAIL,  # noqa: E402
                    load_book, track_units)
from synthesize import cache_path  # noqa: E402
from tts import SAMPLE_RATE, VOICES, silence, trim  # noqa: E402

from extract_epub import EPUB  # noqa: E402

LIB = ROOT / "app" / "library"
SECRET = ROOT / ".secrets" / "passphrase"
ITERATIONS = 600_000
BITRATE = 48_000
WORDS = ("abacaxi amora anzol areia arraia baleia bambu barco bigode bolacha bossa brisa buriti cacau caju "
         "caneca canoa capim carimbo cavaco cerrado chuva cipó coco coruja cuíca farol feijão figo floresta "
         "fubá galo garoa goiaba graviola guaraná ipê jabuti jaca jangada jardim lagoa laranja limão lua "
         "maracujá mandacaru mangue maré melado mel milho moqueca morro neblina orvalho palmeira pandeiro "
         "papagaio pequi peteca pipoca pitanga quiabo quintal rapadura rede riacho sabiá samba serra "
         "sertão sol tapioca tatu trovão tucano umbu urucum varanda vento viola xaxado zabumba").split()


def b64(b: bytes) -> str:
    return base64.b64encode(b).decode()


def passphrase() -> str:
    if not SECRET.exists():
        SECRET.parent.mkdir(exist_ok=True)
        SECRET.write_text("-".join(secrets.choice(WORDS) for _ in range(5)) + "\n")
        SECRET.chmod(0o600)
        print(f"created a new passphrase in {SECRET.relative_to(ROOT)}")
    return SECRET.read_text().strip()


def vault_key() -> bytes:
    """Derive the AES key, creating vault.json on first run and refusing a mismatched passphrase."""
    pw = passphrase().encode()
    vault_file = LIB / "vault.json"
    if vault_file.exists():
        v = json.loads(vault_file.read_text())
        key = hashlib.pbkdf2_hmac("sha256", pw, base64.b64decode(v["salt"]), v["iter"], 32)
        try:
            decrypt(key, base64.b64decode(v["check"]))
        except Exception:
            sys.exit("The passphrase in .secrets/passphrase does not open app/library/vault.json. "
                     "Delete app/library to re-encrypt everything with the new passphrase.")
        return key
    salt = os.urandom(16)
    key = hashlib.pbkdf2_hmac("sha256", pw, salt, ITERATIONS, 32)
    LIB.mkdir(parents=True, exist_ok=True)
    vault_file.write_text(json.dumps({"v": 1, "kdf": "PBKDF2-SHA256", "iter": ITERATIONS, "salt": b64(salt),
                                      "check": b64(encrypt(key, b"audiolivros"))}))
    return key


def encrypt(key: bytes, data: bytes) -> bytes:
    iv = os.urandom(12)
    return iv + AESGCM(key).encrypt(iv, data, None)


def decrypt(key: bytes, blob: bytes) -> bytes:
    return AESGCM(key).decrypt(blob[:12], blob[12:], None)


def book_id(title: str) -> str:
    """Opaque folder name so the public paths don't spell out the title."""
    return hashlib.sha256(f"audiolivros:{title}".encode()).hexdigest()[:10]


def hashed(folder: Path, stem: str, blob: bytes) -> str:
    """Write blob as <stem>-<hash>.enc and drop older versions: the app caches these files forever."""
    name = f"{stem}-{hashlib.sha256(blob).hexdigest()[:10]}.enc"
    for old in folder.glob(f"{stem}-*.enc"):
        if old.name != name:
            old.unlink()
    (folder / name).write_bytes(blob)
    return name


def assemble(track: dict, voice) -> tuple[np.ndarray, dict]:
    """Concatenate cached chunks with pauses; return audio plus section/paragraph start times."""
    pieces, n = [silence(0.4)], int(SAMPLE_RATE * 0.4)
    sections, paras = {0: 0.0}, []
    for u in track_units(track):
        if u.kind == "break":
            pieces.append(silence(PAUSE_BREAK))
            n += int(SAMPLE_RATE * PAUSE_BREAK)
            continue
        gap = silence(PAUSE_BEFORE[u.kind]) if len(pieces) > 1 else silence(0)
        pieces.append(gap)
        n += len(gap)
        start = n / SAMPLE_RATE
        if u.kind == "section":
            sections[u.section] = round(start, 2)
        if u.para is not None:
            paras.append([round(start, 2), u.section, u.display])
        for c in chunk(u.spoken, voice.max_chars):
            p = cache_path(voice.name, c)
            if not p.exists():
                raise SystemExit(f"missing chunk for track {track['id']} (run synthesize.py first): {c[:70]}")
            a, _ = sf.read(p, dtype="float32")
            a = trim(a)
            pieces += [a, silence(PAUSE_CHUNK)]
            n += len(a) + int(SAMPLE_RATE * PAUSE_CHUNK)
        if u.kind in ("part", "title", "section"):
            pieces.append(silence(PAUSE_AFTER_HEADING))
            n += int(SAMPLE_RATE * PAUSE_AFTER_HEADING)
    pieces.append(silence(TAIL))
    audio = np.concatenate(pieces)
    meta = {
        "sections": [{"title": s["title"], "t": sections.get(i, 0.0)} for i, s in enumerate(track["sections"])],
        "paras": paras,
    }
    return level(audio), meta


def level(a: np.ndarray, target_db: float = -19.0) -> np.ndarray:
    """Match speech loudness across chapters (RMS over voiced samples), keeping peaks below -1 dBFS."""
    voiced = a[np.abs(a) > 0.02]
    if len(voiced):
        a = a * (10 ** (target_db / 20) / np.sqrt(np.mean(voiced ** 2)))
    peak = np.max(np.abs(a))
    return a * (0.89 / peak) if peak > 0.89 else a


def to_aac(audio: np.ndarray) -> bytes:
    with tempfile.TemporaryDirectory() as d:
        wav, m4a = Path(d) / "t.wav", Path(d) / "t.m4a"
        sf.write(wav, audio, SAMPLE_RATE, subtype="PCM_16")
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", str(BITRATE), "-q", "127",
                        str(wav), str(m4a)], check=True)
        return m4a.read_bytes()


def cover_jpeg() -> bytes:
    with zipfile.ZipFile(EPUB) as z, tempfile.TemporaryDirectory() as d:
        src = Path(d) / "cover.jpeg"
        src.write_bytes(z.read("OEBPS/Images/cover.jpeg"))
        subprocess.run(["sips", "-Z", "900", "-s", "formatOptions", "82", str(src)], check=True, capture_output=True)
        return src.read_bytes()


def main(voice_name: str, only: list[str]):
    voice = VOICES[voice_name]
    key = vault_key()
    book = load_book()
    bid = book_id(book["title"])
    out = LIB / bid
    out.mkdir(parents=True, exist_ok=True)

    manifest_file = out / "book.enc"
    old = json.loads(decrypt(key, manifest_file.read_bytes())) if manifest_file.exists() else {"tracks": []}
    old_tracks = {t["id"]: t for t in old["tracks"]}

    tracks = []
    for t in book["tracks"]:
        if only and t["id"] not in only:
            if t["id"] in old_tracks:
                tracks.append(old_tracks[t["id"]])
            continue
        audio, meta = assemble(t, voice)
        blob = encrypt(key, to_aac(audio))
        name = hashed(out, t["id"], blob)
        dur = round(len(audio) / SAMPLE_RATE, 2)
        tracks.append({"id": t["id"], "title": t["title"], "part": t["part"], "file": name,
                       "bytes": len(blob), "duration": dur, **meta})
        print(f"{t['id']} {t['title'][:32]:32} {dur / 60:5.1f} min  {len(blob) / 1e6:5.1f} MB", flush=True)

    total = sum(t["duration"] for t in tracks)
    manifest = {"id": bid, "title": book["title"], "author": book["author"], "lang": "pt-BR",
                "voice": voice.label, "duration": round(total, 1), "tracks": tracks}
    manifest["cover"] = old.get("cover") if (out / str(old.get("cover"))).exists() else hashed(out, "cover", encrypt(key, cover_jpeg()))
    manifest_file.write_bytes(encrypt(key, json.dumps(manifest, ensure_ascii=False).encode()))

    index_file = LIB / "index.enc"
    index = json.loads(decrypt(key, index_file.read_bytes())) if index_file.exists() else {"books": []}
    entry = {"id": bid, "title": book["title"], "author": book["author"], "duration": manifest["duration"],
             "tracks": len(tracks), "bytes": sum(t["bytes"] for t in tracks)}
    index["books"] = [b for b in index["books"] if b["id"] != bid] + [entry]
    index_file.write_bytes(encrypt(key, json.dumps(index, ensure_ascii=False).encode()))
    print(f"published {book['title']}: {len(tracks)} tracks, {total / 3600:.1f} h, "
          f"{entry['bytes'] / 1e6:.0f} MB -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
