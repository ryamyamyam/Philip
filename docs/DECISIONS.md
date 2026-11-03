# Decision log

Significant product and architectural decisions. Never silently reverse one: propose a new entry that supersedes it, get the owner's approval, and mark the old entry "Superseded by D-0XX".

Backfilled entries (D-001 – D-015) were reconstructed on 2026-11-02 from the repository (code, CLAUDE.md, ARCHITECTURE.md, commit history). Their dates are the commit in which they first appear; alternatives were not recorded at the time and are marked as such.

Format: **Decision · Reason · Alternatives · Consequences · Date · Decided by · Status**

---

### D-001 — No backend, zero added cost
- **Decision:** Static client-only PWA on GitHub Pages; no server, accounts, paid hosting, APIs or services.
- **Reason:** Personal single-user app; owner requirement of zero cost beyond Claude access.
- **Alternatives:** Not recorded.
- **Consequences:** All data on one device; no sync; backups are manual JSON files; any AI must be free-tier and client-side.
- **Date:** 2026-10-29 · **By:** Ryan (owner) · **Status:** Accepted

### D-002 — IndexedDB via Dexie, reactive reads with `useLiveQuery`
- **Decision:** Persist everything in IndexedDB (`philip` DB) through Dexie 4; UI reads with live queries; writes through `src/db/repo.ts`.
- **Reason:** Local-first storage with migrations and reactivity without a state library.
- **Alternatives:** Not recorded.
- **Consequences:** Schema changes need Dexie versions + upgrades; no in-memory cache layer.
- **Date:** 2026-10-29 · **By:** Initial build · **Status:** Accepted

### D-003 — Minimal dependencies
- **Decision:** Runtime deps limited to `react`, `react-dom`, `dexie`, `dexie-react-hooks`. No router, state, UI, chart or HTTP libraries; hand-rolled SW plugin instead of a PWA plugin.
- **Reason:** Keep the app small and maintainable.
- **Alternatives:** PWA plugin (rejected per `vite.config.ts` comment); others not recorded.
- **Consequences:** Hash routing, SVG charts and the SW are maintained in-house. New dependencies need owner approval.
- **Date:** 2026-10-29 · **By:** Initial build · **Status:** Accepted

### D-004 — Hash-based routing
- **Decision:** `#/<route>` routing in `src/hooks/useRoute.ts`.
- **Reason:** Works on GitHub Pages without server rewrites.
- **Alternatives:** Not recorded.
- **Consequences:** Sheets and selected date are not in the URL; old routes are redirected with `replaceState`.
- **Date:** 2026-10-29 · **By:** Initial build · **Status:** Accepted

### D-005 — Gemini optional, client-side, user's own free-tier key
- **Decision:** AI estimates via Gemini REST from the browser with a key stored in IndexedDB; only `services/foodAnalysis/gemini.ts` knows Gemini; the app must be fully usable without a key.
- **Reason:** Zero cost; no backend to hide a key.
- **Alternatives:** Claude handoff (kept as a copy/paste fallback; Philip never calls Claude itself).
- **Consequences:** Key readable on the device (documented); default model `gemini-3.1-flash-lite` must be verified and may age.
- **Date:** 2026-10-29 · **By:** Ryan (owner) · **Status:** Accepted

### D-006 — Mandatory review before saving AI results
- **Decision:** Every AI result passes `validateAnalysis` and the Review sheet before anything is saved.
- **Reason:** AI estimates are untrusted and approximate.
- **Alternatives:** Not recorded.
- **Consequences:** No one-tap AI logging; all AI paths converge on `ReviewSheet`.
- **Date:** 2026-10-29 · **By:** Ryan (owner) · **Status:** Accepted

### D-007 — Local dates, metric storage, computed totals, append-only target plans
- **Decision:** Dates are local `YYYY-MM-DD`; nutrition stored in g/kcal; daily totals computed, never stored; target changes append a new plan (`planForDate`).
- **Reason:** Correct day boundaries; history keeps its old targets.
- **Alternatives:** Not recorded.
- **Consequences:** Never use `toISOString()` for dates; plans are never edited in place.
- **Date:** 2026-10-29 · **By:** Initial build · **Status:** Accepted

### D-008 — Safety rules in the target calculator are owner-controlled
- **Decision:** `lib/targets.ts` safety limits (rate caps, calorie floor/ceiling, BMI, adults only, review codes) change only with owner approval.
- **Reason:** Avoid unsafe targets; reviewed by a separate Opus pass in Stage 3.
- **Alternatives:** —
- **Consequences:** Any calculator change touching these needs explicit approval and tests.
- **Date:** 2026-10-29 · **By:** Ryan (owner) · **Status:** Accepted

