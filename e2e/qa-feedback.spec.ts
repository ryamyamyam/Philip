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

/** Story 3: QA & Feedback opens from Settings only (no floating button). */
async function openQa(page: Page) {
  await tab(page, 'Settings').click();
  await page.getByRole('button', { name: 'Write feedback' }).click();
}

/** Answers the "archive the included suggestions?" question asked right after each generation. */
async function keepActive(page: Page) {
  const ask = page.getByRole('alertdialog', { name: 'Do you want to archive the suggestions included in this prompt?' });
  await ask.getByRole('button', { name: 'Keep active' }).click();
  await expect(ask).toHaveCount(0);
}

async function openCapture(page: Page) {
  await openQa(page);
  const panel = page.getByRole('dialog', { name: 'QA & Feedback' });
  await expect(panel).toBeVisible();
  return panel;
}

async function capture(page: Page, text: string, opts: { type?: string; feature?: string } = {}) {
  const panel = page.getByRole('dialog', { name: 'QA & Feedback' });
  await panel.getByLabel('What did you notice?').fill(text);
  if (opts.type) await panel.getByRole('button', { name: opts.type, exact: true }).click();
  await panel.getByRole('button', { name: 'Save observation' }).click();
  await expect(panel.getByText(/Saved “/)).toBeVisible();
  // OBS-A09A21: Feature or screen is no longer on the capture form; it's set on the detail screen.
  if (opts.feature !== undefined) {
    await panel.getByRole('button', { name: 'open it' }).click();
    await panel.getByLabel('Feature or screen').fill(opts.feature);
    await panel.getByRole('button', { name: 'Save changes' }).click();
    await expect(panel.getByRole('button', { name: 'Saved' })).toBeDisabled();
    await panel.getByRole('button', { name: 'Capture', exact: true }).click();
  }
}

