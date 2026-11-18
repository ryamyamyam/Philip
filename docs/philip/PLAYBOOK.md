# Philip's Playbook (v1, 2026-11-14)

> The single source of truth for what Philip knows and how he decides. Owner: Ryan. Fact-checked on 2026-11-14 against the research; corrections and owner decisions are folded in.
> Human-readable here; the numbers the code reads live in `src/lib/playbook/rules.ts`. Every rule has an ID; code, tests and Philip's prompts cite the ID.

**Evidence labels.** `research` = backed by meta-analyses or several trials. `practice` = a coaching rule of thumb, sensible but not proven. `emerging` = a few promising studies. `unsettled` = research disagrees. `owner` = Ryan's own decision for his app.

---

## 0. Decision hierarchy (PB-0)

1. **The playbook first.** Every calorie target, macro, progression step, swap, phase call and guardrail is computed by the app's code from these rules. Gemini never invents those numbers; it explains them and picks only inside the ranges the code gives it.
2. **Outside the playbook.** If a question isn't covered here, Philip may answer from broader sports-science knowledge (and a live lookup only if the free tier allows it).
3. **Label it.** Any advice that doesn't come from the playbook starts with: "Outside my core playbook:". `owner`
4. **Plausibility before speaking (PB-0.4).** Every number Philip shows (first prescription, answer to a pushback, Too tired / Too easy, post-workout proposals, Update goals) passes the plausibility check in §8.4 first. `owner`

---

## 1. Phase logic (cut / bulk / maintain)

| ID | Rule | Label |
|---|---|---|
| PB-1.1 | **Cut is recommended** at body fat ≥ **18 % (male)** / ≥ 24 % (female). | owner / practice |
| PB-1.2 | **Below 18 % (male) / 24 % (female)** any phase the lifter picks is allowed without a flag. Philip's own default below the line: bulk ≤ 12 % (m) / ≤ 21 % (f); maintain/recomp in between. | owner / practice |
| PB-1.3 | Training age < 1 year, or back after a > 3-month layoff: recomp/maintain is a good default (beginners gain muscle even near maintenance). | research |
| PB-1.4 | Bulk requested at or above the cut line: flag the trade-off, suggest a **mini-cut of 2–6 weeks** to below the line first. The lifter can still choose. | practice |
| PB-1.5 | **Maintenance bridge:** cut → bulk goes through 7–14 days at measured maintenance. Purpose: hunger and adherence, and a cleaner reading of the new maintenance. Hormonal claims are not proven. | practice |
| PB-1.6 | **Diet break:** after 8–12 weeks of continuous cutting or > 10 % of body weight lost, offer 7–10 days at maintenance, extra calories mostly from carbs. One large trial found better fat loss with breaks; a later one in trained lifters found no body-composition benefit. Offered for adherence, not as a must. | unsettled |

Note: the claim that fat storage is favored at higher body fat ("partitioning", insulin sensitivity at a fixed cutoff) is weak. The cutoffs are coaching heuristics.

---

## 2. Energy targets

### 2.1 BMR (research)
- **Mifflin-St Jeor** (default when BF % unknown): male `10·kg + 6.25·cm − 5·age + 5`; female `… − 161`.
- **Katch-McArdle** (when a reliable BF % exists): `LBM = kg · (1 − BF/100)`; `BMR = 370 + 21.6 · LBM`.

### 2.2 TDEE multiplier (practice)
| Job / steps | 3–4 lifting days | 5–6 lifting days |
|---|---|---|
| Sedentary | 1.45 | 1.55 |
| Active / > 10,000 steps | 1.65 | 1.75 |

Workout calories are inside the multiplier; never add them on top.

### 2.3 Weekly rate → daily calories (PB-2.3)
**Compute calories from the rate; never use fixed offsets.**
`daily kcal change = rate % / 100 × body weight (kg) × 7,700 ÷ 7`
(At 73 kg, a 0.5 %/week cut ≈ −400 kcal/day.) 7,700 kcal/kg is a rough average. `practice`

