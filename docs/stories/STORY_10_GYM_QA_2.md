# Story 10 — QA batch, 2026-11-11 (8 observations) — T-027, D-032

Owner decisions (2026-11-11): the "suggestion inbox" is the QA & Feedback inbox; Philip estimates a treadmill's speed scale from the machine name (owner can correct); Philip's tone becomes a charming, persuasive dominant coach who never scolds (non-sexual); a finished log gets a read-back before completing **and** can be edited later from the calendar.

| Obs | Root cause (confirmed in code) | Change |
|---|---|---|
| OBS-097D6D flags "do nothing" | `CheckinPanel` flag buttons only set local state; a proposal came only after **Send**, and it was a single change below the set list | A flag tap answers at once with Philip's options (`checkinOptions`): pick one per kind, Philip's pick pre-ticked, **Apply**. Rest can also be added to every later exercise (`addLaterRest`). A typed note still goes to Gemini via Send; its read becomes one more option. Options show right under the set. |
| OBS-2C086C unrealistic advice | `nextAccessoryKg` always held the weight on a miss; `nextTargetReps` clamped the target to the bottom of the range, so 9, 9, 4 of 4 × 9 (8–12) became "same weight × 8" | A set 2+ reps under the range bottom (or unfinished sets) drops the next load ~2.5% per missing rep (≥ one increment, ≤ 20%; `LOAD_PCT_PER_MISSED_REP`, coaching default). Same rule mid-session: logging a set 2+ reps short offers the lighter options unasked. Gemini report "next" proposals that only trim reps after a big miss get the rule weight; both Gemini prompts state the rule. |
| OBS-7BAD75 can't fix a finished log | Finish set `status: 'done'` at once; done logs could only be deleted | **Finish → "What you did today"** read-back (Yes completes, No goes back). **Edit log** in the calendar day box (current cycle, no other open workout): `reopenWorkoutSession` undoes applied review/report changes (same undo as delete), clears the report, sets `editing`; saving keeps the original finish time and Philip reviews again. |
| OBS-DD5F16 slow reorder | Story 7 had per-card Up/Down only | Long-press (450 ms) a title bar, or "Change the order", opens reorder mode: title bars float, drag (pointer events, no dependency) or Up/Down, **Save order**. Main lift stays first. |
| OBS-E19B38 machine speed | Cardio speed was mph or km/h by weight unit | Settings › Training › Your treadmill: brand/model, "Ask Philip" (Gemini) estimates mph / km/h / level (top level, speeds), owner can correct. Cardio shows "= 2.2 mph" (or "About … (estimate)" for levels) and stores `speedMph`. |
| OBS-9F203A select all | Inbox had "Select visible" + "Clear selection" | One toggle: **Select all** (every match of the filters) ↔ **Unselect all**. |
| OBS-5042CD scrollbar + bounce | `overscroll-behavior` was only on `body` (iOS applies it on the root scroller); no scrollbar rule | `overscroll-behavior: none` on `html`, body, sheets and the QA panel; `scrollbar-width: none` + `::-webkit-scrollbar` hidden everywhere. **Verify on the iPhone.** |
| OBS-4E1000 tone | D-020 voice ("bossy") plus scolding lines | Gemini personas: dominant but charming, persuasive, never scolds, no sexual content; scolding copy rewritten. |

Data: optional `WorkoutSession.editing`, `TrainingProgram.treadmill`, `CardioLog.speedMph`, `CardioLog.speedUnit` adds `'level'`. No Dexie bump; backup `schemaVersion` stays 1 and parses the new optional fields.

Checks (cloud clone): tsc clean, unit 375/375, build, `npm run size` 170.9/172 KB initial JS, Chromium e2e 106/106. WebKit + real iPhone pending (overscroll/scrollbar, long-press, drag).
