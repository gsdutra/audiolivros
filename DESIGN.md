---
name: Audiolivros
description: A private audiobook library drawn as a metro network — each book a line, chapters its stations, the listener the train.
colors:
  enamel: "#0B1230"
  enamel-panel: "#101A40"
  enamel-press: "#182557"
  porcelain: "#F4F1EA"
  tile: "#ECEFF3"
  tile-panel: "#FFFFFF"
  tile-press: "#DDE2EA"
  scarlet: "#E8262F"
  cobalt: "#3A73FF"
  amber: "#FFC20E"
  green: "#2BB653"
  danger: "#FF6B6B"
typography:
  unlock:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "clamp(48px, 15vw, 64px)"
    fontWeight: 700
    lineHeight: 0.92
  station:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "clamp(36px, 11.5vw, 48px)"
    fontWeight: 700
    lineHeight: 0.93
    letterSpacing: "0.005em"
  title-lg:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 700
    lineHeight: 0.95
  title:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 0.95
  title-sm:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 0.95
  card-title:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 0.98
  eta:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1
  station-list:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "0.04em"
  subtitle:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: 1.25
  reading:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.58
  input:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.2
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.12em"
  meta:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.3
  small:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.3
  caption:
    fontFamily: "Barlow Condensed, Barlow, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.1em"
rounded:
  hair: "2px"
  rail: "3px"
  cover: "4px"
  tight: "6px"
  control: "8px"
  panel: "12px"
  pill: "13px"
  sheet: "18px"
  round: "50%"
spacing:
  gutter: "20px"
  tight: "8px"
  row: "48px"
  tabs: "62px"
components:
  button-primary:
    backgroundColor: "{colors.scarlet}"
    textColor: "#FFFFFF"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "52px"
    padding: "0 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.porcelain}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    height: "48px"
  line-badge:
    backgroundColor: "{colors.scarlet}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    height: "26px"
    padding: "0 10px"
  play-ring:
    backgroundColor: "{colors.porcelain}"
    textColor: "{colors.enamel}"
    rounded: "{rounded.round}"
    size: "88px"
  input:
    backgroundColor: "{colors.enamel-panel}"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.control}"
    height: "54px"
    padding: "0 16px"
  departures-board:
    backgroundColor: "{colors.enamel-panel}"
    textColor: "{colors.porcelain}"
    rounded: "{rounded.panel}"
---

# Design System: Audiolivros

## Overview

The library is a transit network fired in midnight-blue enamel. Every book is one line in one ink; its chapters are stations, its parts are interchanges, and the listener is a porcelain train moving along it. The interface reads like station signage: condensed capitals for anything you navigate *to*, a departures board for what comes next, and a thick line you can grab and drag. It is built for glances during a commute — the answer to "where am I, and how long until the next stop?" is always one look away.

Light appearance translates the same world into station porcelain tile: cool white ground, midnight ink, the same line inks. The world never warms toward cream.

## Colors

### Primary
- **Line ink (`scarlet`, then `cobalt`, `green`, `amber`)** — one per book, assigned by library position and set as `--line`. It paints the heard part of the line, the train's ring, the part badge, primary buttons, the active tab bar marker, selection and focus. Nothing else gets it.

### Neutral
- **Enamel `#0B1230`** — the ground in dark appearance. **Enamel panel `#101A40`** for boards and cards; **enamel press `#182557`** for pressed rows.
- **Porcelain `#F4F1EA`** — all text and outlines in dark; secondary text is porcelain at 72%, tertiary at 58% (never below 4.5:1).
- **Tile `#ECEFF3` / `#FFFFFF` / `#DDE2EA`** — ground, panel and press in light appearance, with midnight ink at 74% / 64% for secondary/tertiary text.
- **Unheard line** — the line ink mixed 38% into the ground (`--line-faint`).

### Named Rules
- **One Line, One Ink.** A book's identity is its ink; a screen never shows two books' inks at once except the library list.
- **Ink Means Here or Go.** Line ink marks where you are, what you have heard, and the primary action — never decoration.

## Typography

One family in two widths, both self-hosted (SIL OFL): **Barlow Condensed** for station type, **Barlow** for reading and UI text. Numerals are tabular everywhere.

