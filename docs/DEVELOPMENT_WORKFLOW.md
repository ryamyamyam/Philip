# Development workflow

Ryan is the product owner and final decision-maker. The PM coordinates; Core Development, Feature Development and QA execute within their roles (AGENT_ROLES.md).

## Standard process (features, large or architectural changes)

1. **Request** — Ryan describes the feature or improvement (or it comes from a QA & Feedback prompt).
2. **PM review** — the PM reads the request and the relevant docs.
3. **Fit check** — the PM checks ARCHITECTURE.md, ROADMAP.md and DECISIONS.md for conflicts.
4. **Clarify** — if scope, behaviour or ownership is unclear, the PM asks Ryan (one focused question at a time).
5. **Specify** — the PM writes the spec in the task entry: behaviour, acceptance criteria, out-of-scope.
6. **Owner** — the PM recommends the role (and says why). If it isn't obvious, the PM asks Ryan to choose: PM, Core Development, Feature Development, QA / Testing, or PM coordination across roles.
7. **Dependencies & conflicts** — the PM lists allowed files, excluded files, shared files needing approval, interfaces that must not change, and other tasks it depends on.
8. **Assign** — the PM adds the task to TASK_ASSIGNMENTS.md (status Approved), with a branch name and (for parallel work) a worktree.
9. **Implement** — the developer works only within scope, commits on the task branch, and sets status **Ready for QA** with a short summary of what changed and how it was tested.
10. **QA** — QA validates against acceptance criteria and runs regression tests (QA_STRATEGY.md). Status **QA in progress**.
11. **Fix** — defects go back to the developer with reproducible steps; repeat 9–10.
12. **PM review** — the PM reviews the diff (`git diff main...<branch> --stat`, then the full diff) for scope, conventions and doc impact.
13. **Docs** — the relevant docs are updated (ARCHITECTURE, PROJECT_CONTEXT, ROADMAP, DECISIONS, CLAUDE.md known issues).
14. **Complete** — only after the Definition of Done (QA_STRATEGY.md) is met and Ryan approves the merge. Status **Completed**.

## Simplified process (small, low-risk changes)

Allowed when **all** are true: one or two files, no shared file from DEVELOPMENT_RULES.md §2 other than adding strings to `en.ts`, no data/schema/backup/AI/safety change, no new dependency, no file deletion.

1. Ryan asks → the session confirms role and scope in one line.
2. Implement on a short-lived branch (or on the current task branch if it's in scope).
3. `npm test` + `npm run typecheck` (+ the related e2e spec if UI).
4. Add a one-line entry under "Recently completed" in TASK_ASSIGNMENTS.md.

When in doubt, use the standard process.

## Choosing sequential vs parallel

The PM decides per task:

| Situation | Approach |
|---|---|
| One coherent change, mostly in one area | One role, one task |
| A change that needs a shared interface first (new table, new sheet kind, new route) | **Sequential**: Core lands the interface → Feature builds on it → QA |
| Two changes with disjoint files and no shared interface changes | **Parallel** in separate worktrees |
| Tests for an approved spec while the feature is being built | QA can write e2e/unit tests in parallel against the spec, in `e2e/` / `*.test.ts` only |
| Unclear scope or architecture | **Review first** (PM spec / DECISIONS entry) before any implementation |

Don't split work just to use more sessions. Integration cost is real; prefer fewer, cleaner tasks.

## Integration order

When several tasks are ready, the PM merges them one at a time into an integration branch (or `main` when M1 is done), re-running `npm test`, `npm run typecheck` and the e2e suite after each merge. Shared-file conflicts are resolved by the PM, not by the developers independently.
