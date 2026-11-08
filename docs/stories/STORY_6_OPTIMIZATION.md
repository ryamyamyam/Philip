# Story 6: Optimization (training calendar, delete log, one workout a day, gym fixes)

> **As built (2026-11-08, T-019 → T-022 → T-020 → T-021, D-028).** Differences from the text below:
> - The squat/RDL warning fires when they're 2 days apart; with exactly 4 distinct weekdays they can never be back to back.
> - `reviewApplied.tm` has no TM row id; backups drop TM ids, and the undo is additive, so it isn't needed.
> - The BF "Now" line has no date (the profile stores no date for body fat).
> - The large flower's よくできました is set in the system font (owner to confirm or ask for pixel lettering).
> - Starting-weight ratios shipped as listed in `claude/story-6-starting-weights.md` (owner said go, 2026-11-08); they live in one table in `startLoad.ts`.

> Owner: Ryan. Written 2026-11-06 from the code on `main` @ `3a5cd6f` (T-017).
> **Base: latest `main`.** It doesn't depend on T-018 (Philip art), which is on hold until the new creatives arrive. Proposed tasks: T-019 to T-023.
> Read first: CLAUDE.md, `docs/ARCHITECTURE.md`, `docs/DESIGN_SYSTEM.md`, `docs/DECISIONS.md` (D-022 to D-027), `docs/DEVELOPMENT_RULES.md`, `docs/stories/STORY_5_WORKOUTS.md`.

Owner answers (2026-11-06):
- Planned dates: Philip picks the training weekdays; Ryan can change them.
- Deleting a finished log also undoes what its end-of-workout review changed.
- Philip's art resolution is dropped from this story. The owner is making better creatives first (§9).
- Gym fixes (2026-11-07):
  - Every exercise gets Philip's numbers.
  - Swap any accessory mid-workout.
  - The rest timer sends a push alert when done (no keep-screen-on for now).

## 1. Goals

1. **Workout calendar that sells the plan.** The calendar shows done days as a stamp, upcoming workout dates, and the cycle's last day as a goal date with a flower stamp and the expected weight and body-fat result.
2. **Delete a workout log** from the day box under the calendar. This also undoes its review changes.
3. **One workout a day.** After today's workout is done, nothing offers the next one until tomorrow.
4. **Every exercise has a number.** Accessories get Philip's starting weight and target reps (§6).
5. **Swap mid-workout** when a machine is taken (§7).
6. **Rest alert:** a push notification when rest is over, even with the screen off (§8).

## 2. One workout a day

**Bug today:** after Finish, the calendar's today button reads "Next workout: Day N" (`cal.openNext`) and the Home card shows the next day. You can start a second session on the same day.

**Rule:** if a session with `status: 'done'` is dated today, no session can be started today. Sessions keep the date they were started (D-027), so a workout that runs past midnight counts for the day it began.

- `workoutCardState(program, sessions, today)` takes `today` as a parameter, so it stays pure, and gains a state:
  `{ kind: 'doneToday'; session: WorkoutSession; next: SessionRef | null; nextDate: YMD | null; cycleDone: boolean }`
- **Check order:** setup → briefing → resume → **doneToday** → cycleDone → next.
- **Home card, `doneToday` state:** "Done today" with "Day 2: Bench · 41 min", plus "Next: Day 3, RDL · Thu 12 Nov". Tapping it opens the calendar on today. The dialog line is new, e.g. "Done. Go eat, go sleep. Thursday, we go again."
- **Calendar today box:** the done box (§3.4). There is no start button.
- **Cycle finished today** (the W4 D4 done): the box still offers **Cycle briefing**, because the briefing isn't a workout. The new cycle's Day 1 can start tomorrow at the earliest.
- `cal.openNext` is deleted.
- A whole-day `skipped` session does not block the day.

## 3. Training calendar

### 3.1 Training days (Philip picks, Ryan can change)

