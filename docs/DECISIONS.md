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
- **Date:** 2026-11-02 · **By:** Ryan (owner), implemented in Story 3 · **Status:** Accepted — shipped to `main` by the owner (2026-11-03)

### D-015 — Today may scroll
- **Decision:** Today scrolls when many foods are logged; the card and the log buttons (now Take photo / Choose photo / Enter yourself, D-017) must stay above the fold at 393×793. Replaces the earlier "Today and Meals fit 393×793 without scrolling" rule.
- **Reason:** Meals folded into Today (D-014).
- **Alternatives:** Keep no-scroll by capping visible foods.
- **Consequences:** e2e asserts above-the-fold actions instead of no-scroll.
- **Date:** 2026-11-02 · **By:** Story 3 session · **Status:** Accepted — owner confirmed 2026-11-03

### D-016 — Development operating system
- **Decision:** Adopt the four-role model (PM, Core, Feature, QA), the task registry, worktree-per-session parallel development, and the docs set referenced from CLAUDE.md.
- **Reason:** Safe parallel development with multiple Claude Code sessions.
- **Alternatives:** Single-session development (still allowed for small changes via the simplified process).
- **Consequences:** Every session follows CLAUDE.md's startup procedure; shared files are coordinated by the PM.
- **Date:** 2026-11-02 · **By:** Ryan (owner) request; drafted by PM session · **Status:** Shipped to `main` with the docs (2026-11-03); explicit owner review ❓

### D-017 — Today log buttons: Take photo · Choose photo · Enter yourself
- **Decision:** Remove the Log food button. Today shows three buttons; Enter yourself toggles an inline panel (text box, saved meals, Type the numbers) instead of opening a sheet. The by-hand entry button is renamed “Type the numbers”.
- **Reason:** Owner feedback (2026-11-02): fewer taps, typing box only when asked for.
- **Alternatives:** Keep the Log food sheet.
- **Consequences:** `AddPanel` shared by Today and the Add food sheet; e2e `openAdd()` opens the inline panel.
- **Date:** 2026-11-02 · **By:** Ryan (owner) · **Status:** Accepted — shipped (`0cdd351`); Take photo removed by D-022

### D-018 — Units switch and 1-month target on the Targets page
- **Decision:** A metric ⇄ imperial switch lives in the calculator (still also in Settings › Units); switching converts typed values. Lose/Gain shows a 1-month target weight at the default safe pace with a “Use it” button. `SAFETY` is unchanged.
- **Reason:** Owner feedback (2026-11-02).
- **Alternatives:** Units only in Settings; free-form target weight only.
- **Consequences:** Suggestion uses `resolveRate()`; no new safety rules.
- **Date:** 2026-11-02 · **By:** Ryan (owner) · **Status:** Accepted — shipped (`0cdd351`)

### D-019 — Gemini 3+ uses the default temperature
- **Decision:** Omit `temperature` for Gemini 3 and later; keep 0.2 for older models. Suggestions retry once on an unreadable reply; errors show the raw message.
- **Reason:** Google advises keeping Gemini 3 at the default temperature; low values can make replies loop and get cut off. Owner reported “What should I eat?” not working.
- **Alternatives:** Keep 0.2 everywhere.
- **Consequences:** Gemini 3 numbers may vary a little more between calls; the review step still applies (D-006). Root cause of the owner's failure unconfirmed until live-key test (T-004).
- **Date:** 2026-11-02 · **By:** Owner feedback round session · **Status:** Accepted — shipped (`0cdd351`)

### D-020 — Voice: dominant, campy coach; fewer words, more emoji
- **Decision:** Philip's coaching copy is a dominant, campy, bossy gay coach: short commands, pet names (“sweetie”, “darling”, “good boy”), and an emoji where it replaces a phrase. Meal and macro labels get decorative, `aria-hidden` emoji. Errors, data loss, delete/replace, safety warnings and backup text stay plain. Never comment on body, weight or appearance; no sexual content.
- **Reason:** Owner feedback (2026-11-02); owner asked on 2026-11-03 to ship the proposed samples in the next update.
- **Alternatives:** The earlier dry, bossy voice (D-013 — this refines it).
- **Consequences:** Reviewers check tone and that emoji never carry meaning alone.
- **Date:** 2026-11-03 · **By:** Ryan (owner) · **Status:** Accepted — emoji-in-copy part superseded by D-023

