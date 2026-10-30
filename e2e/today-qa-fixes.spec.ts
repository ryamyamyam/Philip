import { expect, test, type Page } from '@playwright/test';
import { addManualFood, fresh } from './helpers';

/** Fires a horizontal touch drag on an element (Chromium touch emulation). */
async function swipe(page: Page, selector: string, dx: number) {
  await page.evaluate(
    ({ selector, dx }) => {
      const el = document.querySelector(selector) as HTMLElement;
      const r = el.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const x0 = r.left + r.width * 0.7;
      const touch = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      const fire = (type: string, x: number, list: boolean) =>
        el.dispatchEvent(
          new TouchEvent(type, { bubbles: true, cancelable: true, touches: list ? [touch(x)] : [], changedTouches: [touch(x)] }),
        );
      fire('touchstart', x0, true);
      for (let i = 1; i <= 6; i++) fire('touchmove', x0 + (dx * i) / 6, true);
      fire('touchend', x0 + dx, false);
    },
    { selector, dx },
  );
}

test.beforeEach(async ({ page }) => {
  await fresh(page);
});

test('OBS-763014: on another day the heading names that day; the way back is a labeled button', async ({ page }) => {
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.getByRole('heading', { name: 'Tomorrow' })).toBeVisible();
  const main = page.getByRole('main');
  // No bare "Today" label under the date any more.
  await expect(main.getByText('Today', { exact: true })).toHaveCount(0);
  await page.locator('.date-nav').screenshot({ path: 'e2e/screenshots/375-tomorrow-header.png' });
  await page.screenshot({ path: 'e2e/screenshots/375-tomorrow.png', clip: { x: 0, y: 0, width: 375, height: 200 } });
  await main.getByRole('button', { name: 'Back to today' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(main.getByRole('button', { name: 'Back to today' })).toHaveCount(0);
});

test('OBS-352C94: P, F and C each sit in their own colored rounded square', async ({ page }) => {
  await addManualFood(page, { name: 'Chicken rice bowl', grams: '350', calories: '620', protein: '42', fat: '18', carbs: '70' });
  const row = page.locator('.meal-card .list-item').first();
  const chips = row.locator('.macro-chip');
  await expect(chips).toHaveCount(3);
  await expect(chips.nth(0)).toHaveText(/P\s*Protein\s*42/);
  const styles = await chips.evaluateAll((els) =>
    els.map((e) => {
      const s = getComputedStyle(e);
      return { bg: s.backgroundColor, radius: parseFloat(s.borderTopLeftRadius) };
    }),
  );
  expect(new Set(styles.map((s) => s.bg)).size).toBe(3);
  for (const s of styles) expect(s.radius).toBeGreaterThan(0);
  await page.locator('.meal-card').filter({ hasText: 'Chicken rice bowl' }).screenshot({ path: 'e2e/screenshots/375-today-macro-chips.png' });
});

test('OBS-3E7A73: swipe left to delete (with undo) or move an entry to another day', async ({ page }) => {
  await addManualFood(page, { name: 'Lunch salad', calories: '400', protein: '20', fat: '15', carbs: '40', meal: 'Lunch' });
  await addManualFood(page, { name: 'Apple', calories: '95', protein: '0.5', fat: '0.3', carbs: '25', meal: 'Snacks' });

  // Swipe left reveals Move and Delete; the day does not change.
  await swipe(page, '.meal-card[aria-label="Lunch"] .swipe-content', -160);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  const actions = page.getByRole('group', { name: /Actions for “Lunch salad”/ });
  await expect(actions.getByRole('button', { name: 'Move' })).toBeVisible();
  await page.locator('.meal-card[aria-label="Lunch"]').evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await page.locator('.meal-card[aria-label="Lunch"]').screenshot({ path: 'e2e/screenshots/375-today-swipe.png' });

  // Move to yesterday's dinner.
  await actions.getByRole('button', { name: 'Move' }).click();
  const dlg = page.getByRole('dialog', { name: 'Move “Lunch salad”' });
  const today = await dlg.getByLabel('Date').inputValue();
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  const prev = new Date(y, m - 1, d - 1);
  const ymd = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
  await dlg.getByLabel('Date').fill(ymd);
  await dlg.getByRole('radio', { name: 'Dinner' }).click();
  await dlg.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByText(/Moved to/)).toBeVisible();
  await expect(page.getByText('Lunch salad')).toHaveCount(0);
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByRole('region', { name: 'Dinner' }).getByText('Lunch salad')).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'Back to today' }).click();

  // Swipe-delete with undo.
  await swipe(page, '.meal-card[aria-label="Snacks"] .swipe-content', -160);
  await page.getByRole('group', { name: /Actions for “Apple”/ }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Apple', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Apple', { exact: true })).toBeVisible();

  // A right swipe on a closed row still changes the day; tapping a row still opens it.
  await swipe(page, '.meal-card[aria-label="Snacks"] .swipe-content', 160);
  await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'Back to today' }).click();
  await page.getByRole('button', { name: /Apple/ }).click();
  await expect(page.getByRole('dialog', { name: 'Edit food' })).toBeVisible();
});

test('OBS-3AD584: backup reminder is a dismissable pop-up that explains why and where', async ({ page }) => {
  for (let i = 1; i <= 5; i++) {
    await addManualFood(page, { name: `Food ${i}`, calories: '100', protein: '5', fat: '2', carbs: '10' });
  }
  await page.reload();
  const pop = page.getByRole('dialog', { name: 'Back up your food log' });
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('only on this iPhone');
  await expect(pop).toContainText('iCloud Drive');
  await expect(pop).toContainText(/philip-backup-\d{4}-\d{2}-\d{2}\.json/);
  await page.screenshot({ path: 'e2e/screenshots/375-backup-popup.png' });
  // No fixed banner on the page.
  await expect(page.locator('.banner').filter({ hasText: /back(ed)? up/i })).toHaveCount(0);
  await pop.getByRole('button', { name: 'Later' }).click();
  await expect(pop).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Back up your food log' })).toHaveCount(0); // snoozed
});

test('OBS-3AD584: "Back up now" goes to the backup section in Settings', async ({ page }) => {
  for (let i = 1; i <= 5; i++) {
    await addManualFood(page, { name: `Food ${i}`, calories: '100', protein: '5', fat: '2', carbs: '10' });
  }
  await page.reload();
  await page.getByRole('dialog', { name: 'Back up your food log' }).getByRole('button', { name: 'Back up now' }).click();
  await expect(page.getByRole('button', { name: 'Export backup' })).toBeInViewport();
});
