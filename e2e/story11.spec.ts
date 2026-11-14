import { expect, test, type Page } from '@playwright/test';
import { fresh, seedWeights, tab } from './helpers';

/** Story 11: goal reached → next goal → Philip's plan → Apply / Undo; Claude paste; Home reminder. */
const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page, name = 'Goal reached') => page.getByRole('dialog', { name });
const SHOTS = process.env.STORY11_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};

// Gemini is mocked with page.route(), which misses service-worker fetches (see photo.spec.ts).
test.use({ serviceWorkers: 'block', viewport: { width: 393, height: 793 } });

const PLAN = {
  message: 'Goal hit two weeks early. Same pace again, a little more protein.',
  kcal: { value: 2900, why: 'Your logs say maintenance is about 2,650.' },
  proteinG: { value: 150, why: 'Two grams per kilo while we build.' },
  cardioMin: { value: 15, why: 'Recovery first.' },
  days: null,
  swaps: [],
  remember: [],
};

function mockGemini(page: Page, reply: object) {
  const prompts: string[] = [];
  void page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const body = route.request().postDataJSON() as { contents: { parts: { text: string }[] }[] };
    prompts.push(body.contents[0]?.parts[0]?.text ?? '');
    await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }] } });
  });
  return prompts;
}

async function setKey(page: Page) {
  await tab(page, 'Settings').click();
  await page.getByRole('textbox', { name: 'Gemini API key' }).fill('test-key-123');
  await page.getByRole('region', { name: 'Photo & text analysis (Gemini)' }).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Gemini settings saved.' })).toBeVisible();
}

/** Program set up and cycle 1 started on 2 Nov at 73 kg (Philip's goal: 74 kg). */
async function startCycleOne(page: Page) {
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
  await expect(main(page).getByRole('button', { name: /Today’s workout: Day 1/ })).toBeVisible();
}

/** 18 Nov: yesterday 74.2 kg; logging 165 lb (74.8 kg) today puts the 7-day average over 74 kg. */
async function reachGoal(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-18T10:00:00'));
  await page.reload();
  await seedWeights(page, [73, 74.2]);
  await page.reload();
  await expect(sheet(page)).toHaveCount(0);
  await tab(page, 'Progress').click();
  const card = page.getByRole('region', { name: 'Log weight' });
  await card.getByLabel(/^Weight/).fill('165');
  await card.getByRole('button', { name: 'Log weight' }).click();
}

test('goal reached pops up; "Same again" is preselected; Philip plans; Apply starts cycle 2; Undo puts it back', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  const prompts = mockGemini(page, PLAN);
  await fresh(page, { at: 'home' });
  await setKey(page);
  await startCycleOne(page);
  await reachGoal(page);

  const s = sheet(page);
  await expect(s).toBeVisible();
  await expect(s).toContainText('Goal hit. I knew you had it.');
  await expect(s.getByRole('radio', { name: 'Same again' })).toHaveAttribute('aria-checked', 'true');
  await expect(s).toContainText('Cycle 1 ends today. Cycle 2 (Block B) starts with this goal.');
  await shot(page, '1-goal-reached');
  await s.getByRole('button', { name: 'Ask Philip for the plan' }).click();

  await expect(s).toContainText('Goal hit two weeks early.');
  await expect(s).toContainText('Protein');
  await expect(s).toContainText('150 g');
  expect(prompts.at(-1)).toContain("reached this cycle's goal");
  expect(prompts.at(-1)).toContain('New goal: bulk');
  expect(prompts.at(-1)).toContain("--- Philip's brief");
  await shot(page, '2-review');

  // Keep the cardio as it is (switch it off), apply the rest.
  await s.getByRole('checkbox', { name: /Cardio walk/ }).uncheck();
  await s.getByRole('button', { name: 'Yes, let’s go' }).click();
  await expect(s).toHaveCount(0);
  const toast = page.getByRole('status').filter({ hasText: 'New plan is live.' });
  await expect(toast).toBeVisible();

  await tab(page, 'Home').click();
  await expect(main(page).getByRole('button', { name: /^Workout/ })).toContainText('Block B');
  await expect(main(page)).toContainText('Goal');

  // Progress › Goals shows the reached goal; Undo there puts cycle 1 back.
  await tab(page, 'Progress').click();
  const goals = page.getByRole('region', { name: 'Goals' });
  await expect(goals).toContainText('Reached');
  await goals.getByRole('button', { name: 'Undo last plan' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Plan undone.' })).toBeVisible();
  await tab(page, 'Home').click();
  await expect(main(page).getByRole('button', { name: /^Workout/ })).toContainText('Block A');
});

test('no key: ask Philip in Claude by pasting his reply; "Later" leaves a reminder on Home', async ({ page, context, browserName }) => {
  // WebKit has no clipboard permissions to grant (see qa-feedback.spec.ts); the copy check runs in Chromium.
  const chromium = browserName === 'chromium';
  if (chromium) await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  await fresh(page, { at: 'home' });
  await startCycleOne(page);
  await reachGoal(page);

  const s = sheet(page);
  await expect(s).toBeVisible();
  // "Later": the sheet closes, Home keeps the reminder and reopens it.
  await s.getByRole('button', { name: 'Close' }).click();
  await tab(page, 'Home').click();
  await expect(main(page)).toContainText('You hit your goal.');
  await shot(page, '3-home-reminder');
  await main(page).getByRole('button', { name: 'Next goal' }).click();
  await expect(s).toBeVisible();

  await s.getByRole('button', { name: 'Ask Philip for the plan' }).click();
  await expect(s).toContainText('Philip needs a way to think');
  await s.getByRole('button', { name: 'Ask Philip in Claude' }).click();
  if (chromium) {
    await s.getByRole('button', { name: 'Copy prompt' }).click();
    await expect(s.getByRole('button', { name: 'Prompt copied' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Reply with JSON only');
  }

  await s.getByLabel('Claude’s reply').fill('not json');
  await s.getByRole('button', { name: 'Use this reply' }).click();
  await expect(s.getByRole('alert')).toContainText('isn’t the plan JSON');
  await s.getByLabel('Claude’s reply').fill('Here you go:\n```json\n' + JSON.stringify(PLAN) + '\n```');
  await s.getByRole('button', { name: 'Use this reply' }).click();
  await expect(s).toContainText('Philip (via Claude)');

  await s.getByRole('button', { name: 'Not now, keep my plan' }).click();
  await expect(s).toHaveCount(0);
  await tab(page, 'Home').click();
  await expect(main(page)).not.toContainText('You hit your goal.');
  await expect(main(page).getByRole('button', { name: 'Ask Philip' })).toBeVisible();
});