| Phase | Rate (% body weight per week) | Label |
|---|---|---|
| Cut, standard | −0.5 to −0.75 % | research |
| Cut, > 25 % BF | up to −1.0 % | research |
| Cut, lean (< 12 % m) | −0.25 to −0.5 % | research |
| Bulk, < 1 yr training | +0.25 to +0.5 % | practice |
| Bulk, 1–3 yrs | +0.20 to +0.35 % | practice |
| Bulk, > 3 yrs | +0.10 to +0.20 % | practice |

Training age is a profile field ("years of consistent lifting"), asked once.

### 2.4 Calibration (research for the method, practice for the thresholds)
- From week 2: `measured maintenance = average daily intake − (Δ weekly average weight kg × 7,700 ÷ 7)`. Requires enough logged days (the Story 11 reliability rule).
- If the weekly average misses the target rate for **2 consecutive weeks**, adjust by **±150–200 kcal/day**, from carbs and/or fat (never protein).

---

## 3. Macros

| ID | Rule | Label |
|---|---|---|
| PB-3.1 | **Protein**: bulk 1.6–2.0 g/kg body weight; cut 2.0–2.4 g/kg (above 25 % BF: 2.3–2.7 g/kg of LBM). Same every day. | research |
| PB-3.2 | **Fat floor**: never below **the higher of 0.6 g/kg and 20 % of calories**. Standard 0.7–1.0 g/kg (≈ 25–30 %). | practice (replaces the app's 25 % / 0.5 g/kg) |
| PB-3.3 | **Carbs**: the remainder, `(kcal − P·4 − F·9) ÷ 4`. | research (arithmetic) |
| PB-3.4 | **Carb cycling**: on during a cut, or for intermediate/advanced lifters on 4+ days a week; off (flat) for beginners or by choice. Gym days: carbs up, fat to the floor, 30–40 % of the day's carbs around training. Rest days: carbs down, fat 0.9–1.1 g/kg. **Weekly calories stay equal: the code solves the gym-day and rest-day numbers for the actual number of each in the week**, not fixed ±%. The +20–30 % / −25–35 % carb swings are the starting band. | practice (benefit is adherence and performance; no proven body-composition edge) |
| PB-3.5 | Alcohol: 7 kcal/g, taken from the carb and/or fat budget, never from protein. | research |

---

## 4. Training by phase

| ID | Rule | Label |
|---|---|---|
| PB-4.1 | Bulk volume: 12–20 hard sets per muscle per week; effort 1–3 RIR on compounds, 0–1 on isolations. | research |
| PB-4.2 | Cut volume: **keep as much as you recover from**; drop toward 8–12 sets only if recovery or performance suffers. Effort 1–2 RIR; no grinding to failure on heavy compounds. | practice |
| PB-4.3 | Cut intensity: keep loads heavy; cut sets, not weight. Light-weight "toning" is a myth. (Light loads can still build muscle near failure; the point is keeping the strength signal in a deficit.) | research |
| PB-4.4 | **Big 4 main lifts** (squat, bench, OHP, RDL) run on the app's **4-week %-training-max wave with a built-in deload**. It replaces the generic "A1 3–4 × 5–8" and the 5–7-week deload rule. | owner |
| PB-4.5 | **Accessories use double progression:** fixed weight until the top of the rep range on all sets (or the first 2) at target RIR, then add weight and reset to the bottom. Increments: upper isolation +1.25–2.5 kg; upper compound +2.5 kg; lower compound +2.5–5 kg. Dumbbells per hand, rounded to what the gym has. | research / practice |
| PB-4.6 | Add a set only in a bulk, after a 2-week stall, with good recovery. | practice |
| PB-4.7 | Stall (≥ 2 reps down for 2 sessions at the same load): bulk → that lift's sets −40–50 % at 85–90 % load for a week; cut → reduce the deficit by 150 kcal or a 1–2-day carb refeed. | practice |

---

## 5. Session layout and swaps

- **A1** main lift (the wave); **B1/B2** antagonist pair (e.g. incline DB press + chest-supported row), 60–90 s between, saves time with little strength cost; **C1/C2** isolation 2–3 × 10–15 at 0–1 RIR, 60–90 s rest. `practice` (pairing: `research`)
- **Swap matrix** (same pattern, similar resistance curve; principle `research`):
  - Horizontal push: barbell bench ↔ flat DB press, machine chest press, Smith bench
  - Incline push: incline barbell ↔ 30° incline DB, incline Smith, converging incline machine
  - Vertical pull: weighted pull-up ↔ neutral-grip pulldown, single-arm kneeling cable pulldown
  - Horizontal pull: barbell row ↔ chest-supported T-bar, seal row, single-arm DB row, seated cable row
  - Knee-dominant: high-bar squat ↔ hack squat, leg press (feet low), pendulum squat, Bulgarian split squat
  - Hip-dominant: RDL ↔ stiff-leg deadlift, good morning, 45° back extension, seated leg curl
  - Vertical push: seated DB OHP ↔ standing barbell OHP, machine press, landmine press
  - Lateral delt: DB lateral ↔ cable lateral (cuff), machine lateral
- **Weak-point specialization** (Ryan's upper chest): other muscles down to a **maintenance level of 6–8 sets/week** (true maintenance volume is lower, about ⅓ of normal, so this is safe); weak point 16–20 sets over 2–3 sessions, ≤ 8–10 per session; put it early in the session; favor lengthened-position exercises (`emerging`); run 6–8 weeks, then rebalance. `practice`

---

## 6. Monitoring

| ID | Rule | Label |
|---|---|---|
| PB-6.1 | Daily weight swings 0.5–2 kg from water, glycogen and salt. Judge by the **7-day average / EMA**, week vs previous week. | research |
| PB-6.2 | **Weigh-ins are voluntary (~2 a week)**; never required or blocking. With fewer than 4 in a week Philip says the trend is less certain. | owner |
| PB-6.3 | Trust order: (1) weight trend + navel waist, the best *practical* tracker (not a gold standard); (2) strength log (strength held in a cut ≈ muscle held); (3) DEXA / calipers every 8–12 weeks; (4) smart-scale BIA, ignore day to day. | practice |

---

## 7. Guardrails (hard rules in `lib/targets.ts`, owner-approved 2026-11-14)

| ID | Rule | Label |
|---|---|---|
| PB-7.1 | Calorie floor **1,500 kcal (m) / 1,200 (f)**. | practice |
| PB-7.2 | Energy-availability check: (intake − exercise kcal) ÷ LBM should stay ≥ **30 kcal/kg**; below it Philip warns (RED-S risk). Replaces the incorrect "22–25 kcal/kg of LBM total intake". | research |
| PB-7.3 | Max loss **1.0 % body weight/week** (1.25 % if BMI > 35). | research |
| PB-7.4 | **See a professional, stop that activity:** sharp, radiating or joint-specific pain; goal below BMI 18.5 or BF < 5 % (m) / < 12 % (f); disordered-eating patterns; amenorrhea during a cut. Philip doesn't diagnose. | research / safety |

---

## 8. Loads, strength tracking and plausibility

### 8.1 Estimated 1RM (PB-8.1)
- **Epley with RIR:** `e1RM = weight × (1 + (reps + RIR) ÷ 30)`. Only sets with reps + RIR ≤ 12 count (less reliable above). Dumbbells: per-hand weight, tracked per hand. `research` (formula), `practice` (cutoff)
- Each exercise's e1RM = best qualifying set of the session; the trend = sessions over time.
- Every exercise has an e1RM; only the Big 4 sit on the strength dashboard.

### 8.2 Strength goal (PB-8.2) `owner`
- Each lift's **target e1RM and date come from the cycle plan**: the planned training-max increases per cycle, spread week by week up to the goal deadline. On a cut the target is to hold strength (flat line).
- **One combined strength date:** the date all Big 4 are projected to reach their targets. Projection = the trend of the last several sessions (not one session), so one light day doesn't swing it.

### 8.3 Weekly target per exercise (PB-8.3)
- Shown the same way for last week and this week: **weight × reps × sets** (dumbbells "2 × kg × reps"). This week's numbers are what keeps the lift on its planned line.

### 8.4 Plausibility check (PB-8.4) `owner` (method `research`, ratios `practice`)
Before any load is shown:
1. **Anchor:** the exercise's own e1RM from logged sets if any; else a ratio of the related Big-4 e1RM from the ratio table (e.g. DB walking lunge per hand ≈ a small fraction of the squat 1RM).
2. **Convert** e1RM → load for the prescribed reps + RIR: `load = e1RM ÷ (1 + (reps + RIR) ÷ 30)`.
3. **Per hand** for dumbbells; **body-weight cap** for unilateral and accessory lifts.
4. Number inside the band → use it; adjustments move by the reps/RIR math (e.g. "too heavy" = the load for +2 RIR), never a flat −10 %.
5. Number outside the band → Philip re-derives it from step 1, says plainly the old number was wrong and why, and gives the corrected suggestion.
6. The lifter can always push back or set his own number.

### 8.5 Lighter than planned (PB-8.5) `owner`
If the lifter logs less than the plan, the day's final report states the effect on the **combined strength date** (computed from the trend; "barely moves it" if tiny), and the calendar moves the strength-date marker. The body-weight goal date follows calories, so lifting lighter doesn't move it on its own.

---

## 9. Disruptions and adherence (practice)
- 1–2 days missed: shift forward; never double up.
- 1–2 weeks missed: week back at 85–90 % of loads and ~70 % of volume.
- 3+ weeks: 2-week re-entry at 75–80 % loads, 2–3 RIR, then progression resumes.
- Overshoot: no next-day crash; spread −150–200 kcal/day over the rest of the week (or absorb it on a bulk).

## 10. Cardio and NEAT
- 7,000–10,000 steps/day on a cut. `practice`
- Stall breaker: −150 kcal from carbs/fat **or** +150 kcal of low-impact cardio (e.g. 20–25 min incline walk), lifter's choice. `practice`
- Keep HIIT 6+ hours from heavy legs, or on rest days; prefer LISS in a deficit. The incline-walk finisher is fine. `research`

## 11. Fatigue and warm-up
- High fatigue/soreness: keep loads heavy, cut working sets ~30 %, cap at 2–3 RIR. `practice`
- Warm-up for A1/B1 heavy lifts: 50 % × 8, 70 % × 4, 85 % × 1–2; isolations 0–1 warm-up set. `practice`


---

## Story 17 additions (2026-11-17, D-040)

| ID | Rule | Label |
|---|---|---|
| PB-2.2 | Now in code (`PB_TDEE`): mostly sitting 1.45 / 1.55, on the feet or 10,000+ steps 1.65 / 1.75 for 3–4 / 5–6 lifting days. Under 3 lifting days the general 1.2–1.9 table applies (no playbook row). | practice |
| PB-4.8 | **Bodyweight moves** (pull-up, chin-up): progress by reps to the top of the range on every set, then one more set (max 4), then — only with the lifter's yes — +2.5 kg added. A logged weight within 15 % of body weight is read as body weight. e1RM uses body weight + added load. Far under the range → the assisted version. | practice |
| PB-6.4 | **Today's line**: expected today = straight line from the goal's start to its target (weight, body fat), the cycle plan's weekly steps for the Big 4. Actual weight = 7-day average. On track within ±0.5 kg / ±1.5 BF points / Story 16's 3 % for lifts. A BF reading older than 28 days asks for a new one. Charts: plan and actual on the same axes, band shown, no dual axes, small multiples for the lifts. | practice |
