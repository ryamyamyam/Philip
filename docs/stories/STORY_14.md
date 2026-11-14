# Story 14: goal choices that work, and Philip the educator

> Owner: Ryan. Task **T-032**, decision **D-037**. Branch `feat/T-032-story14` on `main` @ `8aa98a8`.
> As built 2026-11-14. App version **0.14.1**. Two QA observations, both captured on 0.12.4.

## OBS-0327E3: "Keep this goal", "Philip's pick", "Set my own" don't work

> Check by clicking on keep this goal, Philips plan, and set my own - they aren't working. Find out why and develop the user journey for each and optimize.

Captured on Progress, 393×793, iPhone Safari.

### Root cause (confirmed)

Progress › weigh-in › **Let Philip re-plan** opens the goal sheet and asks Philip straight away (0.12.3 `autoAsk`). That creates a plan request with status `waiting` and sends it. When Philip has no way to answer (not paired with the cloud and no Gemini key on the phone), `sendRequest` returned `noAi` **but left the request `waiting`**. The sheet treats a waiting request as in flight, so it:

- disabled all three goal choices, the phase picker and the goal date (`disabled={waiting}`),
- hid the Ask button,
- said "You're offline. Philip answers as soon as you're back." (wrong: nothing was waiting to be sent).

The same lock hit a request queued in the cloud or saved offline, and reopening it from "See Philip's plan". A ready plan also had no way back to step 2.

Shown by `e2e/story14.spec.ts` run against `8aa98a8`: the "no AI" test fails on "You're offline" and, past that, on `Set my own` being **disabled**. Unit: `story14.test.ts` checks the request is no longer left waiting.

### Fix

