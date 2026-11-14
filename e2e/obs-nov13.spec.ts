import { expect, test, type Page } from '@playwright/test';
import { fresh, markBackedUp, openTargets, tab, openSettings } from './helpers';

/** QA batch, Nov 13 2026. */

async function calculatedTargets(page: Page) {
  await openSettings(page);
  await page.getByRole('radiogroup', { name: 'Body weight' }).getByRole('radio', { name: 'kg' }).click();
  await page.getByRole('radiogroup', { name: 'Height' }).getByRole('radio', { name: 'cm' }).click();
  await openTargets(page);
  const calc = page.getByRole('region', { name: 'Calculator' });
  await calc.getByLabel('Sex').selectOption('male');
  await calc.getByLabel('Date of birth').fill('1998-03-01');
  await calc.getByLabel('Height (cm)').fill('180');
  await calc.getByLabel('Weight (kg)').fill('90');
  await calc.getByLabel('Activity level').selectOption('moderate');
  await calc.getByRole('radio', { name: 'Lose fat' }).click();
  await calc.getByLabel('Target weight (kg)').fill('80');
  await calc.getByLabel('Rate per week (kg)').fill('0.5');
  await calc.getByRole('button', { name: 'Calculate' }).click();
  await page.getByRole('button', { name: 'Use these targets' }).click();
}

test('OBS-3037F2: after a weigh-in Philip checks the targets and offers new ones; the plan line is kept', async ({ page }) => {
  await fresh(page);
  await markBackedUp(page);
  await calculatedTargets(page);
  await tab(page, 'Progress').click();
  const form = page.getByRole('region', { name: 'Log weight' });
  const take = page.getByRole('region', { name: 'Philip’s take' });
  await expect(take).toHaveCount(0);

  // A small change: targets still fit.
  await form.getByLabel('Weight (kg)').fill('89.8');
  await form.getByRole('button', { name: 'Log weight' }).click();
  await expect(take).toContainText('Your targets still fit this weight.');
  await expect(take).toContainText('Training stays on plan');

  // A bigger change: new numbers, one tap to use them.
  await form.getByLabel('Weight (kg)').fill('86');
  await form.getByRole('button', { name: 'Log weight' }).click();
  await expect(take).toContainText('New weight, new numbers. Using 86 kg (your latest weigh-in)');
  await page.screenshot({ path: 'e2e/screenshots/393-weigh-in-take.png', fullPage: true });
  const status = page.getByRole('region', { name: 'Weight log' }).getByRole('status');
  const before = await status.textContent();
  await take.getByRole('button', { name: 'Update my targets' }).click();
  await expect(page.getByText('Targets updated from today.')).toBeVisible();
  await expect(take).toHaveCount(0);
  // The plan line did not restart from 86 kg.
  await expect(status).toHaveText(before ?? '');
  await expect(page.getByRole('region', { name: 'Weight log' }).locator('.pm-row', { hasText: 'Plan today' })).toContainText('90 kg');
  // Logging the same weight again: nothing left to change.
  await form.getByLabel('Weight (kg)').fill('86');
  await form.getByRole('button', { name: 'Log weight' }).click();
  await expect(take).toContainText('Your targets still fit this weight.');
});

test('OBS-3037F2: no calculated targets → Philip points to Targets', async ({ page }) => {
  await fresh(page);
  await markBackedUp(page);
  await tab(page, 'Progress').click();
  const form = page.getByRole('region', { name: 'Log weight' });
  await form.getByLabel(/Weight \((kg|lb)\)/).fill('180');
  await form.getByRole('button', { name: 'Log weight' }).click();
  const take = page.getByRole('region', { name: 'Philip’s take' });
  await expect(take).toContainText('Give me calculated targets');
  await take.getByRole('button', { name: 'Open Targets' }).click();
  await expect(page.getByRole('region', { name: 'Calculator' })).toBeVisible();
});
