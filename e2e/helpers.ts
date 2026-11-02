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

/** Opens the add sheet from a meal card on the Meals tab (UX-5/UX-6). Keeps the selected date. */
export async function openAdd(page: Page, meal = 'Breakfast') {
  if ((await tab(page, 'Meals').getAttribute('aria-current')) !== 'page') await tab(page, 'Meals').click();
  await page.getByRole('main').getByRole('button', { name: `Add to ${meal}` }).click();
  await expect(page.getByRole('dialog', { name: 'Add food' })).toBeVisible();
}

/** "More options" → the hidden manual form / My Foods / recents / Claude handoff (OBS-BC1840). */
export async function openMoreOptions(page: Page) {
  await page.getByRole('dialog', { name: 'Add food' }).getByRole('button', { name: 'More options' }).click();
}

export async function addManualFood(
  page: Page,
  f: { name: string; grams?: string; calories: string; protein: string; fat: string; carbs: string; meal?: string },
) {
  await openAdd(page, f.meal ?? 'Breakfast');
  await openMoreOptions(page);
  await page.getByRole('button', { name: /Manual/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Add food' });
  await dlg.getByLabel('Food name').fill(f.name);
  if (f.grams) await dlg.getByLabel('Weight (g)').fill(f.grams);
  await dlg.getByLabel('Calories (kcal)').fill(f.calories);
  await dlg.getByLabel('Protein (g)').fill(f.protein);
  await dlg.getByLabel('Fat (g)').fill(f.fat);
  await dlg.getByLabel('Carbs (g)').fill(f.carbs);
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

export async function setManualTargets(page: Page, m: { calories: string; protein: string; fat: string; carbs: string }) {
  await tab(page, 'Progress').click();
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

/** UX-2: the Today tab always resets the date to today. Then back to Meals (same shared date). */
export async function backToTodayOnMeals(page: Page) {
  await tab(page, 'Today').click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await tab(page, 'Meals').click();
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

export function tab(page: Page, name: 'Today' | 'Meals' | 'Progress' | 'Settings') {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true });
}
