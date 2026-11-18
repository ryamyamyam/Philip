import { expect, test, type Page } from '@playwright/test';
import { fresh, noHorizontalScroll, openSettings, seedWeights, tab } from './helpers';

/**
 * Story 15: Update goals. Progress › Goals › Update goals → now (unchanged or new) → target →
 * Generate plan → tick + Others → Philip revises or the final plan → Yes, confirm → applied (cycle kept).
 */
const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Update goals' });
const SHOTS = process.env.STORY15_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test.use({ serviceWorkers: 'block', viewport: { width: 393, height: 793 } });

const FIRST = {
  message: 'Lean bulk. A touch more food, three focused days, and I bump your incline press.',
  // Story 17 (PB-2.2): 'moderate' now reads as on-the-feet (1.65), so maintenance and the bulk range moved up.
  kcal: { value: 3100, why: 'About 250 over your maintenance.', basis: 'practice' },
  proteinG: { value: 140, why: 'Enough for growth.', basis: 'research' },
  fatG: { value: 80, why: 'Comfortably above the floor.' },
  carbDays: { value: true, why: 'Fuel the sessions.' },
  cardioMin: { value: 15, why: 'Heart and habit.', basis: 'default' },
  days: { value: [1, 3, 5], why: 'Three days you will actually make.', basis: 'practice' },
  swaps: [],
  remember: [],
};
const SECOND = { ...FIRST, message: 'Earlier it is: more food, and the date moves up.', kcal: { value: 3080, why: 'Faster, still lean.', basis: 'practice' } };

function mockGemini(page: Page, replies: object[]) {
  const prompts: string[] = [];
  void page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const body = route.request().postDataJSON() as { contents: { parts: { text: string }[] }[] };
    prompts.push(body.contents[0]?.parts[0]?.text ?? '');
    const reply = replies[Math.min(prompts.length - 1, replies.length - 1)];
    await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }] } });
  });
  return prompts;
}

async function setKey(page: Page) {
  await openSettings(page);
  await page.getByRole('textbox', { name: 'Gemini API key' }).fill('test-key-123');
  await page.getByRole('region', { name: 'Photo & text analysis (Gemini)' }).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Gemini settings saved.' })).toBeVisible();
}

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
  await seedStats(page);
  await page.reload();
  await main(page).getByRole('button', { name: 'Start cycle 1' }).click();
  await expect(main(page).getByRole('button', { name: /Today’s workout: Day 1/ })).toBeVisible();
}

/** Body stats, so the calculator knows his maintenance (as on the owner's phone). */
async function seedStats(page: Page) {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open('philip');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const tx = db.transaction('profile', 'readwrite');
    const store = tx.objectStore('profile');
    const get = store.get('me');
    get.onsuccess = () => store.put({ ...get.result, sex: 'male', heightCm: 184, birthDate: '1998-01-01', activityLevel: 'moderate', weightKg: 73 });
    await new Promise((res) => (tx.oncomplete = res));
    db.close();
  });
}

async function openUpdate(page: Page) {
  await tab(page, 'Progress').click();
  await page.getByRole('region', { name: 'Goals' }).getByRole('button', { name: 'Update goals' }).click();
  await expect(sheet(page)).toBeVisible();
}

test('no Philip connection: the app’s draft, tick, Looks good → final plan → Yes, confirm (cycle kept)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  await fresh(page, { at: 'home' });
  await startCycleOne(page);
  await page.clock.setFixedTime(new Date('2026-11-12T10:00:00'));
  await page.reload();
  await openUpdate(page);

  const s = sheet(page);
  await expect(s.getByRole('radio', { name: /^Unchanged/ }).first()).toHaveAttribute('aria-checked', 'true');
  await s.getByLabel(/^Target weight/).fill('168');
  await s.getByLabel(/^Target body fat/).fill('15');
  await expect(s).toContainText('A bulk');
  await shot(page, '1-setup');
  await s.getByRole('button', { name: 'Generate plan' }).click();

  await expect(s).toContainText('The app’s formula draft');
  await expect(s).toContainText('Goal date (estimate)');
  await expect(s).toContainText(/By .* about .* weeks/);
  await expect(s).toContainText('Protein / fat / carbs');
  await expect(s).toContainText('Extra carbs on gym days');
  await noHorizontalScroll(page);
  await shot(page, '2-draft');

  await s.getByRole('checkbox', { name: /Incline walk|Cardio/ }).uncheck();
  await page.getByRole('button', { name: 'Looks good' }).click();
  await expect(s).toContainText('Final plan');
  await expect(s).toContainText('kcal a day');
  await expect(s).not.toContainText('min incline walk');
  await shot(page, '3-final');
  await page.getByRole('button', { name: 'Yes, confirm' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your nutrition and training goals are updated.' })).toBeVisible();
  await expect(sheet(page)).toBeHidden();
  // Same cycle: Workout still on block A, week 1, day 1 (no restart).
  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: /^Workout/ }).click();
  await expect(main(page)).toContainText('Block A · Week 1');
  await expect(main(page).getByRole('button', { name: /Today’s workout: Day 1/ })).toBeVisible();
});

