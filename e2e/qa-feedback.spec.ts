import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fresh, noHorizontalScroll, tab } from './helpers';

const SHOT = 'public/icon-512.png';
const SHOT2 = 'public/icon-192.png';

async function resetQa(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((res) => {
        const r = indexedDB.deleteDatabase('qa-feedback');
        r.onsuccess = r.onerror = r.onblocked = () => res();
      }),
  );
}

async function openCapture(page: Page) {
  await page.getByRole('button', { name: 'Capture feedback' }).click();
  const panel = page.getByRole('dialog', { name: 'QA & Feedback' });
  await expect(panel).toBeVisible();
  return panel;
}

async function capture(page: Page, text: string, opts: { type?: string; feature?: string } = {}) {
  const panel = page.getByRole('dialog', { name: 'QA & Feedback' });
  await panel.getByLabel('What did you notice?').fill(text);
  if (opts.type) await panel.getByRole('button', { name: opts.type, exact: true }).click();
  if (opts.feature !== undefined) await panel.getByLabel('Feature or screen').fill(opts.feature);
  await panel.getByRole('button', { name: 'Save observation' }).click();
  await expect(panel.getByText(/Saved “/)).toBeVisible();
}

async function setGeminiKey(page: Page) {
  await tab(page, 'Settings').click();
  await page.getByRole('textbox', { name: 'Gemini API key' }).fill('test-key-123');
  await page.getByRole('region', { name: 'Photo analysis (Gemini)' }).getByRole('button', { name: 'Save', exact: true }).click();
  await tab(page, 'Today').click();
}

const gemini = (data: unknown) => ({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] }, finishReason: 'STOP' }] } });

test.beforeEach(async ({ page }) => {
  await fresh(page);
  await resetQa(page);
  await page.reload();
});

