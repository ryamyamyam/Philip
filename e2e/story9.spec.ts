import { expect, test, type Page } from '@playwright/test';
import { fresh, noHorizontalScroll, seedWeights, tab } from './helpers';

/** Story 9: Philip's memory — brief in every prompt, remembered notes, Ask Philip, Settings › Philip's memory. */
const main = (page: Page) => page.getByRole('main');
const SHOTS = process.env.STORY9_SHOTS;

// Gemini is mocked with page.route(), which misses service-worker fetches (see photo.spec.ts).
test.use({ serviceWorkers: 'block', viewport: { width: 393, height: 793 } });

async function setKey(page: Page) {
  await tab(page, 'Settings').click();
  await page.getByRole('textbox', { name: 'Gemini API key' }).fill('test-key-123');
  await page.getByRole('region', { name: 'Photo & text analysis (Gemini)' }).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Gemini settings saved.' })).toBeVisible();
}

async function setUpAndOpenDay1(page: Page) {
  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: /^Workout/ }).click();
  const lift = (name: string) => main(page).getByRole('group', { name });
  await lift('Back squat').getByLabel('Weight (kg)').fill('150');
  await lift('Bench press').getByLabel('Weight (kg)').fill('100');
  await lift('Romanian deadlift').getByLabel('Weight (kg)').fill('115');
  await lift('Overhead press').getByLabel('Weight (kg)').fill('50');
  await main(page).getByRole('button', { name: 'Save my numbers' }).click();
  await seedWeights(page, [73, 73.2, 72.8]);
  await page.reload();
  await main(page).getByRole('button', { name: 'Start cycle 1' }).click();
  await main(page).getByRole('button', { name: /Today’s workout: Day 1/ }).click();
}

function mockGemini(page: Page, replies: object[]) {
  const prompts: string[] = [];
  void page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const body = route.request().postDataJSON() as { contents: { parts: { text: string }[] }[] };
    prompts.push(body.contents[0]?.parts[0]?.text ?? '');
    const r = replies[Math.min(prompts.length - 1, replies.length - 1)];
    await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(r) }] }, finishReason: 'STOP' }] } });
  });
  return prompts;
}

test('Ask Philip without a key points to Settings', async ({ page }) => {
  await fresh(page, { at: 'home' });
  await main(page).getByRole('button', { name: 'Ask Philip' }).click();
  await expect(page.getByRole('heading', { name: 'Ask Philip', level: 1 })).toBeVisible();
  await expect(main(page)).toContainText('I need a Gemini key');
  await main(page).getByRole('button', { name: 'Add a Gemini key in Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Philip’s memory' })).toContainText('No notes yet.');
});

test('the report reads the history and keeps a note; Ask Philip answers from it; memory is managed in Settings', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  const prompts = mockGemini(page, [
    { message: 'Squat moved. Lunges stay light while that knee complains.', changes: [], remember: ['Left knee complains on walking lunges'] },
    { message: 'Your squat top set was 115.3 kg for 1 today. Next week we push it.', remember: ['Wants a 150 kg squat by summer'] },
    { message: 'Noted.', remember: [] },
  ]);
  await fresh(page);
  await setKey(page);
  await setUpAndOpenDay1(page);
  await main(page).getByRole('button', { name: 'Start workout' }).click();
  const squat = main(page).getByRole('region', { name: 'Back squat', exact: true });
  await squat.getByRole('listitem').nth(3).getByRole('button', { name: 'Set 4: as ordered' }).click();
  await main(page).getByRole('button', { name: 'Finish workout' }).click();
  await main(page).getByRole('button', { name: 'Yes, that is right' }).click();

  const report = main(page).getByRole('region', { name: 'Philip’s report' });
  await expect(report).toContainText('Squat moved.');
  // The report prompt starts with Philip's brief, then today's workout.
  expect(prompts[0]).toContain("--- Philip's brief");
  expect(prompts[0]).toContain('Training maxes now (kg): squat 135');
  expect(prompts[0]).toContain('7-day average');
  expect(prompts[0].indexOf("--- Philip's brief")).toBeLessThan(prompts[0].indexOf("Today's workout:"));

  // Ask Philip: the brief now has the workout and the note.
  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: 'Ask Philip' }).click();
  await main(page).getByRole('textbox', { name: 'Your question' }).fill('How did my squat go?');
  await main(page).getByRole('button', { name: 'Send' }).click();
  const thread = main(page).getByRole('list', { name: 'Conversation with Philip' });
  await expect(thread).toContainText('You: How did my squat go?');
  await expect(thread).toContainText('Philip: Your squat top set was 115.3 kg');
  expect(prompts[1]).toContain('Left knee complains on walking lunges');
  expect(prompts[1]).toMatch(/- squat: 11-02 [\d.]+x\d/);
  // The Ask chat is sent once (as this conversation), not again inside the brief.
  expect(prompts[1].match(/How did my squat go\?/g)).toHaveLength(1);
  expect(prompts[1].trim().endsWith('Lifter: How did my squat go?')).toBe(true);
  await noHorizontalScroll(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/story9-ask.png`, fullPage: true });

  // Survives a reload; the next question carries this conversation.
  await page.reload();
  await expect(thread).toContainText('Philip: Your squat top set was 115.3 kg');
  await main(page).getByRole('textbox', { name: 'Your question' }).fill('And my bench?');
  await main(page).getByRole('button', { name: 'Send' }).click();
  await expect(thread).toContainText('Philip: Noted.');
  expect(prompts[2]).toContain('Lifter: How did my squat go?');
  expect(prompts[2]).toContain('Wants a 150 kg squat by summer');

  // Settings › Philip's memory: both notes, delete one, sharing off removes body data from the brief.
  await main(page).getByRole('button', { name: 'What Philip remembers' }).click();
  const memory = page.getByRole('region', { name: 'Philip’s memory' });
  await memory.scrollIntoViewIfNeeded();
  await expect(memory.getByRole('listitem')).toHaveCount(2);
  if (SHOTS) await memory.screenshot({ path: `${SHOTS}/story9-memory.png` });
  await memory.getByRole('button', { name: 'Delete note: Wants a 150 kg squat by summer' }).click();
  await expect(memory.getByRole('listitem')).toHaveCount(1);
  const shareBox = memory.getByRole('checkbox', { name: /Include body and food data/ });
  await shareBox.click(); // saved live (Dexie), so the box updates a tick later
  await expect(shareBox).not.toBeChecked();
  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: 'Ask Philip' }).click();
  await main(page).getByRole('textbox', { name: 'Your question' }).fill('Anything else?');
  await main(page).getByRole('button', { name: 'Send' }).click();
  await expect(thread.getByRole('listitem')).toHaveCount(6);
  expect(prompts[3]).toContain('body and food data not shared');
  expect(prompts[3]).not.toContain('7-day average');
  expect(prompts[3]).not.toContain('Wants a 150 kg squat');

  // Clear the chat: notes stay.
  await main(page).getByRole('button', { name: 'Clear this chat' }).click();
  await page.getByRole('alertdialog', { name: 'Clear this chat?' }).getByRole('button', { name: 'Clear chat' }).click();
  await expect(main(page)).toContainText('Nothing asked yet.');
  await tab(page, 'Settings').click();
  await expect(page.getByRole('region', { name: 'Philip’s memory' }).getByRole('listitem')).toHaveCount(1);
});
