# A Startup Enxuta — audiobook PWA

## What I understood

1. Turn the EPUB in `~/Downloads` into a Brazilian-Portuguese audiobook, using a TTS model that runs
   locally on this Mac (M3, 16 GB RAM, ~15 GB free disk).
2. Before converting everything, render the same short passage with several models so you can pick
   the voice by ear.
3. Build a PWA you add to the iPhone home screen. It lists the book by part, chapter and section,
   plays the audio, and remembers where you stopped. It's hosted for free (GitHub Pages).

## The book, as extracted

- 20 audio tracks: Apresentação, Introdução, 3 parts (Visão, Direção, Aceleração) with 14
  chapters plus 2 part intros, then "Em favor da transparência" and "Agradecimentos".
- 134 section headings inside the chapters, which become the in-chapter navigation.
- ~530k characters of narratable text, roughly **9–11 h of audio** depending on the voice's pace.
- **Narrated:** body text, block quotes, and sidebar boxes (e.g. the box on agile methods).
- **Skipped:** cover, technical sheet, the distributor's ad page, printed table of contents,
  tables and diagram labels (they don't make sense read aloud), footnote markers, and the
  end-of-chapter notes (mostly URLs).

## Components and data flow

```
EPUB ─► extract_epub.py ─► build/book.json   (tracks → sections → paragraphs, display text)
                                │
                     normalize.py (numbers, %, URLs, acronyms → spoken pt-BR; editable lexicon)
                                │
                     synthesize.py (winning model via mlx-audio, chunk ≤ ~300 chars,
                                │   per-chunk WAV cache → resumable; optional Whisper check
                                │   that re-renders chunks that skip/repeat/hallucinate)
                                │
                     assemble.py  (pauses: sentence 0.25 s · paragraph 0.6 s · section 1.2 s,
                                │   loudness-normalise, AAC mono ~48 kbps .m4a via macOS afconvert,
                                │   record start time of every section and paragraph)
                                │
                     app/audio/NN.m4a(.enc) + app/manifest(.enc)
                                │
GitHub Pages ◄──────────────────┘    iPhone PWA: fetch → (decrypt) → <audio> + Media Session
```

**App (vanilla HTML/CSS/JS, no build step):**
- Home screen with a big "Continuar" button showing chapter, position and % of the book.
- Chapter list grouped by part, with per-chapter progress. Each chapter expands to its
  sections; tap one to jump there.
- Player: play/pause, ±15 s / 30 s, scrubber, speed 0.8–2×, sleep timer (15/30/60 min or end of
  chapter), next/previous chapter, auto-advance.
- Lock screen and AirPods controls (Media Session API).
- Position saved to `localStorage` every few seconds and on pause/background, so the app resumes
  exactly where you left off.
- Offline: a service worker caches the app; chapters are cached as you play them, plus a
  "baixar tudo" button (~250–300 MB).

## Decisions for you

1. **Where the audio lives (privacy).** The audio is a full copy of a copyrighted book. Free
   GitHub Pages needs a public repo and a public site, so plain `.m4a` files there would be
   downloadable by anyone, and could get a DMCA takedown. Options:
   - **(Recommended) Encrypted on GitHub Pages:** audio and chapter text are AES-256-GCM encrypted
     at build time. You type a passphrase once on the iPhone; the app decrypts in the browser.
     Still free and one-click deploy, but the files are useless without the passphrase.
   - **Nothing online:** the public app holds no book content. You AirDrop or iCloud the audio
     folder to the iPhone and import it once into the app (stored in the PWA's own storage).
     The most private option, but there's a manual import step, and removing the app from the
     home screen deletes the audio.
2. **Voice / model:** pick from the comparison page.
3. **Extras:** read-along text (show and highlight the paragraph being spoken; tap a paragraph
   to jump to it) and bookmarks.

## Assumptions

- You'll listen in pt-BR. The edition is Brazilian, and I'll favour pt-BR voices.
- One audio file per chapter (max ~75 min ≈ 27 MB) is fine. The trade-off: with encryption the
  whole chapter downloads before it starts the first time (a few seconds on 4G). After that it
  plays from cache.
- GitHub limits are OK: ≤ 1 GB site, ≤ 100 MB per file; we'll be at ~300 MB.
- The Mac can stay awake for a long run (`caffeinate`). It's resumable if interrupted.

## Trade-offs I chose

- **mlx-audio on Apple Silicon** over PyTorch/Coqui: native Metal speed, one install covers
  Kokoro, Voxtral, Qwen3-TTS and Chatterbox, and it fits in 16 GB.
- **Preset or described voices, no cloning** of any real person's voice.
- **AAC .m4a** over Opus/MP3: native on iOS, good quality at low bitrates, encoded by macOS itself.
- **Vanilla JS** over a framework: no build tooling, and it deploys as plain static files.
- **Per-paragraph timings** stored in the manifest. They're cheap to produce and enable section
  jumps and read-along.

## Where this can break

- **LLM-based voices (Voxtral, Qwen3, Chatterbox)** sometimes skip words, repeat a phrase or
  mumble on long chunks. Mitigation: small chunks plus an automatic speech-recognition pass that
  re-renders bad chunks. Kokoro and Luciana don't have this failure mode, but sound flatter.
- **Generation time.** Kokoro takes ~3 h for the whole book. The 1.7B–4B models could take
  10–20 h on an M3 and will run overnight.
- **English names and acronyms** (Dropbox, IMVU, Toyota, kanban…) may come out with odd
  pronunciation. The lexicon in `pipeline/normalize.py` fixes them once you point them out.
- **iOS PWA audio quirks.** Background playback works with `<audio>` + Media Session on current
  iOS, but auto-advancing to the next chapter while the screen is locked needs the next chapter
  already downloaded. The app prefetches it.
- **iOS storage.** Home-screen apps aren't subject to Safari's 7-day eviction, but deleting the
  home-screen icon wipes the cache and progress.
- **Disk.** ~15 GB free now. I delete losing models after you choose.
