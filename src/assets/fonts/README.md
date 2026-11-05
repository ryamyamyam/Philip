# Philip Pixel

Display font for labels, chips, numbers and headers (D-022). One CSS family, `'Philip Pixel'`,
built from two SIL Open Font License 1.1 fonts (licenses next to this file):

| Files | Source | Used for |
|---|---|---|
| `philip-pixel-400.woff2`, `philip-pixel-700.woff2` | **Pixelify Sans** © 2021 The Pixelify Sans Project Authors (https://github.com/eifetx/Pixelify-Sans) — `OFL-PixelifySans.txt` | letters and punctuation |
| `philip-pixel-digits-400.woff2` | **Silkscreen** Regular © 2001 The Silkscreen Project Authors (https://github.com/googlefonts/silkscreen) — `OFL-Silkscreen.txt` | digits 0–9 only (`unicode-range`), because Pixelify's 5 reads as an S at 15–20px; used for every weight (Silkscreen Bold's 4 is unclear) |

Modifications: static instances (Pixelify at weight 400 and 700), the capital "C" opened wider so it no longer reads as a zero, the digit "1" re-spaced to the
width of the other digits (tabular figures) in both fonts (Silkscreen digits also tightened to one pixel of side bearing), subset (Basic Latin, Latin-1, Latin Extended-A and common punctuation
marks; digits only for Silkscreen), woff2. Renamed "Philip Pixel" / "Philip Pixel Digits" as the
OFL asks for modified versions. No Reserved Font Names are declared by either font.

Self-hosted so the PWA works offline: Vite emits or inlines the files and the service worker precaches them.

## Nov 2026: Jersey 15 (owner feedback)

The app now uses **Jersey 15** © 2023 The Soft Type Project Authors (https://github.com/scfried/soft-type-jersey), SIL OFL 1.1 — `OFL-Jersey15.txt` — unmodified, as `jersey15-latin-400.woff2` and `jersey15-latin-ext-400.woff2` (Fontsource subsets). It's a pixel font on a finer grid than Pixelify, so text reads better at the same size, and its digits are clear, so the Silkscreen digit face isn't needed. One weight; `font-synthesis: none` keeps bold text from being faked. The Pixelify/Silkscreen files above are kept for a quick rollback (not loaded).
