# Story 5: Workouts + Home hub

> **Revision 4 (2026-11-05).** Changes:
> - **Cycle goal briefing** (§4.8): before every cycle, Philip proposes a body-weight and body-fat goal. His proposal is the default; Ryan can set his own instead.
> - **Day 3 main lift is the Romanian deadlift** (`LiftId 'rdl'`), with safety caps: no singles, RIR ≥ 2 on every set. The Day 3 hinge accessories were reworked so none duplicates it.
> - **Full exercise menu** (Appendix A): every slot has Philip's pick plus 2 pre-approved swaps. Equipment is assumed to be a full gym.
>
> **Revision 3** owner answers applied:
> - No photo shortcut on Home.
> - Setup accepts a known 1RM.
> - New bar and plate loader for 20 kg bars with lb plates (§4.7).
> - Rest timer and bulk extra set confirmed for v1; Today's session may scroll.
> - Cardio is out of scope here; it belongs to a separate story the owner will merge with Story 1.
>
> **Revision 2** changes from revision 1:
> - Philip writes the training prescription (orders). Ryan logs what he actually did in separate fields. Neither one overwrites the other.
> - Each cycle uses a different training block, rotating through four.
> - Every session is capped at 45 minutes, not counting cardio.
>
> Owner: Ryan. Base: `main` after **T-010 (tutorial) merges**. Proposed tasks: T-011 to T-015. Read first: CLAUDE.md, `docs/ARCHITECTURE.md`, `docs/DESIGN_SYSTEM.md` (D-022), `docs/DECISIONS.md`, `docs/DEVELOPMENT_RULES.md`.
> This spec was written from the project docs while the Mac was offline. Check route names, tab names and the Dexie version against the code before coding.

## 1. Goal

Philip becomes a meal log **and** a coach.

- **Home** is where the app opens. From there, Ryan picks **Meal log** (the existing app) or **Workout** (new).
- **Workout** answers two questions:
  1. *What do I lift today?* Philip's orders for the session, plus a place to log what I actually lifted.
  2. *What's the plan?* The current cycle, week by week, with every prescribed weight. It also shows the next block.
- **Progress** and **Settings** move up to Home level and cover both sections.
- **One phase** (cut, maintain or bulk) drives both the calorie targets and the training plan. Philip prescribes training aimed at Ryan's target body weight and body-fat %.

Owner decisions:
- 4-week cycles: 3 build weeks and 1 deload, with weights based on a training max.
- One phase setting for both nutrition and training.
- 4 days a week, one Big 4 lift per day.
- Accessories are Philip's prescription, not placeholders.
- Every cycle trains in a different way.
- Lifting takes 45 minutes or less, not counting cardio.

## 2. Navigation

```
Home (#/home)  ── default on open
 ├─ Meal log   (#/meals)          = current Today screen and sheets, unchanged
 ├─ Workout    (#/workout)        = Today's session
 │   └─ Plan   (#/workout/plan)   = cycle plan
 ├─ Progress   (#/progress)       = Body | Strength
 └─ Settings   (#/settings)       = + Training section
```

- **Tab bar:** Home · Progress · Settings. Meal log and Workout open from Home and have a back chevron.
- **Redirects:** `#/today` → `#/meals`. An empty or unknown hash → `#/home`. Deep links to `#/meals` and `#/workout` keep working.
- **One extra tap to log food,** accepted by the owner. There's no photo shortcut on Home. The Meal log card shows live numbers.

## 3. Home

D-022 look: top display zone with two chamfered "cartridge" cards, dark control deck below. It must fit 393×793 without scrolling.

| Element | Content |
|---|---|
| Header | Date · phase chip (CUT / MAINTAIN / BULK). The chip opens the targets calculator. |
| Goal strip | This cycle's goal from the briefing (§4.8): "74.0 kg by 3 Dec · BF ≤ 16%" and progress so far (7-day average weight). It shows only real entries. Nothing is seeded. |
| Meal log card | kcal-left meter + protein to go → `#/meals` |
| Workout card | "Block B · W2 · Day 2: Bench" · "~39 min" · top-set preview → `#/workout`. Other states: Set up training / Resume / Done (summary) / DELOAD tag. |
| Dialog bar | One Philip line chosen by state. |
| Deck | Tab bar only |

## 4. The program (`src/lib/program.ts`, pure and tested)

### 4.1 Fixed structure

