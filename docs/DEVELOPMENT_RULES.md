# Development rules

**MUST** = mandatory. **MUST NOT** = prohibited. These complement the conventions in CLAUDE.md (which still apply in full).

## 1. File ownership

- MUST only modify files listed in your task's "Allowed files" (TASK_ASSIGNMENTS.md). Need another file → stop and ask the PM; the PM updates the task.
- MUST NOT modify files in another active task's scope without PM authorization.
- MUST NOT assume a file is safe to modify because it isn't open in your editor or because it's in a different directory.
- MUST NOT overwrite, revert or "clean up" another developer's work, even if it looks wrong — report it.
- Default ownership zones (a task can override):

| Zone | Default owner |
|---|---|
| `src/App.tsx`, `src/main.tsx`, `src/ui.tsx`, `src/hooks/**`, `src/db/**`, `src/lib/**`, `src/services/**`, `src/i18n/index.ts`, `src/sw-template.js`, `vite.config.ts`, `src/styles/tokens.css`, `src/styles/global.css` | Core |
| `src/views/**` (screens and sheets), feature components, `src/styles/today.css`, `src/styles/views.css` | Feature (per task) |
| `src/modules/qa-feedback/**`, `src/qaFeedback.config.ts` | Whoever the task names (module is portable — see CLAUDE.md) |
| `**/*.test.ts`, `src/test/**`, `e2e/**`, `playwright.config.ts` | QA (developers add/adjust tests for their own changes) |
| `docs/**`, `CLAUDE.md`, `README.md` | PM |

## 2. Shared files (PM approval and coordination required)

Only one active task may modify each of these at a time unless the PM explicitly coordinates (e.g. "T012 adds keys under `today.*`, T013 under `progress.*`"):