async function setGeminiKey(page: Page) {
  await tab(page, 'Settings').click();
  await page.getByRole('textbox', { name: 'Gemini API key' }).fill('test-key-123');
  await page.getByRole('region', { name: 'Photo & text analysis (Gemini)' }).getByRole('button', { name: 'Save', exact: true }).click();
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
  // OBS-A09A21: no project picker, Feature or screen, Structure with AI or More details on the form.
  await expect(panel.getByLabel('What did you notice?')).toBeVisible();
  await expect(panel.getByLabel('Project', { exact: true })).toHaveCount(0);
  await expect(panel.getByLabel('Feature or screen')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Structure with AI' })).toHaveCount(0);
  await expect(panel.getByText('More details (optional)')).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Feedback list' }).click();
  const inbox = page.getByRole('dialog', { name: 'QA & Feedback' });
  const item = inbox.getByRole('list', { name: 'Observations' }).getByRole('listitem');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Bug');
  await expect(item.getByLabel('2 screenshots')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/375-qa-inbox.png' });
  // OBS-EF13DE: the inbox shows the one type chosen at capture, labeled the same as the capture chip.
  await expect(item.locator('.qa-badge-type')).toHaveText('Type: Bug');
  await expect(item.locator('.qa-badge-type')).toHaveClass(/qa-type-bug/);

  await item.getByRole('button').click();
  await expect(inbox.getByRole('list').locator('.qa-shot')).toHaveCount(2);
  await inbox.getByLabel('Title').fill('Ring overlaps date');
  await inbox.getByLabel('What should happen (expected)').fill('Ring sits below the date');
  await inbox.getByLabel('Status').selectOption('reviewed');
  await inbox.getByRole('button', { name: 'Save changes' }).click();
  await expect(inbox.getByRole('button', { name: 'Saved' })).toBeDisabled();
  await page.screenshot({ path: 'e2e/screenshots/375-qa-detail.png', fullPage: false });

  await page.reload();
  await openQa(page);
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

test('search and filters (single project, no picker)', async ({ page }) => {
  const panel = await openCapture(page);
  await capture(page, 'Export button does nothing on iOS', { type: 'Bug', feature: 'Settings' });
  await capture(page, 'Add a dark mode', { type: 'Feature request', feature: 'App' });
  await capture(page, 'Macro bars are too thin to read', { type: 'UI issue', feature: 'Today' });

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

  // OBS-A09A21: one project per app — there is no project picker any more.
  await expect(panel.getByLabel('Project', { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('option', { name: '+ New project…' })).toHaveCount(0);
});

test('batch select → template prompt → edit protection → copy and .txt export', async ({ page, context, browserName }) => {
  // WebKit has no clipboard permissions to grant; the app falls back to a manual copy.
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const panel = await openCapture(page);
  await capture(page, 'Ring overlaps the date', { feature: 'Today', type: 'UI issue' });
  await capture(page, 'Meal list jumps when adding food', { feature: 'today', type: 'Bug' });
  await capture(page, 'Export should include notes', { feature: 'Settings', type: 'Feature request' });

  await panel.getByRole('button', { name: /^Inbox/ }).click();
  await panel.getByRole('button', { name: 'Select visible' }).click();
  await expect(panel.getByText('3 shown · 3 selected')).toBeVisible();
  await panel.getByRole('button', { name: 'Build prompt from 3 selected' }).click();
  await expect(panel.getByText('3 observations in 2 groups')).toBeVisible();
  await panel.getByRole('button', { name: 'Generate prompt' }).click();
  await keepActive(page);
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
  // Copy/export no longer archive anything on their own.

  await panel.getByRole('button', { name: 'Copy' }).click();
  if (browserName === 'chromium') {
    // Clipboard read/write is only grantable in Chromium; WebKit shows the manual-copy fallback instead.
    await expect(panel.getByText('Copied. Paste it into Claude Code.')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('MY NOTE');
  }

  await page.evaluate(() => Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }));
  const [download] = await Promise.all([page.waitForEvent('download'), panel.getByRole('button', { name: 'Save .txt' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^philip-dev-prompt-\d{4}-\d{2}-\d{2}-\d{4}\.txt$/);
  const path = test.info().outputPath('prompt.txt');
  await download.saveAs(path);
  expect(readFileSync(path, 'utf8')).toContain('MY NOTE');
  await panel.getByRole('button', { name: /^Inbox/ }).click();
  await expect(panel.getByRole('list', { name: 'Observations' }).getByRole('listitem')).toHaveCount(3);

  // Edited prompt survives reopening.
  await page.reload();
  await openQa(page);
  await page.getByRole('dialog').getByRole('button', { name: /^Prompt/ }).click();
  await page.getByText('Recent prompts').click();
  await page.getByRole('button', { name: /3 observations · template/ }).click();
  await expect(page.getByRole('dialog').getByLabel(/^Prompt/)).toHaveValue(/MY NOTE$/);
});

test('AI analysis (detail screen) and AI prompt help are optional and failures never block saving', async ({ page }) => {
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
  // OBS-A09A21: no AI on the capture form, even with a key. Capture never calls the AI.
  await expect(panel.getByRole('button', { name: 'Structure with AI' })).toHaveCount(0);
  await panel.getByLabel('What did you notice?').fill(words);
  await panel.getByRole('button', { name: 'Save observation' }).click();
  await expect(panel.getByText(/Saved “calorie ring overlaps/)).toBeVisible();
  await panel.getByLabel('What did you notice?').fill('Second note while AI is down');
  await panel.getByRole('button', { name: 'Save observation' }).click();
  await expect(panel.getByText('Saved “Second note while AI is down”')).toBeVisible();
  expect(bodies).toHaveLength(0);

  // AI analysis is still available on the detail screen and only fills empty fields.
  await panel.getByRole('button', { name: /^Inbox/ }).click();
  await panel.getByRole('button', { name: /calorie ring overlaps/ }).click();
  await panel.getByLabel(/^Title/).fill('Ring overlaps date');
  await panel.getByRole('button', { name: 'Analyze with AI' }).click();
  await expect(panel.getByText(/suggestions, not facts/)).toBeVisible();
  // Critical without a reason is not suggested.
  await expect(panel.getByText(/priority: Critical/)).toHaveCount(0);
  expect(bodies[0]).toContain('<user_data');
  expect(bodies[0]).not.toContain('test-key-123');
  await panel.getByRole('button', { name: 'Fill empty fields from suggestions' }).click();
  await expect(panel.getByLabel(/^Title/)).toHaveValue('Ring overlaps date');
  await expect(panel.getByLabel(/^Description/)).toHaveValue('Calorie ring overlaps the date header at large text sizes.');
  await panel.getByRole('button', { name: 'Save changes' }).click();
  await expect(panel.getByRole('button', { name: 'Saved' })).toBeDisabled();
  await expect(panel.locator('blockquote').first()).toHaveText(words);
  await expect(panel.locator('.qa-badge-ai').first()).toBeVisible();

  // AI failure: message shown, nothing lost.
  mode = 'fail';
  await panel.getByRole('button', { name: 'Re-analyze' }).click();
  await expect(panel.getByRole('alert')).toContainText('server error');
  await expect(panel.getByLabel(/^Title/)).toHaveValue('Ring overlaps date');

  // Prompt: AI failure falls back to template; AI success never drops an observation.
  await panel.getByRole('button', { name: /^Inbox/ }).click();
  await panel.getByRole('button', { name: 'Select visible' }).click();
  await panel.getByRole('button', { name: /Build prompt/ }).click();
  await panel.getByRole('button', { name: 'Improve with AI' }).click();
  await expect(panel.getByRole('alert')).toContainText('The template prompt still works');
  await panel.getByRole('button', { name: 'Generate prompt' }).click();
  await keepActive(page);
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
  await expect(panel.getByRole('alert')).toContainText('Microphone access is blocked');
  await expect(panel.getByRole('button', { name: 'Tap and describe what you noticed' })).toBeVisible();
  await capture(page, 'Typed instead');
});

test('OBS-591E6F: the panel is a bottom sheet with the app visible above it', async ({ page }) => {
  const panel = await openCapture(page);
  const box = await panel.boundingBox();
  expect(box!.y).toBeGreaterThan(30);
  await expect(page.locator('.qa-scrim')).toBeVisible();
  // Every type is offered at capture and the chosen one is what the inbox shows (OBS-EF13DE).
  for (const label of ['Bug', 'UI issue', 'Usability', 'Feature request', 'Optimization', 'Other']) {
    await expect(panel.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await panel.getByRole('button', { name: 'Optimization', exact: true }).click();
  await page.screenshot({ path: 'e2e/screenshots/375-qa-sheet.png' });
  await panel.getByLabel('What did you notice?').fill('Inbox type should be obvious');
  await panel.getByRole('button', { name: 'Save observation' }).click();
  await panel.getByRole('button', { name: /^Inbox/ }).click();
  const item = panel.getByRole('list', { name: 'Observations' }).getByRole('listitem');
  await expect(item.locator('.qa-badge-type')).toHaveText('Type: Optimization');
  await expect(item.locator('.qa-badge-type')).toHaveClass(/qa-type-optimization/);
  await page.screenshot({ path: 'e2e/screenshots/375-qa-inbox-types.png' });
});

test('OBS-748382: a recognizer that never starts or ends can still be stopped', async ({ page }) => {
  // What iOS does after "Don't Allow": start() is accepted but no events ever arrive.
  await page.addInitScript(() => {
    class Stuck {
      onerror = null;
      onend = null;
      onresult = null;
      onstart = null;
      lang = '';
      continuous = false;
      interimResults = false;
      start() {}
      stop() {}
      abort() {}
    }
    Object.assign(window, { SpeechRecognition: Stuck, webkitSpeechRecognition: Stuck });
  });
  await page.reload();
  const panel = await openCapture(page);
  await panel.getByRole('button', { name: 'Tap and describe what you noticed' }).click();
  await panel.getByRole('button', { name: 'Listening… tap to stop' }).click();
  // Stop always works: the session is ended even though the recognizer never confirms.
  await expect(panel.getByRole('button', { name: 'Tap and describe what you noticed' })).toBeVisible({ timeout: 3000 });
  await expect(panel.getByLabel('What did you notice?')).not.toHaveAttribute('readonly');
  // Left alone, the start watchdog ends it with guidance instead of "listening" forever.
  await panel.getByRole('button', { name: 'Tap and describe what you noticed' }).click();
  await expect(panel.getByRole('alert')).toContainText('The microphone didn’t start', { timeout: 9000 });
  await expect(panel.getByRole('button', { name: 'Tap and describe what you noticed' })).toBeVisible();
  await capture(page, 'Typed after mic failure');
});

test('Story 3: no floating button; QA & Feedback opens from Settings and the app keeps working', async ({ page }) => {
  for (const where of ['Today', 'Progress', 'Settings'] as const) {
    await tab(page, where).click();
    await expect(page.getByRole('button', { name: 'Capture feedback' })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Write feedback' }).click();
  const panel = page.getByRole('dialog', { name: 'QA & Feedback' });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Show the floating capture button on every screen')).toHaveCount(0);
  // Capture needs only the text.
  await capture(page, 'Make the log button bigger');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await page.getByRole('button', { name: 'Feedback list' }).click();
  await expect(panel.getByRole('list', { name: 'Observations' })).toContainText('Make the log button bigger');
});

test('Story 3: generating a prompt asks to archive; yes archives only the included items, no keeps them active; archive is grouped by date', async ({ page }) => {
  const panel = await openCapture(page);
  await capture(page, 'Heading repeats the date', { feature: 'Today', type: 'UI issue' });
  await capture(page, 'Swipe is flaky', { feature: 'Today', type: 'Bug' });
  await capture(page, 'Keep this one open', { feature: 'Settings', type: 'Other' });

  await panel.getByRole('button', { name: /^Inbox/ }).click();
  const list = panel.getByRole('list', { name: 'Observations' });
  const items = list.locator('.qa-item');
  await list.getByRole('checkbox', { name: 'Select Heading repeats the date' }).check();
  await list.getByRole('checkbox', { name: 'Select Swipe is flaky' }).check();
  // Selecting and opening the builder archives nothing.
  await panel.getByRole('button', { name: 'Build prompt from 2 selected' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await panel.getByRole('button', { name: /^Inbox/ }).click();
  await expect(items).toHaveCount(3);
  await panel.getByRole('button', { name: /^Prompt/ }).click();

  // Generate → asked immediately. "Keep active" leaves everything in the active list.
  await panel.getByRole('button', { name: 'Generate prompt' }).click();
  const ask = page.getByRole('alertdialog', { name: 'Do you want to archive the suggestions included in this prompt?' });
  await expect(ask).toContainText('2 suggestions will leave the active list');
  await page.screenshot({ path: 'e2e/screenshots/375-qa-archive-ask.png' });
  await ask.getByRole('button', { name: 'Keep active' }).click();
  await panel.getByRole('button', { name: /^Inbox/ }).click();
  await expect(items).toHaveCount(3);

  // Generate again → asked again → Archive. The prompt stays available to copy.
  await panel.getByRole('button', { name: /^Prompt/ }).click();
  await panel.getByRole('button', { name: /enerate prompt$/ }).click();
  await ask.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 observations archived' })).toBeVisible();
  await expect(panel.getByLabel(/^Prompt \(template\)/)).toHaveValue(/Swipe is flaky/);
  await panel.getByRole('button', { name: /^Inbox/ }).click();
  await expect(items).toHaveCount(1);
  await expect(list).toContainText('Keep this one open');
  await expect(panel.getByText('1 shown')).toBeVisible(); // selection cleared with the archived items

  // Archived tab: grouped under the day they were archived, struck through.
  await panel.getByRole('tab', { name: 'Archived' }).click();
  await expect(items).toHaveCount(2);
  await expect(list.locator('.qa-day-heading')).toHaveCount(1);
  await expect(list.locator('.qa-day-heading')).toHaveText(/^Archived /);
  await expect(list.locator('.qa-item-archived .qa-item-title').first()).toHaveCSS('text-decoration-line', 'line-through');
  await expect(list).not.toContainText('Keep this one open');
  await page.screenshot({ path: 'e2e/screenshots/375-qa-archived-inbox.png' });

  // Unarchive from the detail screen brings it back to Active.
  await list.getByRole('button', { name: /Swipe is flaky/ }).click();
  await expect(panel.getByText(/Archived .*after a prompt was generated from it/)).toBeVisible();
  await panel.getByRole('button', { name: 'Unarchive' }).click();
  await panel.getByRole('button', { name: '‹ Inbox' }).click();
  await expect(items).toHaveCount(1);
  await panel.getByRole('tab', { name: 'Active' }).click();
  await expect(items).toHaveCount(2);
});

test('OBS-A09A21 / OBS-97D767: archive feedback already turned into a prompt; counts exclude archived; archive view', async ({ page }) => {
  const panel = await openCapture(page);
  await capture(page, 'First suggestion');
  await capture(page, 'Second suggestion');
  await capture(page, 'Third suggestion');
  const inboxTab = panel.getByRole('button', { name: /^Inbox/ });
  await expect(inboxTab).toHaveText('Inbox (3)');

  // Turn two into a prompt and keep them active.
  await inboxTab.click();
  const list = panel.getByRole('list', { name: 'Observations' });
  await list.getByRole('checkbox', { name: 'Select First suggestion' }).check();
  await list.getByRole('checkbox', { name: 'Select Second suggestion' }).check();
  await panel.getByRole('button', { name: 'Build prompt from 2 selected' }).click();
  await panel.getByRole('button', { name: 'Generate prompt' }).click();
  await keepActive(page);
  const promptText = await panel.getByLabel(/^Prompt \(template\)/).inputValue();
  expect(promptText).toContain('First suggestion');

  // Converted items are marked in the inbox, and the detail screen offers Archive.
  await inboxTab.click();
  await expect(list.getByRole('listitem').filter({ hasText: 'First suggestion' })).toContainText('In a prompt');
  await expect(list.getByRole('listitem').filter({ hasText: 'Third suggestion' })).not.toContainText('In a prompt');
  await list.getByRole('button', { name: /First suggestion/ }).click();
  await expect(panel.getByText('Already turned into a prompt.', { exact: false })).toBeVisible();
  await panel.getByRole('button', { name: 'Archive', exact: true }).first().click();
  await expect(page.getByRole('status').filter({ hasText: '1 observation archived' })).toBeVisible();
  await expect(panel.getByText(/^Archived .+\.$/)).toBeVisible();
  await expect(inboxTab).toHaveText('Inbox (2)');

  // Back in the prompt builder, the remaining included item can be archived from there.
  await panel.getByRole('button', { name: /^Prompt/ }).click();
  await page.getByText('Recent prompts').click();
  await page.getByRole('button', { name: /2 observations · template/ }).click();
  await panel.getByRole('button', { name: 'Archive the 1 in this prompt' }).click();
  await expect(inboxTab).toHaveText('Inbox (1)');

  // Archived list: both are there; the prompt is untouched.
  await inboxTab.click();
  await expect(panel.getByRole('tab', { name: 'Active · 1' })).toBeVisible();
  await panel.getByRole('tab', { name: 'Archived · 2' }).click();
  await expect(list.getByRole('listitem').filter({ hasText: /suggestion/ })).toHaveCount(2);
  await panel.getByRole('button', { name: /^Prompt/ }).click();
  await page.getByText('Recent prompts').click();
  await page.getByRole('button', { name: /2 observations · template/ }).click();
  await expect(panel.getByLabel(/^Prompt \(template\)/)).toHaveValue(promptText);

  // Bulk: archive the last active one from the inbox, then undo.
  await inboxTab.click();
  await panel.getByRole('tab', { name: /^Active/ }).click();
  await list.getByRole('checkbox', { name: 'Select Third suggestion' }).check();
  await panel.getByRole('button', { name: 'Archive 1' }).click();
  await expect(inboxTab).toHaveText('Inbox (0)');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(inboxTab).toHaveText('Inbox (1)');

  // Settings has a direct way to the archived suggestions; they survive a reload.
  await page.reload();
  await tab(page, 'Settings').click();
  await page.getByRole('button', { name: 'Archived', exact: true }).click();
  const qa = page.getByRole('dialog', { name: 'QA & Feedback' });
  await expect(qa.getByRole('tab', { name: 'Archived · 2' })).toHaveAttribute('aria-selected', 'true');
  await expect(qa.getByRole('list', { name: 'Observations' })).toContainText('First suggestion');
  await expect(qa.getByRole('button', { name: /^Inbox/ })).toHaveText('Inbox (1)');
  await noHorizontalScroll(page);
});