### D-021 — QA capture simplified; manual archive; one project in the UI
- **Decision:** Remove the project picker, Feature or screen, Structure with AI and More details from the QA capture flow; the panel always uses the host app's project. Add manual archive (detail, inbox selection, prompt builder) that keeps prompts and `promptIds`. Inbox count = active items only. PFC targets can be entered as grams or as % of calories; grams stay the saved values (no schema change).
- **Reason:** Owner QA observations OBS-A09A21, OBS-97D767, OBS-E49D0F (2026-11-03).
- **Alternatives:** Keep the fields behind a disclosure; store a ratio on `TargetPlan` (rejected: schema/backup change for no gain, since grams can be derived).
- **Consequences:** Projects created earlier stay in the `qa-feedback` database but are hidden. No Dexie or backup changes. Detail-screen editing and AI analysis are unchanged.
- **Date:** 2026-11-03 · **By:** Ryan (owner) request · **Status:** Implemented on `qa-obs-nov3` (not merged)

### D-022 — Handheld-RPG design system (T-009)
- **Decision:** Replace the orange-and-white look with an original design system inspired by DS-era handheld monster-RPG interfaces: top display zone + dark bottom control deck; HP-style meters (ceilings drain green→yellow→red, minimums fill blue→green); chamfered buttons with one slate face for every button; category chips (8-color palette); info panels with a dark «header» bar; angled name plate; Philip's dialog bar; pixel-art ambient scenes; a self-hosted OFL pixel font for all text (15px floor) and a 12×12 pixel icon set. Today shows one photo button (no `capture`: iOS offers camera or library), "N left" with eaten/target beside the meter, no goal chip, adherence in the panel header, "What do I eat?" inside the dialog bar. Spec: docs/DESIGN_SYSTEM.md.
- **Reason:** Owner request and feedback rounds (2026-11-03/04).
- **Alternatives:** Keep the minimal orange look; flat-vector scenes (replaced by pixel art on owner feedback); system font for body text (replaced on owner feedback).
- **Consequences:** Supersedes the visual part of the earlier DESIGN_SYSTEM.md and the three-button part of D-017. Visual layer only: no data, storage, AI or QA-module logic changed; no dependencies. Macro color tokens keep their names with new values. The QA module is themed only through `--qa-*` variables (`src/styles/qa-theme.css`). Copy changes: short labels appended to `en.ts`; e2e assertions updated for the new copy and layout.
- **Date:** 2026-11-04 · **By:** Ryan (owner) · **Status:** Accepted (on `feat/T-009-design-system`)

