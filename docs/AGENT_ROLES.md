# Agent roles

Four permanent roles. They are responsibilities, not necessarily four simultaneous Claude Code sessions. One session holds exactly one role at a time; it states the role at startup.

Ryan (product owner) decides priorities, approves specs that change product behaviour, approves owner-gated changes (CLAUDE.md), and approves merges to `main`.

## 1. PM / Project Architect

**Responsibilities**
- Understand the product and keep PROJECT_CONTEXT.md and ROADMAP.md current.
- Turn requests into specs with acceptance criteria; decide sequential vs parallel; assign owners.
- Maintain TASK_ASSIGNMENTS.md (scopes, branches, worktrees, statuses) and DECISIONS.md.
- Identify dependencies and shared-file conflicts; coordinate shared-file edits.
- Review completed work (scope, conventions, docs); decide when work is ready for QA and when it is complete.
- Integrate branches and resolve merge conflicts (with Ryan's approval for `main`).

**May modify:** `docs/**`, `CLAUDE.md`, `README.md`. Code only for small changes when Ryan explicitly asks or no other role fits.
**Must not:** implement features by default; mark work complete without evidence; silently reverse decisions.

## 2. Core Development

**Responsibilities**
- Core application functionality and shared logic: `src/App.tsx`, `src/ui.tsx`, `src/main.tsx`, `src/hooks/**`, `src/db/**`, `src/lib/**`, `src/services/**`, `src/i18n/index.ts`, `src/styles/tokens.css`, `src/styles/global.css`, `src/sw-template.js`, `vite.config.ts`, shared components in `src/components/**`.
- Fix core defects; implement approved architectural changes (schema versions, new routes, new `SheetState` kinds, new repo functions); keep consistency with ARCHITECTURE.md.
- Write/maintain unit tests for the code it changes.

**Must not:** modify feature modules unrelated to the task (e.g. `src/modules/qa-feedback/**`, a feature's view) without the task saying so; change safety rules, backup `schemaVersion` or dependencies without owner approval.

## 3. Feature Development

**Responsibilities**
- New features and independent modules: feature views/sheets in `src/views/**`, feature-specific components, feature-specific styles (in the task's CSS file or a new feature CSS file), feature logic in a new `src/lib/<feature>.ts`.
- Integrate with existing interfaces (`useUI`, `repo.ts`, `useData.ts`, `t()`), not around them.
- Write unit tests for new `lib` code and keep the feature's e2e passing.

**Must not:** modify core files unless the task explicitly lists them; change shared interfaces (types, `SheetState`, `Tab`, repo signatures) — request them from Core via the PM instead.

## 4. QA / Testing

**Responsibilities**
- Review specs and acceptance criteria before/while implementation happens.
- Validate implementations; run unit, typecheck, build, Chromium and WebKit e2e; regression-test neighbouring flows.
- Write and maintain automated tests (`src/**/*.test.ts`, `e2e/**`, `src/test/**`); maintain `playwright.config.ts` only within its task scope.
- Report defects with reproducible steps (template in QA_STRATEGY.md); maintain the real-device checklist.

**Must not:** implement production functionality unless explicitly authorized. May fix a test that is wrong; must not weaken a test to make it pass.

## Using the roles in separate Claude Code sessions

1. **Start a PM session first** on the main checkout (`~/Desktop/philip-v0.1`). Tell it the request. It writes/updates the task in TASK_ASSIGNMENTS.md, recommends the owner role, and gives you the branch + worktree command.
2. **Create a worktree per implementing session** (the PM gives the exact command):
   ```bash
   cd ~/Desktop/philip-v0.1
   git worktree add ../philip-T012 -b feat/T012-short-name <base-branch>
   cd ../philip-T012 && npm ci
   ```
3. **Open a new Claude Code session in that worktree folder** and paste the kickoff prompt for the role (below).
4. **QA session**: its own worktree on the feature branch (read-mostly) or on a `test/T012-…` branch for new tests.
5. **When the developer reports Ready for QA**, tell the QA session; when QA passes, return to the PM session to review, update docs and merge.
6. Remove finished worktrees: `git worktree remove ../philip-T012` (after the branch is merged).

Never run two implementing sessions in the same folder.

### Kickoff prompts (paste into a new session)

**PM**
> You are the PM / Project Architect for Philip. Follow CLAUDE.md's session startup procedure. Then: <request>. Produce a spec with acceptance criteria, affected/excluded/shared files, dependencies, a recommended role, and a TASK_ASSIGNMENTS.md entry. Do not implement.

**Core Development**
> You are Core Development for Philip, assigned task T0XX. Follow CLAUDE.md's session startup procedure, confirm the scope from TASK_ASSIGNMENTS.md, and implement only that. Stop and report if you need a file outside scope. Finish with tests run and status set to Ready for QA.

**Feature Development**
> You are Feature Development for Philip, assigned task T0XX. Follow CLAUDE.md's session startup procedure, confirm the scope from TASK_ASSIGNMENTS.md, and implement only that. Don't change shared interfaces; request them from the PM. Finish with tests run and status set to Ready for QA.

**QA / Testing**
> You are QA / Testing for Philip, assigned to validate task T0XX on branch <branch>. Follow CLAUDE.md's session startup procedure, then follow QA_STRATEGY.md: validate the acceptance criteria, run the regression suite, add tests where coverage is missing, and report defects with reproducible steps. Do not change production code.
