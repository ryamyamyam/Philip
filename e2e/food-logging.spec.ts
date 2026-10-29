import { expect, test } from '@playwright/test';
import { addManualFood, fresh, noHorizontalScroll, setManualTargets } from './helpers';

test.beforeEach(async ({ page }) => fresh(page));

test('manual logging updates the dashboard and persists', async ({ page }) => {
  await setManualTargets(page, { calories: '2200', protein: '160', fat: '70', carbs: '235' });
  const ring = page.getByRole('img', { name: /kcal remaining of 2,200 kcal target/ });
  await expect(ring).toBeVisible();

  await addManualFood(page, { name: 'Greek yogurt', grams: '170', calories: '146.5', protein: '17.3', fat: '3.8', carbs: '7.9', meal: 'Breakfast' });
  await expect(page.getByRole('img', { name: /2,054 kcal remaining.*147 kcal eaten/ })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Protein' })).toHaveAttribute('aria-valuetext', '17 of 160 grams');

  // Persist across reload
  await page.reload();
  await expect(page.getByRole('region', { name: 'Breakfast' }).getByText('Greek yogurt')).toBeVisible();

  // Edit
  await page.getByRole('region', { name: 'Breakfast' }).getByRole('button', { name: /Greek yogurt/ }).click();
  await page.getByRole('dialog', { name: 'Edit food' }).getByLabel('Calories (kcal)').fill('200');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('img', { name: /2,000 kcal remaining/ })).toBeVisible();

  // Duplicate
  await page.getByRole('region', { name: 'Breakfast' }).getByRole('button', { name: /Greek yogurt/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByRole('img', { name: /1,800 kcal remaining/ })).toBeVisible();

  // Delete with confirmation, then undo
  await page.getByRole('region', { name: 'Breakfast' }).getByRole('button', { name: /Greek yogurt/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('img', { name: /2,000 kcal remaining/ })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('img', { name: /1,800 kcal remaining/ })).toBeVisible();
  await noHorizontalScroll(page);
});

test('validation blocks bad input', async ({ page }) => {
  await page.getByRole('button', { name: 'Add food' }).first().click();
  await page.getByRole('button', { name: /Manual/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Add food' });
  await dlg.getByLabel('Calories (kcal)').fill('abc');
  await dlg.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dlg.getByText('Enter a name')).toBeVisible();
  await expect(dlg.getByText('Enter a number')).toBeVisible();
  await expect(dlg.getByText('Required').first()).toBeVisible();
});

test('date navigation keeps entries on their day', async ({ page }) => {
  await addManualFood(page, { name: 'Toast', calories: '80', protein: '3', fat: '1', carbs: '15' });
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible();
  await expect(page.getByText('Toast')).toHaveCount(0);
  await addManualFood(page, { name: 'Bagel', calories: '250', protein: '9', fat: '1.5', carbs: '48' });
  await page.getByRole('main').getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByText('Toast')).toBeVisible();
  await expect(page.getByText('Bagel')).toHaveCount(0);
});

test('recent foods support one-tap re-logging', async ({ page }) => {
  await addManualFood(page, { name: 'Protein shake', calories: '160', protein: '30', fat: '2', carbs: '6' });
  await page.getByRole('button', { name: 'Add food' }).first().click();
  await page.getByRole('button', { name: 'Log Protein shake' }).click();
  await expect(page.getByRole('img', { name: /320 kcal eaten/ })).toBeVisible();
});

test('works offline after first load', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await addManualFood(page, { name: 'Offline apple', calories: '95', protein: '0.5', fat: '0.3', carbs: '25' });
  await expect(page.getByText('Offline apple')).toBeVisible();
  await context.setOffline(false);
});
