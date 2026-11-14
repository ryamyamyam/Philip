# Story 12: Re-plan with Philip, goal dates, your time

> Owner: Ryan. Task **T-029**, decision **D-035**. Branch `feat/T-029-replan` on `main` @ `4a0a042`.
> As built 2026-11-13. App version **0.12.1**; **0.12.2** adds §6b (macros by phase, carb days) and the one-line Your time inputs. Items 6–10 were added by the owner during the build.

## 1. Owner ask (2026-11-13)

"How do I let Philip recalibrate my nutrition and workout plan?" Until now Philip re-planned only at set moments (goal reached / off track, cycle briefing, workout report, the formula-only "Update my targets"). The owner wants a fresh plan whenever he asks, mid-cycle, even when on track. Added during the build: a goal date he can set (Philip suggests one), the version shown in Settings, a setting for how much time he can train, 60-minute sessions, a slide when changing days, and "Copy to today" on a swiped food.

## 2. Re-plan with Philip (manual mode of the goal sheet)

- **Entry points** (`views/goal/ReplanButton.tsx`): a card at the top of Workout › Cycle plan, under the list in Progress › Goals, under the intro line in Ask Philip. Not on Home.
- **Button states** (`lib/goal/replan.ts › replanButton`): hidden with no active cycle (setup, briefing pending, all 16 sessions closed, or ended early); disabled with "Finish or close the open workout first." while a workout is open; "See Philip's plan" when a request is waiting or ready (it reopens that one; no second `planChanges` row); else "Re-plan with Philip".
- **Sheet**: `openSheet({ kind: 'goal', manual: true })` → `GoalSheet` with `manual`. Title "Re-plan"; Philip: "Let's take a fresh look. Tell me where we're aiming, and I'll read your logs." Step 1 unchanged. Step 2 has the off-track options; **Keep this goal** is preselected (cycle continues, levers apply now); Philip's pick and Set my own restart the cycle (Story 11 §6). Steps 3–5 unchanged.
- **7-day note**: a plan applied under 7 days ago (`REPLAN_RULES.recentDays`) shows Philip's note about a week of data reading clearer because daily swings are mostly water. Coaching default; nothing is blocked.
- **Data**: `PlanChange.event` and `reason` gain `'manual'`. A manual plan never creates a Home reminder: `useGoalState().open` excludes manual rows (they are in `openManual`), and `isResolved` ignores them, so a pending reached / off-track event stays pending. The watcher still polls a waiting manual request and opens it when it arrives.
- **Prompt**: the manual situation says he asked mid-cycle, whether the goal is kept or new, to change only what the data supports, and that "keep everything" is a valid answer with every lever returned at today's value.
- **Fix found on the way**: the sheet and the watcher could both send the same new request (two Gemini calls). `sendRequest` now shares one in-flight send per request.

## 3. Goal date (deadline)

- A new goal (Same again, Philip's pick, Set my own) has a **goal date**. Philip suggests it (`lib/goal/deadline.ts › suggestDeadline`): the weeks the change needs at the phase's default pace (bulk 0.3%, cut 0.6% of body weight a week), never under 4 or over 26 weeks; Same again and Philip's pick suggest 4 weeks (Same again: the last goal's length).
- The owner can move the date (2 to 26 weeks out). The date sets the weekly pace, the pace sets the calories through the targets calculator, and the existing pace warnings and safety rules apply unchanged.
- Stored as optional `weeks` and `deadline` on `GoalChoice` and `CycleGoalSnapshot`. A goal can outlast a cycle: at the next briefing `continuation()` carries the same weight and date on as Philip's default ("Goal by {date}"), unless it was reached, has under a week left or the phase changed.
- Keep this goal keeps the cycle's date (older goals: the cycle's 28 days). Home's goal line and Progress › Goals show the date.

## 4. Your time (Settings › Training)

