"""Turn display text into text a pt-BR TTS model reads correctly.

Numbers, percentages, URLs and acronyms are spelled out here so every model gets the
same input; the lexicon below is the place to fix a word a model mispronounces.
"""
import re

from num2words import num2words

# Spoken form for acronyms / names models tend to mangle. Extend after listening.
LEXICON = {
    "IMVU": "I-eme-vê-u",
    "MVP": "eme-vê-pê",
    "MVPs": "eme-vê-pês",
    "WIP": "dáblio-i-pê",
    "LTV": "ele-tê-vê",
    "TDD": "tê-dê-dê",
    "API": "a-pê-i",
    "TI": "tê-i",
    "UX": "u-xis",
    "QA": "quê-a",
    "PC": "pê-cê",
    "HP": "agá-pê",
    "IBM": "i-bê-eme",
    "AOL": "a-ó-ele",
    "NPS": "ene-pê-esse",
    "XP": "xis-pê",
    "três As": "três ás",
    "Laudry": "Laundry",  # the edition misspells "Village Laundry Service"
}

ROMAN = {"II": 2, "III": 3, "IV": 4, "XIX": 19, "XX": 20, "XXI": 21}
FEMININE_EXCEPTIONS = {"dia", "dias", "problema", "problemas", "sistema", "sistemas", "programa",
                       "programas", "tema", "temas", "mapa", "mapas", "clima", "planeta", "idioma"}


def _int_words(n: int, next_word: str = "") -> str:
    w = num2words(n, lang="pt_BR")
    nw = next_word.lower()
    if nw.endswith(("a", "as")) and nw not in FEMININE_EXCEPTIONS and not nw.startswith("mil"):
        w = re.sub(r"\bum$", "uma", w)
        w = re.sub(r"\bdois$", "duas", w)
        w = re.sub(r"entos\b", "entas", w)
    return w


def _number(m: re.Match) -> str:
    raw, nxt = m.group(1), m.group(2) or ""
    if "," in raw:  # pt-BR decimal: 30,6 -> trinta vírgula seis
        whole, frac = raw.replace(".", "").split(",")
        frac_words = " ".join(num2words(int(d), lang="pt_BR") for d in frac) if frac.startswith("0") \
            else num2words(int(frac), lang="pt_BR")
        return f"{num2words(int(whole), lang='pt_BR')} vírgula {frac_words}{nxt}"
    return _int_words(int(raw.replace(".", "")), nxt.strip()) + nxt


def _url(m: re.Match) -> str:
    u = re.sub(r"^https?://(www\.)?", "", m.group(1)).rstrip("/")
    u = u.split("/")[0]
    return u.replace(".", " ponto ").replace("-", " ")


def normalize(text: str) -> str:
    t = text
    t = re.sub(r"<?(https?://[^\s>]+)>?", _url, t)
    t = re.sub(r"\bwww\.([^\s,;]+)", lambda m: _url(re.match(r"(.*)", m.group(1))), t)
    t = t.replace("&", " e ").replace("…", "...")
    t = re.sub(r"\s*[–—]\s*", ", ", t)
    t = re.sub(r"US\$ ?([\d.,]+)( mil| milhões| milhão| bilhões| bilhão)?",
               lambda m: f"{m.group(1)}{m.group(2) or ''} dólares", t)
    t = re.sub(r"R\$ ?([\d.,]+)( mil| milhões| milhão| bilhões| bilhão)?",
               lambda m: f"{m.group(1)}{m.group(2) or ''} reais", t)
    t = re.sub(r"(\d+(?:,\d+)?) ?%", r"\1 por cento", t)
    t = re.sub(r"(\d+)º", lambda m: num2words(int(m.group(1)), lang="pt_BR", to="ordinal"), t)
    t = re.sub(r"(\d+)ª", lambda m: re.sub(r"o\b", "a", num2words(int(m.group(1)), lang="pt_BR", to="ordinal")), t)
    t = re.sub(r"\b(século|Século|Parte|parte) (II|III|IV|XIX|XX|XXI)\b",
               lambda m: f"{m.group(1)} {num2words(ROMAN[m.group(2)], lang='pt_BR')}", t)
    t = re.sub(r"\b(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\b(\s+\w+)?", _number, t)
    for k, v in LEXICON.items():
        t = re.sub(rf"\b{re.escape(k)}\b", v, t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


SENTENCE_END = re.compile(r"(?<=[.!?…:;])[”\"’)]*\s+(?=[“\"(]?[A-ZÁÉÍÓÚÂÊÔÃÕÀÇ0-9])")


def chunk(text: str, max_chars: int = 280) -> list[str]:
    """Split a paragraph into sentence-aligned chunks no longer than max_chars."""
    sentences = [s.strip() for s in SENTENCE_END.split(text) if s.strip()]
    out, cur = [], ""
    for s in sentences:
        while len(s) > max_chars:  # very long sentence: break at a comma near the limit
            cut = s.rfind(", ", 0, max_chars)
            cut = cut if cut > max_chars // 3 else s.rfind(" ", 0, max_chars)
            if cur:
                out.append(cur)
                cur = ""
            out.append(s[: cut + 1].strip())
            s = s[cut + 1:].strip()
        if cur and len(cur) + 1 + len(s) > max_chars:
            out.append(cur)
            cur = s
        else:
            cur = f"{cur} {s}".strip()
    if cur:
        out.append(cur)
    return out


if __name__ == "__main__":
    for s in [
        "Processamos 116 mil quilos, em 2010 (versus 30,6 mil quilos em 2009). Quase 60% do negócio.",
        "Uma garota de 17 anos e 2 empresas com 200 pessoas e 1.500 clientes no século XXI – veja <http://theleanstartup.com>.",
        "A IMVU lançou um MVP por US$ 50 mil. Foi a 3ª vez em 0,02 segundo.",
    ]:
        print(normalize(s))
