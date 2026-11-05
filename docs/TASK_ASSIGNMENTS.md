# Task assignments

Shared registry for all sessions. **Update it whenever a task is proposed, assigned, started, blocked, handed to QA, reassigned or completed.** Do not assume two sessions have coordinated because they work on the same project — this file is the coordination.

Statuses: **Proposed** → **Approved** → **In progress** → **Ready for QA** → **QA in progress** → **Completed**; or **Blocked** (say on what).
Roles: PM · Core · Feature · QA · Owner (Ryan, for manual/device work and approvals).

Base branch for new work: `main`.

## Active tasks

| ID | Feature | Role | Status | Branch | Depends on |
|---|---|---|---|---|---|
| T-003 | Real-iPhone verification checklist | Owner + QA | Proposed | — | — |
| T-004 | Live Gemini key verification | Owner + QA | In progress — “What should I eat?” works (2026-11-03); photo/text/errors unchecked | — | — |
| T-006 | SW `ignoreVary` + update-available prompt | Core | Proposed | `fix/T-006-sw-offline-update` | — |
| T-012 | Story 5 training engine + data (Dexie v4, `lib/training/*`, backup block) | Core | Ready for review (no UI) | `feat/T-012-training-engine` | T-010 commit `8a70d20` |
| T-010 | Philip's guided tutorial (NDS-style): overlay, spotlight, typewriter, pixel portrait, replay from Settings | Feature (+ shared files, owner-approved) | Ready for owner review on device | `feat/T-010-tutorial` | T-009 (in `main`) |
| T-009 | Design system v2 (handheld-RPG look): tokens, components, Today, Progress, Settings, Targets, QA theme, docs | Feature (+ shared files, owner-approved) | Ready for owner review on device | `feat/T-009-design-system` | — |

---

### T-012 — Story 5 training engine and data (D-025)
- **Role:** Core. **Spec:** `docs/stories/STORY_5_WORKOUTS.md` §4, §8, Appendix A.
- **Files:** `src/lib/training/*` (new), `src/db/{db,types,repo}.ts`, `src/hooks/useData.ts`, `src/lib/backup.ts`, `src/lib/targets.ts` (`BODY_FAT_TARGET` only, owner-approved), `src/i18n/en.ts` (append `exercise.*`, `cue.*`, `why.*`), tests, docs.
- **Interfaces:** Dexie v4; backup `schemaVersion` stays 1 (optional `training` block); `RestoreSummary.sessionsAdded` added.
- **Status:** Ready for review · **Branch:** `feat/T-012-training-engine`, branched from the T-010 commit `8a70d20` (worked in the `../philip-T010` worktree folder). Merge after T-010.
- **Log:** 2026-11-05 Core: engine, data layer, backup and copy. tsc clean, 267/267 unit (+58), build OK, Chromium e2e 66/66. No UI yet (T-011, T-013, T-014).

