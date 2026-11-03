# Philip

Personal nutrition tracker. Local-first PWA for iPhone: calories, protein, fat and carbs, with optional AI photo estimates via the Gemini free tier. No backend, no accounts, no paid services.

## Features

> Describes the `story-3-simplify` branch (latest code, not yet merged to `main`). See [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md).

- **Today**: kcal and protein/fat/carbs eaten, target and left; the day's foods by meal (tap to edit, swipe to move/delete); date navigation; **Take photo** and **Log food**; optional "What should I eat?" (Gemini)
- **Logging**: photo, typed text (Gemini or local parsing without a key), saved meals, or manual entry, always ending in a review step
- **Photo/text estimates**: Gemini analysis → mandatory review & edit → save. Claude-app copy/paste handoff as a fallback on photo errors
- **Saved meals**: save a reviewed set of foods and re-log it
- **Progress**: weight log, on track / ahead / behind vs plan, chart, history with delete + Undo
- **Targets** (Settings › Targets & body stats): Mifflin–St Jeor / Katch–McArdle calculator with safety limits, manual override, history-preserving plans, weekday plans, optional adherence score
- **Backup**: versioned JSON export/import (merge or replace), typed-confirmation delete-all
- **QA & Feedback**: capture bugs and ideas by voice or text with screenshots, organize them, and generate Claude Code prompts (reusable module in `src/modules/qa-feedback`, opened from Settings)

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

Every Claude Code session starts with [CLAUDE.md](CLAUDE.md), which lists the mandatory reading order.

- [CLAUDE.md](CLAUDE.md) — rules for every session, startup procedure, conventions, known issues
- [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) — current state, branches, open questions
- [docs/ROADMAP.md](docs/ROADMAP.md) — milestones and status
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure, data model, backup format, calculations, boundaries
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — tokens and UI rules
- [docs/DEVELOPMENT_WORKFLOW.md](docs/DEVELOPMENT_WORKFLOW.md) — how a request becomes a finished feature
- [docs/DEVELOPMENT_RULES.md](docs/DEVELOPMENT_RULES.md) — mandatory rules, shared files, Git
- [docs/AGENT_ROLES.md](docs/AGENT_ROLES.md) — PM, Core, Feature, QA; how to run them in parallel sessions
- [docs/TASK_ASSIGNMENTS.md](docs/TASK_ASSIGNMENTS.md) — task registry
- [docs/DECISIONS.md](docs/DECISIONS.md) — decision log
- [docs/QA_STRATEGY.md](docs/QA_STRATEGY.md) — testing and Definition of Done
