import { expect, test } from '@playwright/test';
import { fresh, noHorizontalScroll, setManualTargets, tab } from './helpers';

const home = (page: import('@playwright/test').Page) => page.getByRole('main');

test.describe('Home (Story 5, T-011)', () => {
  test('opens on Home with both cartridges; Meal log opens today, Workout opens its section', async ({ page }) => {
    await fresh(page, { at: 'home' });
    expect(page.url()).not.toMatch(/#\/meals/);
    await expect(page.getByRole('heading', { name: 'Philip', level: 1 })).toBeVisible();
    await expect(home(page).getByRole('button', { name: /^Meal log/ })).toContainText('No targets yet');
    await expect(home(page).getByRole('button', { name: /^Workout/ })).toContainText('Set up training');

    await home(page).getByRole('button', { name: /^Meal log/ }).click();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await expect(tab(page, 'Home')).toHaveAttribute('aria-current', 'page');

    await tab(page, 'Home').click();
    await home(page).getByRole('button', { name: /^Workout/ }).click();
    await expect(page.getByRole('heading', { name: 'Workout', level: 1 })).toBeVisible();
    expect(page.url()).toMatch(/#\/workout$/);
    await page.getByRole('button', { name: 'Cycle plan' }).click();
    expect(page.url()).toMatch(/#\/workout\/plan$/);
    await page.getByRole('button', { name: 'Back to Home' }).click();
    await expect(page.getByRole('heading', { name: 'Philip', level: 1 })).toBeVisible();
  });

  test('with targets, the Meal log card shows what is left; the phase chip opens targets', async ({ page }) => {
    await fresh(page);
    await setManualTargets(page, { calories: '2400', protein: '150', fat: '70', carbs: '280' });
    await tab(page, 'Home').click();
    const meals = home(page).getByRole('button', { name: /^Meal log/ });
    await expect(meals).toContainText('2,400 kcal left');
    await expect(meals).toContainText('Protein 150 g to go');
    await home(page).getByRole('button', { name: /^Phase:/ }).click();
    await expect(page.getByRole('heading', { name: 'Targets & body stats', level: 1 })).toBeVisible();
  });

  for (const width of [375, 393, 440]) {
    test(`fits without scrolling at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 793 });
      await fresh(page, { at: 'home' });
      await setManualTargets(page, { calories: '2400', protein: '150', fat: '70', carbs: '280' });
      await tab(page, 'Home').click();
      await noHorizontalScroll(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `e2e/screenshots/${width}-home.png` });
    });
  }
});
