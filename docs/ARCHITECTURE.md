# Architecture

Local-first single-page PWA. No server: everything runs in the browser and is stored in IndexedDB.

```
src/
  main.tsx              boot: open DB, set locale, render, request persistent storage, register SW
  App.tsx               shell: hash routing (4 tabs: Today · Meals · Progress · Settings), shared selected date, sheet host, toasts
  ui.tsx                UI context (date, openSheet, navigate) + SheetState union
  db/
    types.ts            persisted types (metric units)
    db.ts               Dexie schema (v1 → v2), default profile, init
    repo.ts             all reads/writes used by the UI
  lib/
    date.ts             local YYYY-MM-DD helpers (DST-safe)
    nutrition.ts        sums, plan resolution, scaling
    targets.ts          Mifflin–St Jeor / Katch–McArdle calculator + safety rules
    remaining.ts        Today card: left / over / to go per phase (cut, maintain, bulk)
    weight.ts           weight log: expected-weight line from the plan, goal date
    foodText.ts         local (no-AI) parsing of typed food text + My Foods / recents matching
    adherence.ts        daily adherence score
    history.ts          day/week summaries and averages
    backup.ts           export / validate / restore / delete-all
    recents.ts          recent & frequent foods
    numbers.ts          decimal parsing and validation
    format.ts           Intl number/date formatting
    pwa.ts              service worker + storage persistence
  services/foodAnalysis/
    index.ts            provider-independent entry point (analyzeFoodPhoto, analyzeFoodText)
    gemini.ts           the only Gemini-aware module (REST, error mapping)
    image.ts            in-browser resize to ≤1024px JPEG
    prompt.ts           shared prompt + JSON shape + Gemini response schema
    parse.ts            JSON extraction + strict validation (used by Gemini and Claude handoff)
  views/                screens and sheets (Today, Meals, Progress, Settings, Add, Entry, photo/*);
                        TargetsView.tsx now only supplies the calculator sections reused by Progress
  components/           small shared UI (Sheet, ConfirmDialog, CalorieRing, MacroBars, …)
  i18n/                 en.ts strings + t() helper
  styles/               tokens.css, global.css, view styles
  sw-template.js        service worker; precache list injected at build (vite.config.ts)
  qaFeedback.config.ts  connects the QA & Feedback module to Philip (app name, screen context, Gemini key)
  modules/qa-feedback/  self-contained QA & Feedback Capture module (see its README.md)
```

## Navigation

| Tab | Route | Content |
|---|---|---|
| Today | `#/today` | Date heading + one card: kcal left / over / to go, plus P/F/C (`lib/remaining.ts`) |
| Meals | `#/meals` | Four meals for the selected date, 2 foods each then “+N more”; each card’s + opens the add sheet |
| Progress | `#/progress` | Targets + goal date, weight log & chart, 7-day intake vs target, compact calculator |
| Settings | `#/settings` | unchanged |

Old routes redirect with `history.replaceState`: `#/history` → `#/meals`, `#/targets` → `#/progress`. Today and Meals share the selected date; tapping the Today tab always resets it to today.

## Data model (IndexedDB `philip`, Dexie v2)

| Table | Key | Notes |
|---|---|---|
| `profile` | `id = 'me'` | body stats (incl. optional `bodyFatPct`, v2), goal, unit prefs, locale, `geminiKey`, `geminiModel`, `adherenceEnabled` |
| `targetPlans` | `++id`, index `effectiveFrom` | append-only; optional `weekdayOverrides` (0=Sun…6=Sat) |
| `foodEntries` | `id` (UUID), index `date` | `source: manual\|photo\|saved`; `estimate` keeps original AI values |
| `savedFoods` | `id` (UUID) | `useCount`, `lastUsedAt`, `favorite` |
| `meta` | `key` | `lastBackupAt`, `backupReminderSnoozedAt`, `storagePersisted` |
| `weightEntries` (v2) | `date` | `{date, weightKg, createdAt, updatedAt}`; one per local date, logging again overwrites. Logging the newest date also updates `profile.weightKg`. |

