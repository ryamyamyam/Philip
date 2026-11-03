# Project context

> Snapshot verified 2026-11-03 against `main` (`0cdd351`) plus the `release/voice-emoji-docs` branch. Update this file whenever the state below changes (PM responsibility). Items marked **❓** could not be verified from the repository.

## What Philip is

A personal, single-user nutrition tracker for Ryan's iPhone: a local-first PWA that tracks calories, protein, fat and carbs against personal targets, with optional AI food estimates via the Gemini free tier. No backend, no accounts, no paid services. The UI speaks in the voice of "Philip", a dominant, campy, bossy coach with short lines and emoji (D-020).

v1 is nutrition-only. Workouts, AI coaching and training plans are planned for later and are **not** implemented (see ROADMAP.md).

## Branches (source of truth: `git branch -a -vv`)

| Ref | Commit | Meaning |
|---|---|---|
| `main` = `origin/main` | `0cdd351` (2026-11-03) | **Deployed.** Story 3 + dev-os docs + owner feedback round (units switch, 1-month target, Today log buttons, Gemini temperature). |
| `fix/owner-feedback-nov2` (pushed) | `0cdd351` | Same commit as `main`; can be deleted. |
| `release/voice-emoji-docs` | on top of `0cdd351` | Voice/emoji copy (D-020) + this docs refresh. Merge into `main` to deploy. |
| `story-3-simplify`, `qa-round-2`, `docs/dev-os`, `qa-fixes-round-1` | ancestors of `main` | Merged; kept for history. |

Remote: `https://github.com/ryamyamyam/Philip.git`. GitHub Pages deploys `main` via `.github/workflows/deploy.yml` (tests → build → Pages). The owner pushed `0cdd351` on 2026-11-03; whether that run went green is **❓ unverified from here** (check the Actions tab).

## Current development stage

- Stages 0–7 implemented; Stage 8 (QA & polish) partially done; Stage 9 (QA & Feedback module) done.
- M1 (QA round 2 + Story 3) and the owner feedback round are merged and deployed. Current milestone: M2 — real-iPhone and live-Gemini verification (WebKit e2e done 2026-11-03).

## Current priorities

1. Ship `release/voice-emoji-docs` (merge into `main`, push).
2. Owner: send the “What Gemini said” text if “What should I eat?” still fails (T-004).
3. ~~WebKit e2e~~ — done: 51 passed, 3 skipped (T-002).
4. Real-iPhone pass: install, offline, camera → review → save, saved meals, share-sheet export, Dynamic Type, VoiceOver.
5. Live Gemini key test (photo, text, "What should I eat?").
6. Owner decisions listed under "Open questions".

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

## Implementation status (on `main` unless noted)

| Feature | Status |
|---|---|
| Today: kcal + P/F/C eaten/target/left, day's foods by meal, ‹ › date nav, Take photo / Choose photo / Enter yourself (inline text panel) | Implemented, tested (Chromium) |
| Add panel / Add food sheet: text box, saved meals, Type the numbers (sheet also has photo buttons; used by Meals) | Implemented, tested (Chromium) |
| Targets: metric ⇄ imperial switch, Sex/DOB layout, 1-month target suggestion | Implemented, tested (Chromium); iOS date input ❓ |
| Voice + emoji copy (D-020) | On `release/voice-emoji-docs`, tested (Chromium) |
| Review sheet (mandatory for AI), saved meals (Dexie v3) | Implemented, tested (Chromium) |
| Gemini photo + text analysis, local text fallback, Claude handoff on photo errors | Implemented, mock-tested; live key ❓ |
| "What should I eat?" suggestions (Gemini) | Works with the owner's live key (2026-11-03) |
| Targets calculator + safety rules, manual, weekday plans, adherence (Settings › Targets) | Implemented, tested |
| Progress: weight log, on-track status, chart, history with delete + Undo | Implemented, tested (Chromium) |
| Backups (merge/replace), delete-all, backup reminder | Implemented, tested |
| Offline/PWA | Implemented; Vary caveat (below) |
| QA & Feedback module (from Settings; archive after prompt) | Implemented, tested (Chromium); iPhone voice ❓ |

Test evidence: on `0cdd351`, `tsc -b` clean, 177/177 unit tests and 54/54 Chromium-mobile e2e passed in a clean Linux clone (2026-11-03); see TASK_ASSIGNMENTS.md for the voice/emoji branch. WebKit (`9d8c052`, Mac): 51 passed, 3 skipped, 0 failed. A real iPhone and full live-Gemini checks: **not yet run**.

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

`release/voice-emoji-docs` (T-007, T-008) is ready to ship. Nothing else in progress.

## Outstanding technical issues

1. WebKit e2e green (3 skips need the real iPhone: swipe, offline reload, clipboard). Real-device checklist unrun.
2. SW `caches.match` without `ignoreVary` → lazy chunks may fail offline if the host sends `Vary` (❓ on GitHub Pages).
3. Update prompt not wired.
4. Dead code removed 2026-11-03 (T-005): `CalorieChart`, `CalorieRing`, `MacroBars`, `MyFoodsSheet`, `SavedFoodSheet` (+ their sheet kinds), the `TargetsView` default export. Kept on purpose: `lib/history.ts` (tested; may return with M5), `MealsView.tsx` (`TodayView` imports `MealCard`), unused `en.ts` keys and old CSS classes (harmless).
5. E2E is not run in CI.
6. `node_modules` on the Mac is macOS-native; Linux sandboxes need their own clone + `npm ci`.

## Open questions (owner)

1. ~~Today scrolls~~ — confirmed by the owner 2026-11-03 (D-015 accepted).
2. QA observations now record "Settings" as the screen — acceptable?
3. ~~Delete unused files~~ — approved and done 2026-11-03 (T-005).
4. Should removed History views (30-day averages, weekly planned vs actual) come back?
5. Did the 2026-11-03 Pages deploy succeed (Actions tab)?
