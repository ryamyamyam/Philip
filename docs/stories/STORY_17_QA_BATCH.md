# Story 17: Calories follow the real gym days, playbook TDEE, treadmill incline, bodyweight progression, lift-day swaps, today's line

> Owner: Ryan. Task **T-035**, decision **D-040**. Branch `feat/T-035-qa-batch` on `main` @ `04d250b`. App version **0.17.1**.
> As built 2026-11-17. Spec (owner-confirmed): `claude/story-17-qa-spec.md` in the Philip project.

## 1. Owner asks

- **N-1** Tue 17 Nov showed 2,326 kcal · P 140 / F 74 / C 275: is it right? → it is a correct PB-3.4 **rest-day** number. The bugs were elsewhere (A–C below).
- **OBS-F17324** "I changed my exercise days … (Tuesday instead of Saturday), but my calorie intake didn't change."
- **OBS-A4F4B9** choose the treadmill during the workout; "woodway / 14 / 2.5" → Philip works out incline % and speed and fills them in.
- **OBS-0E95EF** pull-ups: body weight is the load; progress by reps and sets, not weekly weight.
- **OBS-E73C29** past and goal data in the sets → **closed, fixed by Story 16** (owner confirmed on 0.16.1).
- **OBS-4DC2DF** switch which main lift is on which day (shoulder day ↔ leg day).
- **N-2 / N-3** a "today's line" above the Meal log: where weight, body fat and the Big 4 1RMs should be TODAY on a straight line to the goal; a two-card carousel with charts, built the most scientifically sound way.

## 2. Step 0 findings (code on `04d250b`)

| Finding | Where |
|---|---|
| **Bug A** carb-day overrides are written by weekday into the plan when it's made; `setTrainingDays` only changed `trainingProgram.trainingDays`, so food stayed on the old weekdays (only Your time re-split them). | `lib/goal/carbDays.ts`, `db/repo.ts setTrainingDays`, `lib/nutrition.ts targetForDate` |
| **Bug B** maintenance still used the general 1.2–1.9 table; PB-2.2 (1.45–1.75) was never in `rules.ts`. | `lib/targets.ts ACTIVITY_FACTORS` |
| **Bug C** `planAvailability`, `goalRepo` and the Progress weigh-in refresh called `carbDays` without the weight, so fat didn't move between gym and rest days on those paths. | `lib/training/availability.ts`, `db/goalRepo.ts`, `views/ProgressView.tsx` |
| Pull-ups: with kg left empty the order never progressed reps (no log counted); with his body weight typed as kg the double progression added +2.5 kg per week. | `lib/training/session.ts accessory`, `program.ts nextAccessoryKg` |
| Treadmill: Story 10 converted the speed setting only, in Settings; no incline, nothing during the workout. | `lib/training/treadmill.ts`, `views/TreadmillSettings.tsx` |
| Day order was fixed 1-2-3-4 (`nextSessionRef`, `remainingRefs`). | `lib/training/progress.ts`, `schedule.ts` |

## 3. What was built

