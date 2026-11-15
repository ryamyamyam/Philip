# Story 16: Philip's Playbook, sane numbers, notes that matter, strength on track

> Owner: Ryan. Task **T-034**, decision **D-039**. Branch `feat/T-034-playbook` from `main` @ `c5eba7d` (Story 15 merged). App version **0.16.1**.
> Status: **As built (2026-11-15), awaiting WebKit on the Mac and owner review.** Confirmed by the owner on 2026-11-14.
> The playbook is already in the repo: **`docs/philip/PLAYBOOK.md`**. One session does the whole story: Core + Feature + QA.

## 1. Owner ask (2026-11-14)

1. A centralized knowledge base for Philip: the knowledge he uses for plans and suggestions. Ryan wrote it; it was fact-checked and corrected → `docs/philip/PLAYBOOK.md`.
2. Philip's numbers must make sense. He prescribed 85 lb **per hand** for walking lunges (≈ 77 kg total, more than Ryan's body weight). When Ryan pushed back, Philip only cut ~10 %. Philip should check every suggestion against science: if it was plausible, adjust it properly; if it wasn't, fix it himself from scratch and say so. Ryan can still push back.
3. Every button must do something. Workout notes are typed and then nothing happens: not clearly saved, not read, no reply.
4. Hypertrophy is the point: per exercise, see last week and this week as **weight × reps × sets**, track estimated 1RM for every exercise against a goal with a date, and know whether he's on track.
5. If he lifts lighter than planned, the day's final report says how the goal date moves, and the calendar shows it.
6. The new rules must apply to **today's ongoing nutrition plan**, not only to future plans.

Owner answers (2026-11-14): cut line **18 % BF (male)**, below it any phase is fine; keep voluntary ~2/week weigh-ins; keep the 4-week %TM wave and its deload for the Big 4; adopt the playbook's fat floor (higher of 0.6 g/kg and 20 %) and cut pace (0.5–0.75 %, 1 % only above 25 % BF); strength targets come **from the cycle plan**; e1RM for **all** exercises, dashboard for the **Big 4** only (already built); **one combined strength date**; today's plan updates automatically with Undo; years of lifting asked once; strength-date marker separate from the goal flower; diet break, maintenance bridge, missed-week re-entry, overshoot spreading, alcohol and steps are advice-only in this story (no automation).

## 2. Start here

1. Follow CLAUDE.md's startup procedure. Read CLAUDE.md, `docs/ARCHITECTURE.md`, `docs/DESIGN_SYSTEM.md`, `docs/DECISIONS.md` (D-030, D-032, D-034, D-038), `docs/DEVELOPMENT_RULES.md`, `docs/stories/STORY_15.md`, and **`docs/philip/PLAYBOOK.md`**.
2. `git checkout -b feat/T-034-playbook main && npm ci`. Add T-034 to `docs/TASK_ASSIGNMENTS.md`.
3. State scope back in two lines. Ask questions one at a time, only about what this leaves unclear.
4. **Step 0 (report before coding):** find (a) where the 85 lb lunge came from (starting-weight estimate, per-hand conversion, ratio source) and (b) where workout notes are stored today and who reads them. Report both, then continue.

## 3. What to build

### 3.1 Playbook as code (PB-0)
- `src/lib/playbook/rules.ts`: typed constants with the PB IDs (phase lines, rates, macro bands, fat floor, carb-cycling band, increments, deload, guardrails, e1RM cutoff, accessory ratio table). Existing constants (`RATE_PCT`, `GOAL_RULES`, `SAFETY`, macro bands in `lib/goal/update.ts`, `lib/targets.ts`) **read from it**; no duplicate numbers left in the codebase (a test that guards against stray literals of the changed values, or centralized imports).
- **Rule changes** (owner-approved, touches `lib/targets.ts`):
  - Phase: Philip's pick cuts at ≥ 18 % BF (m) / ≥ 24 % (f) (was 20 %); below it any chosen phase passes without a warning; above it a bulk shows the mini-cut trade-off (warning, not a block).
  - Rates from training age (new profile field "years of consistent lifting", asked once in a sheet, editable in Settings); calories from `rate × kg × 7,700 ÷ 7`.
  - Fat floor = max(0.6 g/kg, 20 % kcal).
  - Protein bands: bulk 1.6–2.0, cut 2.0–2.4 g/kg (LBM rule above 25 % BF).
  - Carb cycling: gym days fat → floor, carbs up; rest days fat 0.9–1.1 g/kg, carbs down; **solve so the week's calories equal the flat plan** for the actual count of gym and rest days.
  - Guardrails PB-7.1–7.4, including the energy-availability warning (≥ 30 kcal/kg LBM after exercise).
