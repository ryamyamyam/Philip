# Story 11: Goal reached → next goal → Philip's plan

> Owner: Ryan. Task **T-028**, decision **D-034**. Branch `feat/T-028-next-goal` on `main` @ `1130a6f`.
> As built 2026-11-13. Differences from the draft in the claude.ai project are marked **(as built)**.

## 1. Owner ask (2026-11-13)

When I hit or pass my goal, Philip pops up right away and asks for my next goal. The default is the same goal as last time ("+2 kg, hold 15% BF" → "+2 kg more, hold 15%?"), or I type my own. Philip then reads my workouts and nutrition and proposes how he'd adjust. I walk through it, tap Yes, and it's applied.

Follow-ups: the numbers must never be "based on nothing", Philip must make the call, and the flow must always end in a decision; extra setup is fine. Answers: a reached goal ends the cycle and starts a new one; "same again" uses the same planned length; the brief may pass through Cloudflare; include the off-track check.

## 2. Flow

```
weigh-in / BF entry saved (or app opened)
  → goal check (lib/goal/goalCheck.ts, pure)
  → GoalWatcher opens the sheet (never over another sheet, the tour or an open workout)
       1. What happened   start → now, days, actual vs planned pace, BF (fresh reading offered if stale)
       2. Next goal       Same again (preselected) | Philip's pick | Set my own
                          off track: Keep this goal (preselected; Philip's pick if BF ceiling) | Philip's pick | Set my own
       3. Philip's plan   Ask Philip → cloud / device key / queued / offline; Ask Philip in Claude always offered
       4. Review          Philip's message; before → after per lever with a switch; capped values shown
       5. Apply           one transaction; toast with Undo (and Progress › Goals › Undo last plan)
  Close = Later: Home's dialog line keeps "You hit your goal…" + a Next goal button until answered.
  "Not now, keep my plan" = answered, nothing changes.
```

## 3. Goal check

| Phase | Reached | Off track |
|---|---|---|
| Bulk | 7-day average (2+ weigh-ins) ≥ goal weight | BF above the ceiling (fresh reading); too fast; stalled |
| Cut | 7-day average ≤ goal weight, or fresh BF ≤ target | too fast; stalled |
| Maintain | — (the normal cycle-end briefing) | drifting > 0.25%/week |

- Fresh BF = entered since the cycle started and in the last 14 days (`Profile.bodyFatDate`, set when body fat changes).
- Too fast: day 14+, more than 1.5× the planned pace. Stalled: day 21+, under 25% of it. Coaching defaults in `GOAL_RULES`.
- Each event fires once per cycle (off track: per reason). Reached weight beats the BF line; Philip handles the phase in the next goal.

## 4. Next goal

- **Same again**: the last goal's change over the same 4 weeks from today's average, same BF line. Pace outside the phase range → Philip's plain warning (e.g. +2 kg in 4 weeks at 75 kg ≈ 0.67%/week, above lean-bulk 0.25–0.5%).
- **Philip's pick**: Story 5 default for the recommended phase: maintain once a bulk reaches its BF ceiling, cut at ≥ 20% BF, maintain at the long-term BF target; he says why.
- **Set my own**: weight and BF line; `checkUserGoal` + `targets.ts` safety rules (errors block, warnings shown).
- **Off track (as built)**: *Keep this goal* keeps the cycle and its goal; picking a new goal restarts the cycle with it. (The draft also allowed revising the goal without a restart; dropped so a goal always belongs to one cycle.)

## 5. Philip's plan

**Engine → ranges** (`lib/goal/proposal.ts`), from the owner's own data:

| Lever | Range |
|---|---|
| kcal | calculator result for the new goal and the target from *measured maintenance* (average logged intake − weight change × 7,700 / days; only with ≥ 50% of days logged and ≥ 10 days), ±150 kcal; ≤ ±400 from the formula; calorie floor/ceiling from `SAFETY`. Unreliable log: formula ±100 |
| protein | 1.6–2.2 g/kg (reference weight above BMI 30) |
| cardio walk | bulk 15–25 min, maintain 15–30, cut 20–40 |
| training days | any 4 weekdays |
| swaps | ≤ 3, only Appendix A options of the new cycle's block |

