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
- **Owner changes during build (2026-11-05):** Home opens the app (no photo shortcut; empty space under the cards stays for future features). Weigh-ins are voluntary, about twice a week: the briefing uses the 7-day average when there are 2+ weigh-ins, else the latest weigh-in from 14 days, else the Targets weight, and says which. Swaps are picked during the day check before starting (tap an accessory) or in Settings › Training › Exercise menu; there is no equipment-availability list. The plan shows weights in the plate unit; the session shows kg and lb.
- **Date:** 2026-11-05 · **By:** Ryan (owner) · **Status:** Implemented across `feat/T-012-training-engine`, `feat/T-011-home`, `feat/T-013-session`, `feat/T-014-plan`, `feat/T-015-qa` (stacked; not merged)

### D-026 — Owner feedback round (Nov 5): finer pixel font, tour that can't be lost, clearer Targets
- **Decision:** (1) App font switches from Pixelify Sans + Silkscreen digits to **Jersey 15** (OFL), a pixel font on a ~1.5× finer grid, `size-adjust: 112%`, one weight, no synthesized bold. (2) Philip's tour: hold the screen to type at 2×; Skip and Escape ask first ("Keep going" / "Skip tour"); the current step is saved in `META.tutorialStep`, so "Set targets" pauses the tour and it resumes at the next line back on Home or the Meal log (also after a reload). (3) Static dialog bars no longer show the blinking ▼ caret (it read as "tap to continue"); only the tour does. (4) Targets page renamed **Daily nutrition targets** with one-line explainers under Calculator and Manual; both forms stay mounted so switching tabs never clears typed values. (5) The day check shows the main lift's 4 weeks plus next cycle's week 1 (`liftOutlook`).
- **Reason:** Owner testing feedback, 2026-11-05.
- **Consequences:** D-022's font choice is superseded for the family (tokens, sizes and the 15px floor unchanged). One new `META` key. Copy: `targets.pageTitle`, `settings.targetsOpen`, new `tutorial.*`, `outlook.*`, `targets.*Intro`.
- **Date:** 2026-11-05 · **By:** Ryan (owner) · **Status:** Implemented on `feat/T-016-owner-feedback`

### D-027 — Mid-workout check-in, end-of-day review, Workout opens on a calendar
- **Decision:** (1) Each work set has "Tell Philip": flags (out of breath, too heavy, too easy, pain) and an optional note (≤400 chars). Rules: too heavy → sets left 10% lighter; out of breath → +60 s rest and one set fewer (never the last set); too easy → accessories 5% heavier, main lift unchanged (push the + set); pain → the existing Hurts stop. A note is also sent to Gemini when a key is set; its reply is clamped (load −25%…+10%, rest 0–120 s, drop ≤2 sets) and any error falls back to the rules. Nothing changes without the owner's OK; the original orders are kept on the session (`originalPrescription`). (2) After Finish, Philip's review proposes changes for the rest of the cycle: main lift flagged heavy/out of breath or a missed key set → TM ×0.95 (append-only TM row, reason `adjust`); any out-of-breath flag → +30 s rest on work sets (`cycle.restBonusSec`, capped at 90 s). Each change has a checkbox; "OK, apply" or "Not now". (3) Workout opens on a month calendar with today selected; days show trained/started/skipped; a past day shows its read-only log with flags and notes; today's button opens the session ("Next workout" if a workout is already done today).
- **Reason:** Owner request, 2026-11-05 (answers: "Also read my free text (Gemini)", "Today + review at the end").
- **Consequences:** New optional fields only (`ActualSet.flag/note`, `SessionExercise.originalPrescription`, `WorkoutSession.reviewed`, `CycleRecord.restBonusSec`, `TmReason` `adjust`); no Dexie version bump, backup `schemaVersion` stays 1. Orders still change only through a swap or an owner-approved check-in. Safety text for pain stays plain. Sessions are dated by the day they were started.
- **Date:** 2026-11-05 · **By:** Ryan (owner) · **Status:** Implemented on `feat/T-017-checkin-calendar`

