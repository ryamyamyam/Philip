# Roadmap

Status legend: ✅ Completed (verified) · 🟡 In progress · ⬜ Planned · ⛔ Blocked · ❓ Requires confirmation.
"Completed" means implemented **and** verified with evidence; code on an unmerged branch is not completed.
Owner: PM. Update when a milestone or task changes status.

## Completed milestones

| Stage | Scope | Status |
|---|---|---|
| 0 | Scaffold, tokens, shell & nav, Dexie, i18n, PWA (manifest, icons, SW), Pages workflow | ✅ Done |
| 1 | Food entries CRUD, Today dashboard, calorie ring, macro bars, date nav + swipe | ✅ Done |
| 2 | JSON backup/restore (merge/replace), validation, delete-all, backup reminder | ✅ Done |
| 3 | Target calculator, safety rules, manual override, append-only plan history | ✅ Done (Opus review applied) |
| 4 | Recent / frequent / favorites / My Foods, one-tap relog, save-from-entry | ✅ Done |
| 5 | Gemini photo analysis, review & edit, error handling, Claude handoff | ✅ Done (needs live-key test) |
| 6 | History: daily log, 7/30-day averages, SVG chart, target comparisons | ✅ Done (UI removed in round 2 / Story 3; code kept) |
| 7 | Adherence score (optional), weekday target planning, weekly planned vs actual | ✅ Done |
| 9 | QA & Feedback Capture module (capture, screenshots, inbox, prompt builder, optional AI) | ✅ Done (needs real-iPhone voice test) |
| — | Development operating system (CLAUDE.md + docs/*) | 🟡 Drafted on `docs/dev-os`, awaiting owner review |

Several later stages changed earlier UI (calorie ring, macro bars, History tab, My Foods in the add sheet). Their code is kept; see PROJECT_CONTEXT.md.

## Current milestone — M1: verify and ship QA round 2 + Story 3

| Item | Status | Notes |
|---|---|---|
| QA round 2 (`qa-round-2`, `389c39e`) | 🟡 Implemented, unmerged | 4-tab nav, photo-first add, weight log, Katch–McArdle, QA archive |
| Story 3 (`story-3-simplify`, `5f78cb4`) | 🟡 Implemented, unmerged | 3 tabs, Today logging, saved meals (Dexie v3), weight on-track, "What should I eat?" |
| Unit tests + typecheck on `5f78cb4` | ✅ 176/176, tsc clean | Re-run 2026-11-02 |
| Chromium e2e on `5f78cb4` | ❓ 52 reported passing | Not re-run independently |
| WebKit e2e (`--project=webkit-iphone`) | ⬜ Planned | Must run on the Mac |
| Owner decisions (Today scroll, QA screen name) | ❓ Requires confirmation | PROJECT_CONTEXT.md "Open questions" |
| Merge into `main` + push (deploys) | ⛔ Blocked | By WebKit run + owner decisions |

## Stage 8 — QA & polish (🟡 In progress)

- [x] Unit tests: calculations, dates, DB, backup, AI parsing, Gemini adapter (mocked)
- [x] Browser tests (Chromium mobile emulation): logging, validation, dates, recents, offline, photo flow, handoff, backup, calculator
- [x] Screenshots at 375 and 440 CSS px, plus 150% text pass; no horizontal scroll
- [ ] Run Playwright with WebKit (`--project=webkit-iphone`)
- [ ] Real iPhone: install from Safari, offline launch, camera capture, share-sheet export, Files import, Dynamic Type at largest sizes, VoiceOver pass
- [ ] Live Gemini free-tier key: success, invalid key, rate limit
- [ ] Performance check on device (cold start, 1 year of entries)
- [ ] QA & Feedback: voice capture in the installed iPhone app, screenshot from Photos, share-sheet .txt export, live Gemini structuring

## Upcoming milestones

| ID | Milestone | Status | Depends on |
|---|---|---|---|
| M2 | Real-device + live-Gemini verification (rest of Stage 8) | ⬜ Planned | M1 merged and deployed |
| M3 | Hardening: SW `ignoreVary`, update-available prompt, e2e in CI (optional) | ⬜ Planned / ❓ scope | M1 |
| M4 | Cleanup of unused files (CalorieChart, CalorieRing, MacroBars, …) | ❓ Requires owner approval (file deletion) | M1 |
| M5 | Body-weight & long-term analytics (bring back 30-day / weekly views?) | ❓ Requires confirmation | M1 |
| M6 | Workout tracking | ⬜ Planned (not started) | Data-model decision (new Dexie version + backup fields) |
| M7 | AI coaching / training plans | ⬜ Planned (not started) | M6; zero-cost AI approach decision |
| M8 | zh-TW and ja translations | ⬜ Planned (not started) | i18n catalog structure is ready |

## Dependencies and technical prerequisites

- Anything that changes persisted data needs: a new Dexie version + upgrade + migration test, and optional backup fields (schemaVersion stays 1 unless approved).
- Any new AI feature must go through `services/foodAnalysis` (or a sibling service) + validation + a review step, and must work without a key.
- M6/M7 must stay within zero-cost constraints (Gemini free tier, no backend).

## Outstanding blockers

1. WebKit e2e has never been run (needs the Mac).
2. Owner decisions on Today scrolling and QA screen labels.
3. GitHub Pages deployment status ❓.
