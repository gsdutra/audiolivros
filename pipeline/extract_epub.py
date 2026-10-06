"""Extract the narratable structure of the EPUB into build/book.json.

Output shape:
  {"title", "author", "tracks": [
      {"id", "title", "part", "sections": [{"title", "paragraphs": [str]}]}
  ]}

One track = one audio file in the app. Section titles drive in-chapter navigation.
"""
import html
import json
import re
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EPUB = Path.home() / "Downloads" / "A Startup Enxuta - Eric Ries.epub"
OUT = ROOT / "build" / "book.json"

# EPUB spine file -> (track title, part it opens or None). Files not listed are skipped
# (cover, ficha técnica, dedication, the distributor's ad page and the printed TOC).
TRACKS = [
    ("part0003", "Apresentação", None),
    ("part0004", "Introdução", None),
    ("part0006", "1. Começar", "Parte I — Visão"),
    ("part0007", "2. Definir", None),
    ("part0008", "3. Aprender", None),
    ("part0009", "4. Experimentar", None),
    ("part0011", "Como a visão leva à direção", "Parte II — Direção"),
    ("part0012", "5. Saltar", None),
    ("part0013", "6. Testar", None),
    ("part0014", "7. Medir", None),
    ("part0015", "8. Pivotar (ou perseverar)", None),
    ("part0017", "Liguem seus motores", "Parte III — Aceleração"),
    ("part0018", "9. Agrupar em lotes", None),
    ("part0019", "10. Crescer", None),
    ("part0020", "11. Adaptar", None),
    ("part0021", "12. Inovar", None),
    ("part0022", "13. Epílogo: não desperdice", None),
    ("part0023", "14. Junte-se ao movimento", None),
    ("part0024", "Em favor da transparência", None),
    ("part0025", "Agradecimentos", None),
]

HEADING = {"titulo-corpo-18-before20-LEFT", "titulo-corpo-20-before20-LEFT"}
SECTION = {"titulo-corpo-13-before10-LEFT", "texto-CAIXA-after-CENTRADO"}
# Tables, diagram captions, image holders, end-of-chapter notes and layout spacers.
SKIP_PREFIXES = ("texto-tabelas", "notas-de-rodape", "imagem-", "texto-centrado", "after")
SKIP = {"TOC", "c", "c1"}
BREAK = "separador-texto-before"
# Short acronyms that must stay upper-case when headings are converted from ALL CAPS.
ACRONYMS = {"IMVU", "MVP", "XP", "TDD", "WIP", "LTV", "GE", "SAT", "GMAT", "LSAT", "IBM", "IVP", "S/A"}


class Paragraphs(HTMLParser):
    """Yields (class, text) for each <p>, dropping footnote reference markers."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items, self.cls, self.buf, self.skip_depth, self.depth = [], None, [], 0, 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "p":
            self.cls, self.buf = a.get("class", ""), []
        elif tag == "br" and self.cls is not None:
            self.buf.append(" ")
        if tag == "span":
            self.depth += 1
            if "nota-de-rodape" in (a.get("class") or "") and not self.skip_depth:
                self.skip_depth = self.depth

    def handle_endtag(self, tag):
        if tag == "span":
            if self.skip_depth == self.depth:
                self.skip_depth = 0
            self.depth -= 1
        elif tag == "p" and self.cls is not None:
            text = re.sub(r"\s+", " ", "".join(self.buf).replace("\xa0", " ")).strip()
            if text:
                self.items.append((self.cls, text))
            self.cls = None

    def handle_data(self, data):
        if self.cls is not None and not self.skip_depth:
            self.buf.append(data)


# Headings the generic rule gets wrong.
TITLE_FIXES = {"O VALOR DOS TRÊS AS": "O valor dos três As"}


def decap(title: str) -> str:
    """'A HISTÓRIA DO SNAPTAX' -> 'A história do Snaptax' (keeps known acronyms)."""
    if title in TITLE_FIXES:
        return TITLE_FIXES[title]
    letters = [c for c in title if c.isalpha()]
    if not letters or sum(c.isupper() for c in letters) / len(letters) < 0.8:
        return title
    words = []
    for i, w in enumerate(title.split(" ")):
        core = re.sub(r"[^\w/]", "", w)
        if core in ACRONYMS or any(c.islower() for c in core):  # "TRÊS As": the mixed-case word is deliberate
            words.append(w)
        else:
            words.append(w.capitalize() if i == 0 else w.lower())
    return " ".join(words)


def main():
    with zipfile.ZipFile(EPUB) as z:
        def read(stem):
            return z.read(f"OEBPS/Text/{stem}.html").decode("utf-8")

        tracks = []
        for n, (stem, title, part) in enumerate(TRACKS):
            p = Paragraphs()
            p.feed(read(stem))
            sections = [{"title": title, "paragraphs": []}]
            for cls, text in p.items:
                if cls in HEADING or cls in SKIP or cls.startswith(SKIP_PREFIXES):
                    continue
                if cls == BREAK:
                    sections[-1]["paragraphs"].append("")  # scene break -> longer pause
                    continue
                if cls in SECTION:
                    sections.append({"title": decap(text), "paragraphs": []})
                    continue
                sections[-1]["paragraphs"].append(text)
            for s in sections:  # drop trailing/leading scene breaks
                while s["paragraphs"] and not s["paragraphs"][-1]:
                    s["paragraphs"].pop()
            sections = [s for s in sections if s["paragraphs"]]
            tracks.append({"id": f"{n:02d}", "title": title, "part": part, "sections": sections})

    book = {"title": "A Startup Enxuta", "author": "Eric Ries", "tracks": tracks}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(book, ensure_ascii=False, indent=1))
    total = 0
    for t in tracks:
        chars = sum(len(p) for s in t["sections"] for p in s["paragraphs"])
        total += chars
        print(f"{t['id']} {t['title'][:34]:34} sections={len(t['sections']):3} chars={chars:6}  ~{chars/950:5.1f} min")
    print(f"total chars={total}  ~{total/950/60:.1f} h", file=sys.stderr)


if __name__ == "__main__":
    main()