- **Gemini prompts** (report, chat, Ask Philip, Update goals, proposals): add a compact playbook summary (IDs + one line each) and the hierarchy: playbook first; anything else starts with "Outside my core playbook:". Validate: a reply that states a number not produced by the engine is capped/replaced as in Story 11. Keep the summary short (prompt size and free-tier limits).

### 3.2 Today's plan follows the new rules
- On first launch of 0.16.1, recompute the **current** target plan under the playbook (same goal, same phase; if the 18 % rule now says otherwise, that is only a suggestion, never an automatic phase change).
- New target plan row (append-only), effective **today**; food already logged stays. Home shows today's remaining numbers from the new plan.
- One sheet in Philip's voice: before → after (calories, P/F/C, gym-day vs rest-day split) with the PB IDs that caused each change. **Applied automatically with Undo (24 h)**, like Update goals.

### 3.3 Plausibility check on every load (PB-8.4)
- Pure module `lib/playbook/loads.ts`: `plausibleBand(exercise, reps, rir, profile, history)` and `checkLoad(...)` → `{ ok | corrected, load, reason, pbId }`.
  - Anchor: the exercise's own e1RM from logs; else the ratio table × the related Big-4 e1RM; per hand for dumbbells; body-weight cap for unilateral/accessory lifts.
  - Load for reps + RIR via inverse Epley.
- Runs on **every** load Philip shows: starting weights, next orders, post-workout proposals, Too tired / Too easy options, Update goals accessories, chat replies that contain a load.
  - Inside the band: adjustments move by reps/RIR math (too heavy → the load for +2 RIR; too easy → −2 RIR), rounded to the gym's increments (bar 20 kg, plates in lb, DB steps). **No flat ±% nudges anywhere** (remove them).
  - Outside the band: re-derive, label "corrected", Philip says the old number was wrong and why in one line, offers the new one. Ryan can accept, push back, or type his own.
- **Pushback flow:** when Ryan says a number is wrong (button or chat), Philip re-checks the original. Plausible → a properly reasoned lighter/heavier number. Implausible → corrected from scratch.
- **One-time sweep** on update: run `checkLoad` over every stored accessory next order; fix the implausible ones (e.g. the lunge) and list them in the §3.2 sheet.

### 3.4 Notes that matter
- Per-exercise and per-session notes are saved on blur/Enter (visible "Saved"), shown in the read-back, in history and in edit-workout.
- They go into the post-workout report prompt and Philip's memory brief (Story 9).
- Signal rules in code (keywords + Philip): **pain** → PB-7.4 (stop that exercise, see a professional if sharp/radiating/joint) plus a lighter/swap proposal; **load too heavy/light** → the pushback flow; **machine taken / missing** → swap offer from the matrix. Otherwise Philip acknowledges the note in the report and may ask one question. Proposals are yes/no and applied on Yes.

### 3.5 Every button works
- Playwright crawl at 393×793 over every screen and sheet: tap each enabled button/control and assert an observable effect (navigation, sheet, toast, DB write, state change). The allowlist for intentional no-ops must be empty or justified.
- Fix every dead button found; list them in the hand-off.

