# Design system

Orange-and-white, minimal, iPhone-first. Tokens live in `src/styles/tokens.css`.

## Color

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#FAFAF8` | page background |
| `--color-surface` | `#FFFFFF` | cards, inputs |
| `--color-text` | `#1C1917` | primary text |
| `--color-text-2` | `#57534E` | secondary text (7:1) |
| `--color-text-3` | `#78716C` | tertiary/meta text (4.8:1, minimum for small text) |
| `--color-brand` | `#F97316` | rings, progress fills, selected tab icon, icons — **never small text on white** |
| `--color-action` | `#C2410C` | primary buttons, orange text (5.2:1) |
| `--color-success` / `-soft` | `#3F7D58` / `#E7F2EA` | success |
| `--color-warning` / `-soft` | `#A16207` / `#FEF6DC` | warnings, estimate banner |
| `--color-danger` / `-soft` | `#B91C1C` / `#FDECEC` | destructive, errors |
| Macro fills | protein `#C2410C`, fat `#F59E0B`, carbs `#FB923C` | macro bars |

## Spacing

4-point grid: `--space-1` (4) … `--space-12` (48). Page gutter 16px plus safe-area insets.

## Typography

System font (`-apple-system`, with CJK fallbacks for future zh-TW/ja). Root size follows iOS Dynamic Type (`font: -apple-system-body`), so all `rem` sizes scale with the user's text setting.

Six fixed steps: `--text-xs` 13 · `--text-sm` 15 · `--text-md` 17 · `--text-lg` 20 · `--text-xl` 28 · `--text-2xl` 40 (px at default size).

Numbers use `font-variant-numeric: tabular-nums` (`.num`).

## Rules

- Touch targets ≥ 44px (`--touch`).
- Never fix the height of a text container; labels wrap, never shrink. Long food names wrap (`overflow-wrap: anywhere`).
- Inputs use ≥16px font to stop iOS zoom-on-focus; numeric fields use `inputmode="decimal"`.
- Respect `env(safe-area-inset-*)` on the tab bar, sheets, header.
- No horizontal page scroll at 375–440px, including at 150% text.
- Sheets are bottom modals with a header close button, Escape to close, scroll inside the body, primary action in a sticky footer.
- Destructive actions confirm; delete-all needs typed confirmation.
- Respect `prefers-reduced-motion`.
- Charts are hand-written SVG at true pixel width (`useWidth`) so text stays crisp.
