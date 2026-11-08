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
| T-017 | Mid-workout check-in, end-of-day review, workout calendar | Feature | Ready for owner review on device | `feat/T-017-checkin-calendar` | T-016 (`ee0d647`) |
| T-015 | Story 5 QA + docs | QA | Ready for owner device review + WebKit on the Mac | `feat/T-015-qa` | T-014 (`32b03ae`) |
| T-014 | Story 5 cycle briefing, cycle plan, Progress › Strength, Settings › Training | Feature | Phase A — screenshots for owner review | `feat/T-014-plan` | T-013 (`b386728`) |
| T-013 | Story 5 setup, cycle start (minimum briefing) and Today's session | Feature | Phase A — screenshots for owner review | `feat/T-013-session` | T-011 (`7668646`) |
| T-011 | Story 5 Home hub + navigation (Home · Progress · Settings; Meal log and Workout from Home; tour starts on Home) | Core | Phase A — screenshots for owner review | `feat/T-011-home` | T-012 (`d535ce9`) |
| T-012 | Story 5 training engine + data (Dexie v4, `lib/training/*`, backup block) | Core | Ready for review (no UI) | `feat/T-012-training-engine` | T-010 commit `8a70d20` |
| T-010 | Philip's guided tutorial (NDS-style): overlay, spotlight, typewriter, pixel portrait, replay from Settings | Feature (+ shared files, owner-approved) | Ready for owner review on device | `feat/T-010-tutorial` | T-009 (in `main`) |
| T-009 | Design system v2 (handheld-RPG look): tokens, components, Today, Progress, Settings, Targets, QA theme, docs | Feature (+ shared files, owner-approved) | Ready for owner review on device | `feat/T-009-design-system` | — |

---

