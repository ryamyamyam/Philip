import { expect, test, type Page } from '@playwright/test';
import { fresh, noHorizontalScroll, tab } from './helpers';

/** Seeds realistic data straight into IndexedDB (same schema Dexie uses). */
async function seed(page: Page) {
  await page.evaluate(async () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('philip');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const tx = db.transaction(['foodEntries', 'targetPlans', 'savedFoods'], 'readwrite');
    const start = new Date();
    start.setDate(start.getDate() - 40);
    tx.objectStore('targetPlans').put({ effectiveFrom: ymd(start), calories: 2400, proteinG: 170, fatG: 70, carbsG: 270, method: 'calculated', inputsSnapshot: null, weekdayOverrides: null, createdAt: 1 });
    const foods = [
      ['breakfast', 'Overnight oats with blueberries and a spoon of peanut butter', 320, 520, 24, 18, 66],
      ['lunch', 'Chicken burrito bowl', 450, 690, 48, 22, 74],
      ['snack', 'Greek yogurt', 170, 146, 17, 3.8, 7.9],
      ['dinner', 'Salmon, rice & broccoli', 420, 640, 42, 21, 66],
    ] as const;
    let n = 0;
    for (let i = 0; i < 12; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      if (i === 5) continue;
      for (const [meal, name, grams, kcal, p, f, c] of foods) {
        if (i === 0 && meal === 'dinner') continue;
        const k = 0.85 + ((i * 7 + n) % 5) * 0.08;
        tx.objectStore('foodEntries').put({
          id: `seed-${n++}`, date: ymd(d), meal, name, grams, calories: Math.round(kcal * k), proteinG: Math.round(p * k * 10) / 10,
          fatG: Math.round(f * k * 10) / 10, carbsG: Math.round(c * k * 10) / 10, source: meal === 'lunch' && i === 0 ? 'photo' : 'manual',
          savedFoodId: null, estimate: null, createdAt: Date.now() - i * 86400000 + n, updatedAt: Date.now(),
        });
      }
    }
    tx.objectStore('savedFoods').put({ id: 'sf1', name: 'Protein shake', grams: 350, calories: 160, proteinG: 30, fatG: 2, carbsG: 6, useCount: 9, lastUsedAt: Date.now(), favorite: true, createdAt: 1 });
    await new Promise((res) => (tx.oncomplete = res));
    db.close();
  });
  await page.reload();
}

const widths = [375, 440];

for (const width of widths) {
  for (const large of [false, true]) {
    test(`screens @${width}${large ? ' large text' : ''}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await fresh(page);
      await seed(page);
      if (large) await page.addStyleTag({ content: 'html{font-size:150% !important}' });
      const shot = async (name: string) => {
        await page.waitForTimeout(450);
        await noHorizontalScroll(page);
        await page.screenshot({ path: `e2e/screenshots/${width}${large ? '-xl' : ''}-${name}.png`, fullPage: true });
      };
      await expect(page.getByRole('img', { name: /kcal/ }).first()).toBeVisible();
      await shot('today');
      await tab(page, 'History').click();
      await expect(page.getByRole('heading', { name: '7-day average' })).toBeVisible();
      await shot('history');
      await tab(page, 'Targets').click();
      await page.getByRole('button', { name: 'Calculate' }).waitFor();
      await shot('targets');
      await tab(page, 'Settings').click();
      await shot('settings');
      await tab(page, 'Today').click();
      await page.getByRole('button', { name: 'Add food' }).first().click();
      await shot('add');
      await page.getByRole('button', { name: /Manual/ }).click();
      await shot('entry');
    });
  }
}

test('targets calculator end to end', async ({ page }) => {
  await fresh(page);
  await tab(page, 'Targets').click();
  await page.getByLabel('Sex').selectOption('male');
  await page.getByLabel('Date of birth').fill('1996-05-10');
  await page.getByLabel('Height — Feet').fill('5');
  await page.getByLabel('Inches').fill('11');
  await page.getByLabel('Weight (lb)').fill('180');
  await page.getByLabel('Activity level').selectOption('moderate');
  await page.getByLabel('Training days per week').selectOption('4');
  await page.getByRole('radio', { name: 'Lose fat' }).click();
  await page.getByLabel('Target weight (lb)').fill('170');
  await page.getByLabel('Rate per week (lb)').fill('5');
  await page.getByRole('button', { name: 'Calculate' }).click();
  await expect(page.getByText(/Rate was capped/)).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/375-targets-result.png', fullPage: true });
  await page.getByRole('button', { name: 'Use these targets' }).click();
  await expect(page.getByRole('region', { name: 'Target history' }).getByText(/Calculated/)).toBeVisible();
  await tab(page, 'Today').click();
  await expect(page.getByRole('img', { name: /kcal remaining of/ })).toBeVisible();
});
