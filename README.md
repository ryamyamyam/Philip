# Philip

Personal nutrition tracker. Local-first PWA for iPhone: calories, protein, fat and carbs, with optional AI photo estimates via the Gemini free tier. No backend, no accounts, no paid services.

## Features

- **Today**: calorie ring, macro bars, meals, date navigation (arrows, date picker, swipe)
- **Manual logging**: add / edit / duplicate / delete, decimals, weight-linked rescaling
- **Photo estimates**: Gemini analysis → mandatory review & edit → save. Claude-app copy/paste handoff as a fallback
- **My Foods**: recent, frequent, favorites, one-tap re-logging
- **Targets**: Mifflin–St Jeor calculator with safety limits, manual override, history-preserving plans, weekday plans
- **History**: 7/30-day averages, SVG chart, weekly planned vs actual, optional adherence score
- **Backup**: versioned JSON export/import (merge or replace), typed-confirmation delete-all

## Development

Requires Node 22.

```bash
npm install          # .npmrc sets legacy-peer-deps (works around an npm peer-resolution bug)
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest + fake-indexeddb)
npm run build        # type-check + production build to dist/
npm run e2e          # Playwright (builds and serves dist/ automatically)
```

Browser tests target **WebKit** (closest to iPhone Safari). Install it once with `npx playwright install webkit`, then
`npx playwright test --project=webkit-iphone`. A `chromium-mobile` project is available where WebKit isn't installed. Screenshots land in `e2e/screenshots/` (git-ignored).

## Deploy (GitHub Pages, free)

1. Create a GitHub repository and push this project to `main`.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` runs tests, builds, and deploys via `.github/workflows/deploy.yml`.

The build uses a relative base path, so it works at `https://<user>.github.io/<any-repo-name>/`.

## Install on iPhone

Open the Pages URL in **Safari** → Share → **Add to Home Screen**. After the first load it works offline (photo analysis needs a connection).

## Gemini setup (optional)

1. Create a free API key at [Google AI Studio](https://aistudio.google.com/). **Do not enable billing.**
2. In Philip: Settings → Photo analysis → paste the key → **Test key**.
3. If Google retires the default model, pick another from the Model list (populated from your key after a successful test).

The key is stored only in this browser's IndexedDB. It is never committed or sent anywhere except `generativelanguage.googleapis.com`. Client-side keys can be read by anyone with access to the device/browser, so restrict the key to the Gemini API in Google Cloud console. Photos sent to the free tier may be used by Google to improve its products.

Everything except photo analysis works without Gemini.

## Docs

- [CLAUDE.md](CLAUDE.md) — current stage, conventions, next task
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure, data model, backup format, calculations
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — tokens and UI rules
- [docs/ROADMAP.md](docs/ROADMAP.md) — stages and status