### T-010 — Philip's guided tutorial (Story 4, NDS-style)
- **Role:** Feature, with shared-file edits listed below (owner kickoff 2026-11-04).
- **Description:** First-run tour over the real Today screen: dim layer + spotlight on `data-tour` anchors, bottom dialog box (DialogBar look) with an original pixel-art Philip portrait, typewriter text, tap/Next/Enter to advance, choices, Skip/Escape, Replay from Settings. Seen flag `META.tutorialSeenAt`. Spec: `docs/stories/STORY_4_TUTORIAL.md`.
- **Allowed files:** `src/lib/tutorial.ts` + `tutorial.test.ts`, `src/components/GymCharacter.tsx`, `src/lib/character.ts` + `character.test.ts`, `src/assets/character/**`, `src/components/TutorialOverlay.tsx`, `src/components/useTypewriter.ts`, `src/styles/components.css` (`pm-tour-*`), `src/views/SettingsView.tsx` (Replay row), `data-tour` attributes only in `src/components/{ControlDeck,ActionButton,TabBar}.tsx`; `src/components/{TodayCard,DialogBar}.tsx` (anchors + Philip's head and shoulders beside Today's coach line, owner Q3) and `src/views/TodayView.tsx`, `e2e/tutorial.spec.ts` (new), `docs/stories/STORY_4_TUTORIAL.md`.
- **Shared files needing PM approval:** `src/styles/tokens.css` (`--philip-*`, `--dur-type`), `src/db/repo.ts` (one `META` key), `src/App.tsx` (mount the overlay), `src/i18n/en.ts` (append `tutorial.*`, `settings.replayTutorial`), `src/components/TabBar.tsx` (anchor attribute only), docs: `DESIGN_SYSTEM.md`, `ARCHITECTURE.md`, `DECISIONS.md` (D-024), `TASK_ASSIGNMENTS.md`.
- **Excluded files:** `src/db/{types,db}.ts`, `src/lib/backup.ts`, `src/services/**`, `src/modules/qa-feedback/**`, `src/lib/targets.ts`, `package.json` / lockfile (no dependencies).
- **Interfaces that must not change:** `repo.ts` signatures (only a new `META` key), `SheetState`, `Tab`/`TABS`, backup JSON shape, Dexie version (3), existing CSS tokens (additive only).
- **Acceptance criteria:** spec §8 (1–10).
- **Status:** Ready for owner review on device · **Branch / worktree:** `feat/T-010-tutorial` · `../philip-T010`
- **Known conflicts:** none active (T-009 merged in `main` `bf52988`; T-006 would touch `src/main.tsx` only).
- **Log:** 2026-11-04 Feature: worktree created from `main` `bf52988`; baseline tsc clean, 197/197 unit (Linux VM). Phase A (portrait + one step at 393 px) next.
  2026-11-04 Owner answers (spec §9): Q1 once for everyone, existing installs included; Q2 script §3 approved as written; Q3 yes, also a small Philip beside Today's dialog bar (in T-010 scope).
  2026-11-04 Feature: Phase A built (PhilipPortrait 32×40, TutorialOverlay, useTypewriter, lib/tutorial, `tutorial.*` strings, `META.tutorialSeenAt`, `--philip-*` tokens, `data-tour` anchors, App mount). tsc clean, 197/197 unit, build OK; screenshots at 393 px sent for review. Not committed. Existing e2e will need the tour pre-dismissed (Phase B).
  2026-11-04 Owner: redesign Philip as a full-body DS-era battle-sprite (V-shaped build, manly, ~35–40, ~15% body fat, black hair, smooth tanned skin). Feature: PhilipPortrait v2 — original 40×64 sprite, 3/4 view, hand on hip + fist up, tank, joggers, wristbands, sneakers, whistle, stubble; 2× = 80×128 px; `sm` = head and shoulders 72×48. `--philip-*` tokens replaced (22 colors). tsc clean, 197/197 unit, build OK.
  2026-11-04 Owner: redesign as a 3D-style pixel gym trainer resembling the owner (owner's own photo, confirmed), style of DS-era battle sprites (no franchise characters copied). Feature: PhilipPortrait removed; new `GymCharacter` component + `lib/character.ts` (look = pose/outfit/build → sprite sheet, animations, framings) + `src/assets/character/philip-trainer.png` (64×108 frames: idle, breath, talk), pre-rendered from a small 3D model (generator in `Claude outputs/story-4/character-generator/`, dev-only Python, not in the repo). Tour uses it at 2×. `--philip-*` tokens removed. tsc clean, 201/201 unit (+4), build OK; e2e not run (tour pre-dismiss lands in Phase B).
  2026-11-04 Owner supplied 11 pose images (external generator). Feature: cut out, reduced to a 4× pixel grid with a shared 56-color palette + 1-px outline, packed into `src/assets/character/philip-poses.png` (11 cells of 70×126, feet on the bottom edge); `philip-trainer.png` (3D render) removed. `lib/character.ts` now = pose atlas + bust crops + `COACH_POSE` (Today mood → pose); `TourStep.pose` per line; `GymCharacter` takes `pose`; Today's dialog bar shows Philip's head and shoulders (`DialogBar.portrait`). Pipeline in `Claude outputs/story-4/pose-pipeline/`. tsc clean, 201/201 unit, build OK; e2e not run.
  2026-11-05 Feature: Phase B — Settings › Help › Replay tutorial; `tutorial.test.ts` (+8); `e2e/tutorial.spec.ts` (7 tests); `fresh()` skips the tour unless `{ tour: true }`, `skipTour()` helper, backup spec skips the tour after Delete all; docs (D-024, DESIGN_SYSTEM, ARCHITECTURE, CLAUDE known issue). tsc clean, 209/209 unit, build OK; Chromium e2e 66/66 (cloud clone of the worktree). WebKit to run on the Mac.

### T-009 — Design system v2 (D-022, proposed)
- **Role:** Feature, with owner-approved shared-file edits (Ryan approved Phase 1 on 2026-11-03).
- **Description:** Visual layer only. Phase 2: tokens, self-hosted OFL pixel font, components (Meter, ActionButton, CategoryChip, DialogBar, ControlDeck/DeckActions, StatusStrip, DotIndicator, CornerButton, AmbientScene) and the Today restyle. Phase 3: Progress, Settings (incl. QA look via `--qa-*` variables only), docs/DESIGN_SYSTEM.md rewrite, D-022.
- **Allowed files (phase 2):** `src/styles/{tokens,global,components,today}.css`, `src/main.tsx` (CSS import), `src/assets/fonts/**`, `src/components/{Meter,ActionButton,CategoryChip,DialogBar,ControlDeck,StatusStrip,DotIndicator,CornerButton,AmbientScene,TodayCard,TabBar,Toast,DateNav}.tsx`, `src/views/{TodayView,MealsView,AddSheet}.tsx`, `src/views/photo/PhotoSheet.tsx`, `src/lib/{category,meter}.ts` + `category.test.ts`, `src/i18n/en.ts` (append), `index.html`/manifest theme color.
- **Excluded:** `src/db/**`, `src/services/**`, `src/modules/qa-feedback/**`, other `src/lib/*`, `package.json`.
- **Status:** Ready for owner review on device · **Branch:** `feat/T-009-design-system`
- **Log:** 2026-11-03 Feature: phase 2 done in a clean Linux clone — tsc clean, 196/196 unit (+9), 59/59 Chromium-mobile e2e (no test changed). WebKit and a real iPhone not run.
  2026-11-03 Owner feedback round (phase 2b): pixel font for all Today text (incl. Philip's line, date, food names, inputs; pixel type ≥ 15px); pixel icon set app-wide (`Icon.tsx`, same names); Take photo removed — one photo button without `capture` (iOS offers camera or library; supersedes the three-button part of D-017, to be recorded in D-022); calories show "N left" with "eaten/target" beside the meter; goal-hit chip removed (Philip's line says it); adherence score moved to the panel header; "What do I eat?" moved into Philip's dialog bar. e2e updated for the new copy/layout (food-logging, photo, qa-round-2, screens, owner-feedback-nov). tsc clean, 196/196 unit, 59/59 Chromium-mobile e2e. WebKit and a real iPhone not run.
  2026-11-03 Owner feedback round 3: one button face app-wide (the slate "Enter yourself" look on every `.btn`, ActionButton and dialog action; destructive buttons keep the face with a red frame); no emoji in copy (D-023 guardrail, `src/i18n/en.test.ts`); pixel font app-wide (body, headings, inputs; `--text-xs` raised to 15px); sheets, dialogs, banners, inputs and segmented controls in the pixel chrome; Settings cards as info panels with a dark «header» bar; the ambient scene redrawn as pixel art; Pixelify's capital C opened so it doesn't read as 0. `photo.spec.ts` now blocks the service worker (page.route missed SW fetches → flaky) and waits for "Gemini settings saved." before leaving Settings. tsc clean, 197/197 unit, 59/59 Chromium-mobile e2e (photo spec 3× green). WebKit and a real iPhone not run.
  2026-11-04 Phase 3: Progress as StatPanels (NamePlate latest vs goal with status badge, StatRows for rates / plan today / goal date, red accent when behind, chart in D-022 colors, history as a panel); Targets cards as info panels; QA module themed via `--qa-*` only (`src/styles/qa-theme.css`); docs/DESIGN_SYSTEM.md rewritten, D-022 added (supersedes the old visual spec and D-017's Take photo), CLAUDE.md reading order + UI convention point to it; ARCHITECTURE/README updated for the single photo button. e2e: Progress plan-number assertions moved to the rows.

### T-008 — Voice + emoji copy and docs refresh
- **Role:** Feature (copy) + PM (docs)
- **Description:** Apply D-020 voice/emoji samples in `en.ts`; decorative `aria-hidden` meal/macro emoji in `MealsView`/`TodayCard`; bring README, CLAUDE.md and docs/* up to date with `main` `0cdd351`.
- **Allowed files:** `src/i18n/en.ts`, `src/views/MealsView.tsx`, `src/components/TodayCard.tsx`, `e2e/**` (string updates), `README.md`, `CLAUDE.md`, `docs/**`
- **Acceptance criteria:** error/delete/safety/backup strings unchanged; accessible names unchanged by emoji; tsc, unit and Chromium e2e pass.
- **Status:** Ready to ship · **Branch:** `release/voice-emoji-docs`
- **Log:** 2026-11-03: tsc clean, 177/177 unit, 54/54 Chromium-mobile e2e in a clean Linux clone (8 e2e assertions updated to the new copy). WebKit not run.

### T-002 — WebKit e2e run
- **Role:** QA (on the Mac)
- **Description:** `npx playwright install webkit` (once), then `npx playwright test --project=webkit-iphone` on `main`. Report failures with the defect template; WebKit-only fixes become a separate Core/Feature task. Also check the Targets date-of-birth field (`.input-date`).
- **Allowed files:** `e2e/**` only if a test itself is wrong (report first).
- **Excluded:** `src/**`.
- **Deliverables:** pass/fail report in this entry.
- **Acceptance criteria:** full WebKit suite run with results recorded.
- **Status:** Completed
- **Log:** 2026-11-03 Owner: first WebKit run on `main` `da7c5cf` — 39 passed, 1 skipped, 14 failed. Core: root causes — (a) Settings overwrote a Gemini key typed before the profile loaded (9 photo/text/suggest tests); (b) WebKit ephemeral IndexedDB rejects Blobs → QA screenshots now stored as ArrayBuffer (2 QA tests); (c) test-environment limits skipped/guarded on WebKit: synthetic Touch, offline reload, clipboard permissions (3 tests). Fixes on `fix/webkit-and-cleanup` (`431ded2`).
  2026-11-03 Owner: re-run → 42 passed, 3 skipped, 9 failed. Core: WebKit `page.route()` missed Gemini fetches from SW-controlled pages (8 tests hit the real API with the fake key) → `serviceWorkers: 'block'` for webkit-iphone; photo test gated so the analyzing state is observable (1 test). `9d8c052`.
  2026-11-03 Owner: re-run → **51 passed, 3 skipped, 0 failed**.

### T-003 — Real-iPhone verification
- **Role:** Ryan (device) + QA (checklist, reporting)
- **Description:** ROADMAP.md Stage 8 real-device checklist, plus Story 3 flows: camera → review → save, saved meal, swipe actions, QA panel.
- **Status:** Proposed · **Depends on:** T-001

### T-004 — Live Gemini verification
- **Role:** Ryan (key) + QA
- **Description:** With a free-tier key: Test key, photo analysis, text analysis, "What should I eat?", invalid key, rate limit. Confirm `gemini-3.1-flash-lite` works or pick a new default (DECISIONS entry if changed); tune the prompt if estimates are off.
- **Status:** Proposed · **Depends on:** T-001

### T-005 — Remove unused files
- **Role:** Core
- **Description:** Confirm with `grep`/build which of `CalorieChart`, `CalorieRing`, `MacroBars`, `TargetsView` default export, `MyFoodsSheet`, `SavedFoodSheet`, unused `en.ts` keys are truly unreachable, then remove them. `MealsView.tsx` is **not** dead (TodayView imports `MealCard`).
- **Allowed files:** the files above, `src/views/SheetHost.tsx`, `src/ui.tsx`, `src/i18n/en.ts` (shared — PM coordinates), their tests.
- **Status:** Proposed — needs owner approval (file deletion) · **Depends on:** T-001

### T-006 — SW offline + update prompt
- **Role:** Core
- **Description:** `ignoreVary: true` in `src/sw-template.js` cache matching; wire `registerServiceWorker(onUpdate)` in `main.tsx` to a toast using the existing `update.*` strings.
- **Allowed files:** `src/sw-template.js`, `src/main.tsx`, `src/lib/pwa.ts`, `src/i18n/en.ts` (only if strings need changes), e2e offline spec.
- **Status:** Proposed · **Depends on:** T-001

## Recently completed

| ID | Summary | Completed | Evidence |
|---|---|---|---|
| T-000 | Development operating system docs | 2026-11-03 | Shipped in `main` `0cdd351` (owner push) |
| T-001 | Merge QA round 2 + Story 3 into `main` | 2026-11-03 | Owner fast-forwarded `main` to `0cdd351` and pushed. WebKit (T-002) was **not** run first. |
| T-008 | Voice + emoji copy (D-020) and docs refresh | 2026-11-03 | `main` `da7c5cf`, Pages deploy green |
| T-002 | WebKit e2e run + fixes | 2026-11-03 | Mac (`9d8c052`, 2026-11-03): **51 passed, 3 skipped, 0 failed**; branch `fix/webkit-and-cleanup` |
| T-005 | Remove unused files (owner approved) | 2026-11-03 | `fix/webkit-and-cleanup`; tsc, 177 unit, 54 Chromium e2e |
| T-007 | Owner feedback round: units switch, DOB layout, 1-month target, Today log buttons, Gemini temperature/retry/error detail | 2026-11-03 | `0cdd351`; tsc clean, 177 unit, 54 Chromium e2e (clean clone) |

## Entry template

```
### T-0XX — <feature name>
- **Role:** Core | Feature | QA | PM
- **Description:**
- **Allowed files:**
- **Excluded files:**
- **Shared files needing PM approval:**
- **Interfaces that must not change:**
- **Dependencies:**
- **Deliverables:**
- **Acceptance criteria:** Given … when … then … (incl. edge cases)
- **Status:** Proposed
- **Branch / worktree:** feat/T-0XX-… · ../philip-T0XX
- **Known conflicts:**
- **Log:** <date> <role>: <what happened>
```