### 3.1 Food follows the days he trains (OBS-F17324, Bug A, C) — `lib/goal/gymDays.ts`
- This week's gym dates = planned dates (this week's move first, else the usual weekdays) ∪ days with a done or running workout. A skipped session doesn't count.
- Carb-day plans (`inputsSnapshot.carbDays`): rest-day macros as stored (they don't depend on the count); gym-day calories re-solved for the actual count so the week still equals the flat plan (PB-3.4), protein and fat as stored, carbs fill. Same count as the plan → its stored gym numbers exactly. 0 or 7 gym days → flat.
- **Weeks before the current one keep their plan's stored weekday numbers** (history never re-solved). Manual weekly plans are never touched.
- `targetForDate(plans, date, gym?)`; Home, Meal log, "What do I eat?", history and Philip's brief pass the context (`useGymContext`).
- Settings › Training days: no new plan row needed (targets derive from the days); the toast says the food moved; a permanent change clears any one-week move.
- Bug C: every `carbDays` caller passes the reference weight.

### 3.2 Move a workout for this week only — `views/workout/MoveWorkout.tsx`
Calendar day box of a planned workout this week → "Move this workout" → "Move to Saturday" (free days this week, today or later). Stored as `program.weekDays { weekStart, days }`; ignored outside that week; "Back to my usual days this week" resets. Planned dates and food follow. Squat/RDL two days apart → a warning in the toast.

### 3.3 Playbook TDEE (PB-2.2)
`PB_TDEE` + `tdeeFactor()` in `rules.ts`: mostly sitting 1.45 / 1.55, on the feet 1.65 / 1.75 (3–4 / 5–6 lifting days). Older answers map (sedentary, light → sitting; moderate+ → on the feet); under 3 lifting days the general table still applies (no playbook row). Targets asks two answers. One-time re-check on 0.17.1 (`runPlaybookUpdate(…, 'tdee')`, META `tdeeUpdate`): asks his day once, re-runs the Story 16 replan with the new maintenance (calories move only if their pace left the band; the change is labelled PB-2.2), Undo 24 h. No load sweep on this run.

### 3.4 Treadmill read during the workout (OBS-A4F4B9)
Cardio card: machine name (remembered), incline and speed as shown, "Ask Philip to read it". Philip (Gemini/cloud) describes the machine's dials (incline % or level 1–N with its top %, speed mph/km/h/level); **the app computes the numbers from those dials** (`inclineToPct`, `settingToMph`) and checks them against `CARDIO_LIMITS`. Already a %: kept, and he says so. Low confidence → "Use these" tap; out of range → he asks instead of filling. No AI → manual entry as before. The dials are saved on `program.treadmill.incline`, so later readings convert offline. Logs keep `inclineSetting` when the machine's number isn't a %.

### 3.5 Bodyweight moves (OBS-0E95EF, PB-4.8) — `program.ts nextBodyweight`
Pull-up, chin-up, neutral pull-up (and other `bodyweight` moves): orders show "Bodyweight × reps"; reps up to the top on every set → one more set (max 4) → only then Philip offers +2.5 kg (yes/no, never automatic; `setNextLoad`, undone with the log). A logged weight within 15% of his body weight is read as body weight. Well under the range → the assisted version. e1RM = (body weight + added) with PB-8.1; last/this week read "body weight + x".

### 3.6 Swap lift days (OBS-4DC2DF) — `views/workout/SwapDays.tsx`
Workout › Cycle plan › "Swap lift days": tap a lift not yet trained this week, pick the other, then "This week only" (`program.weekSwap`) or "From now on" (`program.dayRotation`). Each lift keeps its week of the wave; the cycle stays 16 sessions; squat and RDL back to back → warning. The plan's day list follows the order.

### 3.7 Today's line (N-2, N-3) — `lib/goal/todayLine.ts`, `views/home/TodayLine.tsx` (lazy)
Home, above Meal log (replaces the goal text line while a goal runs). Header row: title, two page dots (44 px targets), Goal / 4 wk window toggle (remembered, META `todayLineWindow`). Scroll-snap carousel, no library.
- **Body:** weight chart (dashed plan line start → target over the goal window, ±0.5 kg band, faint weigh-ins, bold 7-day average, red "today" marker, goal end label) and a body-fat strip on its own axis (linear plan line, ±1.5-point band, the reading as a point). Header lines: `Weight plan 74.4 · avg 74.6 kg · On track`, `Body fat plan 15% · 15% (Nov 17) · On track`.
- **Strength:** 2 × 2 small multiples, each on its own scale: weekly-stepped plan line, session points, "Plan 101 · 100", status word; the combined strength date under them.
- Math: goal window = deadline − its weeks (never before the cycle); weight actual = 7-day average (PB-6.1); BF whole points, stale after 28 days; lifts = Story 16 plan-relative e1RM (achieved ÷ ordered), status band = Story 16's 3 % (`PB_LOADS.onTrackBand`), so Home and the exercise card never disagree. Bands in `PB_TODAY_LINE` (PB-6.4).
- Fewer than 3 weigh-ins in the window → plan only and "Three weigh-ins and I'll draw your trend." No goal → "Set a goal" button (Update goals).

## 4. Deviations from the spec
1. **No plan row on a training-days change**: targets are derived from the days for this week on, and older weeks keep their stored numbers, which gives the same result without a write; Undo is "change the days back".
2. **1RM band 3 %** (Story 16's exercise-card band) instead of 2.5 %, so the two screens agree.
3. Swap day lives in the cycle plan only (not the pre-workout check).
4. If an extra workout changes this week's gym-day count mid-week, the week's earlier gym days re-solve too (rest days never change).
5. The Home goal text line is hidden while today's line shows (its information is in card 1).

## 5. Tests
- Unit `src/db/story17.test.ts` (29): gym days (move, done on a rest day, skipped, past weeks, flat), schedule moves, day order/swaps (16 sessions, wave weeks), TDEE table and the one-time re-check + Undo, treadmill read (pct / level / rejects), bodyweight progression + e1RM + accepted load, today's line math (window, linear, clamp, status, BF ceiling, stepped plan, series, 4-week window), Bug C fat. `targets.test.ts` + PB-2.2 cases; `story12.test.ts` expectations for PB-2.2 and Bug C; stray-literal guard extended.
- e2e `e2e/story17.spec.ts` (5) at 393×793: today's line (cards, charts, dots, remembered window, no scroll, tap → Progress), move to Saturday → Meal log shows the rest-day number, swap OHP ↔ squat → Home shows Day 4, treadmill read with a mocked Philip, the 0.17.1 maintenance sheet + Undo.