`views/goal/YourTime.tsx`, `lib/training/availability.ts`, `db/availabilityRepo.ts`.

| Input | Range | Effect on Confirm |
|---|---|---|
| Days a week | 3–5 | Weekdays follow the count (fewest squat/RDL clashes, most current days kept). The rotation stays 4 lifts and 16 sessions, so a cycle is about 5.3 weeks at 3 days, 4 at 4, 3.2 at 5. Five days always has one run of three days. |
| Lifting minutes | 30–90, step 5 (default 60) | The session builder's budget. It trims (bulk round, rest floors, slot B) to fit; it never adds work. |
| Cardio minutes (most) | 10–45, step 5 | A ceiling: a longer planned walk comes down to it. On a cut, room he opens is used up to the phase range (40). On a bulk or at maintenance the walk stays (more would not help). Philip's goal plans are capped by it too. |

- **Nutrition**: applied only when the calculator's own answer moves with training days. Today that is protein on a cut (2.2 g/kg at 4+ days, 2.0 under). Calories are not credited for extra minutes: the activity level already covers training and the app has no evidence to do better (stated in the UI as "Food stays as it is").
- The list under the inputs shows exactly what Confirm will change. One transaction; a new target plan is appended only when food moves (`inputsSnapshot.source = 'availability'`). Undo from the toast.
- Training days picker: now asks for as many days as "Your time" says.
- Stored as optional `TrainingProgram.availability { strengthMin, cardioMin }`; days a week = the number of `trainingDays`.

## 5. Sixty-minute sessions

`SESSION_BUDGET_MIN` 45 → 60 (cardio and stretching excluded, as before). Sessions that were trimmed to fit 45 keep more of their sets and rest. Copy and Philip's prompts name the owner's own minutes.

## 6. Smaller items

- **Version**: Settings shows `Version 0.12.1` from `package.json`. Rule (CLAUDE.md): `0.<story>.<build>`; every story or fix batch that ships bumps it.
- **Day slide**: changing the day on the Meal log (‹ ›, swipe, date picker) slides the new day in from the side it comes from (`hooks/useDaySlide.ts`); off under reduced motion.
- **Copy to today**: a third swipe action on a food (Copy to today · Move · Delete). A dialog asks which meal (the original meal preselected); Undo on the toast. The swipe area is now 216 px.

## 6b. Macros by phase and carb days (0.12.2, owner 2026-11-13)

Owner: cut and bulk should have different P/F/C ratios, and training days should get more carbs than rest days. `lib/goal/carbDays.ts`.

| Phase | Protein (g/kg of reference weight) | Fat | Carbs |
|---|---|---|---|
| Cut | 1.8–2.2 | the app's floor: 25% of kcal, at least 0.5 g/kg | the rest (lowest) |
| Maintain | 1.6–2.0 | floor | the rest |
| Bulk | 1.6–2.0 | floor | the rest (highest) |