Migrations: v1 → v2 adds `weightEntries` and sets `profile.bodyFatPct = null`; every v1 record is kept (covered by `src/db/migration.test.ts`).

Rules:
- Entry dates are local `YYYY-MM-DD`; a meal at 11:55 PM stays on that day.
- Daily totals are always computed from entries.
- Target for a date = latest plan with `effectiveFrom <= date` (ties: newest `createdAt`), then the weekday override if present.
- Logging a saved food copies its values; editing/deleting the saved food never changes history.

## Backup format (`schemaVersion: 1`)

```json
{
  "format": "philip-backup",
  "schemaVersion": 1,
  "exportedAt": "2026-10-28T21:15:00.000Z",
  "data": {
    "profile": { "...": "Profile; geminiKey is null unless the user opts in" },
    "targetPlans": [ "TargetPlan" ],
    "foodEntries": [ "FoodEntry" ],
    "savedFoods": [ "SavedFood" ],
    "weightEntries": [ "WeightEntry — optional" ]
  }
}
```

`weightEntries` and `profile.bodyFatPct` were added in QA round 2 as **optional** fields without bumping `schemaVersion`: backups made before then import unchanged (empty weight log, `bodyFatPct = null`), and older app builds ignore the new fields.

Import is validated completely before touching the database (types, ranges, dates, enums, schema version, duplicate IDs). Restore runs in one transaction:
- **Merge**: keep local data, add missing records; on ID conflict the newer `updatedAt`/`lastUsedAt` wins; local profile kept.
- Weight entries merge by date; on the same date the newer `updatedAt` wins.
- **Replace**: clear everything, write the backup exactly (keeps this device's Gemini key if the backup has none). Requires confirmation.

Future schema versions must add a migration in `parseBackup` rather than rejecting old files.

## Target calculation (`src/lib/targets.ts`)

1. REE: Mifflin–St Jeor (men `10·kg + 6.25·cm − 5·age + 5`, women `… − 161`), or Katch–McArdle `370 + 21.6 · lean mass (kg)` when body fat % (3–60) is set. Result carries `reeMethod`.
2. Maintenance = REE × activity factor (1.2 / 1.375 / 1.55 / 1.725 / 1.9).
3. Adjustment = weekly rate × 7,700 kcal/kg ÷ 7 (rough approximation, labeled as an estimate).
4. Safety: loss ≤ 1% body weight/week, gain ≤ 0.5%/week; calorie floor 1,500 (men) / 1,200 (women) and ceiling 6,000 — hitting either raises a "needs review" warning. Also flagged: low BMI, deficit below REE or > 30% of maintenance, a limit reversing the goal, macros exceeding calories. Adults (18–100) only.
5. Protein g/kg: train ≥1 day → lose 2.0 (2.2 if ≥4 days), maintain 1.6, gain 1.8; no training → 1.2–1.6. Above BMI 30 only 25% of the excess weight counts.
6. Fat = max(25% of calories, 0.5 g/kg reference weight). Carbs = remainder.

Reviewed by a separate Opus pass (Stage 3); findings fixed and covered by tests.

## Adherence score (`src/lib/adherence.ts`)

Calories 40% (full ±10%, linear to 0 at ±35%), protein 35% (full ≥90%, 0 at ≤50%, no penalty above), fat and carbs 12.5% each (full ±20%, 0 at ±50%). Days under 50% of the calorie target are "incomplete" and not scored. A 0 g target earns full credit at ≤5 g.

## Today card (`src/lib/remaining.ts`)

Phase = active plan's `inputsSnapshot.goal`, else `profile.goal`, else maintain. Cutting/maintaining: calories, fat and carbs are ceilings (left → success, over → danger). Bulking: they are minimums (to go → warning, reached → success, shown as “X over”). Protein is always a minimum. Every value carries the words left / over / to go, so color is never the only signal.

## Weight log (`src/lib/weight.ts`)

Expected line: starts at the newest calculated plan's `inputsSnapshot.weightKg` on its `effectiveFrom`, moves by `profile.weeklyRateKg` passed through the calculator's `resolveRate` (same caps), and stops at the goal weight. Goal date = start + ⌈|Δ| / rate⌉ weeks. Manual plans have no starting weight, so no line. Chart is inline SVG (`components/WeightChart.tsx`).

## Food photo analysis

`PhotoSheet` → `analyzeFoodPhoto()` → resize (≤1024px JPEG) → Gemini `generateContent` with JSON mode + response schema (retries once without schema on a generic 400) → `validateAnalysis()` → `ReviewSheet`. Key goes in the `x-goog-api-key` header only. Errors are typed (`noKey`, `invalidKey`, `rateLimited`, `modelUnavailable`, `network`, `timeout`, `blocked`, `invalidResponse`, `server`, `image`) and every error screen offers retry, manual entry and the Claude handoff.

Claude handoff: copy prompt → user attaches the photo in the Claude app (optionally via the share sheet) → paste reply → same validator → same review sheet. Philip never calls Claude itself.

Photos are never stored.

### Typed text (add sheet and review list)

The add sheet shows only Take photo / Choose photo and one text box (“2 eggs, 150 g rice, 1 tbsp olive oil”); the manual form, My Foods, recents and the Claude handoff sit behind “More options”. Text goes to `analyzeFoodText()` → `analyzeTextWithGemini()` (same request, schema, error mapping and `validateAnalysis()` as photos; prompt `FOOD_TEXT_INSTRUCTIONS` with the same JSON shape). The review list has the same text box; sending appends rows. Without a key, on any error, or when Gemini finds nothing, `lib/foodText.ts` splits the text locally (g/kg/ml, tbsp 15 g, tsp 5 g, cup 240 g, bare counts), prefills macros from a My Foods / recent-food name match, and leaves the rest empty for the user. Local rows save as `source: 'manual'` with no estimate; AI rows save as `source: 'photo'` with their own provider/model.

## QA & Feedback Capture (`src/modules/qa-feedback`)

A reusable, self-contained module for capturing observations (bugs, UI/usability issues, ideas) while using the app and turning selected ones into a Claude Code prompt. Details: `src/modules/qa-feedback/README.md`.

- **Integration:** `<QaFeedback config={qaFeedbackConfig} />` in `App.tsx`, a "QA & Feedback" card in Settings, and `src/qaFeedback.config.ts`. The module imports nothing from Philip; Philip's config passes in the Gemini key (from `profile.geminiKey`) and the current screen.
- **Storage:** its own IndexedDB database, `qa-feedback` (Dexie v2: observations gain `archivedAt` / `archivedByPromptId`), with tables `projects`, `observations`, `attachments`, `files` (screenshot blobs), `prompts` and `meta`. Philip's `philip` database, its backups and "Delete all data" are untouched. Rolling back = removing the module and deleting that database.
- **UI:** a slim floating tab on the right edge (the user can hide it) opens a bottom-sheet panel (the app stays visible above it) with Capture, Inbox (search, filters, batch selection, detail) and Prompt (grouping, template or AI-assisted generation, edit, copy, .txt/.md export). The panel and its CSS are lazy-loaded.
- **Archive:** copying or exporting a prompt archives the observations it included (`archiveForPrompt`), with a “N observations archived” toast + Undo. Archived items leave the default Open filter, appear under “Archived” (struck through, muted), and the detail screen has Unarchive. Archive is separate from status.
- **AI:** optional; the Gemini provider is used only after an explicit tap ("Structure with AI", "Analyze with AI", "Improve with AI"). Responses are validated, AI fields are marked, and AI never overwrites what the user typed.

## Offline / PWA

`vite.config.ts` generates `dist/sw.js` with a precache list of all build assets. Navigations are network-first with the cached shell as fallback; same-origin assets are cache-first; cross-origin requests (Gemini) bypass the SW. `navigator.storage.persist()` is requested at boot.
