# QA strategy

Uses only the tools already in the project: **Vitest** (+ `fake-indexeddb`) for unit/integration, **Playwright** for e2e, **tsc** for type checking. Do not add testing frameworks (coverage tools, Testing Library, linters, visual-diff services) without justification, owner approval and a DECISIONS.md entry.

## Existing infrastructure

| Layer | Tool / location | Config |
|---|---|---|
| Unit + integration | Vitest, `src/**/*.test.ts` (Node environment, fake IndexedDB) | `vite.config.ts` → `test`; setup `src/test/setup.ts`; `src/test/helpers.ts` (`freshDb`) |
| Type check | `tsc -b` | `tsconfig*.json` |
| E2E | Playwright, `e2e/*.spec.ts`; helpers in `e2e/helpers.ts` (`fresh`, `openAdd`, `pickMeal`, `addManualFood`, `openTargets`, `setManualTargets`, `noHorizontalScroll`, `backToToday`, `markBackedUp`, `tab`, …) | `playwright.config.ts`: builds and serves `dist/` on :4173; projects `webkit-iphone` (iPhone 15) and `chromium-mobile` (375×812) |
| Screenshots | `e2e/screens.spec.ts` → `e2e/screenshots/` (git-ignored) | 375 / 393 / 440 px, 150% text |
| CI | `.github/workflows/deploy.yml` runs `npm test` + `npm run build` on push to `main` | E2E **not** in CI |

Gemini is always mocked in tests (`fetchImpl` in unit tests, `page.route` in e2e). No test needs a real key.

Current evidence (2026-11-02, `5f78cb4`): 176/176 unit tests (18 files), `tsc` clean. 52 Chromium e2e reported passing (not independently re-run). WebKit e2e never run.

## Commands

```bash
npm test                                         # unit + integration (Vitest)
npm run typecheck                                # tsc -b --noEmit
npm run build                                    # tsc -b && vite build (+ dist/sw.js)
npx playwright test --project=chromium-mobile    # e2e, Chromium mobile emulation
npx playwright test --project=webkit-iphone      # e2e, WebKit (primary target; Mac: `npx playwright install webkit` once)
npx playwright test e2e/photo.spec.ts --project=chromium-mobile   # one spec
npx vitest run src/lib/weight.test.ts            # one unit file
```

Environment note: `node_modules` must match the OS. On the Mac use Terminal or a Claude Code session on the Mac. A Linux sandbox needs its own clone and `npm ci`.

## Strategy by layer

- **Unit** — every pure function in `src/lib/**`, `services/foodAnalysis/{parse,gemini}`, `views/photo/reviewModel.ts`, and the QA module's repository/search/prompt logic. Required for any new or changed calculation, validation, parsing or rule. Safety rules (`targets.ts`) and backup validation have strong coverage; keep it that way.
- **Integration** — repo + Dexie through `fake-indexeddb`: CRUD, Undo paths, schema migrations (`src/db/migration.test.ts` — every version upgrade must keep every record), backup round-trips (old files still import).
- **E2E** — user journeys on the built app: logging (photo/text/manual/saved meals), review gate, edit/move/delete + Undo, date navigation, targets, weight, backup/restore/delete-all, offline launch, QA module. Mock Gemini via `page.route`.
- **Regression** — before Ready for QA → Completed, run the full unit suite, typecheck, build and the full Chromium e2e suite; on the Mac also WebKit. For a fix, add a test that fails without it where practical.
- **Real device (manual)** — the Stage 8 checklist in ROADMAP.md. Record date, iOS version and results in the task entry.

## Test naming conventions

- Unit files: `<module>.test.ts` next to the module. E2E: `e2e/<area>.spec.ts`.
- `describe` names the unit or story (`'Story 3: am I on track?'`); prefix with the task or observation ID when the test exists because of one (`'T012 …'`, `'OBS-3E7A73 …'`, `'F047E3 …'` as already used).
- `it`/`test` titles state the behaviour in plain English: `'stops at the goal weight and estimates the goal date'`.
- Reuse `e2e/helpers.ts`; add helpers there only via a shared-file change (PM).

## Acceptance criteria

Every task lists testable criteria in TASK_ASSIGNMENTS.md, written as observable behaviour:
`Given <state>, when <action>, then <result>` — including at least one negative/edge case (no key, empty input, offline, invalid data, past date) and any layout constraint (375–440 px, no horizontal scroll, ≥44 px targets).

## Defect report template

```
Task / branch:      T0XX on feat/T0XX-…  (commit abc1234)
Environment:        chromium-mobile | webkit-iphone | iPhone <model> iOS <ver> standalone
Steps:              1. … 2. … 3. …
Expected:           …
Actual:             …
Evidence:           failing test name / screenshot path / console output
Severity:           blocker | major | minor | cosmetic
```

## Definition of Done

A task may be marked **Completed** only when all of these hold (with evidence in the task entry):

- [ ] Implementation matches the approved spec; acceptance criteria satisfied.
- [ ] `npm test`, `npm run typecheck` and `npm run build` pass.
- [ ] Relevant e2e specs pass on `chromium-mobile`; WebKit run on the Mac, or the gap is explicitly recorded.
- [ ] Regression check of neighbouring flows done (full e2e suite for anything touching shared files).
- [ ] No unauthorized files modified (`git diff --stat <base>...HEAD` matches the task's allowed files).
- [ ] Conventions followed (CLAUDE.md, DEVELOPMENT_RULES.md, DESIGN_SYSTEM.md).
- [ ] Relevant docs updated.
- [ ] Reviewed by the PM (and QA, for non-trivial work).
- [ ] TASK_ASSIGNMENTS.md shows the final status.

If a test can't be run (no WebKit, no device, no live key), write that down. Never claim a feature is tested or complete without evidence.