test('quick capture without AI: save, screenshots, persistence, edit keeps original words', async ({ page }) => {
  const panel = await openCapture(page);
  await expect(panel.getByLabel('Feature or screen')).toHaveValue('Today');
  await panel.getByLabel('What did you notice?').fill('The calorie ring overlaps the date when text is large. It should sit below it.');
  await panel.getByRole('button', { name: 'Bug', exact: true }).click();
  await panel.getByTestId('qa-screenshot-input').setInputFiles([SHOT, SHOT2]);
  await expect(panel.getByRole('list', { name: 'Screenshots to attach' }).getByRole('listitem')).toHaveCount(2);
  await panel.getByRole('button', { name: 'Remove screenshot 2' }).click();
  await panel.getByTestId('qa-screenshot-input').setInputFiles([SHOT2]);
  await expect(panel.getByRole('list', { name: 'Screenshots to attach' }).getByRole('listitem')).toHaveCount(2);
  await noHorizontalScroll(page);
  await page.screenshot({ path: 'e2e/screenshots/375-qa-capture.png' });
  await panel.getByRole('button', { name: 'Save observation' }).click();
  await expect(panel.getByText('Saved “The calorie ring overlaps the date when text is large”')).toBeVisible();
  // Form is ready for the next one.
  await expect(panel.getByLabel('What did you notice?')).toHaveValue('');

  // Invalid attachment is rejected with a message.
  await panel.getByTestId('qa-screenshot-input').setInputFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
  await expect(panel.getByRole('alert')).toContainText('Only image files');

  // Persists across reload; reachable from Settings.
  await page.reload();
  await tab(page, 'Settings').click();
  await page.getByRole('button', { name: 'Open inbox' }).click();
  const inbox = page.getByRole('dialog', { name: 'QA & Feedback' });
  const item = inbox.getByRole('list', { name: 'Observations' }).getByRole('listitem');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Bug');
  await expect(item.getByLabel('2 screenshots')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/375-qa-inbox.png' });

  await item.getByRole('button').click();
  await expect(inbox.getByRole('list').locator('.qa-shot')).toHaveCount(2);
  await inbox.getByLabel('Title').fill('Ring overlaps date');
  await inbox.getByLabel('What should happen (expected)').fill('Ring sits below the date');
  await inbox.getByLabel('Status').selectOption('reviewed');
  await inbox.getByRole('button', { name: 'Save changes' }).click();
  await expect(inbox.getByRole('button', { name: 'Saved' })).toBeDisabled();
  await page.screenshot({ path: 'e2e/screenshots/375-qa-detail.png', fullPage: false });

  await page.reload();
  await page.getByRole('button', { name: 'Capture feedback' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Inbox/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Ring overlaps date/ }).click();
  const detail = page.getByRole('dialog', { name: 'QA & Feedback' });
  await expect(detail.getByLabel('Title')).toHaveValue('Ring overlaps date');
  await expect(detail.locator('blockquote').first()).toHaveText('The calorie ring overlaps the date when text is large. It should sit below it.');
  await expect(detail.locator('.qa-shot')).toHaveCount(2);
  // Remove one screenshot; the other stays associated.
  await detail.getByRole('button', { name: 'Remove' }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
  await expect(detail.locator('.qa-shot')).toHaveCount(1);
});

test('projects isolate observations; search and filters', async ({ page }) => {
  const panel = await openCapture(page);
  await capture(page, 'Export button does nothing on iOS', { type: 'Bug', feature: 'Settings' });
  await capture(page, 'Add a dark mode', { type: 'Feature', feature: 'App' });
  await capture(page, 'Macro bars are too thin to read', { type: 'UI', feature: 'Today' });

  await panel.getByRole('button', { name: /^Inbox/ }).click();
  const list = panel.getByRole('list', { name: 'Observations' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await panel.getByRole('searchbox').fill('ios export');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Export button does nothing on iOS');
  await panel.getByRole('searchbox').fill('');
  await panel.getByRole('button', { name: 'Filters' }).click();
  await panel.getByLabel('Type').selectOption('feature');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('Add a dark mode');
  await panel.getByRole('button', { name: 'Reset filters' }).click();
  await panel.getByLabel('Feature / screen').selectOption('Today');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Reset filters' }).click();

  // New project is empty and separate.
  await panel.getByLabel('Project', { exact: true }).selectOption('__new');
  await panel.getByLabel('New project name').fill('Side project');
  await panel.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(panel.getByText('Nothing captured yet')).toBeVisible();
  await panel.getByRole('button', { name: 'Capture', exact: true }).click();
  await capture(page, 'Login screen typo');
  await panel.getByRole('button', { name: /^Inbox/ }).click();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await panel.getByLabel('Project', { exact: true }).selectOption({ label: 'Philip' });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(list).not.toContainText('Login screen typo');
});

test('batch select → template prompt → edit protection → copy and .txt export', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const panel = await openCapture(page);
  await capture(page, 'Ring overlaps the date', { feature: 'Today', type: 'UI' });
  await capture(page, 'Meal list jumps when adding food', { feature: 'today', type: 'Bug' });
  await capture(page, 'Export should include notes', { feature: 'Settings', type: 'Feature' });

  await panel.getByRole('button', { name: /^Inbox/ }).click();
  await panel.getByRole('button', { name: 'Select visible' }).click();
  await expect(panel.getByText('3 shown · 3 selected')).toBeVisible();
  await panel.getByRole('button', { name: 'Build prompt from 3 selected' }).click();
  await expect(panel.getByText('3 observations in 2 groups')).toBeVisible();
  await panel.getByRole('button', { name: 'Generate prompt' }).click();
  const editor = panel.getByLabel(/^Prompt \(template\)/);
  const text = await editor.inputValue();
  for (const s of ['Ring overlaps the date', 'Meal list jumps when adding food', 'Export should include notes', 'Inspect the repository first', 'Acceptance criteria']) {
    expect(text).toContain(s);
  }
  expect(text.match(/#### OBS-/g)).toHaveLength(3);
  await page.screenshot({ path: 'e2e/screenshots/375-qa-prompt.png' });

  // Split the grouped pair; nothing is dropped.
  await panel.getByLabel('Group for Meal list jumps when adding food').selectOption('solo');
  await expect(panel.getByText('3 observations in 3 groups')).toBeVisible();

  // User edits are protected from regeneration.
  await editor.fill(text + '\nMY NOTE');
  await expect(panel.getByText('Edited')).toBeVisible();
  await panel.getByRole('button', { name: 'Regenerate prompt' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Replace your edited prompt?' });
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(editor).toHaveValue(/MY NOTE$/);

  await panel.getByRole('button', { name: 'Copy' }).click();
  await expect(panel.getByText('Copied. Paste it into Claude Code.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('MY NOTE');

  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }));
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Save .txt' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^philip-dev-prompt-\d{4}-\d{2}-\d{2}-\d{4}\.txt$/);
  const path = test.info().outputPath('prompt.txt');
  await download.saveAs(path);
  expect(readFileSync(path, 'utf8')).toContain('MY NOTE');

  // Edited prompt survives reopening.
  await page.reload();
  await page.getByRole('button', { name: 'Capture feedback' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Prompt/ }).click();
  await page.getByText('Recent prompts').click();
  await page.getByRole('button', { name: /3 observations · template/ }).click();
  await expect(page.getByRole('dialog').getByLabel(/^Prompt/)).toHaveValue(/MY NOTE$/);
});

test('AI structuring and AI prompt help are optional and failures never block saving', async ({ page }) => {
  let mode: 'ok' | 'fail' = 'ok';
  const bodies: string[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const body = route.request().postData() ?? '';
    bodies.push(body);
    if (mode === 'fail') return route.fulfill({ status: 503, json: { error: { message: 'overloaded' } } });
    if (body.includes('structured QA record')) {
      return route.fulfill(
        gemini({
          title: 'Ring overlaps date',
          feature: '',
          type: 'ui',
          description: 'Calorie ring overlaps the date header at large text sizes.',
          actualBehavior: 'Ring overlaps date',
          expectedBehavior: 'Ring sits below date',
          proposedSolution: '',
          priority: 'critical',
          priorityReason: '',
          facts: ['Ring overlaps date at large text'],
          interpretations: ['Happens with Dynamic Type'],
          unknowns: ['Which device'],
        }),
      );
    }
    // Batch analysis: echo the refs found in the request.
    const refs = [...new Set(body.match(/OBS-[A-Z0-9]{6}/g) ?? [])];
    return route.fulfill(
      gemini({
        groups: [{ title: 'Only first', observationIds: [refs[0]], relationship: 'Independent' }],
        items: [{ id: refs[0], acceptanceCriteria: ['Ring has clear space above it'], missingInformation: [] }],
        dependencies: [],
        uncertainties: ['Layout uses CSS grid or flex?'],
      }),
    );
  });
  await setGeminiKey(page);

  const panel = await openCapture(page);
  const words = 'calorie ring overlaps the date when text is big, it should be under it';
  await panel.getByLabel('What did you notice?').fill(words);
  await panel.getByRole('button', { name: 'Structure with AI' }).click();
  await expect(panel.getByText('AI reading of your words')).toBeVisible();
  await panel.getByText('More details (optional)').click();
  await expect(panel.getByLabel(/^Title/)).toHaveValue('Ring overlaps date');
  // Feature was prefilled by the user context and must not be overwritten.
  await expect(panel.getByLabel('Feature or screen')).toHaveValue('Today');
  // Critical without a reason is not suggested.
  await expect(panel.getByText('Suggested priority')).toHaveCount(0);
  await expect(panel.getByLabel('Priority')).toHaveValue('');
  expect(bodies[0]).toContain('<user_data');
  expect(bodies[0]).not.toContain('test-key-123');
  await panel.getByRole('button', { name: 'Save observation' }).click();
  await expect(panel.getByText('Saved “Ring overlaps date”')).toBeVisible();

  // AI failure: message shown, save still works.
  mode = 'fail';
  await panel.getByLabel('What did you notice?').fill('Second note while AI is down');
  await panel.getByRole('button', { name: 'Structure with AI' }).click();
  await expect(panel.getByRole('alert')).toContainText('server error');
  await panel.getByRole('button', { name: 'Save observation' }).click();
  await expect(panel.getByText('Saved “Second note while AI is down”')).toBeVisible();

  // Original words preserved next to AI-drafted fields.
  await panel.getByRole('button', { name: /^Inbox/ }).click();
  await panel.getByRole('button', { name: /Ring overlaps date/ }).click();
  await expect(panel.locator('blockquote').first()).toHaveText(words);
  await expect(panel.locator('.qa-badge-ai').first()).toBeVisible();

  // Prompt: AI failure falls back to template; AI success never drops an observation.
  await panel.getByRole('button', { name: /^Inbox/ }).click();
  await panel.getByRole('button', { name: 'Select visible' }).click();
  await panel.getByRole('button', { name: /Build prompt/ }).click();
  await panel.getByRole('button', { name: 'Improve with AI' }).click();
  await expect(panel.getByRole('alert')).toContainText('The template prompt still works');
  await panel.getByRole('button', { name: 'Generate prompt' }).click();
  await expect(panel.getByLabel(/^Prompt \(template\)/)).toHaveValue(/Second note while AI is down/);

  mode = 'ok';
  await panel.getByRole('button', { name: 'Improve with AI' }).click();
  await expect(panel.getByText('The AI left out 1 observation')).toBeVisible();
  const ai = panel.getByLabel(/^Prompt \(AI-assisted\)/);
  await expect(ai).toHaveValue(/Ring has clear space above it _\(AI-suggested/);
  await expect(ai).toHaveValue(/Second note while AI is down/);
  await expect(ai).toHaveValue(/Ring overlaps date/);
});

test('voice capture uses the speech adapter and keeps the raw transcript', async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => {
          const r = Object.assign([{ transcript: 'the save button is hidden behind the keyboard' }], { isFinal: true });
          this.onresult?.({ resultIndex: 0, results: [r] });
        }, 50);
      }
      stop() {
        setTimeout(() => this.onend?.(), 10);
      }
      abort() {
        this.onend?.();
      }
    }
    // Chromium ships a native SpeechRecognition; replace both names.
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
  });
  await page.reload();
  const panel = await openCapture(page);
  await panel.getByRole('button', { name: 'Tap and describe what you noticed' }).click();
  await expect(panel.getByRole('button', { name: 'Listening… tap to stop' })).toBeVisible();
  await expect(panel.getByLabel('What did you notice?')).toHaveValue('the save button is hidden behind the keyboard');
  await panel.getByRole('button', { name: 'Listening… tap to stop' }).click();
  // User fixes the transcript before saving.
  await panel.getByLabel('What did you notice?').fill('The Save button is hidden behind the keyboard on Targets.');
  await panel.getByRole('button', { name: 'Save observation' }).click();
  await panel.getByRole('button', { name: /^Inbox/ }).click();
  await panel.getByRole('button', { name: /The Save button is hidden/ }).click();
  await expect(panel.getByText(/Captured .* by voice/)).toBeVisible();
  await panel.getByText('Raw voice transcript').click();
  await expect(panel.locator('blockquote').nth(1)).toHaveText('the save button is hidden behind the keyboard');
});

