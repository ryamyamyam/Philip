import { expect, test, type Page } from '@playwright/test';
import { fresh, seedWeights, tab } from './helpers';

/**
 * Story 17 (D-040): today's line on Home (AC 10), food follows a moved workout (AC 1–2), swap lift days
 * (AC 8) and the treadmill read during the workout (AC 6). At 393×793, the clock on Tue 17 Nov 2026.
 */
const main = (page: Page) => page.getByRole('main');
const SHOTS = process.env.STORY17_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test.use({ serviceWorkers: 'block', viewport: { width: 393, height: 793 } });

async function readStore<T>(page: Page, name: string): Promise<T[]> {
  return page.evaluate(async (name) => {
    const db: IDBDatabase = await new Promise((res) => {
      const r = indexedDB.open('philip');
      r.onsuccess = () => res(r.result);
    });
    const rows = await new Promise<unknown[]>((res) => {
      const q = db.transaction(name).objectStore(name).getAll();
      q.onsuccess = () => res(q.result);
    });
    db.close();
    return rows;
  }, name) as Promise<T[]>;
}

async function putProfile(page: Page, over: Record<string, unknown>) {
  await page.evaluate(async (over) => {
    const db: IDBDatabase = await new Promise((res) => {
      const r = indexedDB.open('philip');
      r.onsuccess = () => res(r.result);
    });
    const tx = db.transaction('profile', 'readwrite');
    const s = tx.objectStore('profile');
    const g = s.get('me');
    g.onsuccess = () => s.put({ ...g.result, ...over });
    await new Promise((res) => (tx.oncomplete = res));
    db.close();
  }, over);
}

/** The real path: profile, the Big 4, weigh-ins, cycle 1 (writes a carb-day plan). */
async function setUp(page: Page, profile: Record<string, unknown> = {}) {
  await page.clock.setFixedTime(new Date('2026-11-17T10:00:00'));
  await fresh(page, { at: 'home' });
  await putProfile(page, { sex: 'male', heightCm: 184, birthDate: '1998-01-01', activityLevel: 'sedentary', weightKg: 74, bodyFatPct: 15, bodyFatDate: '2026-11-17', goal: 'gain', trainingYears: 2, ...profile });
  await main(page).getByRole('button', { name: /^Workout/ }).click();
  const lift = (name: string) => main(page).getByRole('group', { name });
  await lift('Back squat').getByLabel('Weight (kg)').fill('150');
  await lift('Bench press').getByLabel('Weight (kg)').fill('100');
  await lift('Romanian deadlift').getByLabel('Weight (kg)').fill('115');
  await lift('Overhead press').getByLabel('Weight (kg)').fill('50');
  await main(page).getByRole('button', { name: 'Save my numbers' }).click();
  await seedWeights(page, [73.8, 74, 74.1]);
  await page.reload();
  await main(page).getByRole('button', { name: 'Start cycle 1' }).click();
}

test('AC 10: today’s line on Home: two cards, charts, window toggle remembered, no scroll, tap opens Progress', async ({ page }) => {
  await setUp(page);
  await tab(page, 'Home').click();
  const line = page.getByTestId('today-line');
  await expect(line).toBeVisible();
  const body = page.getByTestId('tl-body');
  await expect(body).toContainText('Weight');
  await expect(body).toContainText('plan');
  await expect(body).toContainText('Body fat');
  await expect(body).toHaveAttribute('aria-label', /Weight: expected .* now .*\./);
  await expect(body.locator('.tl-plan').first()).toBeAttached();
  await expect(body.locator('.tl-band').first()).toBeAttached();
  await expect(body.locator('.tl-today').first()).toBeAttached();
  // Home fits one screen.
  const [sh, ih] = await page.evaluate(() => [document.documentElement.scrollHeight, window.innerHeight]);
  expect(sh).toBeLessThanOrEqual(ih + 1);
  await shot(page, 'story17-home-body');

  // Card 2 by its dot (swiping does the same through scroll-snap).
  await line.getByRole('button', { name: 'Show Strength' }).click();
  await expect(line.getByRole('button', { name: 'Show Strength' })).toHaveAttribute('aria-pressed', 'true');
  const strength = page.getByTestId('tl-strength');
  for (const l of ['SQUAT', 'BENCH', 'RDL', 'OHP']) await expect(strength).toContainText(new RegExp(l, 'i'));
  await expect(strength).toContainText('Three sessions per lift and I can date it.');
  await expect.poll(() => page.locator('.tl-track').evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await shot(page, 'story17-home-strength');

  // The window toggle is remembered.
  await line.getByRole('radio', { name: '4 wk' }).click();
  await page.reload();
  await expect(page.getByTestId('today-line').getByRole('radio', { name: '4 wk' })).toHaveAttribute('aria-checked', 'true');

  await page.getByTestId('tl-body').click();
  await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
});

test('AC 1–2: moving today’s workout to Saturday moves the gym-day food with it, this week only', async ({ page }) => {
  await setUp(page);
  const plans = await readStore<{ id: number; weekdayOverrides: Record<string, { calories: number }> | null; inputsSnapshot: Record<string, unknown> | null }>(page, 'targetPlans');
  const plan = plans.sort((a, b) => b.id - a.id)[0]!;
  expect(plan.inputsSnapshot?.carbDays).toBe(true);
  const tue = plan.weekdayOverrides!['2']!.calories; // Tuesday: a gym day on Philip's pick
  const sun = plan.weekdayOverrides!['0']!.calories; // Sunday: a rest day
  expect(tue).toBeGreaterThan(sun);
  const fmt = (n: number) => n.toLocaleString('en-US');
  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: /^Meal log/ }).click();
  await expect(main(page)).toContainText(fmt(tue));

  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: /^Workout/ }).click();
  await main(page).getByText('Move this workout').click();
  await main(page).getByRole('button', { name: 'Move to Saturday' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Moved to Saturday' })).toBeVisible();
  const program = (await readStore<{ weekDays?: { weekStart: string; days: number[] } }>(page, 'trainingProgram'))[0];
  expect(program?.weekDays).toEqual({ weekStart: '2026-11-16', days: [1, 4, 5, 6] });

  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: /^Meal log/ }).click();
  await expect(main(page)).toContainText(fmt(sun));
  await shot(page, 'story17-today-after-move');
});