### D-023 — No emoji in copy (guardrail)
- **Decision:** No string in `src/i18n/en.ts` contains emoji: sentences in text boxes (Philip's dialog bar, toasts, banners, hints, status lines) and button labels are words only. Words that an emoji replaced were written out (“📸 your next plate” → “Snap your next plate”). Decorative meal/macro emoji stay only on markup chips, `aria-hidden`.
- **Reason:** Owner feedback (2026-11-03) during the T-009 redesign: emoji clash with the pixel style; owner asked to keep this as a guardrail.
- **Alternatives:** Keep D-020's emoji-in-copy (superseded in that part).
- **Consequences:** Supersedes the emoji part of D-020 (voice otherwise unchanged). Enforced by `src/i18n/en.test.ts`. e2e assertions updated.
- **Date:** 2026-11-03 · **By:** Ryan (owner) · **Status:** Accepted (on `feat/T-009-design-system`)

### D-024 — Philip's guided tour and gym-trainer character (T-010)
- **Decision:** First-run tour in the style of a DS-era handheld game, run over the real Today screen: dim layer plus spotlight on `data-tour` anchors, a bottom dialog box in the DialogBar look with Philip at 2×, typewriter text (~30 ms a character, longer after punctuation; first tap completes the line, next tap advances), game-style choices (Set targets / Later), Skip and Escape, focus trap, and an `aria-live` region that announces each full line once. Steps are data (`lib/tutorial.ts`, `stepsFor({hasTarget, hasKey})`). Shown once for everyone, existing installs included, until `META.tutorialSeenAt` is set by finishing or skipping; Settings › Help › Replay tutorial clears it. Philip is drawn from 11 owner-supplied pose images (pixel art of a gym trainer based on the owner's own look), reduced to a 4× pixel grid with a shared palette and packed into one atlas (`src/assets/character/philip-poses.png`); `lib/character.ts` maps tour lines and Today moods (`COACH_POSE`) to poses, and Today's dialog bar shows his head and shoulders.
- **Reason:** Owner request (Story 4, 2026-11-04): first-time users don't know what anything does; the coach should explain it in his own voice.
- **Alternatives:** Static intro cards; a hand-drawn 32×40 SVG portrait and a 3D-rendered sprite (both rejected by the owner on review).
- **Consequences:** One new `META` key, no Dexie version or backup change. "Delete all data" clears the flag, so the tour starts again after it; a restore (Merge or Replace) keeps it. The tour never blocks logging: it closes when a sheet opens and only changes data through the flag and the optional navigate-to-targets. Pixelify's "fi" ligature draws as "A", so ligatures are off inside the tour. Known art gaps: outfits vary between poses as generated, and there are no mouth frames (he bobs while text types). e2e: `fresh()` skips the tour unless `{ tour: true }`.
- **Date:** 2026-11-05 · **By:** Ryan (owner) · **Status:** Implemented on `feat/T-010-tutorial`

### D-025 — Workouts engine: orders vs actuals, block rotation, 45-minute sessions (Story 5, T-012)
- **Decision:** Philip prescribes training; the owner logs what he did. 4 days a week (squat, bench, **Romanian deadlift** — the owner doesn't do conventional or sumo deadlifts — and overhead press), 4-week cycles (3 build weeks + deload) from a training max (TM = 90% of 1RM). Cycles rotate blocks A Wave (5/3/1-style) → B Volume → C Heavy (top set + back-offs) → D Control (paused/tempo variants), and every accessory slot changes exercise each cycle (Appendix A menu: Philip's pick + 2 approved swaps). One phase (`profile.goal`) drives calories and training: TM increments per cycle, accessory sets (cut: slot B 2 sets; bulk: +1 A1/A2 round when it fits). RDL caps: ≥3 reps, ≥2 reps in reserve, no singles. Every generated session estimates ≤45 min (cardio excluded) with a fixed trim order. Orders are frozen on the stored session; the log (`actual`) is user input only. Barbell orders are rounded to loadable weights for the owner's bar and plates (20 kg bar + lb plates by default). Before each cycle a goal briefing proposes phase and end-of-cycle weight/BF (lean bulk default +0.3%/wk); the owner can set his own, checked by the safety rules (BF target refused below 10%, warning below 12%).
- **Reason:** Owner request and answers (2026-11-05). Spec: `docs/stories/STORY_5_WORKOUTS.md`.
- **Alternatives:** RPE-autoregulated or linear progression; user-editable accessories (owner: accessories are Philip's prescription).
- **Consequences:** Dexie v4 (new tables `trainingProgram`, `tmHistory` append-only, `cycles`, `workoutSessions`, `slotChoices`; `profile.targetBodyFatPct`). Backup gains an optional `training` block; `schemaVersion` stays 1. `BODY_FAT_TARGET` added to `lib/targets.ts` (owner-approved). Engine lives in `src/lib/training/*` (pure, tested). The numbers (increments, set changes, block order, goal rates) are coaching defaults in constant tables.
- **Date:** 2026-11-05 · **By:** Ryan (owner) · **Status:** Engine implemented on `feat/T-012-training-engine` (UI: T-011, T-013, T-014)
