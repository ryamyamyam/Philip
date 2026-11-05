# Philip — working notes for Claude

These instructions apply to **every** Claude Code session working on Philip. Do not assume a previous session's context is available — the repository and these docs are the only shared memory.

## Mandatory reading (before any work)

1. `README.md` — before starting a new task.
2. This file, completely.
3. [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) — current state, branches, known issues.
4. [`docs/ROADMAP.md`](docs/ROADMAP.md) — current priorities.
5. [`docs/AGENT_ROLES.md`](docs/AGENT_ROLES.md) — the responsibilities of your role.
6. [`docs/TASK_ASSIGNMENTS.md`](docs/TASK_ASSIGNMENTS.md) — before starting work that may overlap with another session.
7. [`docs/DEVELOPMENT_RULES.md`](docs/DEVELOPMENT_RULES.md) — before modifying application code.
8. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — before any architectural change (and for any data, routing, sheet or AI work).
9. [`docs/DECISIONS.md`](docs/DECISIONS.md) — before proposing anything that might conflict with an existing decision.
10. [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — before any UI or styling change.
11. As relevant: [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md), [`docs/QA_STRATEGY.md`](docs/QA_STRATEGY.md), `src/modules/qa-feedback/README.md`.

If a required document is missing or contradicts the code, stop and tell the PM/owner (Ryan). The code is the source of truth; fix the doc only when authorized.

## Session startup procedure

1. Read the documents above.
2. Identify your role: PM, Core Development, Feature Development or QA / Testing. **If you can't tell, ask Ryan.**
3. Find your task in `docs/TASK_ASSIGNMENTS.md` (ID, allowed files, excluded files, branch). No task entry → ask the PM before writing code (trivial fixes excepted, see DEVELOPMENT_WORKFLOW.md).
4. `git status` and `git branch --show-current`; `git worktree list` to see other sessions. Never start on a dirty tree you don't own.
5. Confirm you are on the task's branch/worktree.
6. Check for conflicts: other active tasks touching the same files, especially the shared files listed in DEVELOPMENT_RULES.md §2.
7. State your permitted scope back to the user in one or two lines, then start.
8. Conflict or outdated doc found → report it to the PM before proceeding.

## Current stage
Stages 0–7 implemented; Stage 8 (QA) partially done. QA round 2 (branch `qa-round-2`): photo-first add sheet with a text box, weight log, Katch–McArdle, QA archive.
Story 3 (branch `story-3-simplify`, on top of `qa-round-2`): 3 tabs (Today · Progress · Settings; Meals folded into Today; Targets moved to Settings › `#/targets`), Take photo + Log food on Today, compact review rows, saved meals (Dexie v3 `savedMeals`), weight on-track status, optional Gemini “What should I eat?”, QA only from Settings with archive asked after generation. See docs/ARCHITECTURE.md.
Owner feedback round (Nov 2026): Today has Take photo · Choose photo · Enter yourself (inline `AddPanel`; Log food removed), Targets has a metric ⇄ imperial switch + 1-month target suggestion, Gemini 3+ requests use the default temperature, and the copy uses the dominant/campy coach voice with emoji (D-017 – D-020).
**All of the above is merged into `main` and deployed** (owner pushed 2026-11-03). See docs/PROJECT_CONTEXT.md §Branches.

## Stack & constraints
- React 19 + TypeScript (strict) + Vite 7, plain CSS with tokens, Dexie 4 (IndexedDB) + `useLiveQuery`
- No backend, no auth, no paid services. Single user, single device. GitHub Pages hosting. Zero added cost.
- Gemini is optional; the app must stay fully usable without it.
- Never commit API keys. The Gemini key lives only in IndexedDB (`profile.geminiKey`).
- Never hardcode or seed the owner's body stats.

## Owner approval required (ask Ryan first)
- Changing safety rules in `src/lib/targets.ts` (`SAFETY`, review codes, validation ranges).
- Bumping the backup `schemaVersion` (currently 1).
- Deleting files.
- Adding or upgrading dependencies.
- Reversing anything in docs/DECISIONS.md.

## Conventions
- All UI strings in `src/i18n/en.ts`, accessed with `t('key', vars)`. Dates/numbers via `src/lib/format.ts` (Intl).
- Dates are local `YYYY-MM-DD` strings (`src/lib/date.ts`). Never use `toISOString()` for dates.
- Nutrition is metric internally (g, kcal). Daily totals are computed from entries, never stored.
- Target plans are append-only: every change inserts a new plan; `planForDate` picks the latest `effectiveFrom <= date`.
- Data access goes through `src/db/repo.ts`; calculations live in `src/lib/*`; Gemini only in `src/services/foodAnalysis/gemini.ts`.
- AI results are never saved without the review sheet (`src/views/photo/ReviewSheet.tsx`).
- No `any`. Don't suppress TS errors. Keep components small; no UI libraries.
- Touch targets ≥ 44px, labels wrap (no fixed text heights), tabular numerals for numbers.
- **UI follows [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) (D-022):** tokens only (`src/styles/tokens.css`), reuse the components in `src/components/` (Meter, ActionButton, CategoryChip, StatPanel/StatRow, NamePlate, DialogBar, ControlDeck, StatusStrip, CornerButton, DotIndicator, AmbientScene, pixel `Icon`), pixel font everywhere at ≥15px, one slate button face, `pm-` classes in `src/styles/components.css`. Read it before any UI change.
- Copy uses Philip's voice (dominant, campy, bossy gay coach; short — D-020), but error, data-loss, delete/replace, safety and backup text stays plain. Never comment on body, weight or appearance; no sexual content.
- **Guardrail (owner, D-023): no emoji in copy.** Sentences in text boxes, dialog bars, toasts, banners and buttons are words only; `src/i18n/en.test.ts` fails on any emoji in `en.ts`. Decorative meal/macro emoji exist only in markup chips and are `aria-hidden`.
- `src/modules/qa-feedback/` is a portable module: it must not import from Philip code. Its strings live in `ui/strings.ts` (not `en.ts`) and its styles use `qa-` classes. Philip-specific wiring belongs in `src/qaFeedback.config.ts`.

## Commands
`npm test` · `npm run typecheck` · `npm run build` · `npx playwright test --project=webkit-iphone` (or `chromium-mobile`). Details and Definition of Done: docs/QA_STRATEGY.md.

## QA & Feedback Capture
Implemented in `src/modules/qa-feedback` (unit tests in `qa-feedback.test.ts`, browser tests in `e2e/qa-feedback.spec.ts`). Data in the separate `qa-feedback` IndexedDB database, not in backups.

## Known issues
- QA voice capture uses the Web Speech API; not yet tested on a real iPhone home-screen install.
- WebKit e2e on the Mac (`9d8c052`, 2026-11-03): **51 passed, 3 skipped, 0 failed**. The webkit-iphone project runs with `serviceWorkers: 'block'` (WebKit's `page.route()` misses fetches from SW-controlled pages). Skipped on WebKit with reasons, to verify on a real iPhone: synthetic swipe (no `Touch` constructor), offline reload, clipboard assertions. Real-iPhone pass pending.
- Swipe-left row actions and the bottom-sheet QA panel are tested with synthetic touch events in Chromium only; check on a real iPhone.
- Gemini (`gemini-3.1-flash-lite`): owner confirmed "What should I eat?" works on the live app after the temperature fix (2026-11-03). Photo/text analysis, invalid key and rate limit with a live key still unchecked.
- Today scrolls once several meals are logged; the card and the deck's Choose photo / Enter yourself buttons stay in view at 393×793 (e2e). Since D-022 there is no separate Take photo button (iOS offers the camera from Choose photo) — check on a real iPhone.
- The iOS date-input fix on Targets (`.input-date`) passes in Playwright WebKit; check its look on a real iPhone.
- QA observations captured from Settings record “Settings” as the screen (the floating button that captured the current screen is off).
- SW cache matching doesn't ignore `Vary`; if a host sends `Vary: Origin`, lazy chunks (Progress, Settings) can miss the cache offline. Today, the log sheet and the review sheet are bundled eagerly.
- Export uses the Web Share sheet when available; if iOS rejects the share after the async DB read, it falls back to a download.
- OBS-AFF348 (Progress date out of screen): fixed with `.input-date` on every date input plus a weigh-in grid that stacks below ~2×9.5rem. Chromium doesn't reproduce iOS's intrinsic date-input width, so the e2e guard (`e2e/obs-nov3.spec.ts`) passes on old and new code; confirm on WebKit and a real iPhone.
- Philip's tour (T-010): Pixelify's "fi" ligature draws like "A"; ligatures are off inside the tour only (`.pm-tour-text`). Philip's pose art varies in outfit between poses and has no mouth frames.
- `node_modules` on the Mac is built for macOS; a Linux sandbox (e.g. Cowork's shell) can't run `npm test` against it. Run tests in Terminal on the Mac or in a separate clone.

## Next task
See docs/TASK_ASSIGNMENTS.md (registry) and docs/ROADMAP.md (current milestone: M2 — real-device and live-Gemini verification; WebKit done).
