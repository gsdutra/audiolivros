# Audiolivros

A private audiobook library for the iPhone (PWA), made from your own EPUBs with a TTS model running
locally on this Mac. The book content is AES-256 encrypted before it leaves the Mac; the app
decrypts it on the phone with your library passphrase (`.secrets/passphrase`, never committed).

**Live:** https://gsdutra.github.io/audiolivros/

## On the iPhone

1. Open the link above in Safari, then tap Share → **Adicionar à Tela de Início**.
2. Open **Audiolivros** from the home screen and type the passphrase (`cat .secrets/passphrase` on
   the Mac). Do it inside the home-screen app: it has its own storage, separate from Safari.
3. Optional: library → **Baixar** to keep the whole book offline.

## Render progress

```bash
.venv/bin/python pipeline/status.py
```

Shows each chapter's progress, which ones are ready to publish, current speed, ETA, and whether the
renderer is still running (with the restart command if it isn't). The raw log is `build/synth.log`.

## Publishing new chapters

The render publishes chapters into `app/library/` as they finish. To put them online:

```bash
pipeline/deploy.sh
```

It commits `app/` (encrypted files only) and pushes; GitHub Actions deploys within a minute. In the
app, new chapters appear the next time it opens.

## Layout

- `pipeline/`: EPUB → narration → audio → encrypted library
  - `extract_epub.py`: book structure (`build/book.json`), with tracks, sections and paragraphs
  - `normalize.py`: numbers, %, URLs and acronyms as spoken pt-BR; **`LEXICON`** fixes pronunciations
  - `synthesize.py`: renders chunks (cached, resumable), checks each with Whisper (`qa.py`), and
    publishes each chapter when it's done
  - `publish.py`: assembles chapters, encodes AAC, encrypts, and writes `app/library/`
  - `run_book.sh`: long unattended render (keeps the Mac awake, restarts on crash)
- `app/`: the PWA (plain HTML/CSS/JS), deployed as-is to GitHub Pages
- `bakeoff/`: the voice comparison (`index.html` is self-contained)

## Commands

```bash
.venv/bin/python pipeline/extract_epub.py
```

```bash
nohup pipeline/run_book.sh voxtral-male > build/synth.log 2>&1 &
```

```bash
tail -f build/synth.log
```

```bash
.venv/bin/python pipeline/devserver.py 8766
```

The first renders the book structure, the second renders and publishes the whole book (resumable:
just run it again after an interruption), the third shows progress, and the fourth serves the app
locally at http://localhost:8766.

After fixing a word in `LEXICON`, rerun `run_book.sh`: only the chunks whose text changed are
re-rendered. Chunks the Whisper check flagged are listed in `build/qa/voxtral-male.jsonl`.
