# Story 8: Efficiency (measure, budget, fix)

> Owner: Ryan. Written 2026-11-10 from `main` @ `c19a57d` (Story 7). Task **T-025**, decision **D-030**.
> Next: Story 9 (Philip's memory: a coach brief from the whole history). Story 9 must keep these budgets.

Owner ask (2026-11-09): check that Philip is built the most efficient way: small on the phone, fast, and light on battery, plus whatever else the industry measures. Agreed scope: **measure first, set budgets that fail CI, fix what the numbers show.**

## 1. Metrics

| Area | Metric | How it's measured | Where |
|---|---|---|---|
| Size | Initial JS / CSS (gzip) | `npm run size` after build | `scripts/size-budget.mjs` |
| Size | Largest lazy chunk (gzip) | same | same |
| Size | Precache total (raw, stored on the phone) | same | same |
| Size | Space used on the phone (cache + IndexedDB + QA screenshots) | `navigator.storage.estimate()` | Settings › Your data |
| Speed | Cold-start first contentful paint, 4× CPU slowdown | Playwright + CDP | `e2e/perf.spec.ts` |
| Battery (proxy) | CPU ms per idle second (script + style + layout), 4× CPU slowdown | CDP `Performance.getMetrics` over 10 s | `e2e/perf.spec.ts` |
| Battery (proxy) | Infinite animations running while idle | `document.getAnimations()` | `e2e/perf.spec.ts` |
| Battery (proxy) | Layouts per idle second | CDP | `e2e/perf.spec.ts` (printed) |

A web app can't read the iPhone's battery drain directly, so CPU time, animations and timer wake-ups while nothing happens are the proxies. Screen brightness and the network dominate real drain and are outside the app.

Also tracked (industry standard, not budgeted yet): INP (tap-to-update), CLS, JS error rate, offline reliability, backup round-trip integrity (already unit-tested), Gemini tokens per call (Story 9 budget).

## 2. Baseline and result

Chromium, Pixel-7 profile at 375 px, `vite preview`, numbers from `npm run size` and the `PERF` lines.

| Metric | Before (`c19a57d`) | After (T-025) | Budget |
|---|---|---|---|
| Initial JS (gzip, level 9) | 178.2 KB | **167.5 KB** (−6%) | ≤ 172 KB |
| Initial CSS (gzip) | 13.3 KB | 13.3 KB | ≤ 16 KB |
| Largest lazy chunk (gzip) | 20.4 KB | 20.4 KB | ≤ 30 KB |
| Precache total | 987 KB | 988 KB | ≤ 1,200 KB |
| Cold FCP (4× CPU) | ~0.75–1.2 s | ~0.7 s | < 2.5 s |
| Home idle CPU | 0 ms/s, 0 infinite animations | same | < 15 ms/s, 0 |
| Session idle with rest timer | **10.3 ms/s** | **2.8–3.1 ms/s** (−70%) | < 25 ms/s, 0 animations |

Of the 167.5 KB, React DOM (~55 KB gz) and Dexie (~25 KB gz) are a fixed floor; the app is lean already.

## 3. What changed

1. **Session clock (battery).** The whole live session (every exercise card) re-rendered every second for the entire workout. Now:
   - the rest countdown is its own `RestBar` with its own 1 s clock;
   - the session header ticks once a minute (it only shows whole minutes);
   - rest end and the 8 s Time's-up banner use one-shot timers (`useAt`) instead of polling;
   - every clock stops while the page is hidden and catches up when it shows again.
   Behaviour is unchanged (Story 6 §8.1 e2e still pass, including "Time's up x s ago").
2. **Gemini code loads on use.** Typed-food analysis imported the whole Gemini service into the first screen. It's now a dynamic import (it needs the network anyway).
3. **Backup code off the first screen.** The Meal log's backup reminder only needs the file name; `backupFileName` moved to `lib/backupName.ts` (re-exported from `lib/backup.ts`), so the 30 KB backup/restore code loads with Settings.
4. **Budgets in CI.** `npm run size` runs in the deploy workflow after the build and fails the deploy when a budget is exceeded. `e2e/perf.spec.ts` (Chromium only) fails on idle-CPU or animation regressions.
5. **Storage readout.** Settings › Your data shows "Space used on this device: X MB (app, data and QA screenshots)".

Kept eager on purpose: the log sheet, review sheet and tutorial stay in the first bundle, because lazy chunks can miss the SW cache offline until T-006 (`ignoreVary`) lands.

## 4. Not done (candidates, in order of value)

- **Split `en.ts`** (65 KB raw, ~18 KB gz, all on the first screen). Biggest remaining app-code item; needs a per-screen string loader and touches every view. Worth it only if the initial JS budget gets tight.
- **Memoize `ExerciseCard`** with stable callbacks: the session now re-renders once a minute and on edits, so the gain is small.
- **QA module Gemini provider lazy** (~4 KB raw): portable-module change, low value.
- **INP measurement** on the set tick, once a real-iPhone pass (T-003) exists.

## 5. Real-iPhone check (owner, optional)

Safari on the Mac › Develop › your iPhone › Philip › Timelines: record 30 s on Home and 30 s in a session with a rest running. Expect almost no JavaScript between the 1 s rest ticks and nothing on Home. iPhone Settings › Battery shows Philip's share after a gym day.

## 6. Acceptance criteria

1. `npm run size` passes with the budgets above and runs in `deploy.yml`.
2. `e2e/perf.spec.ts` passes on chromium-mobile and prints `PERF` lines.
3. The session's per-second work is limited to the rest bar; the rest banner, beep and push alert behave as in Story 6 (existing e2e green).
4. Settings shows the space used when the browser reports it, and nothing when it doesn't.
5. `npm test`, `npm run typecheck`, `npm run build`, full Chromium e2e pass; WebKit on the Mac.
