# QA & Feedback Capture (reusable module)

Capture bugs, UI issues, usability problems, optimizations and feature requests while using an app, then turn a selection of them into one Claude Code implementation prompt.

**Capture → save → organize → select → generate prompt → review/edit → copy or export**

Everything runs in the browser. Data lives in its own IndexedDB database (`qa-feedback`). AI is optional: without it you can still capture, attach, search, filter, select and generate template-based prompts.

## Files

| Path | Role |
|---|---|
| `index.ts` | Public exports. Host apps import only from here. |
| `config.ts` | `QaFeedbackConfig`: everything the module needs from its host. |
| `types.ts` | Data model: `QaProject`, `Observation`, `ScreenshotAttachment`, `DevelopmentPrompt`. |
| `db.ts` | Dexie schema (v1): `projects`, `observations`, `attachments` (metadata), `files` (image bytes), `prompts`, `meta`. |
| `repository.ts` | All reads and writes. Every call takes a `projectId` and refuses records from other projects. |
| `search.ts` | Keyword search and filters, scoped to one project through the `[projectId+createdAt]` index. |
| `transcription.ts` | Speech-to-text interface plus the Web Speech API adapter. |
| `ai/provider.ts` | AI provider interface and typed `AiError`. |
| `ai/gemini.ts` | Gemini REST adapter, with the key supplied by the host at call time. |
| `ai/analysis.ts` | AI tasks (structure one observation, describe a screenshot, analyze a batch) with strict validation. |
| `prompt/grouping.ts` | Grouping that explains itself and that you can edit (same feature/screen, AI-suggested, or manual). |
| `prompt/template.ts` | Deterministic Claude Code prompt builder. |
| `browser.ts` | Capture context, image size, AI image copy, clipboard, file export. |
| `ui/*` | React UI: floating button, panel, Capture, Inbox, Detail, Prompt Builder. |
| `qa-fab.css`, `qa-feedback.css` | `qa-`-prefixed styles that map to host tokens (`--color-*`, `--space-*`), with fallbacks. |
| `qa-feedback.test.ts` | Unit tests (Vitest + fake-indexeddb). |

## Data rules

- **The original text never changes.** `originalText` is the text you reviewed and saved. `rawTranscript` is the speech recognizer's output, kept only if it differs from `originalText`. Neither field can be changed after saving.
- **AI never overwrites your input.** AI suggestions only fill empty fields, and fields filled this way are listed in `aiFields`. Editing such a field removes it from the list. A high or critical priority is suggested only when the AI gives a reason for it.
- **Screenshots stay as you uploaded them.** The original bytes are stored unchanged. AI analysis uses a resized copy, and its findings are saved separately on the attachment, labeled "unverified".
- **Deleting is scoped.** Deleting an observation deletes only its own attachments and files. Prompts keep their text.
- **Nothing is silently dropped.** If the AI leaves an observation out of its batch result, the observation is kept as its own group, and the UI says so.

## Using it in another app

1. Copy `src/modules/qa-feedback/` into the app. It needs React 18 or later, `dexie` 4 and `dexie-react-hooks`.
2. Write a config:

   ```ts
   import { QaFeedback, createGeminiProvider, type QaFeedbackConfig } from './modules/qa-feedback';

   const config: QaFeedbackConfig = {
     appId: 'my-app',
     appName: 'My App',
     appVersion: '1.2.0',
     appDescription: 'Next.js app with Postgres. Read CONTRIBUTING.md first.',
     getContext: () => ({ screen: document.title }),
     ai: createGeminiProvider({ getCredentials: async () => ({ apiKey: myKey, model: 'gemini-2.5-flash' }) }), // optional
   };
   ```

3. Render `<QaFeedback config={config} />` once, near the root of the app.
4. Optional: call `openQaFeedback('inbox')` from a menu item.

For a different AI provider, implement `AiProvider` (`label`, `isConfigured`, `generateJson`). For different speech-to-text, implement `TranscriptionProvider`. To turn voice off, pass `transcription: null`.

If the host has a backend and user accounts, swap `repository.ts` for an API-backed version with the same function signatures. Do this only if you need sync across devices.

## Limitations

- **Voice:** the Web Speech API isn't in every browser. Safari and Chrome send the audio to Apple or Google, so it needs a network connection, and it can be unreliable in iOS home-screen apps. Typing is always available, and the iOS keyboard's dictation key works in the text box.
- **Screenshots:** a web app can't capture other apps' screens or record its own screen on iOS. You add screenshots from the photo library or file picker, or paste them on desktop. iOS doesn't support web share targets, so you can't share images into the app from the share sheet.
- **Storage:** data stays on this device only. It isn't included in the host app's backups. Clearing site data deletes it.
- **AI calls:** these run in the browser with the user's own key. That's fine for a single-user personal app, but not for a shared deployment. There, move the provider behind a server endpoint and keep the same `AiProvider` interface.
- **Export:** you can export `.txt` and `.md`. There's no Word export, to avoid a document-generation dependency.