test('denied microphone shows guidance and typing still works', async ({ page }) => {
  await page.addInitScript(() => {
    class Denied {
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onresult = null;
      lang = '';
      continuous = false;
      interimResults = false;
      start() {
        setTimeout(() => {
          this.onerror?.({ error: 'not-allowed' });
          this.onend?.();
        }, 20);
      }
      stop() {}
      abort() {}
    }
    Object.assign(window, { SpeechRecognition: Denied, webkitSpeechRecognition: Denied });
  });
  await page.reload();
  const panel = await openCapture(page);
  await panel.getByRole('button', { name: 'Tap and describe what you noticed' }).click();
  await expect(panel.getByRole('alert')).toContainText('Microphone access was denied');
  await capture(page, 'Typed instead');
});

test('floating button can be hidden; existing app keeps working', async ({ page }) => {
  const panel = await openCapture(page);
  await panel.getByLabel('Show the floating capture button on every screen').uncheck();
  await panel.getByRole('button', { name: 'Close QA & Feedback' }).click();
  await expect(page.getByRole('button', { name: 'Capture feedback' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Capture feedback' })).toHaveCount(0);
  await tab(page, 'Settings').click();
  await page.getByRole('button', { name: 'New observation' }).click();
  await expect(page.getByRole('dialog', { name: 'QA & Feedback' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'QA & Feedback' })).toHaveCount(0);
});
