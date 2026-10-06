"""Turn build/book.json into a narration script: what is spoken, in what order, with which pauses.

Each track becomes a list of Units. A unit is one paragraph or heading; synthesize.py splits it
into model-sized chunks, and assemble.py records the unit's start time for navigation/read-along.
"""
import json
import re
from dataclasses import dataclass
from pathlib import Path

from num2words import num2words

from normalize import normalize

ROOT = Path(__file__).resolve().parent.parent
BOOK = ROOT / "build" / "book.json"

# Silence (seconds) inserted *before* a unit of the given kind, and after every chunk.
PAUSE_BEFORE = {"part": 0.6, "title": 0.6, "section": 1.4, "para": 0.65, "break": 0.0}
PAUSE_AFTER_HEADING = 0.9
PAUSE_BREAK = 1.6
PAUSE_CHUNK = 0.22
TAIL = 1.5


@dataclass
class Unit:
    kind: str          # part | title | section | para | break
    display: str       # text shown in the app ("" for breaks)
    spoken: str        # text sent to the TTS model
    section: int       # index into the track's sections
    para: int | None   # index into the track's paragraphs (read-along), None for headings


ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5}


def spoken_part(part: str) -> str:
    m = re.match(r"Parte (\w+) — (.+)", part)
    n = ROMAN.get(m.group(1), m.group(1))
    return f"Parte {num2words(n, lang='pt_BR')}. {m.group(2)}."


def spoken_title(title: str) -> str:
    m = re.match(r"(\d+)\. (.+)", title)
    if m:
        return f"Capítulo {num2words(int(m.group(1)), lang='pt_BR')}. {normalize(m.group(2))}."
    return normalize(title).rstrip(".") + "."


def load_book() -> dict:
    return json.loads(BOOK.read_text())


def track_units(track: dict) -> list[Unit]:
    units: list[Unit] = []
    if track["part"]:
        units.append(Unit("part", track["part"], spoken_part(track["part"]), 0, None))
    units.append(Unit("title", track["title"], spoken_title(track["title"]), 0, None))
    para_i = 0
    for si, sec in enumerate(track["sections"]):
        if si > 0:
            units.append(Unit("section", sec["title"], normalize(sec["title"]).rstrip(".:") + ".", si, None))
        for p in sec["paragraphs"]:
            if not p:
                units.append(Unit("break", "", "", si, None))
                continue
            units.append(Unit("para", p, normalize(p), si, para_i))
            para_i += 1
    return units


if __name__ == "__main__":
    book = load_book()
    for u in track_units(book["tracks"][2])[:6]:
        print(u.kind, "|", u.spoken[:100])
