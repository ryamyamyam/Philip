# Story 4: Philip's guided tutorial (NDS-style)

> Handoff spec written 2026-11-04 by the T-009 design session. Base: `main` = `bf52988` (T-009 / D-022 deployed).
> Proposed task ID **T-010**, branch `feat/T-010-tutorial`, worktree `../philip-T010`.
> Owner: Ryan. Read CLAUDE.md, `docs/DESIGN_SYSTEM.md` (D-022), `docs/DECISIONS.md` (D-022, D-023) and `docs/DEVELOPMENT_RULES.md` first.

## 1. Goal

A first-time user opens Philip and doesn't know what anything does. Philip, the coach, walks them through the app the way a DS-era handheld game does:

- Philip appears in a dialog box at the bottom of the screen.
- His lines type out letter by letter.
- The user taps to advance.
- The part of the screen he's talking about is lit up.
- The user can skip at any time.

## 2. Experience

**Where it runs.** The tour runs over the real Today screen, not on separate cards. The rest of the screen dims, and the element being explained is spotlit (lifted above the dim layer with a light outline).

**The dialog box.** It reuses the existing `DialogBar` look: dark translucent strip, PHILIP name plate, blinking ▼ "continue" caret. It sits at the bottom, above the control deck. While a deck button is spotlit, it sits above that button.

**Philip's portrait.** It stands at the left edge of the dialog box. Details are in §4.

**Typewriter text.**
- Characters appear one at a time, about 30 ms each. Spaces and punctuation get a small pause, longer after `.` `?` `!`.
- First tap while typing: the full line appears at once.
- Next tap: the next line.
- The ▼ caret only blinks once the line is complete.

**Choices.** Some steps offer two options, game style (`▸ Set targets` / `Later`). They're real buttons, keyboard-selectable, and use the slate button face.

**Skip.** A small "Skip" button sits in the top-right corner. Escape also skips. Skipping asks nothing, because nothing is lost.

**Replay.** Settings gets a new row, "Replay tutorial".

**Ending.** The last line closes the overlay and returns focus to Today.

## 3. Script

The copy is a draft for the owner to approve. All strings go in `en.ts` under `tutorial.*`. No emoji (D-023). Voice per D-020: bossy, campy, short. Never comment on body, weight or appearance, and no sexual content.

| # | Spotlight | Shown when | Line |
|---|---|---|---|
| 1 | none | always | Well, well. Fresh meat. I'm Philip, your coach. Tap to keep up, sweetie. |
| 2 | none | always | I track what you eat, what's left today, and where your weight is heading. You eat. I judge. |
| 3 | calorie panel (`.today-card` hero) | target exists | This is your fuel bar. It drains as you eat. Green, fine. Yellow, slow down. Red stripes? You went over. |
| 4 | protein row | target exists | Blue bars work the other way. Protein fills up. Your job is to fill it. Every. Day. |
| 5 | calorie panel (empty state) | **no** target | No targets yet? Cute. Let's fix that. → choices **Set targets** (closes the tour and navigates to `#/targets`; the tour does not resume) / **Later** |
| 6 | Choose photo (deck) | always | Snap your plate or pick a photo. I estimate, you check it. Nothing saves without your say. |
| 7 | Enter yourself (deck) | always | Rather type? Write what you ate, use a saved meal, or punch in the numbers. |
| 8 | Philip's dialog bar on the card | target exists | I talk to you right here. Lost? Ask me what to eat. |
| 9 | Progress tab | always | Weigh in a few times a week. I'll tell you if you're on track. |
| 10 | Settings tab | no Gemini key | Want photo estimates? Add a free Gemini key in Settings. Optional. I'm fabulous either way. |
| 11 | none | always | That's the tour. Now go. Chop chop. |

Other strings needed: `tutorial.skip` "Skip", `tutorial.next` (accessible name of the tap area, e.g. "Next"), `tutorial.later` "Later", `tutorial.setTargets` "Set targets", `settings.replayTutorial` "Replay tutorial", plus a label for the overlay dialog (e.g. "Philip's tour").

The steps are data: `src/lib/tutorial.ts` exports `TUTORIAL_STEPS` (`id`, `textKey`, `anchor`, `when(ctx)`, `choices?`) and a pure `stepsFor(ctx)` that filters by `{ hasTarget, hasKey }`, with unit tests.

## 4. Philip, the character

- **Original character.** He is not based on any game, anime or real person. No franchise names, sprites or logos.
- **Look:** a muscular, confident, charismatic coach. Think short hair, tank top, wristbands, maybe a whistle, with an arms-crossed or one-fist-up pose.
- **Tone:** he can be magnetic and cheeky through his pose and lines, but the art and copy stay non-sexual (CLAUDE.md rule, D-020).
- **Pixel art,** drawn like `Icon.tsx` and `AmbientScene.tsx`:
  - a 32×32 (or 32×40) grid of named colors, rendered as crisp `<path>` runs, with `shapeRendering="crispEdges"`;
  - colors from tokens, adding `--philip-*` tokens (skin, hair, top, outline) to `tokens.css` if needed;
  - a 1-cell dark outline.
