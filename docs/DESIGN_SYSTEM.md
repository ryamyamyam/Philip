# Design system

> D-022 (T-009, Nov 2026): an original look inspired by DS-era handheld monster-RPG interfaces, the "Black & White" era. It borrows the visual language only. Never reproduce characters, sprites, logos, franchise names, type names or exact layouts.
> Source of truth: tokens in `src/styles/tokens.css`, components in `src/components/`, classes in `src/styles/components.css`. Every new screen follows this file.

## Principles

1. **Two screens.** The top **display zone** holds status and numbers: the date strip, panels and Philip's dialog bar. The bottom **control deck** is dark charcoal with a subtle dot texture, holds the log actions and the tabs, and sits within thumb reach.
2. **Tokens only.** New CSS uses `var(--*)`. Never write raw hex, px or ms in components. (Exception: SVG drawing coordinates in `Icon.tsx`, `AmbientScene.tsx` and `WeightChart.tsx` are geometry, not tokens.)
3. **Pixel everywhere, never tiny.** All text uses the pixel font, and nothing is smaller than 15px (`--text-xs` = 15px).
4. **One button face.** Every button gets the same slate gradient face with a dark frame. Destructive buttons keep that face with a red frame, and their label says what they do.
5. **Words, not emoji (D-023).** No emoji in copy. The decorative meal and macro emoji exist only on markup chips and are `aria-hidden`.
6. **Color is never the only signal.** Every meter and status also prints "left / over / to go" or a label.

## Type

| Token | Value | Use |
|---|---|---|
| `--font-display` | `'Philip Pixel'`, monospace fallbacks | everything (body, headings, inputs) |
| `--text-xs` … `--text-2xl` | 15 · 15 · 17 · 20 · 28 · 40 px (at default size, `rem`) | follows iOS Dynamic Type |
| `--display-tracking` / `-num` | 0.04em / 0.01em | labels and chips / numbers and headings |

The "Philip Pixel" font is self-hosted in `src/assets/fonts/` and precached by the service worker, so it works offline. It combines two OFL fonts, credited in `README.md` there:

- **Pixelify Sans** supplies the letters. Its capital C was opened wider so it doesn't read as a 0.
- **Silkscreen** supplies the digits 0–9 through `unicode-range`. Pixelify's 5 reads as an S.

Each digit face repeats the weight range of a letter face exactly: browsers only combine `unicode-range` faces whose descriptors match. Numbers use `.num` (tabular figures). Bold Pixelify closes some letters, so macro letters stay regular weight.

## Color

| Group | Tokens | Notes |
|---|---|---|
| Ink and surfaces | `--color-ink` `#1A1D20`, `--color-display` `#EEF1F3` (page), `--color-display-2`, `--color-surface` (white), `--color-panel` `#D8DCE0`, `--color-panel-head` `#3A3F46` | panel bodies stay near-white with scanlines; gray `--color-panel` is for row plates (status colors on it fell under 4.5:1) |
| Deck | `--color-deck` `#2A2E33`, `--color-deck-raised`, `--color-on-deck` (12.4:1), `--color-on-deck-2` (7.3:1) | bottom deck, sheet header bars |
| Labels | `--color-label` `#267575` + white (5.4:1) | teal pills. `#2E8C8C` was only 4.0:1 |
| Notable (one red) | `--color-notable` `#E04848` (fills only), `--color-notable-fill` `#C93C3C` (white 5.0:1), `--color-notable-text` `#A82A2A` | over target or notable, once per view |
| Meters | `--color-meter-track`, `-full` `#3FD86A`, `-mid` `#F2C230`, `-low` `#E04848`, `-fill-up` `#5A8FE0` | each is ≥3:1 against the track |
| Category | `--cat-{sky,sand,slate,violet,coral,leaf,rose,teal}` + `-ink` | every fill/ink pair ≥4.5:1. Protein = coral, fat = sand, carbs = sky. Breakfast = sand, lunch = leaf, dinner = violet, snack = rose. Slate = every button |
| Text | `--color-text` / `-2` / `-3` (≥5.3:1 on the page) | `--color-text-3` was darkened for the gray page |
| Focus | `--color-focus` `#2B63BD` on light, `--color-focus-on-dark` `#FFD84A` on the deck/dialog | 3px ring |
| World | `--world-ground`, `-path`, `-foliage(-2)`, `-sky`, `-outline` | ambient scenes only |

The old orange tokens (`--color-brand`, `-soft`) remain only for legacy fills. `--color-action` now points to slate: there are no orange buttons.

## Spacing, shape, shadow, motion

- **Spacing:** a 4px grid, `--space-1` (4) … `--space-12` (48), plus `--space-0-5` (2) for press depth and hairline offsets. The page gutter is 16px plus safe-area insets.
- **Shape:**
  - **Chamfers:** `--chamfer-sm/md/lg` (6/10/14), applied with `clip-path: var(--pm-chamfer)` after setting `--pm-c`.
  - **Borders:** `--border-hair/frame/thick` (1/2/3).
  - **Corners:** 0 everywhere except capsule meters and dots.
- **Shadows:** `--shadow-hard` (2px ink drop), `--shadow-hard-lg`, `--shadow-inset-frame`, `--shadow-deck`.
- **Motion:**
  - **Durations:** `--dur-fast/base/slow` 120/150/180ms for snappy steps. Meters fill in `steps(8)` over `--dur-meter` (360ms).
  - **Interactions:** a press moves the element down by `--press-depth`, and the selected item bounces (`pm-bounce`).
  - **Reduced motion:** every duration becomes 0 and press depth becomes 0.