### Hierarchy
- **Station** (Condensed 700, up to 48px, uppercase, line-height 0.93): the current chapter on Ouvindo; book and screen titles at 30–44px.
- **Station list** (Condensed 600, 21px, uppercase, +0.04em): chapters on the line.
- **Label** (Condensed 600, 12–17px, uppercase, +0.06 to +0.14em): board headings, buttons, tabs, form labels.
- **ETA** (Condensed 600, 22px with a 14px unit): minutes on the departures board.
- **Body** (Barlow 400/500, 15–20px): sections, metadata, toasts.
- **Reading** (Barlow 400, 19px/1.58, max 36em): read-along text; the current paragraph at full ink, the rest at tertiary.

## Layout

A single phone column with a 20px gutter; above 700px wide it centres at 560px max with the tab bar following. Fixed bottom tab bar (62px + safe area); a floating mini-player sits 8px above it on every screen except Ouvindo. Ouvindo stacks: top bar → station → departures board → line scrubber → transport → a four-button text row (speed · timer · EQ · mark). Content clears the safe areas (`viewport-fit=cover`, black-translucent status bar).

## Elevation & Depth

Depth comes from outlines, not shadows: boards, cards, inputs and secondary buttons carry a crisp 1.5px porcelain (or midnight) rule. One soft shadow (`0 10px 30px` deep navy) lifts only floating things — the train, the play ring, the mini-player, toasts and the cover.

## Shapes

- Stations: white rings on the line (20px, 4px stroke); interchanges: larger rings (32px) or a capsule across a bundle of lines.
- The train: a porcelain disc ringed in line ink with a ground-coloured halo so it always reads on top of the line.
- Lines: 6–8px, round caps, only horizontal, vertical and 45° segments.
- Rails and hairlines 2–3px radius (half their width), cover 4px, toast actions 6px, controls 8px, panels 12px, sheets 18px on top; badges, stations, the train and round buttons fully round.

## Components

### Buttons
- **Primary** — line-ink plate, white condensed caps with +0.1em tracking, 52px tall, arrow icon trailing when it moves you somewhere.
- **Ghost** — 1.5px porcelain outline, same type; turns to a line-ink plate when it represents an active state (timer on).
- **Play ring** — 88px porcelain disc with a 6px line-ink ring and soft shadow; pulses (opacity) while a chapter decrypts.

### Line badge
Part of the book shown as a pill in line ink, set beside the station name — never above it.

### Departures board ("Próximas paradas")
Outlined panel; rows show a tick on a short line segment, the stop name, and minutes away at the current speed. Chapter stops are set in station caps with an interchange tick. While the train is dragged the heading becomes "Soltar em mm:ss".

### The line scrubber (signature)
The current chapter drawn as an 8px line with section stops; heard part in ink, the rest faint; the train is the thumb. Dragging names the stop under the finger in the station subtitle and on the board.

### The vertical line (Capítulos)
The whole book as a vertical line through station rows; parts appear as interchange rows; the current station is the train; each station expands to its section stops with start times.

### Equalizer (sheet)
Five speech bands (Graves 120 Hz, Corpo 400 Hz, Médios 1,2 kHz, Presença 3,2 kHz, Brilho 8 kHz, ±12 dB) drawn as short vertical rails; each band's value is a draggable station (the train style) and the stations are joined by the book's line in its ink, so the curve reads as a line through stations. Presets sit above as chips (Plano, Voz clara, Carro, Quente, Suave; "Personalizado" lights up when bands are edited). The EQ button in the secondary row turns into a line-ink plate while a non-flat setting is active.

### Inputs / Fields
54px, 1.5px rule, enamel-panel fill; focus swaps the rule to line ink with a 3px ink halo. Errors sit beneath in `danger`, naming the problem and the fix.

### Navigation
Tab bar of four (Ouvindo, Capítulos, Texto, Marcadores): 24px stroke icons over condensed caps; active tab in full ink with a 3px line-ink marker on top.

## Do's and Don'ts

### Do:
- **Do** draw structure as lines and stations — chapters, sections and parts are always placed on a line.
- **Do** keep every time and distance in tabular numerals, minutes-away scaled by playback speed.
- **Do** keep light mode cool porcelain tile with midnight ink.

### Don't:
- **Don't** put labels or eyebrows above headings; badges go beside the name.
- **Don't** use colored side borders on rows or cards; the line is its own element, drawn as a rail.
- **Don't** spend line ink on decoration or give a second accent colour any role.
- **Don't** let anything book-specific (cover, title text) appear in the public shell — it lives in the encrypted library.