- **Frames:**
  - idle (a 1-cell bob every ~1.2 s);
  - talking (2 mouth frames that alternate while text types);
  - optional "point" frame for spotlight steps.
- **Size:** about 96–128 px tall at 1×, integer-scaled so the pixels stay crisp. It must never cover the dialog text.
- **Reduced motion:** no bob, no mouth animation; the text appears whole.
- The new component is `src/components/PhilipPortrait.tsx` (decorative, `aria-hidden`).

## 5. Behavior rules

- **When it shows** (open question, see §9): recommended default is once for everyone after this update, existing users included, and on first launch for new users.
- **Storing that it was seen:**
  - **Key:** `META.tutorialSeenAt` (timestamp), set on finish or skip. It uses the existing `getMeta` / `setMeta` in `repo.ts`: one new key in the `META` constant, and no Dexie version or schema change.
  - **Limitation:** `meta` isn't in backups, and a "Replace" restore clears it, so the tour can show again after a Replace. That's acceptable; note it in the docs.
- **What it may not do:**
  - It never blocks logging. If a sheet opens (deep link, PhotoSheet), the tour closes first.
  - It never changes data, except the meta flag and the optional navigate-to-targets.
- **Layout:**
  - It works at 375–440 px and at 150% text without horizontal scroll.
  - Spotlight positions come from `getBoundingClientRect()` of the anchor and are recalculated on resize and scroll.
  - It scrolls the anchor into view first.
- **Missing anchors:** if an anchor is missing (e.g. no target, so no protein row), the step is filtered out by `stepsFor`.

## 6. Accessibility

- The overlay is `role="dialog"` `aria-modal="true"`, labelled; focus moves into it and returns to Today at the end.
- Screen readers get each line once and complete, via an `aria-live="polite"` region with the full string, not per character. The typed text itself is `aria-hidden`.
- The tap target is the whole overlay. There's also a visible "Next" button (≥44 px), and keyboard Enter or Space advances. Skip is a real button. Escape skips.
- The spotlight is not the only cue: the line names the thing ("This is your fuel bar…").
- Under `prefers-reduced-motion`, text appears instantly, without the bob or mouth animation, and the spotlight jumps instead of animating.
- Contrast follows D-022 tokens. The dim layer uses `--color-scrim` or a darker token.

## 7. Implementation plan (suggested)

| File | Action |
|---|---|
| `src/lib/tutorial.ts` + `tutorial.test.ts` | step data, `stepsFor(ctx)`, typewriter timing helper (pure) |
| `src/components/PhilipPortrait.tsx` | pixel-art character + frames |
| `src/components/TutorialOverlay.tsx` | dim layer, spotlight, dialog box, typewriter, choices, Skip |
| `src/components/useTypewriter.ts` (or in `hooks/`) | reveal state; respects reduced motion |
| `src/styles/components.css` | `pm-tour-*` classes, tokens only |
| `src/styles/tokens.css` | `--philip-*` colors and `--dur-type` if needed (shared file, PM coordination) |
| `src/db/repo.ts` | add `tutorialSeenAt` to `META` (shared file, Core) |
| `src/App.tsx` | mount `<TutorialOverlay>` once Today and the data have loaded (shared file) |
| `src/views/SettingsView.tsx` | "Replay tutorial" row |
| `src/i18n/en.ts` | append `tutorial.*`, `settings.replayTutorial` (no emoji; `en.test.ts` enforces) |
| Anchors | add stable `data-tour="…"` attributes to the calorie panel, protein row, deck buttons, dialog bar and tabs, so the tour doesn't depend on styling classes |
| `e2e/tutorial.spec.ts` | new |
| Docs | `docs/DESIGN_SYSTEM.md` (TutorialOverlay, PhilipPortrait), `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (**D-024** tutorial + character), `TASK_ASSIGNMENTS.md` (T-010) |

No new dependencies. No data, storage or AI changes beyond the meta key.

## 8. Acceptance criteria

1. Given a fresh install, when Today opens, then the tour starts with line 1 and the rest of the screen is dimmed.
2. While a line is typing, a tap shows the full line; another tap goes to the next line.
3. With a target set, step 3 spotlights the calorie panel and step 4 the protein row. With no target, step 5 shows its two choices instead, and "Set targets" opens `#/targets` and ends the tour.
4. With a Gemini key, step 10 is skipped.
5. Skip, Escape, or finishing the last line sets `tutorialSeenAt`. After a reload, the tour doesn't show again.
6. Settings › Replay tutorial starts it again from line 1.
7. With reduced motion, every line appears whole and nothing bobs.
8. A screen reader announces each full line once. Focus stays inside the overlay and returns to Today at the end.
9. There's no horizontal scroll at 375, 393 and 440 px, including at 150% text. The dialog never covers the spotlit element.
10. `npm test`, `npm run typecheck`, `npm run build` and Chromium e2e pass; WebKit is run on the Mac.

## 9. Open questions for Ryan (ask before coding)

1. Should existing users (you) see the tour once after this update, or only new installs? (Recommended: once for everyone.)
2. Do you approve the script, or want edits?
3. Should the portrait also appear elsewhere later, e.g. a small Philip next to the dialog bar on Today? It's out of scope for T-010 unless you say yes.