test('AC 8: swap shoulder day with leg day from the cycle plan', async ({ page }) => {
  await setUp(page);
  await main(page).getByRole('button', { name: 'Cycle plan' }).click();
  await main(page).getByText('Swap lift days').click();
  await main(page).getByRole('button', { name: 'Overhead press', exact: true }).click();
  await main(page).getByRole('button', { name: 'Swap Overhead press with Back squat' }).click();
  await shot(page, 'story17-swap-day');
  await main(page).getByRole('button', { name: 'From now on' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Overhead press comes first now' })).toBeVisible();
  await tab(page, 'Home').click();
  await expect(main(page).getByRole('button', { name: /^Workout/ })).toContainText('Day 4: Overhead press');
  expect((await readStore<{ dayRotation?: number[] }>(page, 'trainingProgram'))[0]?.dayRotation).toEqual([4, 2, 3, 1]);
});

test('AC 6: during the workout, “woodway / 14 / 2.5” → Philip reads it and fills incline % and mph', async ({ page }) => {
  const prompts: string[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const b = route.request().postDataJSON() as { contents: { parts: { text: string }[] }[] };
    prompts.push(b.contents[0]?.parts[0]?.text ?? '');
    await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify({ inclineScale: 'pct', scale: 'mph', maxLevel: null, minMph: null, maxMph: null, inclinePct: 14, mph: 2.5, confidence: 'high', note: '' }) }] }, finishReason: 'STOP' }] } });
  });
  await setUp(page, { geminiKey: 'test-key' });
  await main(page).getByRole('button', { name: /Today’s workout: Day 1/ }).click();
  await main(page).getByRole('button', { name: 'Start workout' }).click();
  const cardio = main(page).getByRole('region', { name: 'Cardio: incline walk' });
  await cardio.scrollIntoViewIfNeeded();
  await cardio.getByRole('textbox', { name: 'Treadmill (brand, model)' }).fill('woodway');
  await cardio.getByRole('textbox', { name: 'Incline %' }).fill('14');
  await cardio.getByRole('textbox', { name: /Speed/ }).fill('2.5');
  await cardio.getByRole('button', { name: 'Ask Philip to read it' }).click();
  await expect(cardio.getByRole('status')).toContainText('woodway: 14% incline, 2.5 mph.');
  expect(prompts.some((p) => p.includes('Machine: "woodway"') && p.includes('Incline shown: 14'))).toBe(true);
  const program = (await readStore<{ treadmill?: { name: string; incline?: { scale: string } } }>(page, 'trainingProgram'))[0];
  expect(program?.treadmill).toMatchObject({ name: 'woodway', incline: { scale: 'pct' } });
  await shot(page, 'story17-treadmill');
});

test('AC 5: first launch of 0.17.1 → asks his day once, moves calories by PB-2.2, Undo restores', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T10:00:00'));
  await fresh(page, { at: 'home' });
  await expect.poll(async () => (await readStore<{ key: string }>(page, 'meta')).some((m) => m.key === 'tdeeUpdate')).toBe(true);
  await putProfile(page, { sex: 'male', heightCm: 184, birthDate: '1998-01-01', activityLevel: 'light', weightKg: 74, bodyFatPct: 15, goal: 'gain', trainingYears: 2 });
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res) => {
      const r = indexedDB.open('philip');
      r.onsuccess = () => res(r.result);
    });
    const tx = db.transaction(['targetPlans', 'meta'], 'readwrite');
    // Made with the old 1.2 table: about 2,330 kcal for a bulk.
    tx.objectStore('targetPlans').put({ effectiveFrom: '2026-11-02', calories: 2330, proteinG: 140, fatG: 70, carbsG: 285, method: 'calculated', inputsSnapshot: { goal: 'gain', weightKg: 74 }, weekdayOverrides: null, createdAt: 1 });
    tx.objectStore('meta').delete('tdeeUpdate');
    await new Promise((res) => (tx.oncomplete = res));
    db.close();
  });
  await page.reload();
  const sheet = page.getByRole('dialog', { name: 'Your maintenance, by the playbook' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Mostly sitting' }).click();
  await expect(sheet).toContainText('2,330 kcal →');
  await expect(sheet).toContainText('Rule PB-2.2');
  await shot(page, 'story17-tdee-sheet');
  await sheet.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Undone. Your old plan is back.' })).toBeVisible();
  // The clock is frozen, so rows share createdAt: the newest is the highest id (as planForDate breaks ties).
  const plans = (await readStore<{ id: number; calories: number }>(page, 'targetPlans')).sort((a, b) => b.id - a.id);
  expect(plans).toHaveLength(3);
  expect(plans[0]?.calories).toBe(2330);
});
