# Story 9: Philip's memory

> Owner: Ryan. Written 2026-11-10, built on `feat/T-025-efficiency` (Story 8). Task **T-026**, decision **D-031**.
> Owner ask (2026-11-09): every conversation with Philip should draw on the existing data (sets, weights, exercises, what was said before) from a well-organised database. Owner, 2026-11-10: "do it all in one go".

## 1. Audit (before)

| Gemini call | What Philip saw |
|---|---|
| Report after a workout | today's session, current TMs, training days, swap menu |
| Chat under the report | the same + the last 12 lines of *that* report's chat |
| Mid-set check-in | that one set |
| Anything else | no way to talk to Philip outside a workout |

Missing: past sessions and lift trends, accessories' history, pain reports from earlier weeks, weight and body fat, food, earlier reports and chats. Chats lived only inside each session row (deleting a log deleted them).

The database itself was in good shape (typed Dexie tables, append-only TM history, derived values computed, not stored). Loose ends noted, not changed: `profile.weightKg` duplicates the newest `weightEntries` row; `meta` is a key-value catch-all for device settings.

## 2. Design

**Don't dump the database into the prompt.** A pure builder turns the history into a short, ordered brief with a hard size cap. It's faster, cheaper on the free tier, and shares less.

### 2.1 Brief (`lib/coach/brief.ts`, pure, tested)

Sections in priority order. Whole lines are added until **6,000 characters (~1,500 tokens)**; anything that doesn't fit is cut from the end and marked "(brief cut short)".

1. **Notes** Philip keeps (§2.3).
2. **Lifter**: sex, age, height; long-term target; weight 7-day average and 4-week trend; body fat; food over the last 7 days (days logged, average kcal and protein vs target).
3. **Program**: cycle, block, phase, start date; TMs now and in cycle 1; this cycle's goal.
4. **Main lifts**: best set per session (e1RM when it's a key set), last 5 per lift.
5. **Reported in sets**: pain, flags and notes from the last 6 weeks.
6. **Recent workouts**: last 6 (date, week/day, minutes, sets done, skips, cardio, flags, Philip's report line).
7. **Accessories**: latest log of each (12).
8. **Earlier conversations**: last 12 lines across Ask Philip and all workout chats.

A realistic month (16 sessions) fits well under the cap (unit test). `db/coachBrief.ts#loadBrief` reads it all in one read transaction.

### 2.2 Where the brief goes

| Call | Change |
|---|---|
| Report | brief, then "Today's workout:" (today's session isn't repeated in Recent workouts) |
| Chat under the report | brief (without this report's chat, which is already in the prompt), then today's workout |
| Mid-set check-in | this exercise's last 3 logs + Philip's notes (kept short: it's mid-set) |
| **Ask Philip** (new, `#/ask`) | brief (without the Ask chat), the last 10 lines of the Ask chat, the question |

**Ask Philip** opens from the **Ask Philip** button in Home's dialog bar (no new card; Home still fits 393×793). It gives advice only. Plan changes (TM, rest, swaps, days) still come from the report after a workout, where each proposal is validated and needs Apply. Without a key it says so and links to Settings.

### 2.3 Notes (`coachNotes`, Dexie v5)

- Every coaching reply may include `"remember": [..]`: 0–2 short new facts (injury or pain spot, missing equipment, a preference, a schedule limit, a goal). Only what the lifter said or the log shows; no body judgments.
- `parseRemember` keeps at most 2, clean, ≤ 140 characters. `addCoachNotes` dedupes (case-insensitive) and keeps the newest 40.
- Notes survive deleting a workout log.
- **Settings › Philip's memory** lists them with Delete, plus "Delete all notes".

### 2.4 Privacy switch

Settings › Philip's memory › **Include body and food data** (on by default, device-only, not in backups). Off: the brief has no weight, body fat, age, height or food lines; training, notes and chats still go. The section explains that the brief goes to Google Gemini only when you ask Philip something.

### 2.5 Data

- Dexie **v5**: `coachNotes` (`++id, createdAt`) and `coachMessages` (`++id, at`; the Ask chat, newest 200 kept). Additive migration.
- Workout chats stay on `workoutSessions.coach`; the brief reads both.
- Backup: optional `training.coachNotes` / `training.coachMessages`. `schemaVersion` stays 1, and pre-Story-9 backups restore with none. Merge adds what's missing. Delete all data clears both.

## 3. Budgets (D-030 and D-031)

- **Brief ≤ 6,000 characters**: unit test with 80 sessions, 40 long notes and 50 long chat lines.
- First-screen JS ≤ 172 KB gzip: **168.7 KB** after this story (+1.2 KB: strings and repo functions). Ask Philip is a lazy 1.6 KB chunk.
- Idle CPU and animations unchanged (`e2e/perf.spec.ts`).

## 4. Acceptance criteria

1. The report prompt starts with Philip's brief (TMs, 7-day weight, history) before today's workout (e2e).
2. A `remember` in a reply appears under Settings › Philip's memory; Delete removes one; Delete all clears them (e2e + unit).
3. Ask Philip: the question goes out with the brief, the notes and the previous Ask lines, and the reply survives a reload (e2e).
4. Sharing off: no body or food lines in the next prompt (e2e + unit).
5. The brief never passes 6,000 characters; a realistic month isn't cut (unit).
6. Migration v4 → v5 keeps every record; backup round-trips notes and the Ask chat, and old backups restore cleanly (unit).
7. Home fits 393×793 at 375/393/440 px with the Ask Philip button (existing e2e).
8. `npm test`, `npm run typecheck`, `npm run build`, `npm run size`, full Chromium e2e pass; WebKit on the Mac.

## 5. Later

- Let Ask Philip propose plan changes (needs a validation context without a session).
- Philip summarises old chats into notes on his own, instead of only the last 12 lines.
- A real-device check of reply quality with the live free-tier key (T-004).
