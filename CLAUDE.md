# Philip — working notes for Claude

## Current stage
Stages 0–7 implemented; Stage 8 (QA) partially done. See docs/ROADMAP.md.

## Stack & constraints
- React 19 + TypeScript (strict) + Vite 7, plain CSS with tokens, Dexie 4 (IndexedDB) + `useLiveQuery`
- No backend, no auth, no paid services. Single user, single device. GitHub Pages hosting.
- Gemini is optional; the app must stay fully usable without it.
- Never commit API keys. The Gemini key lives only in IndexedDB (`profile.geminiKey`).

## Conventions
- All UI strings in `src/i18n/en.ts`, accessed with `t('key', vars)`. Dates/numbers via `src/lib/format.ts` (Intl).
- Dates are local `YYYY-MM-DD` strings (`src/lib/date.ts`). Never use `toISOString()` for dates.
- Nutrition is metric internally (g, kcal). Daily totals are computed from entries, never stored.
- Target plans are append-only: every change inserts a new plan; `planForDate` picks the latest `effectiveFrom <= date`.
- Data access goes through `src/db/repo.ts`; calculations live in `src/lib/*`; Gemini only in `src/services/foodAnalysis/gemini.ts`.
- AI results are never saved without the review sheet (`src/views/photo/ReviewSheet.tsx`).
- No `any`. Don't suppress TS errors. Keep components small; no UI libraries.
- Touch targets ≥ 44px, labels wrap (no fixed text heights), tabular numerals for numbers.
- `src/modules/qa-feedback/` is a portable module: it must not import from Philip code. Its strings live in `ui/strings.ts` (not `en.ts`) and its styles use `qa-` classes. Philip-specific wiring belongs in `src/qaFeedback.config.ts`.

## Commands
`npm test` · `npm run build` · `npx playwright test --project=webkit-iphone` (or `chromium-mobile`)

## QA & Feedback Capture
Implemented in `src/modules/qa-feedback` (unit tests in `qa-feedback.test.ts`, browser tests in `e2e/qa-feedback.spec.ts`). Data in the separate `qa-feedback` IndexedDB database, not in backups.

## Known issues
- QA voice capture uses the Web Speech API; not yet tested on a real iPhone home-screen install.
- WebKit e2e not yet run (only Chromium mobile emulation in the build sandbox). Real-iPhone pass pending.
- Gemini default model (`gemini-3.1-flash-lite`) not yet verified against a live key.
- Export uses the Web Share sheet when available; if iOS rejects the share after the async DB read, it falls back to a download.

## Next task
1. Push to GitHub, enable Pages, install on iPhone; run the real-device checklist in docs/ROADMAP.md (Stage 8).
2. Run `npx playwright test --project=webkit-iphone` locally and fix any WebKit-only issues.
3. Test Gemini with a real free-tier key and tune the prompt if estimates are off.