## Components (`src/components/`)

| Component | Props (short) | Use |
|---|---|---|
| `Meter` | `label, value, max, mode: 'drain'|'fill', tone?, size?, valueText?` | **drain** (ceilings) empties: green above 40% left, yellow at 15–40%, red below 15%, striped red when over. **fill** (minimums: protein, or every macro when bulking) fills blue, then green when reached. `aria-valuenow` = % eaten. The logic lives in `lib/meter.ts` |
| `ActionButton` / `ActionFileButton` | `variant, category?, icon?, size?` (+ `accept, capture?, onFile`) | chamfered deck buttons with a light border, dark frame and gradient face. The file variant wraps a hidden input |
| `.btn` (CSS) | `btn-primary/secondary/ghost/danger…` | the same face for every other button |
| `CategoryChip` | `category, label, icon?` | meal headers, macro rows, saved meals (dominant macro from `lib/category.ts`) |
| `StatPanel` | `title, children, tabs?, aside?` | info panel: dark «header» bar plus a scanlined body, as a named region. Use `tabs` only when the panel really has sub-views |
| `StatRow` | `label, value, notable?, hint?` | teal pill plus right-aligned value inside `<dl className="pm-rows">`. `notable` = the one red accent |
| `NamePlate` | `title, subtitle?, badge?` | angled plate with a status badge (Progress: latest weight vs goal) |
| `DialogBar` | `speaker?, children, action?, live?, portrait?` | where Philip speaks: Today's coach line plus "What do I eat?"; `portrait` shows Philip's head and shoulders (pose from `COACH_POSE`). Toasts use it without a speaker, because plain or error text gets no name plate |
| `GymCharacter` | `pose, framing?: 'full'\|'bust', scale?, talking?` | Philip, drawn from the pose atlas (`lib/character.ts`, `assets/character/philip-poses.png`). Integer scales only so pixels stay crisp; `talking` adds a small bob (off under reduced motion). Decorative, `aria-hidden` |
| `TutorialOverlay` | `ctx, onEnd(how)` | Philip's tour (D-024): dim + spotlight on `data-tour` anchors, dialog box with Philip at 2×, typewriter (`useTypewriter`), Next / choices / Skip, Escape, focus trap; flips to the top when it would cover the spotlit element. Classes `pm-tour-*` |
| `ControlDeck` / `DeckActions` | `label` | the deck nav (TabBar) and the actions strip docked above it. Publishes `--deck-actions-h` |
| `StatusStrip`, `CornerButton`, `DotIndicator` | — | date strip with half-circle prev/next buttons and week dots (decorative) |
| `AmbientScene` | `variant: 'empty'|'analyzing'` | pixel-art world on an 80×30 grid with 1-cell outlines. Only for empty states, onboarding and the photo-analysis wait |
| `.pm-cart` (CSS, Home) | button with `pm-cat-*` | Story 5 "cartridge": a big chamfered white screen with a category stripe on the left, label row (`.pm-cart-head`), big line (`.pm-cart-big`), small lines (`.pm-cart-sub`), optional meter. Meal log = coral, Workout = sky |
| `Icon` | `name, label?` | pixel icons on a 12×12 grid (keep sizes at multiples of 12px). Story 5 adds `home` and `dumbbell` |

Settings and Targets cards get the panel look through `.view-settings .card` / `.view-targets .card`: their first `h2` becomes the header bar. New screens should use `StatPanel` instead.

The QA & Feedback module is themed only by re-mapping its `--qa-*` variables in `src/styles/qa-theme.css`. Never style `qa-` classes from Philip code. Its pill-shaped chips and white button text are hard-coded in the module, so they stay as they are.

## Workout patterns (Story 5)

- **Orders vs log:** every exercise card has a panel-colored "Philip's orders" block (cue, why-line) and set rows. A set row shows the order (set number, kind, load in both units with the chosen unit first, reps, reps in reserve, rest, and a per-side plate line for barbell sets) above the owner's log (weight and reps inputs with the order as placeholder, "As ordered", a Done toggle). Done rows turn success-soft; warm-ups use surface-2.
- **Rest bar:** a dark dialog-colored bar fixed above the tab bar while resting (`role="timer"`), with Skip rest.
- **Day preview:** accessories are full-width row buttons with an underlined "Swap" hint; options open inline as slate buttons, the current one marked with the pixel check.
- **Pain text** (`.ex-pain`) is plain danger-soft text, never Philip's voice.
- Styles live in `src/styles/workout.css`.

**Font (D-026):** the family is now Jersey 15 (finer pixel grid); the Pixelify/Silkscreen notes above describe the previous version.

## Rules (carried over)

- **Touch targets:** at least 44px (`--touch`).
- **Text:** text containers never get a fixed height, and labels wrap. Inputs are ≥16px so iOS doesn't zoom on focus.
- **Layout:** respect `env(safe-area-inset-*)`. No horizontal scroll at 375–440px, including at 150% text.
- **States:** every interactive element has hover (`@media (hover: hover)`), `:focus-visible` and `:active` states.
- **Sheets:** bottom modals with a dark header bar and a close button, Escape to close, scrolling inside the body, primary action in a sticky footer.
- **Destructive actions:** they always ask for confirmation, and delete-all needs typed confirmation.
- **Charts:** hand-written SVG at true pixel width (`useWidth`). The actual line is sky, the plan line is dashed slate, and axis text is at least 15px.