### T-020 — Story 6 calendar UI: stamps, planned days, goal flower, delete log, training days
- **Role:** Feature. **Spec:** `docs/stories/STORY_6_OPTIMIZATION.md` §2 (UI), §3.3–3.5, §4 (UI), §5.
- **Files:** new `src/components/PixelStamp.tsx`, `e2e/calendar.spec.ts`; `src/views/workout/{WorkoutCalendar,SessionView}.tsx`, `src/views/{WorkoutView,TrainingSettings}.tsx`, `src/i18n/en.ts`, `src/styles/{workout,tokens}.css` (`--color-stamp`), `e2e/workout.spec.ts` (aria label).
- **Built:** `PixelStamp` (original pixel art generated from shapes on a 16/32 grid: round tick stamp; hanamaru flower, large one with よくできました in the system font). Calendar cells: done stamp (stamp-press animation after Finish, off with reduced motion), SQ/BP/RDL/OHP tags on projected days (dashed border), flower on the goal day; aria-labels carry the meaning. Day box with a Philip line per state: done today (large stamp, summary, top set, next date, View log, Delete log, briefing when the cycle ended), resume (+ Delete log), today open (on-plan vs off-day line, preview, Start), future planned (preview), goal day (goal snapshot per phase, Now line with its source, BF footnote), past logs (Delete log, or Locked line for finished cycles). Delete confirm (plain copy; legacy-review variant) + toast. Session: "Discard workout". Summary: "Back to calendar" (primary) + "Back to Home". Settings › Training › Training days (7 toggles, exactly 4, squat/RDL-two-days warning, Philip's pick).
- **Notes:** the BF "Now" reading has no date in the data model (profile.bodyFatPct), so it shows without one. Kana in the system font (owner to decide at review: keep or pixel-draw).
- **Status:** Phase A screenshots for owner review · **Branch:** `feat/T-020-calendar` on top of `feat/T-022-push-worker`.
- **Log:** 2026-11-08 Feature (cloud clone): tsc clean, 316/316 unit, build OK, Chromium e2e 88/88 (one unrelated food-logging flake passed on rerun). WebKit pending on the Mac.

### T-022 — Story 6: rest-alert push Worker
- **Role:** Core (infra). **Spec:** `docs/stories/STORY_6_OPTIMIZATION.md` §8.2 (server). Owner request 2026-11-07 ("send a push alert when done"; no keep-screen-on).
- **Files:** new `push-worker/` only (`src/{index,timer,webpush}.js`, `test/*.test.js`, `scripts/gen-vapid.mjs`, `wrangler.toml`, `package.json`, `README.md`, `.gitignore`). No app code.
- **Built:** Cloudflare Worker + one SQLite-backed Durable Object per device (`RestTimer`, named by SHA-256 of the endpoint). `PUT /timer` replaces the pending timer and sets the alarm; `DELETE /timer` cancels; the alarm sends one Web Push. Guards: Origin/CORS = `ALLOWED_ORIGIN`, Apple/Google/Mozilla/Microsoft endpoints only, `fireAt` ≤ 15 min, text ≤ 120 chars, 120 requests/hour/device, 4 KB body cap. VAPID (ES256 JWT) and aes128gcm encryption hand-written on WebCrypto: **no dependencies** (no library exception needed for D-028).
- **Free-plan check:** could not re-read Cloudflare's pricing pages from the cloud session (fetch blocked). Known quotas (Workers 100k requests/day; Durable Objects with SQLite storage on the free plan) fit about 100 timers a day by a wide margin (≈2–3 requests per timer). Owner verifies on the pricing page at setup; README says so.
- **Status:** Ready for owner setup (README) · **Branch:** `feat/T-022-push-worker` on top of `feat/T-019-core` (linear, to keep TASK_ASSIGNMENTS merge-free).
- **Log:** 2026-11-08 Core (cloud): `node --test` 11/11 (payload decrypts on the subscriber side, VAPID JWT verifies, PUT/replace/DELETE, alarm sends once, guards); `wrangler@4 deploy --dry-run` OK (9.97 KiB).

### T-019 — Story 6 core: schedule, one workout a day, delete + undo, starting weights
- **Role:** Core. **Spec:** `docs/stories/STORY_6_OPTIMIZATION.md` §2, §3.1–3.2, §4, §6, §7 (data). Owner request 2026-11-06/07.
- **Files:** new `src/lib/training/{schedule,startLoad}.ts` + tests, `src/db/story6.test.ts`; `src/lib/training/{progress,session,sessionLog,program,trainingBackup}.ts` (+ tests), `src/db/{types,repo}.ts`, `src/views/{HomeView,WorkoutView}.tsx`, `src/views/workout/{WorkoutCalendar,SessionView}.tsx` (minimal wiring only), `src/i18n/en.ts` (5 keys), `e2e/workout.spec.ts`.
- **Built:**
  - `planDates` projects the rest of the cycle onto training weekdays (Philip's pick Mon/Tue/Thu/Fri; `trainingProgram.trainingDays` optional), never stored; the last date is the goal day. `squatRdlTooClose` replaces the spec's back-to-back check: with exactly 4 distinct weekdays squat and RDL can never be back to back, so the warning fires when they're only 2 days apart (three training days in a row).
  - `workoutCardState(program, sessions, today)` gains `doneToday` (one workout a day); `cal.openNext` removed; Home and the calendar show "Done today" + the next planned date (minimal UI, T-020 restyles). Briefing can still open on a done day (`briefingOpen`).
  - `applyReview` (one transaction, records `reviewApplied`) and `deleteWorkoutSession` (current cycle only, `LockedSessionError` otherwise; appends `undo` TM rows additively, lowers the rest bonus). `TmReason` gains `undo`. `setTrainingDays`. `reviewApplied.tm` has no row id (backups drop TM ids; undo is additive so it isn't needed).
  - `startLoad.ts`: anchor × ratio for every accessory (group table §6), rounded down, body-weight fallback; `Prescribed.targetReps` / `estimate` / `assist`; `nextTargetReps` (middle of range first, bottom after a weight increase, else weakest set + 1). `copyOrder` copies the target reps; `canCopyOrder(p, bodyweight)`.
  - `swapInSession` (allowed until the first set is ticked; swapping back clears `swappedFrom`) and `swap(index, to, keep = true)` in SessionView (T-021 adds the Keep checkbox).
- **Status:** Review gate (starting-weight table) · **Branch:** `feat/T-019-core` from `3a5cd6f`.
- **Log:** 2026-11-08 Core (cloud clone): tsc clean, 316/316 unit, build OK, Chromium e2e 84/84 (workout spec updated for one-a-day). WebKit pending on the Mac.

### T-017 — Mid-workout check-in, day review, calendar (D-027)
- **Role:** Feature. **Owner request:** 2026-11-05 (voice notes).
- **Files:** `src/lib/training/checkin.ts` + test (new), `src/views/workout/WorkoutCalendar.tsx` (new), `src/views/workout/{ExerciseCard,SessionView}.tsx`, `src/views/WorkoutView.tsx`, `src/db/{types,repo}.ts`, `src/lib/training/{program,session,trainingBackup}.ts`, `src/services/foodAnalysis/gemini.ts` (`coachCheckinWithGemini`), `src/i18n/en.ts`, `src/styles/workout.css`, `e2e/workout.spec.ts`.
- **Built:** "Tell Philip" on every work set (flags: out of breath, too heavy, too easy, pain + optional note). Rules propose a change to the sets left today; a note goes to Gemini when a key is set (reply clamped, rules on any error). Owner taps "OK, change it" or "Keep my orders". After Finish, Philip's review proposes cycle changes (TM row reason `adjust`, `cycle.restBonusSec`) with checkboxes; "OK, apply" or "Not now". Workout opens on a month calendar (today selected; tick/dash/dot marks; a day's read-only log with flags and notes; today's button opens the session).
- **Status:** Ready for owner review · **Branch:** `feat/T-017-checkin-calendar` from `ee0d647`.
- **Log:** 2026-11-05 Feature: built in the cloud clone. tsc clean, 289/289 unit, build OK, Chromium e2e 84/84 (workout spec ×3 repeats stable). WebKit pending on the Mac.

### T-015 — Story 5 QA and docs
- **Role:** QA. **Spec:** `docs/stories/STORY_5_WORKOUTS.md` §11.
- **Done:** weigh-ins voluntary (`MIN_WEIGH_INS` = 2 for the average, owner: about twice a week); 150% text checks on Home, setup, briefing, session, plan, Strength and Settings at 375 and 440 px (`e2e/workout.spec.ts`); docs: D-025 as built, ARCHITECTURE (workout screens), DESIGN_SYSTEM (workout patterns), CLAUDE.md (stage + WebKit gap), story "as built" notes.
- **Acceptance criteria (§11):** 1 opens on Home ✅ · 2 setup + calibration ✅ · 2b plate loader ✅ · 3 block weights ✅ (unit) · 4 rotation ✅ (unit) · 5 orders vs actuals ✅ · 6 45 minutes ✅ (unit, every combination) · 7 phase ✅ (unit) · 8 progression ✅ (unit; applied at the briefing) · 9 resume ✅ · 10 units ✅ (session both units; plan in plate unit, owner OK) · 11 backup ✅ (unit) · 12 layout ✅ (Chromium, incl. 150% text) · 12b cycle goal ✅ (weigh-in rule changed by owner) · 12c menu ✅ · 13 checks: tsc, unit, build, Chromium e2e ✅; **WebKit pending on the Mac**.
- **Status:** Ready for owner review · **Branch:** `feat/T-015-qa` from `32b03ae`.
- **Log:** 2026-11-05 QA: tsc clean, 281/281 unit, build OK, Chromium e2e 80/80 (cloud clone, byte-identical tree). WebKit can't be installed in the cloud or the Mac's Linux VM.

### T-014 — Story 5 briefing, plan, Strength, Training settings
- **Role:** Feature. **Spec:** `docs/stories/STORY_5_WORKOUTS.md` §4.8, §6, §7.
- **Files:** `src/views/workout/StartCycleView.tsx` (full briefing), `src/views/workout/PlanView.tsx` (new), `src/views/StrengthPanel.tsx` (new), `src/views/TrainingSettings.tsx` (new), `src/views/{WorkoutView,ProgressView,SettingsView}.tsx`, `src/lib/training/cycleGoal.ts` (`calcInputsForGoal`) + test, `src/styles/workout.css`, `src/i18n/en.ts`, `e2e/workout.spec.ts`.
- **Built:** briefing (where you are, last cycle's goal vs now, phase radio with Philip's recommendation, Philip's goal preselected or "Set my own" with end weight + optional BF target, checked by `checkUserGoal`: <10% BF refused, <12% warned, out-of-range rate warned; on confirm: TM progression, profile goal/target/rate (+ target BF when set), new target plan through the existing calculator when body stats exist, cycle snapshot with `targetPlanId`); cycle plan (block, focus, phase, TMs, Why this block + evidence labels, week tabs, every day's orders with your best logged set on finished days, next-block TM preview and accessory list); Progress › Body | Strength (e1RM chart per lift, sessions per week, average time, TM by cycle); Settings › Training (re-test a lift → `retest` TM, bar and plates, exercise menu with sticky swaps per day/block, end the cycle now, reset program; logs kept).
- **Not built:** equipment availability list (swaps are chosen directly in the menu instead).
- **Status:** Phase A for review · **Branch:** `feat/T-014-plan` from `b386728`.
- **Log:** 2026-11-05 Feature: built in the Cowork cloud clone (byte-identical tree). tsc clean, 280/280 unit, build OK, Chromium e2e 77/77 (+2).
  2026-11-05 Owner feedback: (1) swap a missing machine during the check before starting — the day preview's accessories open Philip's approved swaps on tap (sticky); (2) the briefing no longer blocks on 3 weigh-ins: 7-day average if there are 3+, else the latest weigh-in from 14 days, else the Targets weight, with a note saying which. tsc clean, 281/281 unit, Chromium e2e 78/78.

### T-013 — Story 5 setup and Today's session
- **Role:** Feature. **Spec:** `docs/stories/STORY_5_WORKOUTS.md` §4.1, §4.7, §5.
- **Files:** `src/views/WorkoutView.tsx` (router: setup → cycle start → session), `src/views/workout/{SetupView,StartCycleView,SessionView,ExerciseCard,units}.tsx|ts` (new), `src/lib/training/sessionLog.ts` + test (new), `src/lib/training/progress.ts` (`cycleOutcomes`), `src/db/{types,repo}.ts` (`SessionExercise.skipped`; autosave keeps frozen orders unless the slot was swapped), `trainingBackup.ts` (`skipped`), `src/styles/workout.css` (new, imported in `main.tsx`), `src/i18n/en.ts`, `e2e/workout.spec.ts` (new), `e2e/helpers.ts` (`seedWeights`).
- **Built:** setup (1RM or weight × reps per lift, kg/lb, e1RM + TM shown, blank → calibration; bar + plate unit); minimum cycle start (Philip's §4.8 goal, needs 3 weigh-ins in 7 days, applies last cycle's TM progression; "Set my own" and the target plan come with T-014); start screen (day preview, minutes, Start / Skip this day); calibration card for a lift with no TM; live session (orders read-only with plate line in both units, YOUR LIFT inputs empty with placeholders, As ordered, Done needs reps + weight, + sets need typed reps, rest timer bar, elapsed vs estimate, 45-min nudge, Swap from approved options with sticky pick, Skip, Note, Hurts → plain-text stop); autosave/resume; finish summary (sets, time, e1RM, PR, miss, pain).
- **Status:** Phase A for review · **Branch:** `feat/T-013-session` from `7668646`.
- **Log:** 2026-11-05 Feature: built in the Cowork cloud clone (byte-identical tree). tsc clean, 278/278 unit (+8), build OK, Chromium e2e 75/75 (+3 `workout.spec.ts`). Screenshots: setup, briefing, live session.

### T-011 — Story 5 Home hub and navigation
- **Role:** Core. **Spec:** `docs/stories/STORY_5_WORKOUTS.md` §2, §3, §9 (tutorial).
- **Files:** `src/hooks/useRoute.ts`, `src/App.tsx`, `src/components/{TabBar,Icon,TutorialOverlay}.tsx`, `src/views/{HomeView,WorkoutView}.tsx` (new; Workout is a placeholder for T-013/T-014), `src/views/SettingsView.tsx` (Replay → Home), `src/lib/tutorial.ts`, `src/lib/training/progress.ts` (`workoutCardState`), `src/qaFeedback.config.ts`, `src/styles/{today,components,global}.css`, `src/i18n/en.ts`, e2e helpers/specs.
- **Routes:** `#/home` (default; empty/unknown → Home), `#/meals` (the former Today screen), `#/workout`, `#/workout/plan`, `#/progress`, `#/settings`, `#/targets`. Redirects `#/today`, `#/history` → `#/meals`. Tab bar Home · Progress · Settings; Meal log/Workout highlight Home. No photo shortcut on Home (owner).
- **Tour:** steps carry a `screen`; it starts on Home (both cartridges, phase chip), then walks into the Meal log (first Meal-log line has no anchor while the screen loads).
- **Also:** font ligatures off app-wide (`body { font-variant-ligatures: none }`): Pixelify's "fi" drew as "A" in new copy ("Protein first"). e2e `fresh()` now lands on the Meal log unless `{ at: 'home' }`; `openMealLog()` helper replaces the old Today tab.
- **Status:** Phase A for review · **Branch:** `feat/T-011-home` from `d535ce9`.
- **Log:** 2026-11-05 Core: built in a Cowork cloud clone (byte-identical tree to the worktree). tsc clean, 270/270 unit, build OK, Chromium e2e 72/72 (+6: `home.spec.ts`, tour-on-Home). Home fits 393×793 with no scroll, no horizontal scroll at 375/393/440. The Mac's node_modules are macOS builds now, so the Linux VM can't run vitest there.

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
