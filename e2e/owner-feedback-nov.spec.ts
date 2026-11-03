import { expect, test } from '@playwright/test';
import { addPanel, fresh, openAdd, openTargets } from './helpers';

test('Targets: metric ⇄ imperial toggle converts typed values; 1-month target suggestion', async ({ page }) => {
  await fresh(page);
  await openTargets(page);
  const form = page.getByRole('region', { name: 'Calculator' });
  await form.getByRole('radio', { name: 'kg · cm' }).click();
  await form.getByLabel('Weight (kg)', { exact: true }).fill('80');
  await form.getByLabel('Height (cm)').fill('180');
  await form.getByRole('radio', { name: 'Lose' }).click();
  await expect(form.getByText('🎯 1 month: 78.3 kg (0.4 kg/wk)')).toBeVisible();
  await form.getByRole('button', { name: 'Use it' }).click();
  await expect(form.getByLabel('Target weight (kg)')).toHaveValue('78.3');
  await page.screenshot({ path: 'e2e/screenshots/owner-targets-metric.png', fullPage: true });
  await form.getByRole('radio', { name: 'lb · ft' }).click();
  await expect(form.getByLabel('Weight (lb)', { exact: true })).toHaveValue('176.4');
  await expect(form.getByLabel('Height — Feet')).toHaveValue('5');
  await expect(form.getByLabel('Inches')).toHaveValue('11');
  await page.screenshot({ path: 'e2e/screenshots/owner-targets-imperial.png', fullPage: true });
});

test('Today: Choose photo · Enter yourself (T-009: no separate Take photo); text box only after tapping Enter yourself', async ({ page }) => {
  await fresh(page);
  const main = page.getByRole('main');
  await expect(main.getByRole('button', { name: 'Log food' })).toHaveCount(0);
  await expect(main.getByText('Choose photo')).toBeVisible();
  await expect(main.getByText('Take photo')).toHaveCount(0);
  await expect(main.getByRole('textbox', { name: 'Describe what you ate' })).toHaveCount(0);
  await openAdd(page);
  await expect(addPanel(page).getByRole('textbox', { name: 'Describe what you ate' })).toBeFocused();
  await page.screenshot({ path: 'e2e/screenshots/owner-today-typing.png' });
});