- Entry & shell: `src/main.tsx`, `src/App.tsx`, `src/ui.tsx` (`SheetState`), `src/views/SheetHost.tsx`
- Routing: `src/hooks/useRoute.ts`, `src/components/TabBar.tsx`
- Data: `src/db/types.ts`, `src/db/db.ts` (Dexie versions), `src/db/repo.ts`, `src/hooks/useData.ts`, `src/lib/backup.ts`
- Safety: `src/lib/targets.ts` (**owner approval** for safety rules)
- AI boundary: `src/services/foodAnalysis/{index,types,parse,prompt}.ts`
- Strings: `src/i18n/en.ts` (append-only within the task's key prefix; never rename/remove keys used elsewhere without PM approval)
- Global styles: `src/styles/tokens.css`, `src/styles/global.css`
- Build & config: `package.json`, `package-lock.json`, `.npmrc`, `vite.config.ts`, `tsconfig*.json`, `playwright.config.ts`, `src/sw-template.js`, `public/manifest.webmanifest`, `.github/workflows/**`
- Test helpers: `e2e/helpers.ts`, `src/test/**`
- QA module wiring: `src/qaFeedback.config.ts`
- Docs: `CLAUDE.md`, `docs/**`

## 3. Interfaces and contracts

- MUST NOT silently change a shared interface: `repo.ts` signatures, `db/types.ts` types, `SheetState`, `Tab`/`TABS`, `AnalysisResult`/`AnalysisError`, `QaFeedbackConfig`, backup JSON shape, CSS tokens.
- Changing one requires a task that says so, PM review, and (if architectural) a DECISIONS.md entry. Prefer additive changes (new optional field, new function) over changing existing ones.

## 4. Code style

- TypeScript strict; no `any`; no `@ts-ignore`/`@ts-expect-error` to hide errors; no non-null assertions to dodge real nullability.
- Function components + hooks; small components; named exports (lazy-loaded screens use default exports, as today).
- Follow the existing file's formatting (2-space indent, single quotes, semicolons, trailing commas). No linter/formatter is configured — don't add one without approval, and don't reformat untouched code.
- Comments explain *why*, not *what*. Keep existing comments that document decisions.

## 5. Component organization

- Screens: `src/views/<Name>View.tsx` (or `<Name>Page.tsx` for sub-pages). Sheets: `src/views/<Name>Sheet.tsx`, rendered only via `SheetHost`.
- Reusable UI: `src/components/`. Feature-only pieces stay next to the feature (e.g. `src/views/photo/`).
- Pure logic: `src/lib/<topic>.ts` with a sibling `<topic>.test.ts`. No React or DOM in `lib` (except `pwa.ts`).
- New screens that aren't needed at startup should be lazy-loaded like Progress/Settings — mind the SW `Vary` caveat (CLAUDE.md known issues).

## 6. CSS conventions

- Use tokens (`var(--color-*)`, `--space-*`, `--text-*`, radii, shadows). No raw hex values or ad-hoc font sizes in components.
- Shared classes live in `global.css`; Today styles in `today.css`; other screens in `views.css` or a new feature CSS file imported from `main.tsx` (shared-file change → PM).
- QA module: `qa-` classes only, in its own CSS.
- Follow DESIGN_SYSTEM.md: ≥44px targets, labels wrap, ≥16px inputs, safe-area insets, no horizontal scroll 375–440px, `prefers-reduced-motion`.

## 7. Data handling

- All persistent reads/writes via `repo.ts` / `useData.ts`.
- Schema changes: new Dexie version + `upgrade` if records change; never edit a released version; add a test to `src/db/migration.test.ts` showing every existing record is kept.
- New persisted data MUST be added to backups (export, validate, merge, replace) as optional fields; `schemaVersion` stays 1 unless the owner approves.
- Dates as local `YMD`; metric storage; totals computed; plans append-only; logging a saved food/meal copies values.
- MUST NOT hardcode or seed the owner's body stats or any personal data. Test data lives only in tests.

## 8. Error handling

- Use typed errors (`AnalysisError`, `BackupError`, module `QaError`/`AiError`); map them to user-facing text through `t()`.
- Surface errors as banners, field errors or toasts — never swallow them silently and never `alert()`.
- AI failures MUST never block saving: manual entry and local parsing stay available.
- Error, data-loss and safety copy is plain (no sass).

## 9. Security & privacy

- Never commit API keys, `.env` files or personal data. The Gemini key stays in IndexedDB; sent only as the `x-goog-api-key` header to `generativelanguage.googleapis.com`.
- AI output is untrusted: validate (`validateAnalysis`) and show the Review sheet before saving.
- User text sent to AI is fenced as data in prompts.
- Photos are never stored.
- No new network destinations without a DECISIONS.md entry.

## 10. Testing

- Every change runs `npm test` and `npm run typecheck`; UI changes also run the related e2e spec (QA_STRATEGY.md).
- New `lib` logic gets unit tests; new user flows get e2e coverage; bug fixes get a regression test where practical.
- Never claim tests passed without running them; report exactly what was and wasn't run.

## 11. Dependency management

- MUST NOT add, remove or upgrade dependencies without owner approval and a DECISIONS.md entry. The runtime has 4 dependencies by design.
- Use `npm ci` for installs; don't regenerate `package-lock.json` incidentally.

## 12. Documentation

- Update ARCHITECTURE.md for structural/data changes, CLAUDE.md "Known issues" for new caveats, PROJECT_CONTEXT.md/ROADMAP.md for status, DECISIONS.md for decisions, TASK_ASSIGNMENTS.md for every status change.
- Developers propose doc edits in their task summary; the PM applies or approves them.

## 13. Git usage

- Before starting: `git status` (clean or only your own changes), `git branch --show-current`, `git worktree list`.
- Branch names: `feat/T0XX-short-name`, `fix/T0XX-…`, `test/T0XX-…`, `docs/…`, `chore/T0XX-…`. Base: the branch named in the task (currently `story-3-simplify` until M1 merges; then `main`).
- One task per branch; one implementing session per worktree. Do not share a working directory between sessions.
- Review your diff before committing (`git diff`, `git diff --stat`); stage specific files (`git add <paths>`), not `git add -A`, so stray files (`Claude outputs/`, screenshots) aren't committed.
- Commit messages: imperative summary with the task ID, e.g. `T012: add weight history list`.
- Before significant changes, make sure existing work is committed (or ask the owner how to preserve it).
- Merging: only the PM integrates, one branch at a time, re-running tests after each merge. Merges to `main` deploy to production and need Ryan's approval. Pushing needs Ryan's approval.
- Merge conflicts: the developer stops and reports; the PM resolves (or assigns). Never resolve a conflict by discarding the other side wholesale.
- Recovery: prefer non-destructive tools — `git revert`, a new fix commit, `git stash push -m "<why>"` (and tell the user), `git worktree add` to inspect an older commit, `git reflog` to find lost commits.
- MUST NOT without explicit authorization: `git reset --hard`, `git clean`, `git checkout -- <file>`/`git restore` on others' changes, `git push --force`, branch deletion, history rewriting (`rebase` of shared branches, `commit --amend` of pushed commits), deleting worktrees with uncommitted changes.
- MUST NOT discard uncommitted user changes, ever.

## 14. Architectural changes

- Anything that changes a boundary in ARCHITECTURE.md "Boundaries and integration points", adds infrastructure, a dependency, a network destination, a persisted table, or reverses a decision → PM review + DECISIONS.md entry + owner approval where CLAUDE.md requires it.
- No unrelated refactoring during feature work. Note it as a follow-up instead.

## 15. Handling uncertainty

- If something can't be verified from the repo, say so and label it unknown — don't invent it.
- If requirements conflict (docs vs code, two docs, request vs a decision), stop and ask; the code is the source of truth for *current* behaviour, the owner for *intended* behaviour.
- Ask one focused question at a time. Don't start significant work until scope and ownership are clear.

## 16. Parallel development checklist (before starting)

- [ ] My task is Approved/In progress in TASK_ASSIGNMENTS.md, and I'm the assigned role.
- [ ] I'm in my own worktree on the task branch.
- [ ] None of my allowed files is in another active task's scope (or the PM has coordinated it).
- [ ] I know which interfaces I must not change.
- [ ] I know which tests I must run.
