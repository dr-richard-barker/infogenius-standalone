# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [1.3.0] — 2026-07-11

### Changed
- **Much richer image prompts.** The prompt builder now cleans the raw topic (collapses whitespace,
  drops duplicate words like "root … root" and connective noise) and composes a coherent scene:
  a fact-driven infographic when on-topic research exists, or a detailed labeled scientific illustration
  otherwise. Adds explicit quality guidance and an "avoid gibberish text / watermarks" negative prompt.
- Applies to both the free (Pollinations) and bring-your-own-key (Gemini) image engines.

### Notes
- `enhance=true` on the free endpoint was evaluated but rejected — it added ~40s latency with no
  reliable quality gain; prompt quality is now handled deterministically in-app instead.

## [1.2.0] — 2026-07-11

### Fixed
- Niche/multi-keyword or misspelled topics (e.g. "hsp22 arabidopsis root … tip atlas") no longer
  hard-fail with "No articles found". Research now cascades: exact query → spelling suggestion →
  progressively broadened phrase → individual keywords, and **never throws** on an empty result.
- If no encyclopedic article matches, the app still generates the image directly from your text
  instead of aborting. The SVG renderer handles zero facts (previously divided by zero → blank image).

### Changed
- AI image engines now always illustrate the user's own topic text, and only use research facts when
  the matched article is actually on-topic — so a loosely-related Wikipedia hit can't skew the picture.
- Added a non-blocking amber notice when there is no (or only a loose) Wikipedia match.

## [1.1.0] — 2026-07-11

### Added
- **Keyless real AI image generation** via the public Pollinations endpoint
  (`services/freeImageService.ts`) — no API key and no token required.
- An **image-engine selector** (AI Image · Free / Infographic · SVG / AI Image · Your Key),
  persisted in `localStorage`; the free AI image is now the default.
- Automatic fallback to the offline SVG infographic if a remote image fails to load, plus a
  loading overlay while a free-AI image renders server-side.

### Changed
- The bring-your-own-key panel is now clearly optional (the free engine needs no key).
- GitHub sync and metadata export handle remote image URLs (recorded as URLs; binaries skipped).

## [1.0.0] — 2026-07-10

### Added
- Standalone, keyless conversion of the InfoGenius AI Studio / Gemini prototype.
- Keyless datamining + summarization via the Wikipedia REST + MediaWiki APIs
  (`services/researchService.ts`), with 10-language support via Wikipedia language editions.
- Deterministic in-browser SVG infographic renderer (`services/infographicRenderer.ts`)
  with palettes for every colour scheme, background and visual style; SVG + PNG export.
- Optional bring-your-own-key AI image path (`services/aiImageService.ts`) that calls the
  Google Gemini image API over plain REST at runtime — no `@google/genai` package bundled.
- GitHub Pages deploy workflow (`.github/workflows/deploy.yml`).
- Zenodo packaging: `CITATION.cff`, `.zenodo.json`, `LICENSE` (Apache-2.0).

### Removed
- `@google/genai` dependency, the AI Studio `window.aistudio` key gate,
  `process.env.API_KEY`, and the `aistudiocdn` import map.

### Fixed
- SVG `font-family` values used nested double quotes, producing an invalid document and a
  blank image; switched inner quotes to single quotes.
