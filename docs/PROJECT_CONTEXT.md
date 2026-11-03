# Project context

> Snapshot verified 2026-11-02 against `story-3-simplify` (`5f78cb4`). Update this file whenever the state below changes (PM responsibility). Items marked **❓** could not be verified from the repository.

## What Philip is

A personal, single-user nutrition tracker for Ryan's iPhone: a local-first PWA that tracks calories, protein, fat and carbs against personal targets, with optional AI food estimates via the Gemini free tier. No backend, no accounts, no paid services. The UI speaks in the voice of "Philip", a bossy, sassy coach.

v1 is nutrition-only. Workouts, AI coaching and training plans are planned for later and are **not** implemented (see ROADMAP.md).

## Branches (source of truth: `git branch -a -vv`)

| Ref | Commit | Meaning |
|---|---|---|
| `main` = `origin/main` = `qa-fixes-round-1` | `21f75d0` (2026-10-29) | What GitHub Pages deploys on push. Round-1 UI (Today · History · + · Targets · Settings). |
| `qa-round-2` (local only) | `389c39e` (2026-11-02) | 4-tab layout, photo-first add, weight log, QA archive. |
| `story-3-simplify` (local only) | `5f78cb4` (2026-11-02) | On top of `qa-round-2`. **Latest code.** 3 tabs. |
| `docs/dev-os` (local only) | on top of `story-3-simplify` | This documentation system. |

Remote: `https://github.com/ryamyamyam/Philip.git`. Whether GitHub Pages is enabled and serving `main` is **❓ unverified**.

## Current development stage

- Stages 0–7 implemented; Stage 8 (QA & polish) partially done; Stage 9 (QA & Feedback module) done.
- QA round 2 and Story 3 are implemented on unmerged branches. Current milestone: verify and merge them (ROADMAP.md, M1).

## Current priorities

1. Run WebKit e2e on the Mac against `story-3-simplify`; fix WebKit-only issues.
2. Merge `story-3-simplify` (includes `qa-round-2`) into `main` and push (deploys).
3. Real-iPhone pass: install, offline, camera → review → save, saved meals, share-sheet export, Dynamic Type, VoiceOver.
4. Live Gemini key test (photo, text, "What should I eat?").
5. Owner decisions listed under "Open questions".

## Application architecture (summary — details in ARCHITECTURE.md)

Static single-page React app. Hash routing (`#/today`, `#/progress`, `#/settings`, `#/targets`). All data in IndexedDB database `philip` (Dexie v3) plus a separate `qa-feedback` database for the QA module. Optional browser → Gemini REST calls with the user's own key. Hand-rolled service worker for offline use. Deployed to GitHub Pages by GitHub Actions on push to `main`.

## Technologies

| Area | Technology |
|---|---|
| Language | TypeScript 5.9 (strict, `noUncheckedIndexedAccess`) |
| UI | React 19.3 (function components, hooks) — no UI, router, state or chart libraries |
| Build | Vite 7.3 + `@vitejs/plugin-react`; custom SW plugin in `vite.config.ts` |
| Styling | Plain CSS + design tokens (`src/styles/tokens.css`) |
| Storage | Dexie 4.4 + `dexie-react-hooks` |
| Unit tests | Vitest 4.1 + `fake-indexeddb` |
| E2E tests | Playwright 1.63 (`webkit-iphone`, `chromium-mobile`) |
| Runtime / CI | Node 22, npm (`.npmrc legacy-peer-deps=true`), GitHub Actions → Pages |
| External | Google Gemini REST (optional) |

Runtime dependencies: `dexie`, `dexie-react-hooks`, `react`, `react-dom` — nothing else. No linter/formatter is configured.

## Implementation status (on `story-3-simplify`)

| Feature | Status |
|---|---|
| Today: kcal + P/F/C eaten/target/left, day's foods by meal, ‹ › date nav, Take photo / Log food | Implemented, tested (Chromium) |
| Log sheet: photo, choose photo, text box, saved meals, manual entry | Implemented, tested (Chromium) |
| Review sheet (mandatory for AI), saved meals (Dexie v3) | Implemented, tested (Chromium) |
| Gemini photo + text analysis, local text fallback, Claude handoff on photo errors | Implemented, mock-tested; live key ❓ |
| "What should I eat?" suggestions (Gemini) | Implemented, mock-tested; live key ❓ |
| Targets calculator + safety rules, manual, weekday plans, adherence (Settings › Targets) | Implemented, tested |
| Progress: weight log, on-track status, chart, history with delete + Undo | Implemented, tested (Chromium) |
| Backups (merge/replace), delete-all, backup reminder | Implemented, tested |
| Offline/PWA | Implemented; Vary caveat (below) |
| QA & Feedback module (from Settings; archive after prompt) | Implemented, tested (Chromium); iPhone voice ❓ |

Test evidence: 176/176 unit tests and `tsc -b` clean on `5f78cb4` (re-run 2026-11-02 in a clean clone). 52 Chromium-mobile e2e reported passing by the Story 3 session (not re-run). WebKit e2e, a real iPhone and a live Gemini key: **not yet run**.

## Known limitations

- Single device; no sync. Data is lost if Safari site data is cleared and no backup exists.
- Client-side Gemini key (documented trade-off for a single-user app).
- English only (CJK font fallbacks exist; no translations).
- Light mode only.
- No "update available" prompt (strings exist; callback not wired in `main.tsx`).
- Sheets are not in browser history; iOS back-swipe doesn't close them.

## Important constraints

See CLAUDE.md "Stack & constraints" and "Owner approval required", and DECISIONS.md. In short: zero cost, no backend, Gemini optional, AI never saved without review, plans append-only, local YMD dates, QA module isolated, no new dependencies or file deletions without approval, never seed the owner's body stats.

## Features currently being developed

None in progress. Story 3 is implemented and awaiting verification/merge (TASK_ASSIGNMENTS.md).

## Outstanding technical issues

1. WebKit e2e never run; real-device checklist unrun.
2. SW `caches.match` without `ignoreVary` → lazy chunks may fail offline if the host sends `Vary` (❓ on GitHub Pages).
3. Update prompt not wired.
4. Possibly dead code kept on purpose (no deletions without approval): `components/CalorieChart.tsx`, `CalorieRing.tsx`, `MacroBars.tsx` have no static imports; `TargetsView` default export unrouted; `MyFoodsSheet` / `SavedFoodSheet` still referenced by `SheetHost` but not reachable from the log sheet; `MealsView.tsx` is unrouted but `TodayView` imports `MealCard` from it (**do not delete MealsView**).
5. E2E is not run in CI.
6. `node_modules` on the Mac is macOS-native; Linux sandboxes need their own clone + `npm ci`.

## Open questions (owner)

1. Today now scrolls with many foods — confirm this replaces the old "Today fits 393×793 without scrolling" rule.
2. QA observations now record "Settings" as the screen — acceptable?
3. Delete the now-unused files listed above?
4. Should removed History views (30-day averages, weekly planned vs actual) come back?
5. Is GitHub Pages enabled and serving `main`?