### D-009 — QA & Feedback as a portable, isolated module
- **Decision:** `src/modules/qa-feedback/` imports nothing from Philip, has its own DB (`qa-feedback`), strings and `qa-` CSS; wiring only in `src/qaFeedback.config.ts`.
- **Reason:** Reuse in Ryan's future apps.
- **Alternatives:** —
- **Consequences:** Two Gemini adapters and two toast systems exist intentionally; QA data is not in backups.
- **Date:** 2026-10-29 · **By:** Ryan (owner) · **Status:** Accepted

### D-010 — WebKit is the primary e2e target
- **Decision:** Playwright `webkit-iphone` is the primary project; `chromium-mobile` exists for environments without WebKit.
- **Reason:** Closest to iPhone Safari.
- **Alternatives:** —
- **Consequences:** Sandboxes that can't install WebKit leave a verification gap that must be closed on the Mac.
- **Date:** 2026-10-29 · **By:** Initial build · **Status:** Accepted

### D-011 — `.npmrc` `legacy-peer-deps=true`
- **Decision:** Keep legacy peer resolution.
- **Reason:** Works around an npm peer-resolution bug (README).
- **Alternatives:** Not recorded.
- **Consequences:** Peer conflicts aren't flagged by npm; review dependency changes manually.
- **Date:** 2026-10-29 · **By:** Initial build · **Status:** Accepted

### D-012 — New backup fields are optional; `schemaVersion` stays 1
- **Decision:** `weightEntries`, `profile.bodyFatPct` (round 2) and `savedMeals` (Story 3) were added as optional backup fields without bumping `schemaVersion`. Bumping requires owner approval; future versions must migrate in `parseBackup`, not reject.
- **Reason:** Old backups keep importing; old builds ignore new fields.
- **Alternatives:** Bump `schemaVersion` (rejected).
- **Consequences:** Validators must treat new fields as optional.
- **Date:** 2026-11-02 · **By:** Ryan (owner) · **Status:** Accepted (on unmerged branches)

### D-013 — Philip's voice in UI copy, plain text for safety
- **Decision:** UI copy uses a bossy, sassy coach voice; errors, data loss, delete/replace, safety and backup text stays plain; never comment on body, weight or appearance.
- **Reason:** Owner preference.
- **Alternatives:** —
- **Consequences:** All copy lives in `en.ts`; reviewers check tone.
- **Date:** 2026-11-02 · **By:** Ryan (owner) · **Status:** Accepted (on unmerged branches)

### D-014 — Navigation: 3 tabs (Today · Progress · Settings)
- **Decision:** Story 3 replaces round 2's 4 tabs (Today · Meals · Progress · Settings). Meals folded into Today; Targets moved to Settings › `#/targets`; `#/meals`, `#/history` → Today.
- **Reason:** Simplify around the daily logging workflow (Story 3).
- **Alternatives:** Round 2's 4-tab layout (supersedes it); round 1's Today · History · + · Targets · Settings.
- **Consequences:** Logging starts on Today; Progress is weight-only.
- **Date:** 2026-11-02 · **By:** Ryan (owner), implemented in Story 3 · **Status:** ❓ Implemented on `story-3-simplify`, confirm at merge

### D-015 — Today may scroll
- **Decision:** Today scrolls when many foods are logged; the card and the Take photo / Log food buttons must stay above the fold at 393×793. Replaces the earlier "Today and Meals fit 393×793 without scrolling" rule.
- **Reason:** Meals folded into Today (D-014).
- **Alternatives:** Keep no-scroll by capping visible foods.
- **Consequences:** e2e asserts above-the-fold actions instead of no-scroll.
- **Date:** 2026-11-02 · **By:** Story 3 session · **Status:** ❓ Proposed — awaiting owner confirmation

### D-016 — Development operating system
- **Decision:** Adopt the four-role model (PM, Core, Feature, QA), the task registry, worktree-per-session parallel development, and the docs set referenced from CLAUDE.md.
- **Reason:** Safe parallel development with multiple Claude Code sessions.
- **Alternatives:** Single-session development (still allowed for small changes via the simplified process).
- **Consequences:** Every session follows CLAUDE.md's startup procedure; shared files are coordinated by the PM.
- **Date:** 2026-11-02 · **By:** Ryan (owner) request; drafted by PM session · **Status:** ❓ Proposed — awaiting owner review
