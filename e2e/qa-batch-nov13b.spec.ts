import { expect, test, type Page } from '@playwright/test';
import { expandSettings, fresh, noHorizontalScroll, seedWeights, tab } from './helpers';

/** QA batch #2, Nov 13 2026 (OBS-C856D1, OBS-46BCAD, OBS-FF441B). */

const main = (page: Page) => page.locator('main');

test('OBS-C856D1: the top-left kg ⇄ lb switch is on every screen and is the Settings unit; the bug opens Capture', async ({ page }) => {
  await fresh(page);
  for (const where of ['Home', 'Progress', 'Settings'] as const) {
    await tab(page, where).click();
    await expect(page.getByTestId('quick-unit')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Report a bug or idea' })).toBeVisible();
  }
  const box = await page.getByTestId('quick-unit').boundingBox();
  expect(box!.x).toBeLessThan(40);
  expect(box!.y).toBeLessThan(60);

  await expandSettings(page);
  const weight = page.getByRole('radiogroup', { name: 'Body weight' });
  const before = (await weight.getByRole('radio', { name: 'kg' }).getAttribute('aria-checked')) === 'true' ? 'kg' : 'lb';
  const after = before === 'kg' ? 'lb' : 'kg';
  await page.getByRole('button', { name: `Weight in ${before}. Switch to ${after}` }).click();
  await expect(weight.getByRole('radio', { name: after })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: `Weight in ${after}. Switch to ${before}` })).toBeVisible();

  await page.getByRole('button', { name: 'Report a bug or idea' }).click();
  const panel = page.getByRole('dialog', { name: 'QA & Feedback' });
  await expect(panel.getByLabel('What did you notice?')).toBeVisible();
  await noHorizontalScroll(page);
});

test('OBS-46BCAD: Settings is Targets plus four collapsible groups, closed until tapped', async ({ page }) => {
  await fresh(page);
  await tab(page, 'Settings').click();
  await expect(page.getByRole('button', { name: 'Change daily nutrition targets' })).toBeVisible();
  const groups = page.locator('details.settings-group');
  await expect(groups).toHaveCount(4);
  await expect(groups.locator('summary')).toHaveText(['Training', 'Philip & AI', 'Units, help & feedback', 'Your data']);
  await expect(page.getByRole('textbox', { name: 'Gemini API key' })).toBeHidden();
  await groups.filter({ hasText: 'Philip & AI' }).locator('summary').click();
  await expect(page.getByRole('textbox', { name: 'Gemini API key' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Philip’s memory' })).toBeVisible();
  // Open groups stay open when coming back.
  await tab(page, 'Home').click();
  await tab(page, 'Settings').click();
  await expect(page.getByRole('textbox', { name: 'Gemini API key' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export backup' })).toBeHidden();
});

test('OBS-FF441B: the briefing preselects Philip’s bulk or cut and says why, not Maintain', async ({ page }) => {
  await fresh(page);
  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: /^Workout/ }).click();
  await main(page).getByRole('group', { name: 'Bench press' }).getByLabel('Weight (kg)').fill('100');
  await main(page).getByRole('button', { name: 'Save my numbers' }).click();
  await seedWeights(page, [73, 73.2, 72.8]);
  await page.reload();
  const phase = main(page).getByRole('radiogroup', { name: 'Phase' });
  await expect(phase.getByRole('radio', { name: 'Bulk' })).toHaveAttribute('aria-checked', 'true');
  await expect(phase.getByRole('radio', { name: 'Maintain' })).toHaveAttribute('aria-checked', 'false');
  await expect(main(page)).toContainText('No body-fat reading yet');
  await expect(main(page)).not.toContainText('(0% a week)');
});
