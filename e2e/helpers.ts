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

export async function addManualFood(
  page: Page,
  f: { name: string; grams?: string; calories: string; protein: string; fat: string; carbs: string; meal?: string },
) {
  await page.getByRole('button', { name: 'Add food' }).first().click();
  if (f.meal) await page.getByRole('dialog').getByRole('radio', { name: f.meal }).click();
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
  await tab(page, 'Targets').click();
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

export function tab(page: Page, name: 'Today' | 'History' | 'Targets' | 'Settings') {
  return page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name, exact: true });
}
