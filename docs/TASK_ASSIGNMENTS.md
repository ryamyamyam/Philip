# Task assignments

Shared registry for all sessions. **Update it whenever a task is proposed, assigned, started, blocked, handed to QA, reassigned or completed.** Do not assume two sessions have coordinated because they work on the same project — this file is the coordination.

Statuses: **Proposed** → **Approved** → **In progress** → **Ready for QA** → **QA in progress** → **Completed**; or **Blocked** (say on what).
Roles: PM · Core · Feature · QA · Owner (Ryan, for manual/device work and approvals).

Base branch for new work: `main`.

## Active tasks

| ID | Feature | Role | Status | Branch | Depends on |
|---|---|---|---|---|---|
| T-002 | WebKit e2e run on `main` | QA | Proposed | `main` (read-only) / `fix/T-002-…` | — |
| T-008 | Voice + emoji copy (D-020) and docs refresh | Feature + PM | Ready to ship (owner merges) | `release/voice-emoji-docs` | — |
| T-003 | Real-iPhone verification checklist | Owner + QA | Proposed | — | — |
| T-004 | Live Gemini key verification (incl. “What should I eat?” failure) | Owner + QA | In progress — waiting for the owner's “What Gemini said” text | — | — |
| T-005 | Remove unused files | Core | Proposed (needs owner approval: deletion) | `chore/T-005-unused-files` | — |
| T-006 | SW `ignoreVary` + update-available prompt | Core | Proposed | `fix/T-006-sw-offline-update` | — |

---

### T-008 — Voice + emoji copy and docs refresh
- **Role:** Feature (copy) + PM (docs)
- **Description:** Apply D-020 voice/emoji samples in `en.ts`; decorative `aria-hidden` meal/macro emoji in `MealsView`/`TodayCard`; bring README, CLAUDE.md and docs/* up to date with `main` `0cdd351`.
- **Allowed files:** `src/i18n/en.ts`, `src/views/MealsView.tsx`, `src/components/TodayCard.tsx`, `e2e/**` (string updates), `README.md`, `CLAUDE.md`, `docs/**`
- **Acceptance criteria:** error/delete/safety/backup strings unchanged; accessible names unchanged by emoji; tsc, unit and Chromium e2e pass.
- **Status:** Ready to ship · **Branch:** `release/voice-emoji-docs`
- **Log:** 2026-11-03: tsc clean, 177/177 unit, 54/54 Chromium-mobile e2e in a clean Linux clone (8 e2e assertions updated to the new copy). WebKit not run.

### T-002 — WebKit e2e run
- **Role:** QA (on the Mac)
- **Description:** `npx playwright install webkit` (once), then `npx playwright test --project=webkit-iphone` on `main`. Report failures with the defect template; WebKit-only fixes become a separate Core/Feature task. Also check the Targets date-of-birth field (`.input-date`).
- **Allowed files:** `e2e/**` only if a test itself is wrong (report first).
- **Excluded:** `src/**`.
- **Deliverables:** pass/fail report in this entry.
- **Acceptance criteria:** full WebKit suite run with results recorded.
- **Status:** Proposed · **Note:** `test-results/` on the Mac contains failing WebKit traces from an earlier run (date/branch unknown) — re-run before drawing conclusions.

### T-003 — Real-iPhone verification
- **Role:** Ryan (device) + QA (checklist, reporting)
- **Description:** ROADMAP.md Stage 8 real-device checklist, plus Story 3 flows: camera → review → save, saved meal, swipe actions, QA panel.
- **Status:** Proposed · **Depends on:** T-001

### T-004 — Live Gemini verification
- **Role:** Ryan (key) + QA
- **Description:** With a free-tier key: Test key, photo analysis, text analysis, "What should I eat?", invalid key, rate limit. Confirm `gemini-3.1-flash-lite` works or pick a new default (DECISIONS entry if changed); tune the prompt if estimates are off.
- **Status:** Proposed · **Depends on:** T-001

### T-005 — Remove unused files
- **Role:** Core
- **Description:** Confirm with `grep`/build which of `CalorieChart`, `CalorieRing`, `MacroBars`, `TargetsView` default export, `MyFoodsSheet`, `SavedFoodSheet`, unused `en.ts` keys are truly unreachable, then remove them. `MealsView.tsx` is **not** dead (TodayView imports `MealCard`).
- **Allowed files:** the files above, `src/views/SheetHost.tsx`, `src/ui.tsx`, `src/i18n/en.ts` (shared — PM coordinates), their tests.
- **Status:** Proposed — needs owner approval (file deletion) · **Depends on:** T-001

### T-006 — SW offline + update prompt
- **Role:** Core
- **Description:** `ignoreVary: true` in `src/sw-template.js` cache matching; wire `registerServiceWorker(onUpdate)` in `main.tsx` to a toast using the existing `update.*` strings.
- **Allowed files:** `src/sw-template.js`, `src/main.tsx`, `src/lib/pwa.ts`, `src/i18n/en.ts` (only if strings need changes), e2e offline spec.
- **Status:** Proposed · **Depends on:** T-001

## Recently completed

| ID | Summary | Completed | Evidence |
|---|---|---|---|
| T-000 | Development operating system docs | 2026-11-03 | Shipped in `main` `0cdd351` (owner push) |
| T-001 | Merge QA round 2 + Story 3 into `main` | 2026-11-03 | Owner fast-forwarded `main` to `0cdd351` and pushed. WebKit (T-002) was **not** run first. |
| T-007 | Owner feedback round: units switch, DOB layout, 1-month target, Today log buttons, Gemini temperature/retry/error detail | 2026-11-03 | `0cdd351`; tsc clean, 177 unit, 54 Chromium e2e (clean clone) |

## Entry template

```
### T-0XX — <feature name>
- **Role:** Core | Feature | QA | PM
- **Description:**
- **Allowed files:**
- **Excluded files:**
- **Shared files needing PM approval:**
- **Interfaces that must not change:**
- **Dependencies:**
- **Deliverables:**
- **Acceptance criteria:** Given … when … then … (incl. edge cases)
- **Status:** Proposed
- **Branch / worktree:** feat/T-0XX-… · ../philip-T0XX
- **Known conflicts:**
- **Log:** <date> <role>: <what happened>
```