- New optional field `trainingProgram.trainingDays?: IsoWeekday[]`, with 1 = Mon … 7 = Sun. When it's missing, Philip's default applies.
- **Philip's default is Mon · Tue · Thu · Fri.**
  - Squat (Day 1) and RDL (Day 3) land 3 days apart.
  - Bench (Day 2) and OHP (Day 4) land 3 days apart.
  - The weekend stays free.
  - This is a coaching default (a hypothesis), not established evidence. The value lives in one constant.
- **Settings › Training › Training days:**
  - 7 weekday toggles. Exactly 4 must be on before Save is enabled, because the program is 4 days a week.
  - If the days put Day 1 and Day 3 (squat and RDL) back to back, show a plain warning: "Squat and RDL land on back-to-back days. Your hamstrings will file a complaint." Saving is still allowed.
  - Philip's default is marked "Philip's pick", and a "Use Philip's pick" button restores it.
- The days only set the projected dates. They never block training: you can train on any day that isn't already done.

### 3.2 Planned dates: projected, never stored (`lib/training/schedule.ts`, pure, tested)

```ts
planDates({ today, trainingDays, sessions, cycle }): PlannedDay[]
// PlannedDay { date: YMD, week: Week, day: Day, lift: LiftId, isGoalDay: boolean }
```

- **Refs:** the current cycle's remaining (week, day) refs in sequence order, from `nextSessionRef`. An in-progress session's ref comes first.
- **First date:**
  - Today, if today is a training day and nothing is done today, or if a session is in progress today.
  - Otherwise, the next training day after today.
- **Each following ref** goes on the next training day.
- **Goal day:** the date of the last ref (W4 D4) is the cycle's goal day.
- **Nothing is stored,** so the projection is recomputed from today every time:
  - A missed day pushes every later date, including the goal day, forward.
  - Training on a non-training day pulls later dates back.
- **Past dates** show only what really happened. A missed planned date leaves no mark: no guilt, as in Story 5.
- **No cycle running** (setup, briefing, or cycle finished): no planned days and no goal day.
- **Tests** at minimum:
  - default days from Mon 2 Nov → 16 dates ending Fri 27 Nov;
  - missing a day shifts the goal day;
  - done today → the first date is the next training day;
  - in progress today → the first date is today;
  - training on a Wednesday;
  - a cycle starting mid-week.

### 3.3 Calendar cells

Each state is shown by shape and text, never by colour alone. Cells keep their current size (7 columns at 375 px).

| State | Mark in the cell | aria-label adds |
|---|---|---|
| Done | **Done stamp**: a small original pixel-art ink stamp (round, red ink, tick) drawn over the date | "trained" |
| In progress | dot (as now) | "started" |
| Skipped | dash (as now) | "skipped" |
| Planned | lift tag under the date: SQ · BP · RDL · OHP, outlined | "planned: Day 3, Romanian deadlift" |
| Goal day | **flower stamp** (§3.5) instead of the lift tag | "goal day: end of cycle 1" |

- Today keeps its `is-today` frame.
- The legend line becomes: "Stamp: trained. Tag: planned. Flower: goal day. Dash: skipped."

### 3.4 Day box (the "notification box" under the calendar)

The box shows Philip's line in a DialogBar (bust portrait), then the content and actions for the selected date.

