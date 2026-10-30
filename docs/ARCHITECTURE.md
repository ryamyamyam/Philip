# Architecture

Local-first single-page PWA. No server: everything runs in the browser and is stored in IndexedDB.

```
src/
  main.tsx              boot: open DB, set locale, render, request persistent storage, register SW
  App.tsx               shell: hash routing (tabs), selected date, sheet host, toasts
  ui.tsx                UI context (date, openSheet, navigate) + SheetState union
  db/
    types.ts            persisted types (metric units)
    db.ts               Dexie schema (v1), default profile, init
    repo.ts             all reads/writes used by the UI
  lib/
    date.ts             local YYYY-MM-DD helpers (DST-safe)
    nutrition.ts        sums, plan resolution, scaling
    targets.ts          Mifflin–St Jeor calculator + safety rules
    adherence.ts        daily adherence score
    history.ts          day/week summaries and averages
    backup.ts           export / validate / restore / delete-all
    recents.ts          recent & frequent foods
    numbers.ts          decimal parsing and validation
    format.ts           Intl number/date formatting
    pwa.ts              service worker + storage persistence
  services/foodAnalysis/
    index.ts            provider-independent entry point (analyzeFoodPhoto)
    gemini.ts           the only Gemini-aware module (REST, error mapping)
    image.ts            in-browser resize to ≤1024px JPEG
    prompt.ts           shared prompt + JSON shape + Gemini response schema
    parse.ts            JSON extraction + strict validation (used by Gemini and Claude handoff)
  views/                screens and sheets (Today, History, Targets, Settings, Add, Entry, photo/*)
  components/           small shared UI (Sheet, ConfirmDialog, CalorieRing, MacroBars, …)
  i18n/                 en.ts strings + t() helper
  styles/               tokens.css, global.css, view styles
  sw-template.js        service worker; precache list injected at build (vite.config.ts)
  qaFeedback.config.ts  connects the QA & Feedback module to Philip (app name, screen context, Gemini key)
  modules/qa-feedback/  self-contained QA & Feedback Capture module (see its README.md)
```

## Data model (IndexedDB `philip`, Dexie v1)

| Table | Key | Notes |
|---|---|---|
| `profile` | `id = 'me'` | body stats, goal, unit prefs, locale, `geminiKey`, `geminiModel`, `adherenceEnabled` |
| `targetPlans` | `++id`, index `effectiveFrom` | append-only; optional `weekdayOverrides` (0=Sun…6=Sat) |
| `foodEntries` | `id` (UUID), index `date` | `source: manual\|photo\|saved`; `estimate` keeps original AI values |
| `savedFoods` | `id` (UUID) | `useCount`, `lastUsedAt`, `favorite` |
| `meta` | `key` | `lastBackupAt`, `backupReminderSnoozedAt`, `storagePersisted` |

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
    "savedFoods": [ "SavedFood" ]
  }
}
```

Import is validated completely before touching the database (types, ranges, dates, enums, schema version, duplicate IDs). Restore runs in one transaction:
- **Merge**: keep local data, add missing records; on ID conflict the newer `updatedAt`/`lastUsedAt` wins; local profile kept.
- **Replace**: clear everything, write the backup exactly (keeps this device's Gemini key if the backup has none). Requires confirmation.

Future schema versions must add a migration in `parseBackup` rather than rejecting old files.

## Target calculation (`src/lib/targets.ts`)

1. REE (Mifflin–St Jeor): men `10·kg + 6.25·cm − 5·age + 5`, women `… − 161`.
2. Maintenance = REE × activity factor (1.2 / 1.375 / 1.55 / 1.725 / 1.9).
3. Adjustment = weekly rate × 7,700 kcal/kg ÷ 7 (rough approximation, labeled as an estimate).
4. Safety: loss ≤ 1% body weight/week, gain ≤ 0.5%/week; calorie floor 1,500 (men) / 1,200 (women) and ceiling 6,000 — hitting either raises a "needs review" warning. Also flagged: low BMI, deficit below REE or > 30% of maintenance, a limit reversing the goal, macros exceeding calories. Adults (18–100) only.
5. Protein g/kg: train ≥1 day → lose 2.0 (2.2 if ≥4 days), maintain 1.6, gain 1.8; no training → 1.2–1.6. Above BMI 30 only 25% of the excess weight counts.
6. Fat = max(25% of calories, 0.5 g/kg reference weight). Carbs = remainder.

Reviewed by a separate Opus pass (Stage 3); findings fixed and covered by tests.

## Adherence score (`src/lib/adherence.ts`)

Calories 40% (full ±10%, linear to 0 at ±35%), protein 35% (full ≥90%, 0 at ≤50%, no penalty above), fat and carbs 12.5% each (full ±20%, 0 at ±50%). Days under 50% of the calorie target are "incomplete" and not scored. A 0 g target earns full credit at ≤5 g.

## Food photo analysis

`PhotoSheet` → `analyzeFoodPhoto()` → resize (≤1024px JPEG) → Gemini `generateContent` with JSON mode + response schema (retries once without schema on a generic 400) → `validateAnalysis()` → `ReviewSheet`. Key goes in the `x-goog-api-key` header only. Errors are typed (`noKey`, `invalidKey`, `rateLimited`, `modelUnavailable`, `network`, `timeout`, `blocked`, `invalidResponse`, `server`, `image`) and every error screen offers retry, manual entry and the Claude handoff.

Claude handoff: copy prompt → user attaches the photo in the Claude app (optionally via the share sheet) → paste reply → same validator → same review sheet. Philip never calls Claude itself.

Photos are never stored.

## QA & Feedback Capture (`src/modules/qa-feedback`)

A reusable, self-contained module for capturing observations (bugs, UI/usability issues, ideas) while using the app and turning selected ones into a Claude Code prompt. Details: `src/modules/qa-feedback/README.md`.

- **Integration:** `<QaFeedback config={qaFeedbackConfig} />` in `App.tsx`, a "QA & Feedback" card in Settings, and `src/qaFeedback.config.ts`. The module imports nothing from Philip; Philip's config passes in the Gemini key (from `profile.geminiKey`) and the current screen.
- **Storage:** its own IndexedDB database, `qa-feedback` (Dexie v1), with tables `projects`, `observations`, `attachments`, `files` (screenshot blobs), `prompts` and `meta`. Philip's `philip` database, its backups and "Delete all data" are untouched. Rolling back = removing the module and deleting that database.
- **UI:** a slim floating tab on the right edge (the user can hide it) opens a bottom-sheet panel (the app stays visible above it) with Capture, Inbox (search, filters, batch selection, detail) and Prompt (grouping, template or AI-assisted generation, edit, copy, .txt/.md export). The panel and its CSS are lazy-loaded.
- **AI:** optional; the Gemini provider is used only after an explicit tap ("Structure with AI", "Analyze with AI", "Improve with AI"). Responses are validated, AI fields are marked, and AI never overwrites what the user typed.

## Offline / PWA

`vite.config.ts` generates `dist/sw.js` with a precache list of all build assets. Navigations are network-first with the cached shell as fallback; same-origin assets are cache-first; cross-origin requests (Gemini) bypass the SW. `navigator.storage.persist()` is requested at boot.