### D-028 — Story 6: one workout a day, projected training calendar, delete with undo, starting weights, mid-workout swaps, rest alerts
- **Decision:**
  1. **One workout a day.** A `done` session dated today (its start date) blocks starting another until tomorrow; a skipped one doesn't. `workoutCardState(…, today)` has a `doneToday` state; Home and the calendar say "Done today" and name the next planned date. The cycle briefing may still open on a done day.
  2. **Projected calendar, never stored.** `lib/training/schedule.ts` maps the rest of the cycle onto training weekdays (Philip's pick Mon/Tue/Thu/Fri, a coaching default; the owner can pick any 4 in Settings › Training › Training days). Recomputed from today every time, so missed days push the goal day forward and no guilt marks exist. The last planned day is the goal day. The calendar shows an ink stamp on trained days, lift tags on planned days and a hanamaru flower (よくできました) on the goal day; the goal box shows the cycle's goal snapshot (bulk: BF ceiling, never a promised drop) and the BF error footnote. Stamps are original pixel art generated from shapes (`PixelStamp`). The squat/RDL warning fires at 2 days apart: with exactly 4 distinct weekdays they can't be back to back.
  3. **Delete a log** (current cycle only; finished cycles are locked because their results already set the TMs). `applyReview` now records what it applied (`reviewApplied`); `deleteWorkoutSession` appends `undo` TM rows (TM += from − to, additive, so later changes survive; `tmHistory` stays append-only), lowers the rest bonus, and deletes the row. In-progress workouts can be discarded.
  4. **Every exercise gets a number.** `lib/training/startLoad.ts`: anchor (a Big 4 TM or body weight) × ratio per exercise, rounded down, body-weight fallback; bodyweight/band/timed moves get reps or seconds. Orders carry a single `targetReps` (middle of the range first, then double progression) and an `estimate` flag ("Estimate" tag until the exercise has a log). Ratios are coaching defaults in one table, conservative (2–3 reps in reserve); machine stacks vary by gym.
  5. **Swap during a workout** from the exercise name or a labelled Swap button, until that exercise's first set is ticked (then "Skip the rest instead"). Today only by default; "Keep this swap" writes the sticky slot choice. The main lift has no swap.
  6. **Rest end:** the rest bar becomes a "Time's up. Next: …" banner for 8 s with a Web Audio beep (Settings › Training › Rest timer). **Rest alerts** (opt-in, installed app only): when a rest starts the app asks the push Worker (`push-worker/`, Cloudflare free plan: Worker + one SQLite Durable Object per device with an alarm) to send a Web Push at the rest end. The service worker shows "Time's up" unless a Philip window is visible. No keep-screen-on (owner choice).
- **Reason:** Owner requests 2026-11-06 and gym feedback 2026-11-07 ("only one exercise date per day", "show what dates to workout… goal date with a yokudekimashita flower", "delete workout log", "give me a number for A1/A2", "swap after I start the day", "message when the timer is done").
- **Platform facts (checked 2026-11-07):** iPhone home-screen web apps get Web Push from iOS 16.4, need a server to send it, can't schedule local notifications, and don't support vibration; Screen Wake Lock works in installed PWAs from iOS 18.4 (not used). Sources: firt.dev/notes/pwa-ios, progressier.com/pwa-capabilities/screen-wake-lock. Cloudflare's free-plan quotas could not be re-read from the build session; the owner checks them at setup (`push-worker/README.md`).
- **Alternatives:** stored planned dates (would go stale and shame missed days); deleting TM rows on undo (breaks append-only); a Web Push library in the Worker (not needed: VAPID + aes128gcm on WebCrypto, tested by decrypting on the subscriber side); iOS Shortcuts timer; keep-screen-on.
- **Consequences:** New optional fields only: `TrainingProgram.trainingDays`, `WorkoutSession.reviewApplied`, `Prescribed.targetReps/estimate/assist`, `TmReason` `undo`. No Dexie bump; backup `schemaVersion` stays 1. Two device-only META keys (`restSound`, `restAlertSub`, not in backups). **Second network destination** (after Gemini): the owner's push Worker, which receives only the push subscription, the end time and the next-set text. App dependencies unchanged; the Worker has none. Build variables `VITE_PUSH_URL` and `VITE_PUSH_VAPID_KEY` (public, GitHub Actions Variables); without them Rest alerts stay hidden. Philip's art resolution was moved out of this story (owner is making better creatives; `claude/philip-art-brief.md`).
- **Date:** 2026-11-08 · **By:** Ryan (owner) · **Status:** Implemented on `feat/T-019-core` → `feat/T-022-push-worker` → `feat/T-020-calendar` → `feat/T-021-session` (linear)

## D-029 — Story 7: gym QA batch (order, cardio, Philip's report + chat, dumbbell pairs)
- **Context:** Four QA observations from the gym, 2026-11-09 (OBS-F52773, OBS-93A8C0, OBS-3DB146, OBS-C94181). Owner answers the same day: any order, remembered but changeable every session; a cardio finisher every session outside the 45 minutes, more on a cut; Gemini free tier for the report and chat; dumbbells as "2 × 12.5 kg × 10".
- **Decision:**
  1. **Exercise order (OBS-F52773).** Up/Down on accessory cards during a session; the main lift stays first (heavy compound on a fresh lifter) and nothing passes it. The order is saved per program day (`TrainingProgram.dayOrder`) and used when the next session for that day is created; the start screen previews it. `saveWorkoutSession` now matches frozen orders by slot, not position. The 45-min estimate reads slots, so order doesn't change it.
  2. **Cardio finisher (OBS-93A8C0).** Cardio was absent by design (Story 5 §4.6 budgeted lifting only), not because of the bulk. Every session gets `WorkoutSession.cardio`: incline walk, 15 min (gain/maintain) or 25 min (cut), Philip's coaching default (a hypothesis, not evidence), one constant in `lib/training/cardio.ts`. Logged as minutes (needed for Done), incline % and speed (mph when the weight unit is lb). Never counted in the 45. Shown on the summary and the calendar log.
  3. **Philip's report + chat (OBS-3DB146).** After Finish (and from the calendar for current-cycle logs) Gemini writes an observation report and proposes changes: TM (±10%), extra rest (15–60 s, cycle cap 90 s), an accessory's next weight (±20% of today's order, per hand for dumbbells) / reps (inside its range) / sets (2–5), a swap (Philip's approved menu only), training days (exactly 4). `lib/training/coach.ts` validates every proposal and drops anything out of bounds. Nothing applies until the owner taps Apply (`applyCoachProposals`, one transaction, recorded in `reviewApplied`). Under the report he can comment; Philip replies and may revise proposals (a newer one for the same target replaces the open one). Thread stored on the session (`WorkoutSession.coach`). The rules review stays and works offline; without a key the report says what's needed.
  4. **Next-time orders.** An applied accessory proposal is stored as `TrainingProgram.nextOverrides` keyed to the session that set it; it applies while that session is the exercise's latest log, so it is used once and then double progression takes over. No clearing needed.
  5. **Dumbbell pairs (OBS-C94181).** `ExerciseInfo.pair` marks two-dumbbell exercises (22). Loads were already stored per hand; display only: summary "4 sets · 2 × 35 lb × 9 per side (8–10)", set line "2 × 35 lb · 15.9 kg", muted total, "2 ×" before the per-hand input; also plan view, swap list, calendar log and report.
- **Reason:** Owner QA observations 2026-11-09 and answers in the build session.
- **Alternatives:** free reordering including the main lift; cardio inside the budget (would trim lifting); rules-only report (no chat); a Claude hand-off prompt instead of Gemini; storing overrides with a "consumed" flag.
- **Consequences:** New optional fields only (`dayOrder`, `nextOverrides`, `cardio`, `coach`, `reviewApplied.swaps/days`); no Dexie bump; backup `schemaVersion` stays 1 and round-trips them. Deleting a log now also restores swaps (unless changed since) and training days, and drops its next-time orders. Gemini receives the workout log, TMs, phase, training days and the approved menus (no body stats). No new dependencies.
- **Date:** 2026-11-09 · **By:** Ryan (owner) · **Status:** Implemented on `feat/T-024-gym-qa`

## D-030 — Story 8: efficiency budgets
- **Context:** Owner asked (2026-11-09) to check Philip is built efficiently: size on the phone, speed, battery, and other standard metrics. Nothing was measured before. Spec: `docs/stories/STORY_8_EFFICIENCY.md`.
- **Decision:**
  1. **Budgets that fail the build.** `scripts/size-budget.mjs` (`npm run size`, no dependencies, runs in `deploy.yml` after the build): initial JS ≤ 172 KB gzip, initial CSS ≤ 16 KB, largest lazy chunk ≤ 30 KB, precache ≤ 1,200 KB. `e2e/perf.spec.ts` (Chromium/CDP): cold FCP < 2.5 s at 4× CPU slowdown; idle CPU < 15 ms/s on Home and < 25 ms/s in a session with the rest timer; no infinite animations while idle.
  2. **Clocks live in the smallest component and stop when hidden.** Per-second ticking only in `RestBar`; the session header ticks per minute; one-shot timers instead of polling for rest end and banner dismissal.
  3. **Network-only code loads on use** (Gemini food analysis), and screens that need a big module only for one helper import the helper from a small file (`lib/backupName.ts`).
  4. Offline-critical sheets stay in the first bundle until T-006.
- **Reason:** Owner request; measured baseline: session idle 10.3 ms CPU per second (whole session re-rendered every second), first-screen JS 178 KB gzip with the Gemini service and backup code in it.
- **Alternatives:** a bundle-analyzer dependency (not needed: Rollup module info and zlib); splitting `en.ts` (biggest remaining item, deferred until the budget is tight); Lighthouse CI (needs Chrome + a dependency; CDP covers what we need).
- **Consequences:** Raising a budget needs a line here. Results: initial JS 167.5 KB gzip (−6%), session idle 2.8–3.1 ms/s (−70%). New Settings line for space used (`navigator.storage.estimate`). No data model change, no new dependencies. Story 9 (Philip's memory) must stay inside these budgets and adds a Gemini prompt-size budget.
- **Date:** 2026-11-10 · **By:** Ryan (owner) · **Status:** Implemented on `feat/T-025-efficiency`

## D-031 — Story 9: Philip's memory (brief, notes, Ask Philip)
- **Context:** Owner (2026-11-09): every conversation with Philip should use the whole history (sets, weights, exercises, earlier conversations) from a well-organised database. Gemini saw only today's session (report/chat) or one set (check-in). Spec: `docs/stories/STORY_9_PHILIP_MEMORY.md`.
- **Decision:**
  1. **A pure, budgeted brief** (`lib/coach/brief.ts`, ≤ 6,000 characters, sections in priority order) goes in front of every coaching prompt: report, report chat, Ask Philip; the mid-set check-in gets that exercise's last logs + notes. Never the raw database.
  2. **Notes Philip keeps** (`coachNotes`, Dexie v5): replies may carry `remember` (≤ 2 lines, ≤ 140 chars); deduped, newest 40 kept, visible and deletable in Settings › Philip's memory. They are text facts only: nothing in the plan changes from a note.
  3. **Ask Philip** (`#/ask`, from Home's dialog bar): a chat outside workouts (`coachMessages`, newest 200), advice only; plan changes stay in the validated report flow.
  4. **Body and food sharing switch** (`META.coachShareBody`, default on, device-only). This reverses the D-029 note "no body stats to Gemini" for coaching prompts, at the owner's request for full-history coaching; the owner can turn it off.
- **Reason:** owner request; free-tier friendly (one bounded prompt per question); keeps the "AI never changes the plan without Apply" rule.
- **Alternatives:** sending all sessions as JSON (slow, large, leaks more); Gemini function calling to query the DB (more requests per answer on the free tier, more code); a separate vector store (needs a server); storing every chat in one new table (would have meant migrating Story 7 threads; the brief reads both places instead).
- **Consequences:** Dexie v5 (additive). Backup gains optional `training.coachNotes` / `training.coachMessages`; `schemaVersion` stays 1. Initial JS 168.7 KB gzip (within D-030's 172). No new dependencies.
- **Date:** 2026-11-10 · **By:** Ryan (owner) · **Status:** Implemented on `feat/T-026-philip-memory`

## D-032 — Story 10: QA batch 2026-11-11 (check-in options, realistic miss rule, read-back + edit log, drag reorder, treadmill mph, voice)
- **Context:** Eight gym/app observations from the owner (spec: `docs/stories/STORY_10_GYM_QA_2.md`).
- **Decision:**
  1. A check-in flag tap shows Philip's options at once; nothing changes until Apply. Rule options are pure (`checkinOptions`).
  2. A set 2+ reps under the range bottom lowers the load ~2.5% per missing rep (≥ 1 increment, ≤ 20%) — next session and mid-session. Coaching default from rep-max tables (neighbouring rep maxes are roughly 2–3% of 1RM apart); a hypothesis, tune in `program.ts`.
  3. Finish shows a read-back first. A done log of the current cycle can be reopened (`editing`), which undoes its applied review/report changes and clears the report, like delete does.
  4. Reorder by long-press/drag in a reorder mode with Save; Story 7's per-card Up/Down move into that mode.
  5. Treadmill speed is logged in the machine's own scale; Philip projects mph (km/h exact, levels linear and labelled an estimate).
  6. Voice: supersedes D-020's "bossy" tone — dominant but charming and persuasive, never scolds; no sexual content (unchanged guardrail). Error, safety, delete and backup copy stay plain.
- **Consequences:** optional fields only, no Dexie bump, `schemaVersion` 1. Initial JS 170.9 KB gzip (D-030 budget 172). No new dependencies.
- **Date:** 2026-11-11 · **By:** Ryan (owner) · **Status:** Implemented on `feat/T-027-qa-batch`

## D-033 — QA batch 2026-11-13 (photo details, feedback undo, everyday meals, weigh-in reaction, load awareness, plan restructuring)
- **Context:** Six owner observations (OBS-D9A254, OBS-18D928, OBS-A0308B, OBS-3037F2, OBS-41CEBE, OBS-369BCA).
- **Decision:**
  1. **Photo details (OBS-D9A254):** after choosing a photo, an optional note box ("I only ate half of the rice"); nothing goes to Gemini until Add details or Just judge it. The note is appended to the photo prompt fenced as data (`foodPhotoPrompt`, ≤ 500 chars), also carried into the Claude handoff, and shown in the review's notes.
  2. **Feedback undo/redo (OBS-18D928):** pure `textHistory.ts` inside the QA module (typing bursts within 1 s = one step; a dictation run = one step), Undo/Redo buttons plus Cmd/Ctrl+Z.
  3. **Everyday meals (OBS-A0308B):** a saved meal can be "my usual {meal}" (`SavedMeal.everyday`, optional, non-indexed, one per meal). The meal log offers it while that meal is empty; logging still goes through Review for small adjustments. No Dexie bump; backup field optional, `schemaVersion` 1.
  4. **Weigh-in reaction (OBS-3037F2):** after logging weight, Progress shows Philip's take (`lib/weighIn.ts`, local math only): recalculates the active calculated plan with the 7-day average (else latest) weight and offers "Update my targets" when calories move ≥ 50 kcal or protein ≥ 5 g; never when the calculator flags review; manual plans untouched. The refreshed plan stores `lineStartKg`/`lineStartDate` so the weight line (and ahead/behind) does not restart. A pre-filled "Ask Philip" hands the AI follow-up to `#/ask` (sent only on Send). Safety rules in `targets.ts` unchanged.
  5. **Load awareness (OBS-41CEBE):** the rule engine already keeps loads per exercise (confirmed in tests); Gemini prompts now carry each exercise's load kind (barbell / dumbbells per hand / machine-cable / bodyweight), today's swaps, and a rule never to compare loads across exercises. QA prompt builder gets "Share screenshots" (Web Share / download) because prompts are text and can't carry images.
  6. **Plan restructuring (OBS-369BCA):** new report proposal `order` (a day's accessory order; main lift stays first), validated, applied with Apply, recorded in `reviewApplied.orders` and undone on delete/reopen unless reordered since. The prompt shows every day's order and tells Philip to restructure (order + swap + sets) when the lifter names a priority, not just add rest.
- **Consequences:** D-030 initial JS budget 172 → 174 KB gzip (172.6 KB: new strings and the meal-log offer are in the first bundle). No new dependencies, no Dexie bump, `schemaVersion` 1.
- **Date:** 2026-11-13 · **By:** Ryan (owner) · **Status:** Implemented, not yet committed

## D-034 — Story 11: goal reached → next goal → Philip's plan; Philip in the cloud
- **Context:** Owner (2026-11-13): when the goal is reached or passed, Philip pops up, asks for the next goal (default: the same change again, e.g. "+2 kg, hold 15%"), reads workouts and food, proposes adjustments; owner reviews, taps Yes, it applies. Owner: the numbers must never be "based on nothing", Philip must decide, and the flow must always end in a decision; extra setup is fine. Spec: `docs/stories/STORY_11_NEXT_GOAL.md`.
- **Decision:**
  1. **Goal check** (`lib/goal/goalCheck.ts`, pure): 7-day average (2+ weigh-ins) reaching the cycle goal = reached; cut also by a fresh BF reading (≤ 14 days, since cycle start); passing a bulk's BF ceiling is *off track*, never reached; off track also for stalled (day 21+, < 25% of planned pace) and too fast (day 14+, > 1.5× pace; maintain drifting > 0.25%/wk). Once per cycle (and reason) via `META.goalPrompts`.
  2. **Pop-up**: a lazy `GoalWatcher` opens the goal sheet the moment an event appears (after a weigh-in or on open), never over another sheet, the tour or an open workout. Home's dialog line keeps the reminder ("Next goal") until it's answered.
  3. **Reached → the cycle ends early** (owner): last cycle's TM progression from what was logged (a lift with no key set holds; shared `lib/training/nextCycle.ts` with the briefing), next block, new goal. No forced deload: at most 3 build weeks of the old cycle + 3 new = within common two-cycle practice (coaching default). **Off track** keeps the cycle and its goal (food, cardio, days and swaps change now) unless the owner picks a new goal (= restart).
  4. **Next goal**: Same again (last change over the same 4 weeks, same BF line; preselected), Philip's pick (Story 5 default; switches phase at the BF ceiling, at ≥ 20% or at the long-term target), Set my own. All through `checkUserGoal` + `targets.ts` (safety rules unchanged).
  5. **Two layers**: the engine computes each lever's range (calories from the calculator and the maintenance measured from the owner's intake vs weight change, ±150 kcal, ≤ ±400 from the formula, floor/ceiling from `SAFETY`; protein 1.6–2.2 g/kg; cardio minutes per phase; days; Appendix A swaps). Philip (Gemini, or Claude by paste) picks every value with a reason; out-of-range values are capped and shown; a reply missing a lever is rejected, never filled with defaults.
  6. **Philip in the cloud**: `POST /coach` on the existing Worker (Bearer `COACH_TOKEN`, Gemini key as Worker secret `GEMINI_API_KEY`, free model chain `GEMINI_MODELS`). When every free model is rate limited, the goal request is queued in a `CoachQueue` Durable Object and retried by alarm (5/15/30 min, then hourly, up to 24 h) with a push when ready; the answer is handed over once and deleted (48 h max). Bodies are never logged. Every coaching call (report, chat, check-in, Ask, treadmill) goes cloud-first when paired, else the device key. **Ask Philip in Claude** (copy prompt, paste reply) is always offered.
  7. Apply is one transaction; **Undo** for 24 h (for a restart, only until the new cycle has a logged session). Target plans and TM history stay append-only.
  8. Strings for the sheet, goal history and cloud settings live in a lazy pack `src/i18n/goal.ts` (first step of "split en.ts"); same no-emoji test.
- **Reason:** owner request; numbers from his own data, decisions by Philip, safety rules unchanged, zero added cost (Cloudflare and Gemini free tiers).
- **Alternatives:** Gemini deciding freely (no guarantees on numbers); engine-only template when Gemini is unavailable (owner rejected: "not based on nothing, Philip decides"); a paid Gemini tier (cost); syncing the database to the cloud so the Worker could analyse on its own (privacy, D1 setup, more code).
- **Consequences:** Dexie **v6** (`planChanges`, additive); optional `CycleRecord.{cardioMin, reachedAt, endedEarly}` and `Profile.bodyFatDate`; backup gains optional `training.planChanges` (Undo data dropped on restore); `schemaVersion` stays 1. CLAUDE.md "No backend" now has one exception: the owner's own Worker (push + coach proxy). D-030 initial JS budget 174 → **176 KB** gzip (174.5 KB: the goal check on Home). No new dependencies.
- **Date:** 2026-11-13 · **By:** Ryan (owner) · **Status:** Implemented on `feat/T-028-next-goal`

## D-035 — Story 12: Re-plan with Philip on demand, goal dates, your time, 60-minute sessions
- **Context:** Owner, 2026-11-13: ask Philip for a fresh plan at any time; set a deadline for a goal with a date suggested by Philip; choose days a week and minutes for lifting and cardio; sessions of 60 minutes, not 45; version in Settings; slide between days; copy a food to today.
- **Decision:**
  1. **On-demand re-plan reuses the goal sheet** in a third mode (`manual`). `PlanChange.event/reason` gain `'manual'`. Keep this goal (preselected) continues the cycle; a new goal restarts it under Story 11's rules. No new storage.
  2. **Manual plans are quiet:** never a Home reminder, and they never resolve a pending reached / off-track event.
  3. **7-day note** after a recent plan is a coaching default in one constant (`REPLAN_RULES.recentDays`), never a block.
  4. **Goal date:** a goal is a weight and a date. Philip suggests the date from the phase's default pace (4–26 weeks); the owner may pick 2–26 weeks. The date sets the pace; `lib/targets.ts` safety rules are unchanged. A goal can span cycles (the briefing carries it on).
  5. **Your time** (owner chose "3–5 days, same 4-lift rotation"): the cycle stays 16 sessions, its calendar length follows the days. Lifting minutes are the session budget (default 60, replaces D-025's 45). Cardio minutes are a ceiling; extra room is used only on a cut. Nutrition changes only when the calculator's answer changes with training days.
  6. Version shown in Settings is `package.json`'s, `0.<story>.<build>`; Story 12 = 0.12.1.
- **Reason:** owner requests; reuse over forks; numbers from the calculator and his data, never invented.
- **Alternatives:** a separate re-plan screen (duplicate flow); a new split for 3 or 5 days (new program design, deferred); crediting calories per training minute (no data in the app to support it).
- **Consequences:** D-025's "exactly 4 days" and "45 minutes" become defaults (4 days, 60 minutes). Optional fields: `GoalChoice/CycleGoalSnapshot.{weeks, deadline}`, `TrainingProgram.availability`. No Dexie bump; backup `schemaVersion` 1. Swipe actions are 216 px wide. First-screen JS 175.7 / 176 KB: the next story needs the "split en.ts" work or a budget decision.
- **Date:** 2026-11-13 · **By:** Ryan (owner) · **Status:** Implemented on `feat/T-029-replan`