- `request.ts`: `noAi` marks the request `failed` (stays `waiting` in status for the history, but the watcher stops polling it and the sheet doesn't treat it as in flight).
- `GoalSheet.tsx`: an open request only counts while it's **for the goal on screen** (`lib/goal/goalChoice.ts › sameRequest`: phase, goal weight, BF line, date, restart). The choices, phase, form and date are never locked by a request (only a new goal during an open workout, as before). A different goal brings Ask back; asking dismisses the old request and sends one for the new goal. Status lines (queued, offline, no AI, failed) belong to the goal they were asked for.
- Once he edits step 2, a plan that arrives for another goal (the watcher re-sends a waiting one when back online) doesn't take over the screen.
- Copy prompt / paste reply (Ask Philip in Claude) use the goal on screen, not an older request's prompt.
- Review: **Change the goal** goes back to step 2 with the choice kept; **Back to Philip's plan** returns without asking again.

### The three journeys

| | Keep this goal | Philip's pick | Set my own |
|---|---|---|---|
| Entry | Default in Re-plan (Plan, Progress › Goals, Ask Philip, weigh-in) and off track. | Default when the running goal is Maintain or at the BF ceiling. | Always available (not during an open workout). |
| Tap | Selected (inset face, `aria-checked`). Line: "Same goal, same cycle. Philip tunes your food, cardio and weights from here." Goal date kept. | Selected. Line: "Philip picks the goal from your body fat and your last phase. Starts a new cycle today." Phase picker, his reason, the goal and a suggested date shown before asking. | Selected. Line: "You set the weight, the body fat line and the date. Starts a new cycle today." The form opens under it, goal weight focused; date suggested from the pace. |
| Ask | "Ask Philip for the plan" → cloud / phone key / queued / offline; or Ask Philip in Claude. | Same. | Disabled with "Type your goal weight first." until a weight is in; safety errors block with the reason shown. |
| What changes on Apply | Food, cardio, days, swaps, lift weights now; cycle and goal stay. | Cycle ends today, next block starts with the new goal (Story 11 §6). | Same as Philip's pick. |
| Back out | Close = Later. In review: Change the goal, or Not now (keeps the plan). Undo 24 h. | Same; a restart can be undone until the new cycle has a logged session. | Same. |

## OBS-92D8DB: Philip as an educator

> I'm not sure when Philip is suggesting my workout plan based on science or not. For example, what is the difference in exercise design between bulking and cutting? I would appreciate him explaining about that. What he creates my plan, acting as not just a planner, but an educator as well.

### What's built

- **Why this plan** (Workout › Cycle plan card; the cycle briefing's phase card; Ask Philip): a lazy sheet (`views/learn/WhyPlanSheet.tsx`) built by `lib/learn/whyPlan.ts` from the engine's own constants. Sections: how sure Philip is (the three labels), **Cut vs bulk: what changes** (side by side, the current phase marked "now", and plain lines where nothing changes), your week, how Philip adjusts. Static: works offline and with no AI.
- **Evidence labels** on every rule: Research-backed / Reasonable practice / Philip's default (words and a border style, not color). Research-backed rules name their sources; only the list below is allowed (unit-tested).
- **Philip's plan review**: each lever (calories, protein, cardio, days) shows Philip's label. The goal-plan prompt asks for `basis` per lever and to teach in each "why"; a missing or unknown basis reads as practice and never rejects a plan. Stored as optional `GoalProposalRecord.basis`.
- **Ask Philip**: a "Bulk vs cut training" chip pre-fills the question, and a "Why this plan" chip opens the sheet. Philip's Ask prompt now says to teach, to separate research from practice from his own judgment, and never to invent studies.

### What actually differs between a cut and a bulk in Philip

| Rule | Cut | Bulk | Label | Source |
|---|---|---|---|---|
| Weekly pace (`RATE_PCT`) | lose 0.5–1%/wk (start 0.6) | gain 0.25–0.5%/wk (start 0.3) | Research-backed | Garthe 2011; Helms, Aragon & Fitschen 2014 |
| Protein (`PROTEIN_PER_KG`) | 1.8–2.2 g/kg | 1.6–2.0 g/kg | Research-backed | Morton 2018; Helms, Aragon & Fitschen 2014 |
| Fat and carbs (`SAFETY.minFatPct`, `minFatGPerKg`) | fat on the floor, carbs squeezed | fat on the floor, carbs plentiful | Philip's default (safety rule) | – |
| Training-day carbs (`CARB_DAY_RULES`) | same: +10% of kcal on training days | same | Reasonable practice | – |
| Main lifts (waves, %TM, reps) | same | same | Research-backed | Helms et al. 2015; Schoenfeld et al. 2017 (loads) |
| Accessory volume (`PHASE_ACCESSORY`) | last accessory 2 sets (from 3) | paired accessories 4 sets (from 3) | Research-backed (direction; the one-set step is Philip's) | Schoenfeld, Ogborn & Krieger 2017 |
| Training max steps (`TM_INCREMENT_KG`) | upper +0, lower +2.5 kg | upper +2.5, lower +5 kg | Reasonable practice | – |
| Incline walk (`CARDIO_MINUTES`, `PROPOSAL_RULES.cardioMin`) | 25 min, range 20–40 | 15 min, range 15–25 | Reasonable practice | – |
| Which phase (`CUT_AT_BF`, `LEAN_BULK_MAX_BF`) | BF ≥ 20% → cut | lean bulk to ~15% | Philip's default | – |

Your week: days a week + 16 sessions (default); a periodized wave (research, Williams 2017); the deload and TM = 90% of 1RM (practice); key sets drive the next TM, progressive overload (research, ACSM 2009); lifting minutes (default, his own); walk after lifting (research, Wilson 2012). How Philip adjusts: 7-day averages (practice), measured maintenance (practice), safety limits (default), yes to every change (default).

### Allowed sources (`SOURCES` in `lib/learn/whyPlan.ts`)

Schoenfeld, Ogborn & Krieger 2017 (J Sports Sci) · Schoenfeld et al. 2017 (J Strength Cond Res) · Morton et al. 2018 (Br J Sports Med) · Helms, Aragon & Fitschen 2014 (J Int Soc Sports Nutr) · Helms et al. 2015 (J Sports Med Phys Fitness) · Garthe et al. 2011 (Int J Sport Nutr Exerc Metab) · Williams et al. 2017 (Sports Med) · Wilson et al. 2012 (J Strength Cond Res) · ACSM position stand 2009 (Med Sci Sports Exerc).

### Open questions for the owner (engine numbers not changed)

- The cut keeps upper-body training maxes flat (+0 kg) even when key sets are hit. Common, but some lifters still gain upper-body strength early in a cut; worth a small step (+1.25 kg) if the logs show it.
- The bulk's extra accessory set is added before the 60-minute trim, so on long days it's the first thing cut. That's by design (D-025), just worth knowing.

## Data, size, tests

- No Dexie bump, no new tables, backup `schemaVersion` 1. One optional field (`GoalProposalRecord.basis`), passed through by the backup parser as before.
- New strings in a lazy pack `src/i18n/learn.ts` (`tl()`) plus a few in `goal.ts`; nothing added to `en.ts`. First-screen JS 176.8 / 177 KB (was 176.6; the budget is unchanged). The step-2 helpers live in `lib/goal/goalChoice.ts`, not `replan.ts` (which Home loads).
- Tests: unit `src/lib/goal/story14.test.ts` (12); e2e `e2e/story14.spec.ts` (4) at 393×793.
