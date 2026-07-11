# InfoGenius Standalone — Conversion Plan

Living checklist for converting the **Copy-of-InfoGenius-to-evolve-customize** AI Studio / Gemini
prototype into a **standalone, keyless, browser-native tool** deployable as a GitHub Pages website.

Source prototype: https://github.com/dr-richard-barker/Copy-of-InfoGenius-to-evolve-customize

---

## Goal

A single static web app that a user can open in a browser (or host on GitHub Pages) which performs the
**same datamining + summary workflow** as the prototype — research a topic, extract cited facts, and
produce an infographic — **without any Google GenAI / AI Studio dependency and without any API key.**

## Core design decisions

- **Remove** `@google/genai`, the AI Studio `window.aistudio` key API, `process.env.API_KEY`, and the
  `aistudiocdn.com` import map. No secrets, no build-time env injection.
- **Datamining + summary → Wikipedia.** Replace Gemini + Google Search grounding with the keyless,
  CORS-enabled Wikipedia REST + MediaWiki search APIs. Honors the existing Language selector via
  Wikipedia language subdomains. Extractive summarizer picks the top facts; real article URLs become
  the cited "Research Sources".
- **Image generation → deterministic SVG.** Replace the Gemini image model with an in-browser SVG
  infographic renderer driven by the same Complexity / Visual Style / Color Scheme / Background options.
  Vector output = reproducible, editable, ideal for scientific figures. Downloadable as SVG (and PNG).
- **"Enhance/edit" → deterministic restyle.** Re-render the same researched facts with layout/palette
  variation seeded by the edit text (honest — no hidden AI).
- **Keep everything else:** React 19 UI, CSV batch queue, GitHub sync (user PAT), history grid,
  metadata CSV export, dark mode, intro animation, sources panel, fullscreen/zoom, download.
- **Deploy:** static site, GitHub Pages via Actions workflow; `base: './'` so it works on a project path.

---

## Checklist

### 1. Scaffold & dependencies
- [x] Create clean project folder `infogenius-standalone/`
- [x] `package.json` without `@google/genai` (keep react, react-dom, lucide-react)
- [x] `vite.config.ts`: drop `process.env` define, add `base: './'`
- [x] `tsconfig.json`, `.gitignore`, `index.css`
- [x] `index.html`: removed `aistudiocdn` importmap + genai; Vite bundles deps; kept Tailwind CDN
- [x] `index.tsx` entry

### 2. Remove Google GenAI dependency
- [x] Deleted `services/geminiService.ts` usage (no @google/genai anywhere)
- [x] `types.ts`: removed the `AIStudio` global declaration; extended data types
- [x] `App.tsx`: removed API-key gate (`hasApiKey`, `handleSelectKey`, "Select Paid API Key" modal)

### 3. Datamining + summary engine (keyless)
- [x] `services/researchService.ts` — Wikipedia search → best article → extract → sentence summarizer
- [x] Language → Wikipedia subdomain mapping (10 languages)
- [x] Returns `{ title, facts[], summary, searchResults[] }` matching the old `ResearchResult` shape
- [x] Graceful errors (no article found, offline, empty extract)

### 4. Deterministic infographic renderer
- [x] `services/infographicRenderer.ts` — SVG builder with palettes per ColorScheme + Background
- [x] Style variants (Minimalist / Realistic / Vintage / Futuristic / 3D / Sketch / Default)
- [x] Complexity affects density (3–6 facts) and body font size
- [x] SVG text-wrapping helper; numbered fact panels; title + audience badge + footer + source count
- [x] Output as `data:image/svg+xml` (unicode-safe) so existing `<img>` + download keep working
- [x] PNG rasterization for download via canvas

### 5. Wire up UI
- [x] `App.tsx`: `handleGenerate`, `runBatchLoop`, `handleEdit` call the new services
- [x] `IntroScreen.tsx`: rebranded badge → "Wikipedia Grounding · No API Key"
- [x] `Infographic.tsx`: SVG + PNG download buttons
- [x] `SearchResults.tsx`: unchanged (now real Wikipedia URLs)
- [x] `Loading.tsx`: unchanged; added a Language selector to the search bar

### 6. Deploy as GitHub webpage
- [x] `.github/workflows/deploy.yml` — build + deploy to GitHub Pages (Actions)
- [x] `README.md` — what it is, how to run/deploy, no-key note, attribution table

### 7. Verify
- [x] `npm install` clean (no genai; 0 vulnerabilities)
- [x] `npm run dev` — researched "Photosynthesis": 4 facts + 6 sources + SVG infographic ✔
- [x] All Style/Color/Background combos render as valid images (fixed nested-quote font bug)
- [x] Language switch pulls the right Wikipedia (verified Spanish "Fotosíntesis"; Japanese renders)
- [x] Live generate ("Mitochondria") renders 1200×800; no console errors
- [x] `npm run build` succeeds (269 kB / 81 kB gzip)
- [ ] Manual spot-check of CSV batch + GitHub sync (logic wired; not exercised in automated run)

---

### 8. Phase 2 — BYO-key AI images, cleanup, deploy, Zenodo
- [x] Optional BYO-key AI image path `services/aiImageService.ts` (pure REST, no `@google/genai` bundled)
- [x] AI settings modal (key + model + enable), key stored in localStorage; falls back to SVG on error
- [x] Wired into generate/batch/edit; SVG↔PNG-aware download, GitHub sync, and file extensions
- [x] Removed the cloned Google-GenAI prototype (`infogenius_src`); confirmed no genai package/imports
- [x] Zenodo packaging: `LICENSE` (Apache-2.0), `CITATION.cff`, `.zenodo.json`, `CHANGELOG.md`, README section
- [x] Deployed: pushed to **dr-richard-barker/infogenius-standalone**, Pages (Actions) enabled, workflow green
- [x] Live + verified 200: https://dr-richard-barker.github.io/infogenius-standalone/
- [x] Created **v1.0.0** GitHub release (the archival unit Zenodo picks up)
- [ ] USER ACTION: enable this repo on Zenodo (zenodo.org/account/settings/github), then add the DOI badge

### 9. Phase 3 — keyless real AI images (user: "generate images without tokens")
- [x] Diagnosed: default SVG path worked (Wikipedia 200, img rendered) — user wanted real *images*, not SVG
- [x] Verified keyless option: Pollinations loads real images via `<img src>` (fetch is Turnstile-gated, img is not)
- [x] `services/freeImageService.ts` — keyless Pollinations URL builder (reuses `buildImagePrompt`)
- [x] Engine selector (free-ai default / svg / byok-ai), persisted; auto SVG fallback on remote error
- [x] Loading overlay for remote images; download opens remote in new tab; sync/export handle URLs
- [x] Verified live: free-ai loads a real image (886×665, no key); svg engine still renders; no console errors
- [x] Built, committed, pushed; deploy workflow green; **live bundle hash matches local build**
- [x] Cut **v1.1.0** release

## Progress log
- 2026-07-10: Analyzed prototype source; wrote this plan; scaffolded standalone app.
- 2026-07-10: Built Wikipedia research service + deterministic SVG renderer; rewired App/components.
- 2026-07-10: Verified end-to-end in browser (EN + ES). Fixed SVG parse bug (font-family had nested
  double quotes → switched inner quotes to single). Clean build. Added Pages deploy workflow + README.
- 2026-07-11: Added optional BYO-key Gemini image path (REST, nothing Google bundled). Removed the
  prototype clone. Added Zenodo files. Deployed to GitHub Pages (live, HTTP 200) and cut v1.0.0 release.
- Remaining: user connects Zenodo to the repo to mint the DOI, then drops the badge into the README.