- **Evidence.** Helms, Aragon & Fitschen 2014 (contest prep): 2.3–3.1 g/kg of lean mass protein, 15–30% of kcal from fat, the rest carbs. Iraki et al. 2019 (off-season): 1.6–2.2 g/kg protein, a 0.25–0.5%/week gain. So the cut starts higher on protein, and the energy a bulk adds goes to carbs. The app's fat floor (25% / 0.5 g/kg, `SAFETY`) is above the reviews' 15% lower end; lowering it is a safety-rule change and needs the owner's approval, so it stays.
- **Carb days** (on by default, switch in Your time): training days get +10% of the day's calories as carbs; rest days give the same grams back, never below half their carbs or the calorie floor. The week's calories, protein and fat are unchanged. Evidence: "fuel for the work required" (Impey et al. 2018) is mostly endurance research; with calories and protein matched, carb cycling hasn't beaten steady intake for body composition. It's here for training quality and ease, and the UI says so.
- **Where it applies:** every plan Philip writes (goal plans, the cycle briefing, Your time) is stored as the steady macros plus `weekdayOverrides` on his training days (`inputsSnapshot.carbDays`). The weigh-in "Update my targets" keeps the split when the plan it replaces had it. Changing training days with carb days on re-splits the plan. Philip's prompt says kcal is the daily average; the review shows the training-day and rest-day calories.
- **Your time:** labels shortened ("Lifting, min/session", "Cardio, min/session max") and the two boxes share one line.
- Tests: unit `story12.test.ts` (bands, split maths, floors, goal plan, Your time); e2e checks the boxes line up. Protein expectations in `story11.spec.ts`/`story12.spec.ts` now reflect the 2.0 g/kg bulk cap (Philip's 150 g is capped at 146–149 g).

## 6c. Weigh-in → Philip re-plans everything (0.12.3, owner feedback 2026-11-13)

Owner (screenshot): after a weigh-in he tapped "Ask Philip for a full update" and got a chat answer; nothing changed in the app. Re-plan was greyed out by an open workout, and it had no lift-weight levers.

- **Weigh-in:** with a cycle running, the weigh-in card's first button is **Let Philip re-plan**. It opens the Re-plan sheet and asks Philip at once (Keep this goal). The formula "Update my targets" stays as a secondary button; the chat button shows only without a cycle.
- **Lift weights are levers:** Philip may move each main lift's training max (±10%, every working weight follows) and each accessory's next weight (±20% of the last logged weight), the same bounds as the workout report. Each is a row with its own switch. TM changes append `tmHistory` rows (`reason: 'adjust'`); accessory weights become `TrainingProgram.nextOverrides`. Undo appends the old TMs back (`reason: 'undo'`) and restores the overrides. Not offered on a restart (the new cycle has its own TM progression).
- **P/F/C in the review:** a line shows protein / fat / carbs before → after, plus the training-day / rest-day calories.
- **Open workout:** no longer disables Re-plan. The open session's orders are frozen, so food and future sessions can change; only a new goal (a restart) waits, with a plain note.
- **Ask Philip:** when asked for new targets or weights, he points to Re-plan with Philip instead of answering in chat.
- Tests: unit (prompt, clamps, restart, Apply/Undo with a workout open, restart refused); e2e weigh-in → re-plan → uncheck one lift → Apply → Cycle plan shows the new TM.

## 7. Data

No Dexie bump, no new tables, backup `schemaVersion` 1. New optional fields only; the backup parser accepts `'manual'`, `weeks`, `deadline` and `availability`, and older backups restore unchanged.

## 8. Acceptance criteria → tests

1. Button on Plan, Goals, Ask Philip; hidden before the first cycle; disabled in a workout (e2e `story12.spec.ts`).
2. Keep: levers left on apply; cycle, goal, logs stay (unit `story12.test.ts`, e2e).
3. New goal: `endedEarly.reason = 'restart'`, no `reachedAt`, next block, goal date kept (unit).
4. Waiting/ready request → "See Philip's plan", one Gemini call (e2e; unit on `replanButton`).
5. 7-day note, nothing blocked (e2e; unit on `recentPlan`).
6. Never a Home reminder; pending events not resolved (unit `isResolved`; e2e checks Home).
7. Backup round-trip with manual row, goal date, availability; pre-Story-12 backup restores (unit).
8. Undo, same rules as Story 11 (unit).
9. Goal date: suggestion, clamp, pace, calculator rate, continuation (unit); picker (e2e).
10. Your time: weekdays, cardio rule, nutrition rule, Confirm/Undo (unit); Settings flow (e2e).
11. 60 minutes; Copy to today; day slide; version line (unit + e2e).
12. 0.12.3: tsc, unit 461/461, Chromium e2e 120/120. 0.12.2: tsc, unit 457/457, build, size 175.7/176 KB, Chromium e2e 119/119. WebKit pending on the Mac.
