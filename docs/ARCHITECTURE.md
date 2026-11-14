# Architecture

> Verified against `story-3-simplify` (`5f78cb4`) on 2026-11-02. Parallel-development boundaries (shared files, ownership zones) are in [DEVELOPMENT_RULES.md](DEVELOPMENT_RULES.md). Architectural changes must be recorded in [DECISIONS.md](DECISIONS.md).

Local-first single-page PWA. No server: everything runs in the browser and is stored in IndexedDB.

```
src/
  main.tsx              boot: open DB, set locale, render, request persistent storage, register SW
  App.tsx               shell: hash routing (3 tabs: Today · Progress · Settings, plus the Settings › Targets page), shared selected date, sheet host, toasts
  ui.tsx                UI context (date, openSheet, navigate) + SheetState union
  db/
    types.ts            persisted types (metric units)
    db.ts               Dexie schema (v1 → v2), default profile, init
    repo.ts             all reads/writes used by the UI
  lib/
    date.ts             local YYYY-MM-DD helpers (DST-safe)
    nutrition.ts        sums, plan resolution, scaling
    targets.ts          Mifflin–St Jeor / Katch–McArdle calculator + safety rules
    remaining.ts        Today card: left / over / to go per phase (cut, maintain, bulk)
    weight.ts           weight log: expected-weight line from the plan, goal date
    foodText.ts         local (no-AI) parsing of typed food text + My Foods / recents matching
    adherence.ts        daily adherence score
    history.ts          day/week summaries and averages
    backup.ts           export / validate / restore / delete-all
    recents.ts          recent & frequent foods
    numbers.ts          decimal parsing and validation
    format.ts           Intl number/date formatting
    pwa.ts              service worker + storage persistence
  services/foodAnalysis/
    index.ts            provider-independent entry point (analyzeFoodPhoto, analyzeFoodText)
    gemini.ts           the only Gemini-aware module (REST, error mapping)
    image.ts            in-browser resize to ≤1024px JPEG
    prompt.ts           shared prompt + JSON shape + Gemini response schema
    parse.ts            JSON extraction + strict validation (used by Gemini and Claude handoff)
  views/                screens and sheets (Today, Progress, Settings, TargetsPage, Add (log), Entry (edit), Suggest, photo/*); MealsView is no longer routed;
                        TargetsView.tsx now only supplies CurrentCard + TargetsSections, used by TargetsPage (Settings › #/targets)
  components/           small shared UI (Sheet, ConfirmDialog, TodayCard, WeightChart, …)
  i18n/                 en.ts strings + t() helper
  styles/               tokens.css, global.css, view styles
  sw-template.js        service worker; precache list injected at build (vite.config.ts)
  qaFeedback.config.ts  connects the QA & Feedback module to Philip (app name, screen context, Gemini key)
  modules/qa-feedback/  self-contained QA & Feedback Capture module (see its README.md)
```

## Navigation

**Story 5 (T-011):** the app opens on **Home** (`#/home`). Tab bar: Home · Progress · Settings. The former Today screen is the **Meal log** (`#/meals`), entered from Home's Meal log cartridge (always on today's date); **Workout** is `#/workout` and `#/workout/plan`. `#/today` and `#/history` redirect to `#/meals`; empty or unknown hashes go to Home. Philip's tour starts on Home and walks into the Meal log (`TourStep.screen`). The notes below predate Story 5 where they mention the Today tab.

| Tab | Route | Content |
|---|---|---|
| Today | `#/today` | First screen. Date heading (‹ › and picker for past days) + one card: kcal eaten/left with a bar, P/F/C eaten / target / left with bars (`lib/remaining.ts`); **Choose photo** (camera or library on iOS) and **Enter yourself** (toggles the inline `AddPanel`) on the bottom control deck (D-022); the day's foods grouped by meal (tap to edit, swipe to move/delete); optional “What should I eat?” |
| Progress | `#/progress` | Weight only: on track / ahead / behind (`lib/weight.ts#weightProgress`), actual-vs-plan chart, weigh-in form, collapsed history with delete + Undo |
| Settings | `#/settings` | Targets & body stats link, data, Gemini, units, QA & Feedback, danger zone |
| (page) | `#/targets` | Settings › Targets & body stats: current targets, calculator, manual, weekly plan, adherence, history. Tab bar highlights Settings. |

Old routes redirect with `history.replaceState`: `#/history` and `#/meals` → `#/today`. Tapping the Today tab always resets the date to today.