**Philip → picks**: the prompt has the brief (Story 9), the goal window, the ranges and the menu. He returns a value + reason per lever. Out-of-range numbers are capped and shown ("asked 9000; capped at 3260"). A reply without a message or a numeric lever is rejected (Try again / Claude), never filled with defaults. `remember` notes are kept on Apply.

**Ways to reach Philip**

| Situation | What happens |
|---|---|
| Paired with the cloud | `POST /coach` on the Worker (key is a Worker secret, free model chain). All models busy → queued, retried by alarm up to 24 h, push "Philip has your plan." |
| Not paired, device key | Gemini directly, as before |
| Offline | Request saved as `waiting`, sent when back online / in view (every 5 min while open) |
| Cloud gave up, bad reply, or no AI at all | Ask Philip in Claude: copy prompt → paste into Claude → paste the reply back (same validation) |

All other coaching calls (report, chat, check-in, Ask Philip, treadmill estimate) also go cloud-first when paired (`services/coachAi.ts`).

## 6. Apply and Undo

- **Reached / new goal**: old cycle gets `endedEarly` (+ `reachedAt`); TM progression from what was logged (key set hit → + phase increment; miss → hold / 90% rule; nothing logged → hold); next block; goal snapshot; profile goal/target weight. **(as built)** No forced deload: at most 3 old build weeks + 3 new before a deload, within common two-cycle practice (coaching default).
- **Off track, keep**: cycle and goal unchanged; levers apply now.
- Calories/protein → new target plan (append-only), fat on the calculator floor, carbs the rest; `inputsSnapshot.source = 'goalPlan'` (the weigh-in refresh leaves Philip's plan alone).
- Cardio minutes → `CycleRecord.cardioMin` (session and preview use it). Days → program. Swaps → slot choices of that block.
- **Undo**: 24 h; for a restart only until the new cycle has a logged session. Restores cycles, program, swaps, profile, notes; appends a copy of the previous target plan.

## 7. Also in this story

1. Home: goal ETA ("on pace for 30 Nov"), reminder line + Next goal button, plan waiting/ready lines, weigh-in nudge after 7 days.
2. Calendar: a flower on the day a goal was reached.
3. Progress › Goals: each cycle's goal, reached date and days early; Undo last plan.
4. Settings › Philip in the cloud: pair / unpair (token stored on this device only). Philip's memory text mentions the Worker and Gemini's free-tier data use.
5. Service worker shows the coach push (opens Home).

## 8. Data

- Dexie **v6**: `planChanges` (`++id, at, status, cycle`), additive.
- Optional: `CycleRecord.cardioMin | reachedAt | endedEarly`, `Profile.bodyFatDate`. Meta: `goalPrompts`, `coachCloudToken` (device-only).
- Backup: optional `training.planChanges` (Undo data dropped, waiting/ready → dismissed on restore); cycles and profile carry the new fields; `schemaVersion` 1.
- Budgets: initial JS 174.5 / **176** KB (raised from 174, D-034); the sheet, history, cloud settings and watcher are lazy; strings in the lazy pack `i18n/goal.ts`.

## 9. Owner setup (one-time)

See `push-worker/README.md` › Philip in the cloud: `GEMINI_API_KEY` and `COACH_TOKEN` secrets, deploy (adds `CoachQueue`), check `GEMINI_MODELS`, pair in Settings, Rest alerts on for the push.

## 10. Acceptance criteria → tests

1. Average past the bulk goal opens the sheet once; one heavy weigh-in doesn't (unit `goal.test.ts`, e2e `story11.spec.ts`).
2. Same again = last change, same length, warning outside the range (unit).
3. BF ceiling is never "reached" (unit).
4. Out-of-range picks capped and shown; missing levers rejected (unit).
5. Queued / offline requests wait; cloud queue retries and hands over once (Worker `coach.test.js`, client unit).
6. Claude paste: valid reply → review; invalid → plain error (e2e).
7. Worker refuses without the token (Worker test).
8. Apply writes everything in one transaction; Undo restores it (unit `story11.test.ts`, e2e).
9. Reached in week 1–2: old logs intact, TMs only for hit lifts, next block (unit). Off track keeps the cycle (unit).
10. v5 → v6 keeps every record; backups round-trip (unit).
11. First-screen JS ≤ 176 KB; Home fits 393×793 (size, existing e2e).
12. Checks: tsc, unit, build, size, Chromium e2e; WebKit on the Mac and a live Worker check pending.
