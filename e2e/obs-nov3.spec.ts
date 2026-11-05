import { expect, test, type Page } from '@playwright/test';
import { fresh, noHorizontalScroll, openTargets, tab, openMealLog } from './helpers';

test.beforeEach(async ({ page }) => {
  await fresh(page);
});

async function manualForm(page: Page) {
  await openTargets(page);
  await page.getByRole('tab', { name: 'Manual' }).click();
  return page.getByRole('region', { name: 'Manual' });
}

test('OBS-E49D0F: set targets by PFC ratio; grams follow the calorie target and are saved', async ({ page }) => {
  const form = await manualForm(page);
  await form.getByLabel('Calories (kcal)').fill('2000');
  await form.getByRole('button', { name: '% of calories' }).click();
  await expect(form.getByRole('button', { name: '% of calories' })).toHaveAttribute('aria-pressed', 'true');
  await form.getByLabel('Protein (%)').fill('30');
  await form.getByLabel('Fat (%)').fill('25');
  await form.getByLabel('Carbs (%)').fill('40');
  // Totals that aren't 100 are flagged and not saved.
  await expect(form.getByText('The percentages add up to 95%.', { exact: false })).toBeVisible();
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('add up to 95%');
  await expect(page.getByRole('region', { name: 'Your daily targets' }).or(page.locator('[aria-labelledby="cur-h"]'))).toContainText('No targets yet');

  await form.getByLabel('Carbs (%)').fill('45');
  await expect(form.getByText('Total 100%')).toBeVisible();
  await expect(form.getByText('= 150 g')).toBeVisible();
  await expect(form.getByText('= 56 g')).toBeVisible();
  await expect(form.getByText('= 225 g')).toBeVisible();
  await expect(form.getByRole('img', { name: 'Calorie split: protein 30%, fat 25%, carbs 45%' })).toBeVisible();
  await noHorizontalScroll(page);
  await form.getByRole('button', { name: 'Save', exact: true }).click();

  const current = page.locator('section[aria-labelledby="cur-h"]');
  await expect(current).toContainText('2,000');
  await expect(current).toContainText('150 g');
  await expect(current).toContainText('56 g');
  await expect(current).toContainText('225 g');
  await expect(current).toContainText('30% of kcal');

  // Switching back to grams carries the computed grams over.
  await form.getByRole('button', { name: 'Grams' }).click();
  await expect(form.getByLabel('Protein (g)')).toHaveValue('150');
  await expect(form.getByLabel('Fat (g)')).toHaveValue('56');
  await expect(form.getByLabel('Carbs (g)')).toHaveValue('225');

  // Today uses the saved grams.
  await openMealLog(page);
  await expect(page.getByRole('main')).toContainText('150 g to go');
});

test('OBS-E49D0F: grams mode shows the split and can match calories to the macros', async ({ page }) => {
  const form = await manualForm(page);
  await form.getByLabel('Calories (kcal)').fill('2400');
  await form.getByLabel('Protein (g)').fill('160');
  await form.getByLabel('Fat (g)').fill('70');
  await form.getByLabel('Carbs (g)').fill('230');
  await expect(form.getByRole('img', { name: 'Calorie split: protein 29%, fat 29%, carbs 42%' })).toBeVisible();
  await expect(form.getByText('Macros add up to 2,190 kcal.')).toBeVisible();
  await form.getByRole('button', { name: 'Make 2,190 kcal the target' }).click();
  await expect(form.getByLabel('Calories (kcal)')).toHaveValue('2190');
  await expect(form.getByText('Macros add up to', { exact: false })).toHaveCount(0);
  // Switching to % starts from the typed grams.
  await form.getByRole('button', { name: '% of calories' }).click();
  await expect(form.getByLabel('Protein (%)')).toHaveValue('29');
  await expect(form.getByLabel('Fat (%)')).toHaveValue('29');
  await expect(form.getByLabel('Carbs (%)')).toHaveValue('42');
});

for (const size of [
  { width: 393, height: 793 },
  { width: 320, height: 568 },
]) {
  test(`OBS-AFF348: Progress weigh-in date stays inside its card @${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await tab(page, 'Progress').click();
    const card = page.getByRole('region', { name: 'Log weight' });
    const date = card.getByLabel('Date');
    await expect(date).toBeVisible();
    const c = (await card.boundingBox())!;
    const d = (await date.boundingBox())!;
    expect(d.x).toBeGreaterThanOrEqual(c.x);
    expect(d.x + d.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
    expect(d.width).toBeGreaterThanOrEqual(120); // room for a full date
    // The date text isn't clipped inside the field.
    expect(await date.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    await noHorizontalScroll(page);

    // Date choice still works.
    await date.fill('2026-11-01');
    await card.getByLabel(/^Weight/).fill('80');
    await card.getByRole('button', { name: 'Log weight' }).click();
    await expect(page.getByRole('main')).toContainText('Nov 1');
  });
}