| Selected date | Philip says (examples, Philip's voice, no emoji) | Content | Actions |
|---|---|---|---|
| Today, done | "Done for today. Go eat, go sleep." | Done stamp (large) · "Day 2: Bench · Block A · W1 · 41 min" · top-set result · "Next: Day 3, RDL · Thu 12 Nov" | **View log** (expands the read-only log) · **Delete log** |
| Today, in progress | "You started. Finish it." | Day · elapsed so far | **Resume** · **Delete log** |
| Today, open | planned: "Day 1. Squats. No negotiating." Not a training day: "Not on the plan, but I won't stop you." | Day · ~min · top-set preview | **Start: Day N, Lift** |
| Past day with logs | none (keep it quiet) | each session's log (as now) | **Delete log** on each, current cycle only |
| Future planned day | "Thursday: RDL. Sleep before it." | "Planned: Day 3, RDL · Block A · W2 · ~38 min" · top set | none (read-only) |
| Goal day | "Hit this and you earn the flower." | flower stamp (large) · goal block (§3.5) · the planned workout on that day | none |
| Rest day / empty | as now | as now | none |

- After **Finish**, the summary's back button returns to the calendar with today selected. The done stamp plays a short "stamp press" (2 frames, `steps()`), and only when `prefers-reduced-motion` is off.
- Past logs from **finished cycles** have no Delete. They show "Locked: this cycle's results already set your TMs." (plain text).

### 3.5 Goal day: flower stamp and expected result

**The stamp** is an original pixel-art "yoku dekimashita" teacher's stamp:
- a red-ink flower (hanamaru spiral with petals) inside a round border;
- the large version (in the day box) carries the kana よくできました;
- the cell version (16×16 art pixels) is the flower only.

Drawing rules:
- Draw it as an inline SVG on a pixel grid (`<rect>`s, `shape-rendering: crispEdges`) in a `PixelStamp` component, with variants `done` and `goal`.
- Jersey 15 has no Japanese glyphs. The kana may be drawn as pixels or set in the system font inside the SVG; the owner decides at Phase A.
- The stamp is decorative (`aria-hidden`). The cell's aria-label carries the meaning.

**The goal block** reads from the current cycle's goal snapshot (`cycle.goal`, set in the briefing), so it always matches what Ryan confirmed. Never invent a number.

| Phase | Weight line | Body-fat line |
|---|---|---|
| BULK | "74.0 kg (+1.0 kg from 73.0)" | "Body fat at or under 16%" (ceiling) |
| CUT | "71.5 kg (−1.5 kg from 73.0)" | "Body fat 14% (−1 point)" (target) |
| MAINTAIN | "Hold 73.0 kg" | "Body fat 15%" (hold) |

- Then a "Now" line: "Now: 73.4 kg (7-day average) · Body fat 15% (2 Nov)". It uses the same weight source rule as the briefing (7-day average with 2+ weigh-ins, else the latest within 14 days, else the Targets weight) and says which. Reuse the existing helper.
- If there's no BF reading, the BF line reads "Body fat: no reading yet".
- A muted footnote: "Body-fat readings carry a few points of error. Philip watches the trend." (from Story 5 §4.8).
- **Owner note:** on a BULK the goal is weight up with body fat *capped*, not decreased. The box shows the snapshot as it is and never claims a BF drop the goal doesn't set.

## 4. Delete a workout log

**Where:**
- the day box (§3.4): today's done or in-progress session, or a past session of the **current cycle**;
- the session screen's overflow, for an in-progress session ("Discard workout", same flow).

**Confirm** uses the existing `ConfirmDialog`, in plain text with no Philip voice:
> **Delete this workout log?**
> Day 2: Bench, Fri 6 Nov. Your sets, notes and check-ins are deleted. Changes Philip's review made from this workout are reversed. This can't be undone.
> [Delete log] [Keep]

- For a session reviewed before Story 6 (`reviewed: true` and no `reviewApplied`), the second sentence becomes: "Changes from its review were made before this update and stay."
- After deleting:
  - a toast: "Log deleted.";
  - the day's (week, day) is open again; because days are a sequence, it becomes today's workout once it's the earliest open one;
  - the calendar and the Home card update live.

**Recording what a review applied** (from Story 6 on): when the owner taps "OK, apply" in the end-of-workout review (D-027), save this on the session:

```ts
reviewApplied?: {
  tm: { lift: LiftId; fromKg: number; toKg: number; tmRowId: number }[];
  restBonusAddedSec: number; // what this review actually added after the 90 s cap
}
```

Move the apply step (currently inline in `SessionView` around `setCycleRestBonus`) into a repo function, `applyReview(sessionId, changes)`, so recording and applying happen in one transaction.

**`deleteWorkoutSession(id)`** in `repo.ts` runs as one Dexie transaction over `workoutSessions`, `tmHistory` and `cycles`:
1. Refuse if `session.cycle !== program.currentCycle`.
2. For each `reviewApplied.tm` entry, **append** a TM row:
   - `reason: 'undo'` (new `TmReason`);
   - TM = that lift's current TM + (fromKg − toKg), rounded to the plate increment;
   - same `effectiveCycle`.
   - This keeps `tmHistory` append-only. It's additive, so a later adjustment isn't wiped out.
3. Lower `cycle.restBonusSec` by `restBonusAddedSec` (floor 0).
4. Delete the session row.

**Derived data needs no work:** e1RM, PRs, Strength charts, `nextSessionRef` and cycle outcomes are all computed from sessions.

**Data:**
- New optional fields only: `trainingProgram.trainingDays`, `WorkoutSession.reviewApplied`, and `TmReason` `'undo'`.
- These are non-indexed, so there's no Dexie version bump.
- Backup parses the new fields as optional, and `schemaVersion` stays 1. A pre-Story-6 backup restores cleanly.

## 5. Copy

- New keys go in `en.ts`: `cal.*` (legend, planned, goal, done box, delete), `home.workout.doneToday*`, `settings.training.days*`, `confirm.deleteLog*`, `toast.logDeleted`.
- **Voice:**
  - Philip's voice for coaching lines.
  - Plain text for delete, confirm, locked and pain.
  - No emoji anywhere in text boxes (D-023).
  - Never comment on body, weight or appearance. Goal numbers are stated, not judged.

## 6. Every exercise gets a number (accessory starting weights)

**Problem (gym, 2026-11-07):** the first time an accessory shows up, its order reads "Your pick × 8–12". Philip has no log for it yet, so the order has no weight and only a rep range.

**Rule:** every order shows **sets × target reps @ weight**, for example "3 × 10 @ 25 kg (8–12)". Ryan can still type something else in Your lift, as with the main lifts.

**Starting weight** (`lib/training/startLoad.ts`, pure, tested):
- Each exercise in `exercises.ts` gets an **anchor** and a **ratio**: `start = anchor × ratio`.
  - Anchors: one of the Big 4 TMs, or body weight.
  - Dumbbell ratios are per hand; cable and machine ratios are per stack.
- **Rounding:** **down** to the step (2.5 kg / 5 lb), never below the smallest step.
- **Anchor fallback:** if the anchor TM is missing (calibration pending), use the body-weight fallback ratio. With no body weight either, the order keeps "Your pick", the only case left.
- **Bodyweight moves** (pull-up, chin-up, dips, push-up, Nordic, ab wheel): the order is "Bodyweight × reps". The load field stays optional ("+ kg").
- **Timed holds:** seconds.
- **Bands:** "Band × reps".
- **After the first session,** the existing double progression (`nextAccessoryKg`) takes over from what he actually lifted. The estimate is used only when there's no log for that exercise.
- The ratios are **Philip's coaching defaults (a hypothesis, not evidence)**. They are deliberately conservative, aiming at 2–3 reps in reserve at the target reps. Machine and cable stacks differ between gyms, so those numbers are rough.
  - The card shows a small "Estimate" tag until the exercise has a log.
  - The why-line adds: "First time: my estimate. Adjust it, and I learn from what you lift."

**Starting ratios by group** (one constant table; tune in one place):

| Group | Examples | Anchor | Ratio |
|---|---|---|---|
| Leg machines | leg press · hack / pendulum / belt squat | squat TM | 1.2 · 0.5 · 0.5 · 0.6 |
| Single-leg, DB per hand | split squat, lunges, step-up | squat TM | 0.12 |
| Goblet / heel-raised DB squat | one DB | squat TM | 0.18 |
| Leg curls | lying, seated, single-leg (×0.5) | RDL TM | 0.25 |
| Hip hinge accessories | hip thrust / glute bridge · good morning · pull-through · KB swing · single-leg RDL (per hand) | RDL TM | 0.8 · 0.4 · 0.25 · 0.2 · 0.15 |
| Weighted back extension | plate held | RDL TM | 0.1 |
| Calves | standing machine · seated · single-leg DB | squat TM | 0.6 · 0.35 · 0.12 |
| Rows | chest-supported DB (per hand) · single-arm DB · cable/machine row · barbell/Pendlay/T-bar | bench TM | 0.25 · 0.3 · 0.6 · 0.6 |
| Chest accessories | incline DB (per hand) · incline barbell · machine press · close-grip bench · DB fly (per hand) · cable fly / pec deck | bench TM | 0.28 · 0.65 · 0.6 · 0.65 · 0.12 · 0.4 |
| Rear delt / triceps | face pull · rear-delt fly DB (per hand) · reverse pec deck · pushdown · overhead cable ext · kickback | bench TM | 0.25 · 0.07 · 0.3 · 0.3 · 0.25 · 0.08 |
| Vertical pull (cable / machine) | lat pulldown, single-arm (×0.5), high row | body weight | 0.6 |
| Side delts | DB lateral (per hand) · cable lateral · machine lateral | OHP TM | 0.18 · 0.1 · 0.4 |
| Curls | DB / hammer / incline (per hand) · EZ-bar · cable | OHP TM | 0.25 / 0.28 / 0.2 · 0.6 · 0.5 |
| Core with load | cable / machine crunch · Pallof press · weighted plank | body weight | 0.4 · 0.12 · 0.15 |

Exercises not covered by a group get their own row in `exercises.ts`. A unit test checks that **every** exercise in Appendix A has an anchor (or is marked bodyweight, timed or band).

**Target reps:**
- First time: the middle of the range, rounded down (8–12 → 10; 12–15 → 13; 6–8 → 7).
- After that: the double-progression target. Add a rep while under the top of the range; at the top, add weight and drop back to the bottom.
- The range stays visible in muted text. "As ordered" copies the weight and the target reps.

**Review gate:** T-019 stops with a printed table of every exercise's estimate at Ryan's current TMs and body weight. Ryan approves it, or edits ratios, before any UI work uses it.

## 7. Swap during a workout

**Problem (gym, 2026-11-07):** a machine was taken mid-workout, and Ryan couldn't find a way to swap after starting the day.

**What's there now:**
- A small ghost "Swap" button in each accessory card's action row.
- It is hidden as soon as any set of that exercise is ticked.
- It writes the swap as a permanent slot choice.

Either it wasn't discoverable or the phone was running an older cached build (see T-006). Both get fixed here.

**New rules:**
- **Visible:**
  - The exercise name on every accessory card becomes a button with a swap icon, as in the day check.
  - The action row keeps a labelled **Swap** button (not ghost).
  - The main lift has no swap; its name isn't a button.
- **Any time before the exercise's first set is ticked.** After that, the card shows "Sets logged. Skip the rest instead." Skip already exists.
- **The list** shows Philip's pick plus the 2 approved swaps (Appendix A). Each has its starting weight (§6) or its last logged weight.
- **Today only by default.** The sheet has a checkbox, "Keep this swap for future workouts" (off). It is ticked automatically when the swap is made in the day check or the Exercise menu, which is today's behaviour there.
- The swapped exercise gets fresh orders, with its own estimate or progression.
  - `swappedFrom` is kept, and the log shows "Swapped from Leg press".
  - Orders are still never edited by hand.
- **Undo:** swapping back to the original is just another swap.

## 8. Rest timer: "Time's up" push alert

**Problem (gym, 2026-11-07):**
- With the screen off, Ryan can't see the countdown and isn't told when rest is over.
- Today the rest bar silently disappears at zero.

**Platform facts** (checked 2026-11-07, sources in D-028):
- An iPhone home-screen PWA can't run timers or show a countdown while the phone is locked.
- It can't schedule a local notification.
- It *can* receive **Web Push** (iOS 16.4+, installed PWAs only), but only if a server sends the push.
- Vibration isn't supported.
- Owner choice: **no keep-screen-on for now; send a push alert when rest is done.**

### 8.1 In the app (screen on)

- **The countdown** stays timestamp-based, as now. After unlocking, it shows the true time left.
- **At zero** the rest bar doesn't vanish. It becomes a banner for 8 s, or until tapped:
  - "Time's up. Next: Bench, set 3."
  - It's announced by `aria-live` once.
  - It plays a short beep (Web Audio, generated, so there's no audio file), unless Settings › Training › Rest sound is off. iPhone's silent switch mutes it.
- **Back from a locked phone after zero:** the banner reads "Time's up 40 s ago."

### 8.2 Push alert (screen off)

**Free server, the first one Philip has:**
- A tiny **Cloudflare Worker** in `push-worker/` in the repo, run on Cloudflare's free plan.
- One **Durable Object per device**, whose **alarm** fires at the rest end and sends one Web Push.
- It stores only the push subscription and the pending timer. No account, body, food or lift data.
- **Owner setup (one time):**
  1. Create a free Cloudflare account.
  2. `npx wrangler deploy`.
  3. Set the VAPID keys as secrets.
  4. Put the Worker URL and VAPID public key in the GitHub Pages build as `VITE_PUSH_URL` and `VITE_PUSH_VAPID_KEY` (both are public values).
- T-022 confirms the current free-plan limits (Durable Objects with alarms) before building. If they no longer fit, it stops and reports.

**API:**
- `PUT /timer` `{ subscription, fireAt, title, body }`: replaces the device's pending timer.
- `DELETE /timer` `{ endpoint }`: cancels it.
- Guards:
  - `fireAt` must be within 15 minutes.
  - One pending timer per device.
  - Body ≤ 120 chars.
  - Simple rate limit.
  - CORS only for the Pages origin.

**Push encryption:** VAPID + aes128gcm, done with WebCrypto in the Worker. The **app gets no new dependencies**. The Worker may use one small, maintained Web Push library if hand-rolled crypto is judged too risky. That library is Worker-only and is noted in D-028.

**App side:**
- **Settings › Training › Rest alerts:** off by default.
  - Turning it on asks for notification permission. That works only in the installed app; in a Safari tab it says "Add Philip to your Home Screen first."
  - It then subscribes with `pushManager.subscribe` and keeps the subscription in `META`.
  - "Send a test alert" fires one in 5 s.
- **When a rest starts:** `PUT /timer`, fire-and-forget with a 3 s timeout. Starting a new rest replaces the timer. Stop rest, Finish, or leaving the session sends `DELETE`.
- **Offline or failed:** no push, and the in-app banner still works. Show one quiet line: "Rest alerts need a connection."
- **Service worker:**
  - The `push` event shows "Time's up" with body "Next: Bench, set 3." and tag `rest`, so only one alert shows at a time.
  - If a Philip window is visible, skip the system notification; the banner covers it.
  - Tapping the notification opens or focuses `#/workout`.
- **Copy:** "Time's up." is Philip's voice; no emoji.
- **Docs:** ARCHITECTURE gains a "Network" section (Gemini + push Worker). DEVELOPMENT_RULES records the push exception to "no network".

## 9. Deferred: Philip's resolution

Taken out of Story 6 (owner, 2026-11-06). The owner is making better creatives first. The findings and the art brief are in the project doc `claude/philip-art-brief.md`. When the new art arrives, it becomes its own task: repack it, check colours and alpha, update the atlas metadata. On-screen sizes stay the same, and no layout or call-site changes are needed.

## 10. Tasks

| Task | Role | Scope | Depends on |
|---|---|---|---|
| T-019 | Core | `schedule.ts` + tests; `workoutCardState` `doneToday`; types (`trainingDays`, `reviewApplied`, `'undo'`); `applyReview` + `deleteWorkoutSession` in repo + tests; backup fields; hooks; **`startLoad.ts` + anchors in `exercises.ts` + target reps (§6), with a review-gate table**; swap helper with today-only vs keep (§7) | — |
| T-020 | Feature | Calendar cells and stamps (`PixelStamp`), day box states, delete confirm and toast, Finish → calendar, Home `doneToday` card, Settings › Training › Training days, copy | T-019 |
| T-021 | Feature | Session fixes: orders show sets × target reps @ weight with the Estimate tag (§6); swap UX, today-only vs keep (§7); rest banner, beep, Settings › Training › Rest alerts and sound, push subscribe/PUT/DELETE, SW `push` + `notificationclick` (§8.1, §8.2 app side) | T-019 (for §6), T-022 (for push; build the rest first) |
| T-022 | Core (infra) | `push-worker/`: Worker + Durable Object alarm + Web Push, guards, tests, deploy guide; confirm free-plan limits first | — |
| T-023 | QA | `e2e/calendar.spec.ts`, `e2e/session-fixes.spec.ts`, delete and one-per-day flows, 375/393/440 px and 150% text, WebKit on the Mac, docs (ARCHITECTURE, DESIGN_SYSTEM, **D-028**), TASK_ASSIGNMENTS | all |

No new app dependencies. Everything works offline except push alerts, which are the one new network use, to our own free Worker (§8.2).

## 11. Acceptance criteria

1. **One a day:** after finishing today's workout, neither Home nor the calendar offers a session today. Home shows "Done today" with the next planned date. Tomorrow, the next day is offered. A session started before midnight and finished after counts for its start date.
2. **Done stamp:** a done day shows the stamp in its cell and in the today box, with an aria-label, and never by colour alone. The today box has View log and Delete log.
3. **Delete:** Delete log, then Confirm, removes the session. Its (week, day) is open again and is offered as today's workout when it's the earliest open one. Logs from finished cycles can't be deleted. In-progress sessions can be discarded.
4. **Review undo:** a session whose review applied squat TM 100 → 95 and +30 s rest. Deleting it appends a TM row with reason `undo` back to 100 (with no later changes) and lowers `restBonusSec` by 30. `tmHistory` gains rows and never loses them.
5. **Planned dates:** with the default days and a cycle starting Mon 2 Nov, cells show SQ/BP/RDL/OHP on Mon/Tue/Thu/Fri, and the goal flower falls on Fri 27 Nov. Missing Thu 5 Nov moves the goal to Mon 30 Nov. Changing the training days in Settings moves the dates live.
6. **Goal box:** on a BULK cycle from 73.0 kg / 15%, the goal day shows "74.0 kg (+1.0 kg from 73.0)", "Body fat at or under 16%", the Now line with its source, and the error footnote. CUT and MAINTAIN use their own wording.
7. **Training days setting:** Save needs exactly 4 days. A back-to-back squat/RDL warning shows but doesn't block. "Use Philip's pick" restores Mon/Tue/Thu/Fri.
8. **Data:** no Dexie version bump. A backup round-trips `trainingDays` and `reviewApplied`, and a pre-Story-6 backup restores cleanly.
9. **Starting weights:** at squat TM 135, bench 90, RDL 103.5, OHP 45 and body weight 73 kg:
   - every accessory order shows sets × target reps @ weight; for example, incline DB press 3 × 10 @ 25 kg per hand with the Estimate tag;
   - only exercises without an anchor and without body weight show "Your pick";
   - a test covers every Appendix A exercise;
   - after one logged session, the next order follows double progression.
10. **Swap mid-workout:** after the first exercise is done, an untouched accessory can be swapped from its name or the Swap button. It is today-only unless "Keep" is ticked. A logged accessory offers Skip instead. The main lift has no swap.
11. **Rest banner:** at zero the bar turns into "Time's up" with the next set, plus the beep (if on). After a lock and unlock past zero, it shows how long ago.
12. **Push:** with Rest alerts on in the installed app, ticking a set and locking the phone shows a "Time's up" notification at the rest end, within a few seconds. Stop rest or a new rest cancels or replaces it. With a Philip window visible, there's no system notification. Offline, the banner still works. Verified on the iPhone (T-003 style manual check).
13. **Layout:** Home fits 393×793 without scrolling. No horizontal scroll at 375/393/440 px or at 150% text. Calendar cells stay legible at 375 px.
14. **Checks:** `npm test`, `npm run typecheck`, `npm run build` and the Chromium e2e tests pass; WebKit is run on the Mac.

## 12. Open questions for Ryan

1. **The flower stamp's kana:** pixel-drawn or system font? Decided at T-020 Phase A from screenshots.
2. **Starting-weight table:** approve it, or edit ratios, at T-019's review gate (§6).
3. **Cloudflare account:** you create the free account and run the one-time deploy (§8.2).
