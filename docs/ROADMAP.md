# Roadmap

| Stage | Scope | Status |
|---|---|---|
| 0 | Scaffold, tokens, shell & nav, Dexie, i18n, PWA (manifest, icons, SW), Pages workflow | ✅ Done |
| 1 | Food entries CRUD, Today dashboard, calorie ring, macro bars, date nav + swipe | ✅ Done |
| 2 | JSON backup/restore (merge/replace), validation, delete-all, backup reminder | ✅ Done |
| 3 | Target calculator, safety rules, manual override, append-only plan history | ✅ Done (Opus review applied) |
| 4 | Recent / frequent / favorites / My Foods, one-tap relog, save-from-entry | ✅ Done |
| 5 | Gemini photo analysis, review & edit, error handling, Claude handoff | ✅ Done (needs live-key test) |
| 6 | History: daily log, 7/30-day averages, SVG chart, target comparisons | ✅ Done |
| 7 | Adherence score (optional), weekday target planning, weekly planned vs actual | ✅ Done |
| 8 | QA & polish | 🟡 In progress |

## Stage 8 checklist

- [x] Unit tests: calculations, dates, DB, backup, AI parsing, Gemini adapter (mocked)
- [x] Browser tests (Chromium mobile emulation): logging, validation, dates, recents, offline, photo flow, handoff, backup, calculator
- [x] Screenshots at 375 and 440 CSS px, plus 150% text pass; no horizontal scroll
- [ ] Run Playwright with WebKit (`--project=webkit-iphone`)
- [ ] Real iPhone: install from Safari, offline launch, camera capture, share-sheet export, Files import, Dynamic Type at largest sizes, VoiceOver pass
- [ ] Live Gemini free-tier key: success, invalid key, rate limit
- [ ] Performance check on device (cold start, 1 year of entries)

## Later (not started)

Workout tracking · body-weight tracking · long-term analytics · AI coaching · zh-TW and ja translations.