### Logging flow (Story 3, updated Nov 2026)
Today → Choose photo (camera or library; D-022) → analyzing (PhotoSheet) → **Review** → Save to {meal}. **Enter yourself** reveals an inline panel on Today (`AddPanel` in `views/AddSheet.tsx`): an autofocused text box, saved meals, and “Type the numbers”. The Add food sheet (`AddSheet`, photo buttons + the same `AddPanel`) remains for Meals. The Log food button was removed (D-017). Every path ends in the Review sheet (meal picker, compact rows: name + grams, nutrition rescales with grams, “Edit nutrition” for direct macro edits, add/remove rows, optional “Also save as a meal”). Saving shows “N kcal logged to {meal}” with Undo. My Foods / recents / favorites and the Claude handoff button were removed from the log sheet (the handoff remains on photo-analysis errors); saved foods stay in the database and backups and still prefill typed text without a key.

## Data model (IndexedDB `philip`, Dexie v6)

| Table | Key | Notes |
|---|---|---|
| `profile` | `id = 'me'` | body stats (incl. optional `bodyFatPct`, v2), goal, unit prefs, locale, `geminiKey`, `geminiModel`, `adherenceEnabled` |
| `targetPlans` | `++id`, index `effectiveFrom` | append-only; optional `weekdayOverrides` (0=Sun…6=Sat) |
| `foodEntries` | `id` (UUID), index `date` | `source: manual\|photo\|saved`; `estimate` keeps original AI values |
| `savedFoods` | `id` (UUID) | `useCount`, `lastUsedAt`, `favorite` |
| `meta` | `key` | `lastBackupAt`, `backupReminderSnoozedAt`, `storagePersisted`, `tutorialSeenAt` (T-010: ms when Philip's tour was finished or skipped; null = show it) |
| `savedMeals` (v3) | `id` (UUID), indexes `name`, `lastUsedAt` | `{id, name, items: {name, grams, calories, proteinG, fatG, carbsG}[], useCount, lastUsedAt, createdAt, updatedAt}`. Saving with an existing name (case-insensitive) replaces its foods. Logging copies the foods into entries via the Review sheet (source `manual`). |
| `weightEntries` (v2) | `date` | `{date, weightKg, createdAt, updatedAt}`; one per local date, logging again overwrites. Logging the newest date also updates `profile.weightKg`. |
| `trainingProgram` (v4) | `id = 'me'` | bar (`barKg`, `plateUnit`, `plates`), `weightUnit`, `unavailableEquipment`, `currentCycle` (0 = briefing pending) |
| `tmHistory` (v4) | `++id`, indexes `lift`, `effectiveCycle` | append-only `{lift, tmKg, effectiveCycle, reason: setup\|cycle\|miss\|pain\|retest}`; a cycle's TM = latest row with `effectiveCycle ≤ cycle` (`tmsForCycle`) |
| `cycles` (v4) | `index` | snapshot at cycle start: `block`, `phase`, `tms`, `goal` (start/end weight, weekly rate %, BF line, source, target plan id) |
| `workoutSessions` (v4) | `id`, indexes `date`, `[cycle+week+day]`, `status` | `exercises[]`: `prescription` (Philip's orders, frozen at creation; `saveWorkoutSession` never overwrites them) and `actual` (owner's log only) |
| `slotChoices` (v4) | `slotKey` (`D2-A1-B`) | owner's sticky swap; only approved swaps are honoured |
| `coachNotes` (v5, Story 9) | `++id`, index `createdAt` | `{text ≤140, source: report\|ask, sessionId, createdAt}`: durable facts Philip keeps (Gemini `remember`); deduped, newest 40 kept; survive log deletes; managed in Settings › Philip's memory |
| `coachMessages` (v5, Story 9) | `++id`, index `at` | Ask Philip chat `{from: me\|philip, text, at}`, newest 200 kept. Workout chats stay on `workoutSessions.coach` |
| `planChanges` (v6, Story 11) | `++id`, indexes `at`, `status`, `cycle` | A goal event (reached / off track) and Philip's plan for it: chosen goal, prompt, engine ranges, proposal, accepted levers, Undo data; `status: waiting → ready → applied \| undone \| dismissed` (D-034) |

Migrations: v1 → v2 adds `weightEntries` and sets `profile.bodyFatPct = null`; v2 → v3 adds the empty `savedMeals` table (no record changes); v3 → v4 adds the training tables; v4 → v5 adds the empty `coachNotes` and `coachMessages` tables (no record changes); v5 → v6 adds the empty `planChanges` table (no record changes). Every record is kept (covered by `src/db/migration.test.ts`).

Rules:
- Entry dates are local `YYYY-MM-DD`; a meal at 11:55 PM stays on that day.
- Daily totals are always computed from entries.
- Target for a date = latest plan with `effectiveFrom <= date` (ties: newest `createdAt`), then the weekday override if present.
- Logging a saved food copies its values; editing/deleting the saved food never changes history.

## Backup format (`schemaVersion: 1`)

```json
{
  "format": "philip-backup",
  "schemaVersion": 1,
  "exportedAt": "2026-10-28T21:15:00.000Z",
  "data": {
    "profile": { "...": "Profile; geminiKey is null unless the user opts in" },
    "targetPlans": [ "TargetPlan" ],
    "foodEntries": [ "FoodEntry" ],
    "savedFoods": [ "SavedFood" ],
    "weightEntries": [ "WeightEntry — optional" ],
    "savedMeals": [ "SavedMeal — optional" ]
  }
}
```

`weightEntries` and `profile.bodyFatPct` were added in QA round 2 as **optional** fields without bumping `schemaVersion`: backups made before then import unchanged (empty weight log, `bodyFatPct = null`), and older app builds ignore the new fields. `savedMeals` (Story 3) follows the same rule: optional, `schemaVersion` still 1; merge adds missing ids and the newer `updatedAt` wins.

Import is validated completely before touching the database (types, ranges, dates, enums, schema version, duplicate IDs). Restore runs in one transaction:
- **Merge**: keep local data, add missing records; on ID conflict the newer `updatedAt`/`lastUsedAt` wins; local profile kept.
- Weight entries merge by date; on the same date the newer `updatedAt` wins.
- **Replace**: clear everything, write the backup exactly (keeps this device's Gemini key if the backup has none). Requires confirmation.

Future schema versions must add a migration in `parseBackup` rather than rejecting old files.

## Target calculation (`src/lib/targets.ts`)

1. REE: Mifflin–St Jeor (men `10·kg + 6.25·cm − 5·age + 5`, women `… − 161`), or Katch–McArdle `370 + 21.6 · lean mass (kg)` when body fat % (3–60) is set. Result carries `reeMethod`.
2. Maintenance = REE × activity factor (1.2 / 1.375 / 1.55 / 1.725 / 1.9).
3. Adjustment = weekly rate × 7,700 kcal/kg ÷ 7 (rough approximation, labeled as an estimate).
4. Safety: loss ≤ 1% body weight/week, gain ≤ 0.5%/week; calorie floor 1,500 (men) / 1,200 (women) and ceiling 6,000 — hitting either raises a "needs review" warning. Also flagged: low BMI, deficit below REE or > 30% of maintenance, a limit reversing the goal, macros exceeding calories. Adults (18–100) only.
5. Protein g/kg: train ≥1 day → lose 2.0 (2.2 if ≥4 days), maintain 1.6, gain 1.8; no training → 1.2–1.6. Above BMI 30 only 25% of the excess weight counts.
6. Fat = max(25% of calories, 0.5 g/kg reference weight). Carbs = remainder.

Reviewed by a separate Opus pass (Stage 3); findings fixed and covered by tests.

## Adherence score (`src/lib/adherence.ts`)

Calories 40% (full ±10%, linear to 0 at ±35%), protein 35% (full ≥90%, 0 at ≤50%, no penalty above), fat and carbs 12.5% each (full ±20%, 0 at ±50%). Days under 50% of the calorie target are "incomplete" and not scored. A 0 g target earns full credit at ≤5 g.

## Today card (`src/lib/remaining.ts`)

Phase = active plan's `inputsSnapshot.goal`, else `profile.goal`, else maintain. Cutting/maintaining: calories, fat and carbs are ceilings (left → success, over → danger). Bulking: they are minimums (to go → warning, reached → success, shown as “X over”). Protein is always a minimum. Every value carries the words left / over / to go, so color is never the only signal.

## Weight log (`src/lib/weight.ts`)

Expected line: starts at the newest calculated plan's `inputsSnapshot.weightKg` on its `effectiveFrom`, moves by `profile.weeklyRateKg` passed through the calculator's `resolveRate` (same caps), and stops at the goal weight. Goal date = start + ⌈|Δ| / rate⌉ weeks. Manual plans have no starting weight, so no line. Chart is inline SVG (`components/WeightChart.tsx`).

## Food photo analysis

`PhotoSheet` → `analyzeFoodPhoto()` → resize (≤1024px JPEG) → Gemini `generateContent` with JSON mode + response schema (retries once without schema on a generic 400) → `validateAnalysis()` → `ReviewSheet`. Key goes in the `x-goog-api-key` header only. Errors are typed (`noKey`, `invalidKey`, `rateLimited`, `modelUnavailable`, `network`, `timeout`, `blocked`, `invalidResponse`, `server`, `image`) and every error screen offers retry, manual entry and the Claude handoff.

Claude handoff: copy prompt → user attaches the photo in the Claude app (optionally via the share sheet) → paste reply → same validator → same review sheet. Philip never calls Claude itself.

Photos are never stored.

### Typed text (add sheet and review list)

The add panel shows one text box (“2 eggs, 150 g rice, 1 tbsp olive oil”), saved meals and Type the numbers; the photo buttons sit on Today (see “Logging flow” above); My Foods, recents and the Claude handoff button are no longer in it. Text goes to `analyzeFoodText()` → `analyzeTextWithGemini()` (same request, schema, error mapping and `validateAnalysis()` as photos; prompt `FOOD_TEXT_INSTRUCTIONS` with the same JSON shape). The review list has the same text box; sending appends rows. Without a key, on any error, or when Gemini finds nothing, `lib/foodText.ts` splits the text locally (g/kg/ml, tbsp 15 g, tsp 5 g, cup 240 g, bare counts), prefills macros from a My Foods / recent-food name match, and leaves the rest empty for the user. Local rows save as `source: 'manual'` with no estimate; AI rows save as `source: 'photo'` with their own provider/model.

## QA & Feedback Capture (`src/modules/qa-feedback`)

A reusable, self-contained module for capturing observations (bugs, UI/usability issues, ideas) while using the app and turning selected ones into a Claude Code prompt. Details: `src/modules/qa-feedback/README.md`.

- **Integration:** `<QaFeedback config={qaFeedbackConfig} />` in `App.tsx`, a "QA & Feedback" card in Settings, and `src/qaFeedback.config.ts`. The module imports nothing from Philip; Philip's config passes in the Gemini key (from `profile.geminiKey`) and the current screen.
- **Storage:** its own IndexedDB database, `qa-feedback` (Dexie v2: observations gain `archivedAt` / `archivedByPromptId`), with tables `projects`, `observations`, `attachments`, `files` (screenshot blobs), `prompts` and `meta`. Philip's `philip` database, its backups and "Delete all data" are untouched. Rolling back = removing the module and deleting that database.
- **UI:** Philip sets `floatingButton: false` (Story 3), so the panel opens from Settings › QA & Feedback (“Write feedback”, “Feedback list”). It opens a bottom-sheet panel (the app stays visible above it) with Capture, Inbox (search, filters, batch selection, detail) and Prompt (grouping, template or AI-assisted generation, edit, copy, .txt/.md export). The panel and its CSS are lazy-loaded.
- **Archive (Story 3):** right after a prompt is generated (template or AI), the builder asks “Do you want to archive the suggestions included in this prompt?” Archive → `archiveForPrompt` + “N observations archived” toast with Undo, and they leave the selection; Keep active → nothing changes. Copy/export no longer archive. The inbox has Active · n | Archived · n; Archived is grouped by the day archived (struck through, muted), and the detail screen has Unarchive. Archive is separate from status.
- **Manual archive (OBS-97D767, Nov 2026):** `archiveObservations` archives by hand (`archivedByPromptId` stays null; `promptIds` and prompts are untouched) from the detail screen (“Archive”, plus a banner on items already in a prompt), the inbox (“Archive n” on the selection, with Undo; “Unarchive n” in Archived) and the prompt builder (“Archive the n in this prompt”). Inbox rows show “In a prompt”. The Inbox tab count is `countByArchive().active` — the same rule as the Active list — so archived items no longer count (OBS-A09A21). Settings › QA & Feedback has an Archived row (`openQaFeedback('archived')`).
- **One project (OBS-A09A21):** the panel has no project picker; it always opens the host app's project (`ensureDefaultProject(appId)`). Other projects already in the database are kept but not shown. The capture form is words + type + screenshots; feature/screen, priority and the structured fields are edited on the detail screen.
- **AI:** optional; the Gemini provider is used only after an explicit tap ("Analyze with AI" on the detail screen, "Improve with AI" in the prompt builder; capture-time "Structure with AI" was removed in OBS-A09A21). Responses are validated, AI fields are marked, and AI never overwrites what the user typed.

## Philip's tour (`src/lib/tutorial.ts`, D-024)

`App.tsx` mounts `TutorialOverlay` on Today while `META.tutorialSeenAt` is unset and no sheet is open, once the profile and target plans have loaded. The context (`hasTarget`, `hasKey`) is captured when the tour starts, so logging during it can't reshuffle the steps; `stepsFor(ctx)` drops steps whose anchor can't exist. Finishing or skipping sets the flag; "Set targets" also navigates to targets. Settings › Help › Replay tutorial sets it to null. The flag isn't in backups; Delete all clears it, restores keep it. Anchors are `data-tour` attributes, not styling classes.

## Training engine (`src/lib/training/`, D-025)

Pure modules, all tested: `program.ts` (blocks, waves, deload, RDL caps, TM progression, double progression), `session.ts` (builds a day's orders and the 45-minute time model + trim order), `plates.ts` (loadable rounding and per-side plates), `cycleGoal.ts` (goal briefing defaults and checks), `exercises.ts` (library + Appendix A menu; copy in `en.ts` as `exercise.*`, `cue.*`, `why.*`), `progress.ts` (TMs per cycle, next day in sequence, e1RM points), `trainingBackup.ts` (optional `training` backup block). Days are a sequence, not weekdays. Cycle numbers never repeat, even after a program reset.

## Workout screens (Story 5, T-013/T-014)

`src/views/WorkoutView.tsx` routes by state (`workoutCardState`): no program → `workout/SetupView` (1RM or weight × reps per lift, kg/lb, bar and plate unit); cycle not started or finished → `workout/StartCycleView` (the goal briefing: phase, Philip's goal or "Set my own" checked by `checkUserGoal`; confirming applies TM progression via `cycleOutcomes`/`nextTm`, updates the profile goal/target/rate, writes a target plan through `calculateTargets` when body stats exist, and calls `startCycle`); otherwise `workout/SessionView` (day preview with tap-to-swap → `createSession` → live log with `ExerciseCard` per exercise → finish → `summarize`). A lift with no TM gets a calibration card on its day. `#/workout/plan` is `workout/PlanView` (read-only). Progress › Strength is `StrengthPanel`; Settings › Training is `TrainingSettings` (re-test, bar/plates, exercise menu, end cycle now, reset program). Orders vs log: `saveWorkoutSession` keeps a session's frozen `prescription` unless the slot's exercise was swapped; everything the owner types lives in `actual`, `note`, `skipped`.

## Story 6 (D-028)

- **Schedule:** `lib/training/schedule.ts` `planDates({ today, trainingDays, sessions, cycle })` → the rest of the cycle on training weekdays (default `DEFAULT_TRAINING_DAYS` Mon/Tue/Thu/Fri); never stored. `workoutCardState(program, sessions, today)` adds `doneToday` (one workout a day).
- **Calendar:** `workout/WorkoutCalendar.tsx` — cells (stamp / lift tag / goal flower via `components/PixelStamp.tsx`) and a day box (done, resume, start, planned, goal with the cycle goal snapshot, past logs with Delete log; finished cycles locked).
- **Delete + undo:** `repo.applyReview(sessionId, changes)` records `reviewApplied`; `repo.deleteWorkoutSession(id)` appends `undo` TM rows, lowers `cycle.restBonusSec`, deletes the row (`LockedSessionError` outside the current cycle). `repo.setTrainingDays`.
- **Starting weights:** `lib/training/startLoad.ts` (`startRule`, `startingKg`, rounding down) feeds `session.ts#accessory` when an exercise has no log; `program.ts#nextTargetReps`. `sessionLog.ts#swapInSession` swaps one accessory until its first set is ticked.
- **Rest alerts:** `services/restPush.ts` (config from `VITE_PUSH_URL`/`VITE_PUSH_VAPID_KEY`, subscribe, `scheduleRestAlert`/`cancelRestAlert` with a 3 s timeout, `beep`). The service worker handles `push` (type `rest`) and `notificationclick`. Server: `push-worker/` (Cloudflare Worker + Durable Object alarm; see its README).

## Philip's memory (Story 9, D-031)

- **Brief:** `lib/coach/brief.ts#buildBrief` (pure) turns the whole history into ≤ 6,000 characters (`BRIEF_BUDGET`), sections in priority order: notes → lifter (age/sex/height, targets, weight 7-day average + 4-week trend, body fat, food last 7 days) → program (cycle, phase, TMs now and in cycle 1, goal) → main lifts (best set per session, e1RM, last 5) → reported pain/notes (6 weeks) → recent workouts (6) → accessories (latest log each, 12) → earlier chats (12 lines). Lines that don't fit are cut from the end. `db/coachBrief.ts#loadBrief(today, {excludeSessionId, excludeAsk})` reads everything in one read transaction; Settings › Philip's memory › "Include body and food data" (`META.coachShareBody`, default on, device-only) drops the lifter's body and food lines.
- **Where it goes:** the workout report and the chat under it (`reportPrompt`/`chatPrompt` take the brief, today's workout follows it), the mid-set check-in (`exerciseHistory` for that exercise + notes), and Ask Philip (`lib/coach/memory.ts#askPrompt`, `#/ask`, advice only; plan changes stay in the report where they're validated).
- **Remember:** any coaching reply may carry `remember: string[]`; `parseRemember` keeps ≤ 2 clean lines (≤ 140 chars); `repo.addCoachNotes` dedupes and keeps the newest 40.
- **Backup:** `training.coachNotes` / `training.coachMessages` (optional; `schemaVersion` stays 1). Delete all data clears them.

## QA batch 2026-11-13 (D-033)

- **Photo details:** `PhotoSheet` opens on a details step; `analyzeFoodPhoto(file, { details })` → `prompt.ts#foodPhotoPrompt(details)`. Handoff gets `details` through `SheetState.handoff`.
- **Everyday meals:** `SavedMeal.everyday` (optional `Meal`), `repo.setSavedMealEveryday` (one per meal), `lib/meals.ts#everydayToOffer`; shown as "Your usual" on the meal log; toggled in the Review sheet.
- **Weigh-in take:** `lib/weighIn.ts#reviewWeighIn` / `refreshPlan`; `ProgressView` `WeighInTake`. `lib/weight.ts#weightPlanLine` honours `inputsSnapshot.lineStartKg/lineStartDate`. `lib/coach/askDraft.ts` pre-fills Ask Philip (in memory only).
- **Coach prompts:** `exercises.ts#loadKind` / `LOAD_RULE` in the report, chat, brief and Ask prompts. Report proposal `{ kind: 'order', day, order }` → `trainingProgram.dayOrder`, `ReviewApplied.orders` for undo.
- **QA module:** `textHistory.ts` (capture undo/redo); `browser.ts#shareFiles` + "Share screenshots" in the prompt builder.

## Network

Two destinations, both optional; the app works fully offline without them:
- **Gemini** (`services/foodAnalysis/gemini.ts`), with the owner's key. Since Story 9 coaching prompts carry Philip's brief (training history, notes, recent chats, and body/food data unless switched off).
- **Rest-alert Worker** (`services/restPush.ts` → `push-worker/`), only when Rest alerts are on: the push subscription, the rest end time and the next-set text. Apple/Google/Mozilla push services deliver the notification.

## Offline / PWA

`vite.config.ts` generates `dist/sw.js` with a precache list of all build assets. Navigations are network-first with the cached shell as fallback; same-origin assets are cache-first; cross-origin requests (Gemini) bypass the SW. `navigator.storage.persist()` is requested at boot.

## Boundaries and integration points

These are the seams that keep parallel work safe. Changing any of them is an architectural change (PM review + entry in [DECISIONS.md](DECISIONS.md)).

| Boundary | Rule | Integration point |
|---|---|---|
| UI ↔ data | Views/components read through `hooks/useData.ts` (live queries) and write through `db/repo.ts`. A few small direct Dexie reads exist (Settings, BackupReminder) — don't add more. | `repo.ts` function signatures |
| Data ↔ schema | `db/types.ts` + `db/db.ts`. New tables/fields = new Dexie version with an upgrade; never edit an old version. | Dexie version number (currently 3) |
| Data ↔ backups | `lib/backup.ts`. New persisted data must be added to export/validate/merge/replace as an **optional** field; `schemaVersion` stays 1 unless the owner approves. | backup JSON shape |
| Logic | Pure calculations in `lib/*` (no React). Safety rules in `lib/targets.ts` are owner-controlled. | exported functions + their tests |
| AI | Only `services/foodAnalysis/gemini.ts` knows Gemini. Everything goes through `index.ts` (`analyzeFoodPhoto`, `analyzeFoodText`) and `parse.ts#validateAnalysis`, then the Review sheet. | `AnalysisResult`, `AnalysisError` |
| Navigation | `hooks/useRoute.ts` (`Tab`, `TABS`, `ROUTE_REDIRECTS`) + `App.tsx` + `components/TabBar.tsx`. | `Tab` union |
| Sheets | One sheet at a time: `SheetState` union in `ui.tsx`, rendered by `views/SheetHost.tsx`. A new sheet = a new union member + a SheetHost case. | `SheetState`, `useUI()` |
| Strings | `i18n/en.ts` via `t()`. QA module strings only in `modules/qa-feedback/ui/strings.ts`. | string keys |
| Styles | Tokens in `styles/tokens.css`; shared classes in `global.css`; screen styles in `today.css` / `views.css`; QA module uses `qa-` classes only. | CSS custom properties |
| QA module | `modules/qa-feedback/` imports nothing from Philip. Philip wiring only in `src/qaFeedback.config.ts` + `<QaFeedback>` in `App.tsx` + Settings card. | `QaFeedbackConfig`, `index.ts` exports |
| Build / offline | `vite.config.ts` (SW generator plugin, base `./`), `src/sw-template.js`, `public/manifest.webmanifest`. | precache list |
| Deploy | `.github/workflows/deploy.yml`: push to `main` → `npm ci` → `npm test` → `npm run build` (with the `VITE_PUSH_*` repository variables) → GitHub Pages. E2E is not run in CI. The push Worker deploys separately with `wrangler` (`push-worker/README.md`). | `main` branch |

## Owner feedback round (Nov 2026)

- **Targets calculator:** `kg · cm | lb · ft` switch in the card header. `convertForm()` converts the typed, unsaved values, then `updateProfile({ unitPrefs })`; the unit re-sync effect is skipped for that change. Field order: Sex | Date of birth, Weight | Body fat, Height (cm full-width or ft | in). `.input-date` normalizes iOS date inputs.
- **1-month target suggestion:** for Lose/Gain with a weight entered, `resolveRate(goal, weightKg, null)` (the default safe pace from `SAFETY`, unchanged) × 30/7 weeks → “🎯 1 month: X (rate/wk) · Use it”, which fills target weight and rate.
- **Gemini:** `usesDefaultTemperature(model)` — Gemini 3+ requests omit `temperature` (Google advises the default 1.0; low values can loop and truncate JSON); older models keep 0.2. Suggestions use `generateWithRetry` (one retry on `invalidResponse`). SuggestSheet shows the raw error message under “What Gemini said”.
- **Copy:** voice and emoji per D-020; decorative meal (🌅 🌞 🌙 🍿) and macro (🥩 🥑 🍚) symbols are `aria-hidden` spans so accessible names are unchanged.

## Story 11: goal reached → next goal → Philip's plan (D-034)
- **Pure:** `lib/goal/goalCheck.ts` (events, ETA), `nextGoal.ts` (Same again / Philip's pick / own), `window.ts` (what happened over the goal window, measured maintenance), `proposal.ts` (lever ranges, prompt, validation and caps), `lib/training/nextCycle.ts` (TM progression, shared with the cycle briefing).
- **Data:** `db/goalRepo.ts` (Apply / Undo in one transaction), `db/goalPrompts.ts` (events already shown, `META.goalPrompts`).
- **UI:** `hooks/useGoal.ts` (eager, small) feeds Home's line and the lazy `components/GoalWatcher.tsx`, which opens the `goal` sheet (`views/goal/GoalSheet.tsx`, lazy) and nudges waiting requests. `views/goal/request.ts` builds and sends the request; `GoalHistory` (Progress) and `CloudSettings` (Settings). Strings: lazy pack `i18n/goal.ts`.
- **AI:** `services/coachCloud.ts` talks to the Worker's `/coach` routes (pairing token in `META.coachCloudToken`, device-only); `services/coachAi.ts` is the one way coaching screens ask for JSON (cloud first, then the device key). The Gemini REST details on the phone stay in `services/foodAnalysis/gemini.ts`; the Worker has its own copy in `push-worker/src/coach.js`.