- **Days are a sequence, not weekdays.** Day 1 is the squat, day 2 the bench press, day 3 the **Romanian deadlift (RDL)**, day 4 the overhead press (OHP). The owner doesn't do conventional or sumo deadlifts; the RDL is the tracked hinge and back lift.
- **RDL safety caps** (it's a long-lever hinge, and form breaks before strength runs out): at least 3 reps per set, RIR ≥ 2 on every set including `+` sets, and no singles.
  - Block A week 3: 75 / 82.5 / 87.5% × 5 / 3 / 3+, in place of 95% × 1+.
  - Block C top sets: 1×5 @ 80% · 1×4 @ 85% · 1×3 @ 87.5%.
  - Re-test: a top set of 3–5 reps at RIR 2. Never a true 1RM attempt.
- **"Today" is the next unfinished day.** Missing a day never skips or resets anything.
- **Every session has the same shape:** warm-up → main lift → superset (A1/A2) → single accessory (B). Cardio comes from a separate story.
- **Training max (TM):** TM = 90% of the 1RM. For each lift, setup accepts **either a known 1RM or a recent hard set** (weight × reps). From a hard set, the 1RM is estimated with Epley, `w × (1 + reps/30)`; above 10 reps, Philip warns that the estimate is rough. Inputs take kg or lb.
- **Unknown 1RM:** a lift left blank in setup gets a guided **Calibration** in its first session: work up in 5 sets to a top set with 2 reps left in the tank (RIR 2). That set gives the e1RM and TM; the session then carries on. A 1RM is never converted from a different lift. TMs only change by Philip's rules (§4.4) or a **Re-test** (a guided top set, logged as `retest`). There is no free-typing over a TM.
- **Rounding:** to the plate increment (default 2.5 kg; 5 lb in lb mode). Storage is in kg.
- **Week 4 of every block is a deload:**
  - Main lift: 40 / 50 / 60% TM × 5.
  - Accessories: 2 sets at the previous week's weight, 3+ reps left in the tank (RIR 3+).

### 4.2 Block rotation (a different way to train every cycle)

Cycle 1 = A, 2 = B, 3 = C, 4 = D, then A again with higher TMs. The main lift stays a Big 4 lift (specificity), but the loading scheme changes, block D uses paused or tempo variants, and every accessory slot rotates to a different exercise.

| Block | Focus | Main lift W1 / W2 / W3 (% of TM) | Accessory style |
|---|---|---|---|
| **A · Wave** | strength | 65/75/85 × 5,5,5+ · 70/80/90 × 3,3,3+ · 75/85/95 × 5,3,1+ | 8–12 reps, RIR 1–2, 90 s rest per round |
| **B · Volume** | muscle | 4×8 @ 65% · 4×7 @ 70% · 4×6 @ 75%, RIR 2–3, no + set | 12–15 reps, RIR 1–2, 75 s |
| **C · Heavy** | top-end strength | top set 1×5 @ 80%, then 3×5 @ 70% · 1×3 @ 87.5%, then 3×4 @ 75% · 1×2 @ 92.5%, then 3×3 @ 80% | 6–8 reps, RIR 2, 90 s |
| **D · Control** | position and technique | paused or tempo variant: 4×5 @ 60% · 4×4 @ 65% · 4×3 @ 70% (% of the base lift's TM) | 10–12 reps, controlled 3-s lowering, 75 s |

**Block D variants:**
- Squat: 2-s pause squat.
- Bench: 2-s pause bench.
- RDL: 2-s pause just below the knee.
- OHP: strict press with a 3-s lowering.

`+` = as many reps as possible, stopping with 1–2 reps left. No grinding.

### 4.3 Philip's accessory prescription

Accessories are chosen to build muscle on a bulk and keep it on a cut. Across the week, every major muscle group gets direct work (roughly 6–12 hard sets per muscle, counting the main lifts).

| Day | Slot | A · Wave | B · Volume | C · Heavy | D · Control |
|---|---|---|---|---|---|
| 1 Squat | A1 | Bulgarian split squat 3×8–10/leg | Leg press 3×12–15 | Reverse lunge, front foot raised, 3×6–8/leg | Goblet squat 3×10–12 tempo |
| | A2 | Lying leg curl 3×10–12 | Seated leg curl 3×12–15 | Assisted Nordic curl 3×4–6 | Single-leg leg curl 3×10–12 |
| | B | Hanging knee raise 3×10–15 | Cable crunch 3×12–15 | Ab wheel 3×8–12 | Pallof press 3×10/side |
| 2 Bench | A1 | Chest-supported DB row 3×8–12 | Seated cable row 3×12–15 | Barbell row 3×6–8 | Single-arm DB row 3×10–12 |
| | A2 | Incline DB press 3×8–12 | Machine chest press 3×12–15 | Dips (weighted if 8+ come easy) 3×6–8 | DB fly 3×10–12 |
| | B | Face pull 3×15–20 | Rear-delt fly 3×15–20 | Band pull-apart 3×15–20 | Triceps pushdown 3×10–12 |
| 3 RDL | A1 | Hip thrust 3×8–12 | 45° back extension (weighted) 3×10–15 | Good morning 3×6–8 | Cable pull-through 3×12–15 |
| | A2 | Walking lunge 3×10/leg | Step-up 3×12/leg | Single-leg RDL 3×6–8/leg | DB reverse lunge 3×10/leg |
| | B | Standing calf raise 3×10–15 | Seated calf raise 3×15–20 | Weighted plank 3×30–45 s | Tempo calf raise 3×10–12 |
| 4 OHP | A1 | Pull-up (assisted if needed) 3×6–10 | Lat pulldown 3×12–15 | Chin-up (weighted if 8+ come easy) 3×5–8 | Neutral-grip pulldown 3×10–12 |
| | A2 | DB lateral raise 3×12–20 | Cable lateral raise 3×15–20 | DB lateral raise 3×10–12 | Lean-away lateral raise 3×12–15 |
| | B | DB curl 3×10–15 | EZ-bar curl 3×12–15 | Hammer curl 3×6–8 | Incline DB curl 3×10–12 |

**Each prescription card shows:**
- sets × reps @ kg;
- RIR target;
- rest time;
- the superset label;
- one technique cue (e.g. "Ribs down, push the floor away");
- a one-line **why** tied to the goal (e.g. "Hamstrings. Your RDL needs them and your cut needs to keep them.").

**Starting accessory weights.** The first time an exercise appears, Philip has no data, so the prescription is "Pick a weight you can do for the top of the range with 2 reps left". That session's actual set becomes the base for the next one.

**Equipment swaps.** If a machine isn't available, Swap offers one or two equivalents Philip has pre-approved for that slot. The swap is logged; it isn't a free edit.

### 4.4 Phase rules (how the goal shapes the plan)

Phase = the existing `profile.goal`. It is set **in the cycle briefing** (§4.8) and snapshotted when the cycle starts, so a change takes effect from the next cycle. A new optional `profile.targetBodyFatPct` holds the long-term BF target; it's validated like the other targets.

| | CUT | MAINTAIN (recomp) | BULK |
|---|---|---|---|
| Main-lift intensity | unchanged (keep it heavy) | unchanged | unchanged |
| TM increase per cycle: bench / OHP | +0 kg | +2.5 kg | +2.5 kg |
| TM increase per cycle: squat / RDL | +2.5 kg | +5 kg | +5 kg |
| Accessory sets | slot B: 2 sets | as written | +1 round on A1/A2 when the 45-min budget allows |

Cardio is out of scope for Story 5; the owner is folding it into Story 1 / Story 3. The 45-minute rule covers lifting only, so that story can add cardio after the lifting without breaking it.

**Evidence labels** (shown in the "Why this block" panel and in the docs):
- *Established:*
  - Body-fat change is driven mainly by energy balance, which is the nutrition side.
  - Lifting heavy and getting enough protein during a deficit help keep muscle and strength.
  - Muscle growth increases with weekly hard sets, up to a point.
  - Progressive overload drives gains.
  - Spot reduction doesn't work, so no exercise here "burns belly fat".
- *Supported, modest effect:* periodized programs beat non-periodized ones for strength. Varying exercises can spread muscle growth across a muscle and helps motivation.
- *Our coaching defaults (hypotheses):* the exact increments, the cut set cut and the block order. They live in one constant table so they're easy to tune.

### 4.5 Progression (Philip updates the orders; your logs are never changed)

- **Main lift:**
  - If a `+` set or top set reaches its prescribed reps, that lift's TM rises by the phase increment at the next cycle.
  - A miss holds that TM.
  - Two misses in a row reset it to 90%, rounded.
  - A pain flag also holds that TM.
- **Accessories use double progression.** When every set reaches the top of the range at or below the target RIR, the next session prescribes the smallest increment up. Otherwise the weight stays the same and the target is more reps.
- **e1RM:** Epley on `+` or top sets of 10 reps or fewer. It feeds PRs and the Strength charts.
- **TM history is append-only:** `{lift, tmKg, effectiveCycle, reason: setup | cycle | miss | retest}`.

### 4.6 The 45-minute budget

- **Time model:** `lib/sessionTime.ts` estimates every session from:
  - set work time: main 45–60 s; accessory 40–50 s, doubled when done per leg or side;
  - prescribed rest;
  - warm-up sets;
  - superset switches (15 s);
  - 1 min transitions;
  - 2 min setup.
- **Hard rule:** a generated session estimates **≤ 45 min** without cardio. A unit test checks every block × week × phase × day.
- **If a session estimates over 45 min, trim in this order:**
  1. Drop the bulk extra round.
  2. Cut rest to the floor (main 150 s, accessories 60 s).
  3. Cut slot B to 2 sets.
- **Current estimates** (maintain, typical day; bulk / cut in brackets):

| Block | Estimate |
|---|---|
| A | ~36 min (39 / 34) |
| B | ~39 min (42 / 37) |
| C | ~41 min (44 / 39) |
| D | ~38 min (41 / 36) |
| Deload | ~20 min |

- **In the app:**
  - The estimated minutes show on Home and in the session header.
  - During a session, an elapsed timer runs in the header.
  - At 45 min Philip says "Time. Finish this exercise and go." It's a nudge, not a lock.

### 4.7 Bar and plate loader (kg or lb, bar in kg)

The problem: the gym's barbells are 20 kg, but the plates are in lb.

- **Settings › Training › Equipment:**
  - Bar weight: 20 kg by default, or 15 kg / 45 lb.
  - Plate unit: lb by default, or kg.
  - Plates you have: lb 45 / 35 / 25 / 10 / 5 / 2.5, or kg 25 / 20 / 15 / 10 / 5 / 2.5 / 1.25.
- **Loadable rounding.** Every ordered barbell weight is rounded to the nearest weight you can actually load: bar + 2 × a multiple of the smallest plate. The order then shows exactly what goes on the bar, so the order matches what you lift. All the math lives in a pure `lib/plates.ts` (`loadFor(targetKg, bar, plates)`), with tests.
- **On every barbell set** (orders and warm-ups) there is a **plate line**:

  `76.7 kg · 169 lb  |  per side: 45 + 10 + 5 + 2.5 lb`

  - It shows both units, whatever the display setting.
  - Plates are listed heaviest first, each plate drawn as a small pixel chip.
  - A **kg ⇄ lb** toggle on the session header swaps which unit comes first. The order itself doesn't change.
- **Your lift input** accepts kg or lb (unit toggle next to the field) and stores kg.
- **Dumbbells and machines** show the order in both units (e.g. "22.5 kg · 50 lb"), rounded to 2.5 kg or 5 lb steps.
- **Worked example** (20 kg bar, lb plates; Block A, week 1):

| Lift (TM) | 65% | 75% | 85% (5+) |
|---|---|---|---|
| Squat (135) | 88.0 kg: 45+25+5 /side | 101.6 kg: 45+45 | 115.3 kg: 45+45+10+5 |
| Bench (90) | 58.6 kg: 35+5+2.5 | 67.6 kg: 45+5+2.5 | 76.7 kg: 45+10+5+2.5 |
| OHP (45) | 29.1 kg: 10 | 33.6 kg: 10+5 | 38.1 kg: 10+10 |

### 4.8 Cycle goal briefing (before every cycle)

**When it appears:**
- At setup.
- When week 4 (deload) is finished.
- From Plan › "Next cycle" at any time.

The next cycle can't start until the briefing is answered. Logging food or weight is never blocked.

**The briefing sheet:**
1. **Where you are:**
   - The 7-day average weight, which needs at least 3 weigh-ins in the last 7 days. Otherwise Philip asks for a weigh-in first.
   - The latest BF%, with its date.
   - Last cycle's goal vs what actually happened.
2. **Phase:** Philip recommends CUT, MAINTAIN or BULK (rules below), and Ryan can pick another.
3. **Philip's goal** (preselected default):
   - End-of-cycle weight.
   - Weekly rate.
   - BF% ceiling (bulk) or target (cut).
   - The calorie change this implies.
4. **"Set my own"** (optional):
   - Ryan enters an end weight and/or BF%.
   - The values are checked by the existing `lib/targets.ts` safety rules plus the rate limits below. Outside them, Philip shows a plain warning; the safety rules still decide what is allowed.
5. **Confirm:**
   - Starts the cycle.
   - Writes a new target plan through the calculator (append-only, as now), so calories follow the phase.
   - Snapshots the goal on the cycle.

**Philip's default goal per 4-week cycle** (`lib/cycleGoal.ts`, pure, tested):

| Phase | Weekly rate (% of body weight) | Default | BF% line |
|---|---|---|---|
| BULK (lean) | +0.25 to +0.5%/wk | +0.3%/wk | ceiling = current + 1 point |
| MAINTAIN | ±0.1%/wk | 0 | hold current |
| CUT | −0.5 to −1.0%/wk | −0.6%/wk | target = current − 1 point |

**Phase recommendation:**
- BF ≥ 20% → CUT.
- BF reached the long-term target → MAINTAIN.
- Otherwise → the phase Ryan last chose, or BULK if this is his first cycle.

The thresholds are Philip's coaching defaults, kept in one constant so they can be changed.

**Adjusting from the last cycle:**
- If weight went up faster than planned and BF rose more than 1 point, the next default rate drops 0.1%/wk.
- If weight didn't move on a bulk, the rate rises 0.1%/wk, still within the range.

**Worked example** (Ryan's current numbers, entered by him, not seeded): 73 kg and 15% BF, bulk.
- Philip's goal: **74.0 kg after 4 weeks** (+0.22 kg/wk, rounded to 0.5 kg), **BF ceiling 16%**.
- About +250 kcal/day above maintenance; the existing calculator computes the exact number.

**Evidence labels in the briefing:**
- *Supported:* published recommendations for trained lifters put lean-bulk gains at about 0.25–0.5% of body weight per week. Gaining faster mostly adds fat.
- *Honest limit:* BF% from home scales or calipers carries a few points of error, so a one-cycle change of about 1 point is within that error. Philip watches the trend across cycles; one reading means little. Measure the same way, at the same time of day.
- *Expectation:* a trained lifter gains muscle slowly. Expect a few hundred grams of muscle per month; the rest of the gain is water, glycogen and some fat. That's why the default rate is at the low end.

## 5. Today's session (`#/workout`)

Each exercise card has two clearly separate parts:

```
┌ PHILIP'S ORDERS ───────────────────────────┐
│ Bench press · Block A · W1 · 5s            │
│ Set 3  85.0 kg × 5+   RIR 1–2   rest 3:00   │
│ Cue: Shoulder blades pinned, touch, drive. │
├ YOUR LIFT ─────────────────────────────────┤
│ [ 85.0 ] kg × [ 7 ] reps   [✓]  [As ordered]│
└────────────────────────────────────────────┘
```

- **Orders are read-only.** They're written when the session is generated and stored with it, so later rule changes never rewrite history.
- **"Your lift" fields start empty.** They show the order as faded placeholder text only. **As ordered** is an explicit one-tap action that copies the order into your actual numbers. Changing your actual numbers never changes the order.
- **Logging rules:**
  - A set counts as done only when it has an actual weight and reps.
  - Unlogged sets are saved as not done; nothing is guessed.
  - `+` sets need reps typed in (As ordered isn't offered).
- **Rest timer:** ticking a set starts the prescribed rest countdown in the dialog bar.
- **Per exercise:**
  - Swap (Philip's equivalents only).
  - Skip.
  - Note.
  - **Hurts.** This stops the exercise and shows plain text: "Stop this exercise. Sharp or unusual pain isn't something to push through. If it keeps up, see a professional." No diagnosis.
- **Finish workout:**
  - Shows a summary: actual vs ordered per exercise, e1RM, PR badge, time taken, and what changes next session.
  - Moves "today" to the next day.
  - Every input autosaves; Home shows **Resume** if the app was closed.
- **Scrolling:** this screen may scroll. Home and Meal log keep the no-scroll rule (Q5).

## 6. Cycle plan (`#/workout/plan`)

- **Header:**
  - Block name and focus.
  - Cycle number.
  - Phase snapshot.
  - The current TMs.
  - A **Why this block** panel: 3 lines in Philip's voice, plus the evidence labels from §4.4.
- **Week tabs:** W1 · W2 · W3 · DELOAD.
- **Each week:** 4 day cards with every ordered exercise, sets × reps @ kg, and the estimated minutes. Finished days show the actual numbers next to the orders, with hit and miss marked as text plus an icon.
- **Next block preview** (faded): its name, projected TMs under the current phase, and its accessory list.
- **Read-only.** The plan is Philip's.

## 7. Progress and Settings at Home level

- **Progress › Body:** the current weight chart, plan line and calculator, plus the body-fat % and target BF% fields.
- **Progress › Strength:**
  - e1RM over time per Big 4 lift.
  - TM steps by cycle, with block labels.
  - Sessions done per week (out of 4).
  - Average session time.
  - Uses inline SVG and `useWidth`; no chart library.
- **Settings › Training:**
  - Re-test a lift.
  - Plate increment.
  - Equipment: bar weight, plate unit, plate set, and machines marked unavailable (which drives Swap).
  - Start the next block now.
  - Reset program (confirm dialog; logs are kept).
- **Phase** stays in the targets calculator, because a phase change has to re-run the `lib/targets.ts` safety rules.

## 8. Data (new Dexie version + upgrade + migration tests)

```ts
profile          + targetBodyFatPct: number|null          // upgrade: ??= null
trainingProgram  'id'   { id:'me', startedAt, barKg, plateUnit:'lb'|'kg', plates:number[],
                          unavailableEquipment: string[], currentCycle, createdAt, updatedAt }
tmHistory        '++id, lift, effectiveCycle'  { lift, tmKg, effectiveCycle,
                          reason:'setup'|'cycle'|'miss'|'retest', createdAt }   // append-only
cycles           'index'  { index, block:'A'|'B'|'C'|'D', startedAt,
                          phase:'lose'|'maintain'|'gain', tms: Record<LiftId,number>,
                          goal: { startWeightKg, startBfPct|null, endWeightKg, weeklyRatePct,
                                  bfLinePct|null, source:'philip'|'user', targetPlanId } }
slotChoices      'slotKey'  { slotKey:'D2-A1-B', exerciseId, chosenAt }   // owner swaps from Appendix A, sticky
workoutSessions  'id, date, [cycle+week+day], status'
  { id, date:YMD, cycle, block, week:1..4, day:1..4, status:'in_progress'|'done'|'skipped',
    estMinutes, startedAt, finishedAt|null, exercises: ExerciseLog[] }
  ExerciseLog { slot:'main'|'A1'|'A2'|'B', exerciseId, swappedFrom|null, note,
    prescription: Prescribed[],     // frozen at generation, never edited
    actual: ActualSet[] }           // user input only
  Prescribed { order, kind:'warmup'|'main'|'amrap'|'top'|'backoff'|'accessory',
    kg|null, reps|repMin..repMax, rir, restSec, perSide, cue, why }
  ActualSet  { order, kg|null, reps|null, done, pain, copiedFromOrder:boolean }
```

- **The exercise library** (`src/lib/exercises.ts`) holds ids, names, cues, why-lines, slot, block, the swap list and the per-side flag. It's static data, not stored in Dexie.
- **Derived, never stored:** the next session, weights, e1RM, PRs, previews and time estimates.
- **Backup:** an optional `training` block; `schemaVersion` stays 1.
- **Layer rules:** writes go through `repo.ts`; math lives in `lib/program.ts` and `lib/sessionTime.ts`; copy lives in `en.ts`.

## 9. Copy, style, accessibility, tutorial

- **Strings** go in `en.ts`: `home.*`, `workout.*`, `plan.*`, `strength.*`, `settings.training.*`, `exercise.*` (names, cues, why-lines).
- **Voice:**
  - Coaching lines use Philip's voice. Pain, reset and delete text stays plain.
  - No emoji. Never comment on body, weight or appearance.
- **Sample lines:**
  - "Block B. More reps, less ego."
  - "Deload week. Light on purpose. Don't get clever."
  - "New PR. Don't get emotional. Just keep going."
  - "Missed the top set. TM stays put. We go again."
- **Poses** (`COACH_POSE`): start → point-down-smirk · PR → fist-pump · deload → cross-smug · miss → cross-unimpressed · 45-min nudge → phone.
- **Style:**
  - D-022 tokens; one slate button face; `.num` for weights.
  - Touch targets ≥ 44 px; `inputmode="decimal"` on weight inputs.
  - Status is never shown by color alone.
  - No horizontal scroll at 375–440 px, including at 150% text.
- **Tutorial:** it now starts on Home. Add steps for the two cards and the phase chip, and move Today's steps under Meal log.

## 10. Tasks

| Task | Role | Scope | Depends on |
|---|---|---|---|
| T-011 | Core | Routes, Home, tab bar, redirects, tutorial anchors | T-010 merged |
| T-012 | Core | Dexie version, types, repo, hooks; `program.ts`, `sessionTime.ts`, `exercises.ts` + tests; backup | — |
| T-013 | Feature | Setup and re-test, Today's session (orders vs actuals), rest timer, 45-min nudge, finish summary | T-011, T-012 |
| T-014 | Feature | Cycle plan + Why panel + next-block preview; cycle goal briefing (`cycleGoal.ts`); exercise menu and swaps; Progress › Strength; Settings › Training; target BF% | T-012 |
| T-015 | QA | `home.spec.ts`, `workout.spec.ts`, tutorial update, WebKit on the Mac, docs (ARCHITECTURE, DESIGN_SYSTEM, **D-025**) | all |

No new dependencies. No AI or network use. Everything works offline.

## 11. Acceptance criteria

1. **Opening the app:** with an empty hash, the app opens on Home. `#/today` redirects to `#/meals`, and the meal log behaves exactly as before.
2. **Setup:** each lift takes a known 1RM or weight × reps, in kg or lb, and shows the e1RM and TM (90%). It saves `tmHistory` rows with reason `setup`. A lift left blank gets Calibration in its first session. There is no free TM edit afterwards; only Re-test.
2b. **Plate loader:** with a 20 kg bar and lb plates, an 85% bench set from TM 90 is ordered as 76.7 kg / 169 lb with "per side: 45 + 10 + 5 + 2.5 lb". Every barbell order is loadable with the plates you've marked as available.
3. **Block A, week 1:** with a squat TM of 100 kg and a 2.5 kg plate, the orders are 65 / 75 / 85 kg × 5 / 5 / 5+. **Block C, week 3:** 92.5 kg × 2, then 3 × 3 @ 80 kg. **Deload:** 40 / 50 / 60 kg × 5.
4. **Rotation:** cycles 1–4 use blocks A, B, C, D, and cycle 5 is A again. No accessory slot repeats an exercise in two cycles in a row.
5. **Orders vs actuals:** orders are read-only, and Your lift starts empty. As ordered copies the numbers and sets `copiedFromOrder`. Editing an actual never changes the order. A later rule change doesn't rewrite past sessions.
6. **45 minutes:** for every block × week × phase × day, `estMinutes` ≤ 45 without cardio (unit test). The trim order is applied when needed. The 45-min nudge appears in the elapsed timer.
7. **Phase:** CUT, MAINTAIN and BULK change TM increments, accessory sets and cardio as in §4.4. A mid-cycle phase change only affects the next cycle.
8. **Progression:** the miss rule, the pain hold and double progression behave as in §4.5, and each shows on the plan.
9. **Resume:** closing the app mid-session and reopening it resumes with every input intact.
10. **Units:** in lb mode, every weight is shown in lb and rounding uses 5 lb.
11. **Backup:** a backup round-trips the training data, and a pre-Story-5 backup restores cleanly.
12. **Layout:** Home and Meal log fit 393×793 with no scrolling. No horizontal scroll at 375 / 393 / 440 px or at 150% text.
12b. **Cycle goal:** at 73 kg and 15% on BULK, the briefing preselects 74.0 kg after 4 weeks and a 16% ceiling. "Set my own" accepts values that pass the safety rules and warns on rates outside the ranges. Confirming writes a new target plan and the cycle's goal snapshot. A cycle can't start without a briefing and at least 3 weigh-ins in the last 7 days.
12c. **Menu:** each slot offers only its approved swaps. A chosen swap sticks for that slot in later cycles and is shown as "Your pick" next to Philip's pick.
13. **Checks:** `npm test`, `npm run typecheck`, `npm run build` and the Chromium e2e tests pass; WebKit is run on the Mac.

## 12. Open questions for Ryan

**Answered:**
- No photo shortcut on Home.
- Rest timer in v1.
- Bulk gets the extra set.
- Today's session may scroll.
- Cardio moves to the separate story.
- Bar and plate setup: 20 kg bar, lb plates.
- Starting 1RMs: entered in setup; never seeded in code.

- Targets: Philip proposes them each cycle (§4.8); Ryan can set his own.
- Equipment: assume a full gym; Ryan swaps from Appendix A.
- Day 3 main lift is the Romanian deadlift (no conventional or sumo deadlift).

- Appendix A approved as written: no swaps, no exclusions (2026-11-05).
- BF% floor: Philip's default, owner-approved with "all good". A target below **10% BF** is refused with plain text, and a target below 12% shows a warning. Both values live in the `lib/targets.ts` safety constants.

**Spec status: approved, ready for kickoff** (see `claude/story-5-kickoff-prompt.md`).

## Appendix A. Exercise menu (Philip's pick · approved swaps)

Swaps keep the same movement pattern and the same sets × reps. A chosen swap sticks for that slot until changed. Slot key = Day-Slot-Block, e.g. D2-A1-B.

### Day 1: Squat
| Slot | Block | Philip's pick | Swap 1 | Swap 2 |
|---|---|---|---|---|
| A1 quads | A | Bulgarian split squat | Hack squat | Single-leg leg press |
| | B | Leg press | Hack squat | Pendulum squat |
| | C | Reverse lunge, front foot raised | Bulgarian split squat | Walking lunge |
| | D | Goblet squat (tempo) | Heel-raised DB squat | Belt squat |
| A2 hamstrings | A | Lying leg curl | Seated leg curl | Swiss-ball leg curl |
| | B | Seated leg curl | Lying leg curl | Single-leg seated curl |
| | C | Assisted Nordic curl | Glute-ham raise | Heavy lying leg curl |
| | D | Single-leg leg curl | Swiss-ball leg curl | Slider leg curl |
| B core | A | Hanging knee raise | Captain's chair knee raise | Reverse crunch |
| | B | Cable crunch | Machine crunch | Decline crunch |
| | C | Ab wheel | Stability-ball rollout | Body saw |
| | D | Pallof press | Dead bug | Side plank |

### Day 2: Bench press
| Slot | Block | Philip's pick | Swap 1 | Swap 2 |
|---|---|---|---|---|
| A1 row | A | Chest-supported DB row | Seal row | Chest-supported T-bar row |
| | B | Seated cable row | Machine row | Wide-grip cable row |
| | C | Barbell row | Pendlay row | T-bar row |
| | D | Single-arm DB row | Single-arm cable row | Meadows row |
| A2 chest | A | Incline DB press | Incline barbell press | Incline machine press |
| | B | Machine chest press | DB bench press | Weighted push-up |
| | C | Dips | Close-grip bench press | Weighted push-up |
| | D | DB fly | Cable fly | Pec deck |
| B shoulders / arms | A | Face pull | Cable rear-delt fly | Band face pull |
| | B | Rear-delt fly | Reverse pec deck | Cable rear-delt fly |
| | C | Band pull-apart | Face pull | Prone Y-raise |
| | D | Triceps pushdown | Overhead cable extension | DB kickback |

### Day 3: Romanian deadlift
| Slot | Block | Philip's pick | Swap 1 | Swap 2 |
|---|---|---|---|---|
| A1 glutes / low back | A | Hip thrust | Barbell glute bridge | Machine glute bridge |
| | B | 45° back extension (weighted) | Reverse hyper | Glute-ham raise |
| | C | Good morning | Safety-bar good morning | Weighted back extension |
| | D | Cable pull-through | Kettlebell swing | Reverse hyper |
| A2 single leg | A | Walking lunge | Reverse lunge | Split squat |
| | B | Step-up | Bulgarian split squat | Walking lunge |
| | C | Single-leg RDL | B-stance RDL | Cable single-leg RDL |
| | D | DB reverse lunge | Deficit reverse lunge | Lateral lunge |
| B calves / core | A | Standing calf raise | Leg-press calf raise | Smith-machine calf raise |
| | B | Seated calf raise | Leg-press calf raise | Single-leg DB calf raise |
| | C | Weighted plank | RKC plank | Long-lever plank |
| | D | Tempo calf raise | Single-leg calf raise | Donkey calf raise |

### Day 4: Overhead press
| Slot | Block | Philip's pick | Swap 1 | Swap 2 |
|---|---|---|---|---|
| A1 vertical pull | A | Pull-up (assisted if needed) | Assisted pull-up machine | Lat pulldown |
| | B | Lat pulldown | Single-arm pulldown | Machine pulldown |
| | C | Chin-up (weighted if 8+ come easy) | Neutral-grip pull-up | Heavy close-grip pulldown |
| | D | Neutral-grip pulldown | Single-arm cable pulldown | Machine high row |
| A2 side delts | A | DB lateral raise | Cable lateral raise | Machine lateral raise |
| | B | Cable lateral raise | Machine lateral raise | DB lateral raise |
| | C | DB lateral raise (heavier) | Machine lateral raise | Cable Y-raise |
| | D | Lean-away lateral raise | Behind-the-back cable lateral raise | Seated DB lateral raise |
| B biceps | A | DB curl | Cable curl | EZ-bar curl |
| | B | EZ-bar curl | Cable curl | Preacher machine curl |
| | C | Hammer curl | Rope cable hammer curl | Cross-body hammer curl |
| | D | Incline DB curl | Bayesian cable curl | Spider curl |
