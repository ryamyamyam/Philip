# Task assignments

Shared registry for all sessions. **Update it whenever a task is proposed, assigned, started, blocked, handed to QA, reassigned or completed.** Do not assume two sessions have coordinated because they work on the same project — this file is the coordination.

Statuses: **Proposed** → **Approved** → **In progress** → **Ready for QA** → **QA in progress** → **Completed**; or **Blocked** (say on what).
Roles: PM · Core · Feature · QA · Owner (Ryan, for manual/device work and approvals).

Base branch for new work: `story-3-simplify` until T-001 merges it into `main`; afterwards `main`.

## Active tasks

| ID | Feature | Role | Status | Branch | Depends on |
|---|---|---|---|---|---|
| T-000 | Development operating system docs | PM | Ready for owner review | `docs/dev-os` | — |
| T-001 | Verify & merge QA round 2 + Story 3 into `main` | PM (+ QA) | Blocked | `story-3-simplify` → `main` | T-002, owner decisions |
| T-002 | WebKit e2e run on `story-3-simplify` | QA | Proposed | `story-3-simplify` (read-only) / `fix/T-002-…` | — |
| T-003 | Real-iPhone verification checklist | Owner + QA | Proposed | — | T-001 deployed |
| T-004 | Live Gemini key verification | Owner + QA | Proposed | — | T-001 deployed |
| T-005 | Remove unused files | Core | Proposed (needs owner approval: deletion) | `chore/T-005-unused-files` | T-001 |
| T-006 | SW `ignoreVary` + update-available prompt | Core | Proposed | `fix/T-006-sw-offline-update` | T-001 |

---

### T-000 — Development operating system docs
- **Role:** PM
- **Description:** Create/update CLAUDE.md and docs/* (PROJECT_CONTEXT, ROADMAP, DEVELOPMENT_WORKFLOW, ARCHITECTURE, DEVELOPMENT_RULES, AGENT_ROLES, TASK_ASSIGNMENTS, DECISIONS, QA_STRATEGY); README docs links.
- **Allowed files:** `CLAUDE.md`, `README.md`, `docs/**`
- **Excluded:** everything else (no application code, tests or config).
- **Deliverables:** the docs above, committed on `docs/dev-os`.
- **Acceptance criteria:** CLAUDE.md points to every doc; no existing information lost; statuses reflect verified evidence only; open questions listed.
- **Status:** Ready for owner review · **Branch:** `docs/dev-os` (on top of `story-3-simplify`) · **Known conflicts:** CLAUDE.md, README.md, docs/ROADMAP.md, docs/ARCHITECTURE.md also differ between `main` and `story-3-simplify`; merge `docs/dev-os` after (or together with) T-001.

### T-001 — Verify & merge QA round 2 + Story 3
- **Role:** PM coordinating QA; Ryan approves merge/push.
- **Description:** After T-002 passes and the owner settles D-014/D-015, merge `story-3-simplify` (contains `qa-round-2`) and `docs/dev-os` into `main`, re-run tests, push (deploys to Pages).
- **Allowed files:** none edited directly (merge only); conflict fixes require PM approval.
- **Excluded:** —
- **Dependencies:** T-002; owner confirmation of PROJECT_CONTEXT.md open questions 1–2.
- **Deliverables:** `main` at the merged commit, pushed; Pages deploy green.
- **Acceptance criteria:** `npm test`, `npm run typecheck`, `npm run build`, Chromium + WebKit e2e pass on the merge commit; CI deploy succeeds; app loads from the Pages URL.
- **Status:** Blocked (T-002, owner decisions) · **Known conflicts:** none expected (`main` is an ancestor of `story-3-simplify`, so a fast-forward is possible).

### T-002 — WebKit e2e run
- **Role:** QA (on the Mac)
- **Description:** `npx playwright install webkit` (once), then `npx playwright test --project=webkit-iphone` on `story-3-simplify`. Report failures with the defect template; WebKit-only fixes become a separate Core/Feature task.
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
| — | — | — | — |

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
