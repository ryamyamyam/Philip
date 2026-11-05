import { expect, test, type Page } from '@playwright/test';
import { fresh, noHorizontalScroll, setManualTargets, skipTour, tab, tour } from './helpers';

/** The full current line (the visually hidden live region; the typed copy is aria-hidden). */
const line = (page: Page) => tour(page).locator('[aria-live="polite"]');
const step = (page: Page) => tour(page).getAttribute('data-step');
/** Untyped rest of the line; empty once the line is complete. */
const rest = (page: Page) => tour(page).locator('.pm-tour-rest');
const next = (page: Page) => tour(page).getByRole('button', { name: 'Next' });

test.describe('Philip’s tour (T-010)', () => {
  test('fresh install starts the tour on Today with line 1', async ({ page }) => {
    await fresh(page, { tour: true });
    await expect(tour(page)).toBeVisible();
    expect(await step(page)).toBe('hello');
    await expect(line(page)).toHaveText(/Fresh meat\. I’m Philip, your coach\./);
    await noHorizontalScroll(page);
  });

  test('first tap finishes the line, the next tap advances', async ({ page }) => {
    await fresh(page, { tour: true });
    await next(page).click();
    await expect(rest(page)).toHaveText('');
    expect(await step(page)).toBe('hello');
    await next(page).click();
    await expect.poll(() => step(page)).toBe('what');
  });

  test('no target: the choice step offers Set targets, which opens targets and ends the tour', async ({ page }) => {
    await fresh(page, { tour: true });
    for (const id of ['hello', 'what']) {
      await expect.poll(() => step(page)).toBe(id);
      await next(page).click(); // finish typing
      await next(page).click(); // advance
    }
    await expect.poll(() => step(page)).toBe('noTarget');
    await expect(next(page)).toHaveCount(0);
    await tour(page).getByRole('button', { name: 'Set targets' }).click();
    await expect(tour(page)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Targets & body stats', level: 1 })).toBeVisible();
    await page.reload();
    await tab(page, 'Today').click();
    await expect(tour(page)).toHaveCount(0);
  });

  test('Skip ends the tour for good; it does not come back after a reload', async ({ page }) => {
    await fresh(page, { tour: true });
    await skipTour(page);
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(tour(page)).toHaveCount(0);
  });

  test('Escape skips', async ({ page }) => {
    await fresh(page, { tour: true });
    // Focus moves into the overlay (the Next button), so keys reach it.
    await expect(next(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(tour(page)).toHaveCount(0);
  });

  test('with a target, the fuel and protein steps spotlight the panel; Settings › Replay starts again from line 1', async ({ page }) => {
    await fresh(page);
    await setManualTargets(page, { calories: '2400', protein: '150', fat: '70', carbs: '280' });
    await tab(page, 'Settings').click();
    await page.getByRole('button', { name: 'Replay tutorial' }).click();
    await expect(tour(page)).toBeVisible();
    expect(await step(page)).toBe('hello');
    for (const id of ['hello', 'what']) {
      await expect.poll(() => step(page)).toBe(id);
      await next(page).click();
      await next(page).click();
    }
    await expect.poll(() => step(page)).toBe('fuel');
    await expect(tour(page).locator('.pm-tour-spot')).toBeVisible();
    await next(page).click();
    await next(page).click();
    await expect.poll(() => step(page)).toBe('protein');
  });

  test('reduced motion shows every line whole', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await fresh(page, { tour: true });
    await expect(rest(page)).toHaveText('');
    await next(page).click();
    await expect.poll(() => step(page)).toBe('what');
    await expect(rest(page)).toHaveText('');
  });
});