test('Philip plans; a note in Others sends it back; the revision moves the date; Yes applies days and food', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  const prompts = mockGemini(page, [FIRST, SECOND]);
  await fresh(page, { at: 'home' });
  await setKey(page);
  await startCycleOne(page);
  await page.clock.setFixedTime(new Date('2026-11-12T10:00:00'));
  await page.reload();
  await openUpdate(page);

  const s = sheet(page);
  await s.getByRole('radio', { name: 'New number' }).first().click();
  await s.getByLabel(/^Weight today/).fill('163');
  await s.getByLabel(/^Target weight/).fill('170');
  await s.getByRole('button', { name: 'Generate plan' }).click();
  await expect(s).toContainText('Lean bulk. A touch more food');
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).toContain('Now: 73.9 kg');
  expect(prompts[0]).toContain('estimates the goal date');
  await expect(s).toContainText('3 days (Mon Wed Fri)');
  await expect(s).toContainText('Research-backed');
  // Close and come back: the plan waits for him ("See Philip's plan"), no second request.
  await s.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('region', { name: 'Goals' }).getByRole('button', { name: 'See Philip’s plan' }).click();
  await expect(s).toContainText('Lean bulk. A touch more food');
  expect(prompts).toHaveLength(1);
  const dateBefore = await s.getByText(/^By /).first().textContent();
  await shot(page, '4-philip-plan');

  await s.getByLabel('Anything else? Tell Philip').fill('I wanna do this earlier.');
  await page.getByRole('button', { name: 'Send to Philip' }).click();
  await expect(s).toContainText('Earlier it is');
  expect(prompts).toHaveLength(2);
  expect(prompts[1]).toContain('--- Follow-up ---');
  expect(prompts[1]).toContain('I wanna do this earlier.');
  expect(prompts[1]).toContain('KEPT kcal 3100');
  const dateAfter = await s.getByText(/^By /).first().textContent();
  expect(dateAfter).not.toBe(dateBefore);
  await shot(page, '5-revised');

  await page.getByRole('button', { name: 'Looks good' }).click();
  await expect(s).toContainText('3 days a week: Mon Wed Fri');
  await page.getByRole('button', { name: 'Yes, confirm' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your nutrition and training goals are updated.' })).toBeVisible();

  // The weigh-in was saved, and the training days changed.
  await openSettings(page);
  const days = main(page).getByRole('group', { name: 'Training days' });
  await expect(days.getByRole('button', { name: 'Wed' })).toHaveAttribute('aria-pressed', 'true');
  await expect(days.getByRole('button', { name: 'Tue' })).toHaveAttribute('aria-pressed', 'false');
});

test('a weigh-in hands off to Update goals with the new average as "now"', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  await fresh(page, { at: 'home' });
  await startCycleOne(page);
  await page.clock.setFixedTime(new Date('2026-11-12T10:00:00'));
  await page.reload();
  await tab(page, 'Progress').click();
  const card = page.getByRole('region', { name: 'Log weight' });
  await card.getByLabel(/^Weight/).fill('163');
  await card.getByRole('button', { name: 'Log weight' }).click();
  await page.getByRole('button', { name: 'Update goals' }).first().click();
  const s = sheet(page);
  await expect(s.getByRole('radio', { name: /^Unchanged/ }).first()).toHaveAttribute('aria-checked', 'true');
  await expect(s.getByRole('button', { name: 'Generate plan' })).toBeEnabled();
});
