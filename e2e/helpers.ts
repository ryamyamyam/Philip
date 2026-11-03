import { expect, type Page } from '@playwright/test';

export async function fresh(page: Page) {
  await page.goto('./');
  await page.evaluate(async () => {
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('philip');
      r.onsuccess = r.onerror = r.onblocked = () => res();
    });
  });
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}

/** Opens the Log food sheet from Today (Story 3). Keeps the selected date. */
export async function openAdd(page: Page) {
  if ((await tab(page, 'Today').getAttribute('aria-current')) !== 'page') await tab(page, 'Today').click();
  await page.getByRole('main').getByRole('button', { name: 'Log food' }).click();
  await expect(page.getByRole('dialog', { name: 'Add food' })).toBeVisible();
}

/** Picks a meal in the review sheet's meal picker. */
export async function pickMeal(page: Page, meal: string) {
  await page.getByRole('dialog').getByRole('radio', { name: meal }).click();
}

/** Log food → Enter it yourself → fill the one row → Save to {meal}. */
export async function addManualFood(
  page: Page,
  f: { name: string; grams?: string; calories: string; protein: string; fat: string; carbs: string; meal?: string },
) {
  await openAdd(page);
  await page.getByRole('dialog', { name: 'Add food' }).getByRole('button', { name: 'Enter it yourself' }).click();
  const dlg = page.getByRole('dialog', { name: 'Review' });
  await pickMeal(page, f.meal ?? 'Breakfast');
  await dlg.getByLabel('Food name').fill(f.name);
  if (f.grams) await dlg.getByLabel('Weight (g)').fill(f.grams);
  await dlg.getByLabel('Calories (kcal)').fill(f.calories);
  await dlg.getByLabel('Protein (g)').fill(f.protein);
  await dlg.getByLabel('Fat (g)').fill(f.fat);
  await dlg.getByLabel('Carbs (g)').fill(f.carbs);
  await dlg.getByRole('button', { name: `Save to ${f.meal ?? 'Breakfast'}` }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** Settings › Targets & body stats (Story 3). */
export async function openTargets(page: Page) {
  await tab(page, 'Settings').click();
  await page.getByRole('button', { name: 'Change targets or body stats' }).click();
  await expect(page.getByRole('heading', { name: 'Targets & body stats', level: 1 })).toBeVisible();
}

export async function setManualTargets(page: Page, m: { calories: string; protein: string; fat: string; carbs: string }) {
  await openTargets(page);
  await page.getByRole('tab', { name: 'Manual' }).click();
  const form = page.getByRole('region', { name: 'Manual' });
  await form.getByLabel('Calories (kcal)').fill(m.calories);
  await form.getByLabel('Protein (g)').fill(m.protein);
  await form.getByLabel('Fat (g)').fill(m.fat);
  await form.getByLabel('Carbs (g)').fill(m.carbs);
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await tab(page, 'Today').click();
}

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** UX-2: the Today tab always resets the date to today. */
export async function backToToday(page: Page) {
  await tab(page, 'Today').click();
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
}

/** Marks a backup as just made, so the backup pop-up (OBS-3AD584) stays out of the way of seeded screens. */
export async function markBackedUp(page: Page) {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('philip');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key: 'lastBackupAt', value: Date.now() });
    await new Promise((res) => (tx.oncomplete = res));
    db.close();
  });
}

/** Today's local date as YYYY-MM-DD in the page. */
export function pageToday(page: Page): Promise<string> {
  return page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

export function tab(page: Page, name: 'Today' | 'Progress' | 'Settings') {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true });
}