### 3.6 Strength on track (PB-8.1–8.3, 8.5)
- `lib/strength/e1rm.ts`: Epley with RIR, sets with reps + RIR ≤ 12 only, per hand for DBs; per-session best; trend.
- **Targets from the cycle plan:** each lift's planned e1RM line from the cycle's TM increases spread to the goal deadline; flat on a cut.
- **Combined strength date** = when all Big 4 projected trends reach their targets (trend over recent sessions, minimum 3 sessions, else "not enough data yet").
- **Exercise card** (pre-workout check and in-session): `Last week: 60 kg × 8 × 3` / `This week: 62.5 kg × 8 × 3` (DB: `2 × 22.5 kg × 10 × 3`), with e1RM now vs planned and On track / Behind / Ahead.
- **Progress:** the Big 4 dashboard gets the planned line and the combined strength date. Progress › Goals shows the strength goal next to the body-weight goal.
- **Lighter than planned:** the day's final report states the change in the combined strength date (or "barely moves it") with the reason; the calendar shows the strength-date marker (separate from the cycle's goal-date flower) at its new date. The body-weight goal date is not moved by lifting lighter.

## 4. Rules
- No new dependencies. Pixel style, one slate button face, no emoji in text (D-023), Philip's voice (D-032), never comment on body or appearance.
- Target plans and `tmHistory` append-only. Orders vs actuals unchanged.
- Dexie: optional fields only if possible (training age, note `savedAt`, strength targets on the cycle). If a bump is needed, additive, with a v→v+1 test; backup `schemaVersion` stays 1 with optional fields.
- **Budgets:** first-screen JS ≤ 176 KB; precache was 1188 / 1200 KB. Playbook docs are not bundled; `rules.ts` and the new modules live in lazy chunks. If precache still can't fit, stop and ask Ryan (raise the budget under D-039 or trim).
- Version at the bottom of Settings → 0.16.1.
- Report ✅ after each step with files touched.

## 5. Acceptance criteria
1. No changed value appears as a literal outside `rules.ts` (unit).
2. Phase: 17.9 % BF bulk → no flag; 18 % bulk → mini-cut warning; Philip's pick at 18 % = cut (unit).
3. Calories follow `rate × kg × 7,700 ÷ 7` for each training-age band (unit).
4. Fat never below max(0.6 g/kg, 20 %); carb cycling keeps the weekly total equal for 3, 4 and 5 gym days (unit).
5. On first launch today's targets change, logged food stays, the sheet shows before → after with PB IDs, Undo restores the old plan (unit + e2e).
6. `checkLoad`: 85 lb/hand walking lunge for a 73 kg lifter with a 150 kg squat → corrected into the band; a plausible load + "too heavy" → the +2 RIR load, not −10 % (unit). No flat-% adjustment code remains (guard test).
7. The sweep fixes implausible stored next orders and lists them (unit).
8. Notes: saved, shown in history/edit, included in the report prompt; a "pain" note triggers the safety line and a proposal; a "too heavy" note triggers the pushback flow (unit + e2e).
9. The button crawl passes with an empty (or justified) allowlist (e2e).
10. e1RM math, the ≤ 12 cutoff, per-hand DBs; planned line flat on a cut; combined date needs ≥ 3 sessions (unit).
11. The exercise card shows last week and this week as weight × reps × sets (e2e at 393×793).
12. Logging lighter than planned → the report states the strength-date change and the calendar marker moves; the body-weight goal date does not (unit + e2e).
13. Outside-playbook answers start with "Outside my core playbook:" (prompt test with a mocked reply).
14. `npm test`, `typecheck`, `build`, `size`, full Chromium e2e pass. The known `food-logging` OBS-A0308B failure on `main` stays as is; say so.

## 6. Docs
- This file → as built; `docs/DECISIONS.md` **D-039** (playbook as source of truth, the rule changes, plausibility check, strength targets from the plan, combined strength date); `docs/ARCHITECTURE.md` (playbook, loads, strength modules); `docs/TASK_ASSIGNMENTS.md` T-034 with the test log.

## 7. Hand-off
Commit on `feat/T-034-playbook` with the repo's attribution lines, then stop and give Ryan:
- Step 0 findings (lunge root cause, notes), the list of dead buttons fixed, the loads the sweep corrected;
- the test summary; screenshots at 393 px: the "today's plan" sheet, an exercise card with last week / this week, a corrected-load message, the report with the strength-date line, the calendar marker;
- the WebKit and merge commands:
```
npx playwright test --project=webkit-iphone
git checkout main && git merge --ff-only feat/T-034-playbook && git push
```

