# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

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
