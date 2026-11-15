# Story 15: Update goals

> Owner: Ryan. Task **T-033**, decision **D-038**. Branch `feat/T-033-update-goals` on `main` @ `fe65b8c`.
> As built 2026-11-14. App version **0.15.1**.

## 1. Owner ask (2026-11-14)

> Plan changes shouldn't be allowed only when I log in weights. The flow should be:
> 1. Go to "Goals" under "Progress".
> 2. Click on "Update Goals" (a new button) to update (1) current weight and body fat (choose "unchanged" or insert a new number), (2) target weight and body fat.
> 3. Click "Generate Plan", and Philip should give advice on how to change the plan, estimating (1) the date this can be achieved, (2) the nutrition change: P/F/C % and total calories, including which days are carb-extra days (gym days), (3) the exercise change: weight/rep/set, workout day frequency.
> 4. The user ticks the points to implement and writes thoughts in an "Others" box ("I wanna do this earlier", "I'll take the above aside from protein, make that 30%"). On Enter, Philip refines the plan if there were suggestions; if not, he confirms the final plan, and on "Yes, confirm" renews all nutrition and exercise goals in the app.

Owner answers (2026-11-14): **keep the cycle and adjust** (no restart); with no Philip connection, **the app's draft + Claude by paste**; **one flow everywhere** (Re-plan on Workout › Plan and Ask Philip, and the weigh-in hand-off, all open Update goals).

## 2. Flow (`views/goal/UpdateGoalsSheet.tsx`)

```
Progress › Goals › Update goals  (also Workout › Cycle plan, Ask Philip, Progress weigh-in "Update goals")
  1. Where you are now   Weight: Unchanged · 7-day average | New number (saved as today's weigh-in)
                         Body fat: Unchanged · last value (date) | New number (saved, fresh today)
  2. Where you want to be  Target weight, target body fat. Phase follows (± 0.5 kg = maintain); the
                         safe pace for it is shown; body-fat floor errors block.
  3. Generate plan       Philip: cloud → this phone's key. No connection / failed / offline → the app's
                         formula draft. Queued in the cloud → "Use the app's draft for now".
  4. The plan            Goal date (estimate) · Nutrition: calories, P/F/C %, extra carbs on gym days ·
                         Training: days a week, training maxes, accessory weight + sets × reps, swaps, walk.
                         A tick per point. Others box.
       note written  →  "Send to Philip": the first prompt + his last plan + KEPT/UNTICKED per point +
                         the note → a revised plan (the last one stays until it arrives; "Back to the last
                         plan" if he can't answer; Claude by paste works for the note too)
       no note       →  "Looks good" → Final plan (only the ticked points) → "Yes, confirm" → applied.
                         Toast with Undo (24 h).
```

## 3. The numbers (`lib/goal/update.ts`, pure, tested)

| Piece | Rule | Label |
|---|---|---|
| Phase | target − now: > +0.5 kg bulk, < −0.5 kg cut, else maintain | Philip's default |
| Maintenance | measured from the food log and weight trend when reliable (Story 11), else the calculator's TDEE | practice |
| Calorie range | maintenance ± the phase's safe weekly pace (`RATE_PCT`: bulk 0.25–0.5%, cut 0.5–1% of body weight), inside the calorie floor/ceiling; maintain ± 100 kcal | research (cut pace), practice (bulk) |
| **Goal date** | *estimated*, not picked: days = change × 7,700 kcal/kg ÷ the daily gap from maintenance at the calories that apply. More food on a bulk / less on a cut = sooner, bounded by the safe pace. Not reachable (wrong direction or > 26 weeks) is said plainly. | practice (7,700 kcal/kg is a rough average) |
| Protein | the phase's g/kg band (unchanged, Story 12) | research |
| Fat | at least the safety floor (25% of kcal and 0.5 g/kg), at most 35% of kcal; carbs fill the rest. Shown as P/F/C % and grams. | default |
| Gym-day carbs | on = training days get the extra carbs, rest days fewer, same week (Story 12 `carbDays`), off = even days | practice |
| Days a week | 3–5 weekdays (Your time's range); the 4-lift rotation stays | practice |
| Training maxes | ± 10% (0.12.3); main-lift sets and reps follow the wave | – |
| Accessories | weight ± 20%, sets 2–5, reps 5–20 (next order until logged again, Story 7 override) | default |

A wish outside a range (e.g. protein 30% of calories above the phase's g/kg band, or a pace faster than safe) is capped and shown as capped; Philip is told to say so in his message.

## 4. Apply (`db/goalRepo.ts`)

Update goals is a `manual` plan with `restart: false`. On Apply, in one transaction:
- the **current cycle keeps going**; its goal (weights, BF line, the estimated date) and **phase** are replaced; cardio if ticked. Logs and the cycle's orders stay; training changes from the next session.
- profile goal, target weight, weekly rate and target BF follow the new goal;
- a new target plan (append-only) with the ticked calories / protein / fat (or the plan in force when only the carb switch is ticked), with gym-day overrides when carb days are on;
- `trainingProgram.carbDays`, training days, TM rows (`adjust`), accessory next orders with sets/reps;
- Undo (24 h) restores all of it, including the phase and the carb switch (`GoalPlanUndo.phaseBefore`, `carbDaysBefore`).

No Dexie bump, no new tables, backup `schemaVersion` 1: optional fields only (`GoalPlanItems.fatG/carbDays`, loads `sets/reps/fromSets/fromReps`, `source.kind 'engine'`, the undo fields); the backup parser passes them through.

## 5. What changed for older flows

- The goal-reached and off-track pop-ups keep the Story 11/14 goal sheet (Same again / Keep this goal / Philip's pick / Set my own). Only manual plans moved to Update goals.
- A manual plan now writes its goal onto the cycle (before, "Keep this goal" left it as it was); `story12.test.ts` updated.
- The weigh-in hand-off no longer asks Philip at once: it opens Update goals with the new average as "now"; he presses Generate.
- Five e2e tests for the retired "Re-plan" sheet were removed (two in `story12.spec.ts`, three in `story14.spec.ts`); `story15.spec.ts` covers the replacement.

## 6. Tests

- Unit `src/db/story15.test.ts` (10): phase, calorie range, date estimate (sooner with more food, null when not reachable), P/F/C and fat range, parsing fat / carb days / 3–5 days / sets-reps (and not outside Update goals), the prompt, the draft, the follow-up prompt, Apply in place + Undo, carb-switch-only.
- e2e `e2e/story15.spec.ts` (3) at 393×793: no-AI draft → untick → final → confirm (cycle kept); Philip plans → close/reopen via "See Philip's plan" (no second call) → note → revised plan, date moves → confirm → days applied; weigh-in hand-off.

## 7. Limitations

- With no body stats and too little food logged there's no maintenance, so no date estimate and no calorie range; the sheet says what to add.
- The app's draft can't read the Others note; refining needs Philip (cloud or key) or Claude by paste.
- Main-lift sets and reps stay on the %TM wave (only their weights move, through the training max).
- Precache is 1188 / 1200 KB: the next feature will need a look at that budget.