## 8. As built (2026-11-15)

### Step 0 findings
- **The 85 lb lunge.** Not the starting rule (squat TM × 0.12 per hand ≈ 16 kg / 35 lb at a 150 kg squat). Double progression (`nextAccessoryKg`) trusted the last logged weight with no outside check; the likely origin is a dumbbell log typed as the total of both before Story 7 labelled inputs "per hand" (D-029 changed only the display), then +1 step. Gemini's bounds were relative (report/Update goals ±20%, check-in −25..+10%), so they could raise a bad number but never fix it, and "Too heavy" was a flat −10% / −5%.
- **Notes.** `SessionExercise.note` saved on every keystroke with no feedback; set notes only reached Gemini on "Ask Philip"; no session note; read only by the Gemini report and brief, never by the rules.

### What changed (see D-039 for the decisions)
- Playbook as code: `lib/playbook/rules.ts` (+ `prompt.ts`, `effort.ts`); guard tests for stray literals and flat-% nudges.
- Rule changes in `targets.ts`, `carbDays.ts`, `cycleGoal.ts`, `nextGoal.ts`, `update.ts`, `proposal.ts`, `deadline.ts`, `whyPlan.ts`; training age in Settings › Training and the sheet.
- Today's plan: `replan.ts`, `sweep.ts`, `db/playbookRepo.ts`, `PlaybookSheet` (once on 0.16.1, Undo 24 h).
- Loads: `loads.ts`, `loadContext.ts`; `Prescribed.corrected` with "Corrected" line and "Keep … anyway"; RIR-based check-in options and Gemini check-in (`rirChange`); report and Update goals proposals checked against the band; loads in chat text corrected.
- Notes: `NoteField` (blur/Enter, "Saved"), session note, read-back/calendar/edit, prompt + brief, `notes.ts` signals → yes/no proposals (`ReviewChange` next/swap).
- Strength: `lib/strength/e1rm.ts`, `StrengthStrip` (preview + card), `StrengthGoal` (Progress › Strength and Progress body next to Goals), dashed planned line, summary strength-date line, calendar marker. Implementation note: progress is measured set by set against the order (achieved ÷ ordered e1RM) and projected from the average of the last ≤ 6 sessions; an absolute e1RM trend swung and went "off" at every block change because the program's RIR labels are conservative.
- Budgets: check-in engine out of the first screen, lazy report chunk, lazy string pack; precache budget 1260 KB (owner, 2026-11-15).

### Dead buttons
The crawl (`e2e/buttons.spec.ts`, 393×793, ~120 buttons on 11 screens and 4 sheets, fresh data per tap) found **no dead buttons**; the allowlist is empty. The only "no effect" hits were the hidden file inputs behind Choose photo and Import backup (driven by their visible buttons), skipped with a reason in the spec. The real "nothing happens" problem was the notes (fixed in §3.4).

### Loads the sweep corrects
Every stored next order and every computed next order goes through PB-8.4 once on update; the sheet lists them. In the e2e data (73 kg lifter, 150 kg squat, lunges logged at 80 lb/hand, report order 85 lb/hand) the walking lunge goes **2 × 85 lb → 2 × 35–40 lb** (reason: too much per hand for the body weight). What it corrects on Ryan's phone shows in his sheet.

### Test log
- Unit: 538 / 538 (`npm test`), `typecheck` clean, `build` ok.
- Size: initial JS 175.1 / 177 KB, CSS 14.4 / 16, largest lazy chunk 25.1 / 30, precache 1240.5 / 1260 KB.
- Chromium e2e (cloud clone, 393×793 and the suite's own sizes): **129 passed, 1 failed** out of 130 (+7 new: 3 in `story16.spec.ts`, 4 in `buttons.spec.ts`; `story14.spec.ts` updated for the new cut band). The one failure is `food-logging` › "works offline after first load". It is flaky on `main` too: on `c5eba7d` it failed 2 of 3 with `--repeat-each=3`, the same as on this branch. Left as it is (the known `food-logging` failure on `main`).
- WebKit: not run (no WebKit in the cloud); run on the Mac.
