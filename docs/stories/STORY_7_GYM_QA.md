# Story 7 — Gym QA batch (D-029)

Four QA observations captured at the gym on 2026-11-09. Decisions and bounds: docs/DECISIONS.md D-029.

| Obs | What changed | Where |
|---|---|---|
| OBS-F52773 order | Up/Down on accessory cards; order remembered per day; main lift first | `lib/training/order.ts`, `ExerciseCard`, `SessionView`, `repo.setDayOrder`, `saveWorkoutSession` (slot match) |
| OBS-93A8C0 cardio | Incline-walk finisher every session, 15 min (25 on a cut), outside the 45 | `lib/training/cardio.ts`, `CardioCard`, `createSession`, summary, calendar log |
| OBS-3DB146 report + chat | Gemini report with validated proposals (TM, rest, next weight/reps/sets, swap, days), Apply per change, chat thread, undo on delete | `lib/training/coach.ts`, `CoachReport`, `repo.applyCoachProposals`, `deleteWorkoutSession`, `buildSession` overrides |
| OBS-C94181 dumbbells | "2 × 12.5 kg × 10" per hand, total in muted text | `exercises.ts` (`pair`), `ExerciseCard`, `PlanView`, `WorkoutCalendar` |

## Tests
- Unit: `src/lib/training/story7.test.ts`, `src/db/story7.test.ts` (20 tests).
- Browser: `e2e/story7.spec.ts` (4 tests, Gemini mocked). `STORY7_SHOTS=<dir>` writes screenshots at 393 px.
- Updated: `e2e/session-fixes.spec.ts` (dumbbell summary text; exact locator for the name button).

## Open
- Real Gemini replies (format, free-tier rate limits) not checked with a live key.
- WebKit run on the Mac and a real-iPhone check pending.
- Cardio type and minutes aren't editable in Settings yet (default incline walk only).
