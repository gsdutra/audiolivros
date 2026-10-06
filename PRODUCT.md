# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Plain static HTML/CSS/JS, no build step and no dependencies, deployed to GitHub Pages. The user
chose this over a framework + Vite.

## Users

One person, the owner, listening on an iPhone with the app added to the home screen. They mostly
listen while commuting or driving, so the phone is often locked, pocketed or mounted. Control
mostly happens through the lock screen, AirPods or a quick glance plus a tap.

## Product Purpose

A private personal audiobook library. The owner turns EPUBs they have into pt-BR audiobooks with
a TTS model running locally on their Mac, then listens on the iPhone. Success: open the app
(or just press play on the lock screen) and continue exactly where they stopped, with no setup or
hunting. The first book is "A Startup Enxuta" (Eric Ries); more will be added with the same
pipeline.

## Positioning

The audio is made by the owner from their own books, and the app knows the book's structure
down to the paragraph. That allows navigation by part, chapter and section, read-along text
synchronized to the narration, and tap-a-paragraph-to-jump. A generic audio player can't do that.

## Operating Context

- Mostly used in short sessions in transit: unlock, resume, lock the phone. Lock-screen and
  AirPods controls (Media Session) carry most of the interaction.
- Network may be poor in transit. Chapters must play from the offline cache.
- Content is AES-GCM encrypted on the public host. A passphrase is typed once per device.
- Book audio is one file per chapter. The manifest carries the times of sections and paragraphs.

## Capabilities and Constraints

- Library home (one book now, more later). Each book has its parts, chapters and sections.
- Player: play/pause, skip back/forward, previous/next chapter, scrubber, speed, sleep timer.
- Auto-resume: the position is saved locally and continuously.
- Read-along text with the current paragraph highlighted; tap a paragraph to seek there.
- Bookmarks with optional notes.
- Offline caching, per chapter and "download everything".
- The UI is in Portuguese (pt-BR).
- The book's cover and text are copyrighted and live only inside the encrypted payload. The public
  shell (icons, app name) must not use the cover art.

## Evidence on Hand

- Book text, structure and cover come from the user's EPUB. They're extracted into
  `build/book.json`, which is gitignored and never published unencrypted.
- No other assets yet. The app icon is to be authored.

## Product Principles

1. Resume beats everything. The path from opening the app to hearing the book is one tap or none.
2. Glanceable while moving. Large targets, clear current position, nothing that needs reading
   mid-commute.
3. The book's structure is the navigation. Parts, chapters and sections, not a raw timeline.
4. Private by construction. Nothing readable about the book is public.

## Accessibility & Inclusion

Large touch targets (≥ 44 pt, primary controls much larger). Must remain usable with VoiceOver
and Dynamic Type-like text scaling, and in both light and dark system appearances.
