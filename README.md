# InfoGenius — Standalone Visual Knowledge Engine

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Deploy to GitHub Pages](https://github.com/dr-richard-barker/infogenius-standalone/actions/workflows/deploy.yml/badge.svg)](https://github.com/dr-richard-barker/infogenius-standalone/actions/workflows/deploy.yml)
<!-- After the first Zenodo release, replace the line below with the DOI badge Zenodo gives you: -->
<!-- [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.XXXXXXX.svg)](https://doi.org/10.5281/zenodo.XXXXXXX) -->

Research any topic and compose a **cited infographic — entirely in your browser.**
No Google GenAI, no AI Studio, no API key, no server. (An **optional** bring-your-own-key
path can call the Gemini image API at runtime — see below — but nothing Google is bundled.)

**Live site:** https://dr-richard-barker.github.io/infogenius-standalone/

This is a standalone conversion of the
[Copy-of-InfoGenius-to-evolve-customize](https://github.com/dr-richard-barker/Copy-of-InfoGenius-to-evolve-customize)
AI Studio prototype. It keeps the same **datamining → summary → infographic** workflow,
but every dependency that required a paid Gemini key or the AI Studio runtime has been removed.

## What changed vs. the prototype

| Prototype (AI Studio) | Standalone (this repo) |
| --- | --- |
| Research via **Gemini + Google Search grounding** (paid key) | Research via the **keyless, CORS-enabled Wikipedia REST + MediaWiki APIs** |
| Facts + sources from the LLM's grounding chunks | Facts from a local **extractive summarizer**; sources are real Wikipedia article URLs |
| Infographic from **Gemini image model** (raster PNG) | Infographic from a deterministic **in-browser SVG renderer** (vector, reproducible) |
| "Enhance" = LLM image edit | "Restyle" = deterministic layout/accent variation (or AI edit if a key is supplied) |
| `@google/genai`, `process.env.API_KEY`, `window.aistudio` key gate | none by default — zero secrets; optional user-supplied key |

Everything else is preserved: complexity / visual-style / colour-scheme / background
options, 10-language support (via Wikipedia language editions), CSV batch processing,
GitHub sync, history grid, metadata CSV export, dark mode, fullscreen + zoom, and
SVG/PNG download.

## Run locally

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev      # http://localhost:3000
```

Build the static site:

```bash
npm run build    # outputs to dist/
npm run preview  # serve the built site locally
```

## Deploy as a GitHub webpage

The included workflow at `.github/workflows/deploy.yml` builds and publishes to
**GitHub Pages** automatically:

1. Push this project to a GitHub repository.
2. In the repo, go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` (or run the workflow manually). The site deploys to
   `https://<user>.github.io/<repo>/`.

`vite.config.ts` uses `base: './'`, so the build works on a Pages project sub-path with
no extra configuration.

## Optional: AI image generation (bring your own key)

The default experience is 100% keyless. If you *want* AI-painted raster infographics instead
of the deterministic SVG, click the ✨ icon in the top bar and paste your own
[Google Gemini API key](https://aistudio.google.com/apikey):

- The key is stored only in your browser's `localStorage` and is sent only to Google's API,
  only when you generate. It is never bundled in the build, logged, or sent anywhere else.
- Implemented as plain REST calls in `services/aiImageService.ts` — there is **no
  `@google/genai` package** and no Google code in the repository or the build output.
- You can set any image-capable Gemini model id your key can access. If a generation fails,
  the app automatically falls back to the built-in SVG infographic.
- With AI mode on, the "Restyle" bar performs a real AI image edit of the current raster.

Leave it off and the tool remains fully functional with zero external credentials.

## How it works

- **`services/researchService.ts`** — queries Wikipedia for the topic, pulls the best
  article's intro extract, and ranks sentences into 3–6 bullet facts (more facts at higher
  complexity). Language selection maps to the matching Wikipedia edition.
- **`services/infographicRenderer.ts`** — composes a self-contained SVG poster: title,
  audience badge, numbered fact panels, and a footer with the cited-source count. Palettes
  and typography follow the colour-scheme, background and visual-style selections. Output is
  a `data:image/svg+xml` URL, with a canvas rasterizer for PNG export.

## Notes & limits

- The tool depends on Wikipedia being reachable from the browser (public CORS API). No key,
  but it does need an internet connection.
- The infographic is a **designed, text-accurate vector layout**, not an AI-painted
  illustration. For scientific figures this is usually an advantage — it is reproducible,
  legible and editable.
- GitHub sync requires a personal access token (stored only in your browser's
  `localStorage`); it is never sent anywhere except GitHub's own API.

## Archiving & citation (Zenodo)

This repository is packaged for archiving on [Zenodo](https://zenodo.org):

- `CITATION.cff` — machine-readable citation metadata (GitHub renders a "Cite this repository" button).
- `.zenodo.json` — Zenodo deposition metadata (authors, keywords, license, related identifiers).
- `LICENSE` — Apache-2.0.

To mint a DOI:

1. Sign in to Zenodo with GitHub and flip the switch for this repository on the
   [Zenodo GitHub page](https://zenodo.org/account/settings/github/).
2. Create a GitHub **Release** (e.g. `v1.0.0`). Zenodo automatically archives it and issues a DOI.
3. Copy the DOI badge Zenodo shows you into the badge placeholder near the top of this README.

Please cite the archived version. Until the DOI is minted, cite:

> Barker, R. (2026). *InfoGenius — Standalone Visual Knowledge Engine* (v1.0.0) [Software].
> https://github.com/dr-richard-barker/infogenius-standalone

## License

Apache-2.0 (inherited from the source prototype). See [LICENSE](LICENSE).
Copyright 2026 Richard Barker.
