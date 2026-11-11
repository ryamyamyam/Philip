import { expect, test, type Page } from '@playwright/test';
import { fresh, markBackedUp, openAdd, openTargets, pageToday, tab, openMealLog } from './helpers';

/**
 * QA round 2 + Story 3: navigation (Today · Progress · Settings), UX-1 heading, UX-2 Today reset,
 * Today card, the primary log action above the fold, Progress (weight vs plan), screenshots.
 */

/** Seeds a target plan and up to `perMeal` foods per meal for today (directly into IndexedDB). */
async function seed(page: Page, opts: { perMeal?: number; goal?: 'lose' | 'gain' | null; kcal?: number } = {}) {
  const perMeal = opts.perMeal ?? 2;
  await page.evaluate(
    async ({ perMeal, goal, kcal }) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const d = new Date();
      const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const db: IDBDatabase = await new Promise((res, rej) => {
        const r = indexedDB.open('philip');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const tx = db.transaction(['foodEntries', 'targetPlans', 'meta'], 'readwrite');
      tx.objectStore('targetPlans').add({
        effectiveFrom: '2026-01-01', calories: 2400, proteinG: 150, fatG: 70, carbsG: 280,
        method: goal ? 'calculated' : 'manual', inputsSnapshot: goal ? { goal, weightKg: 80 } : null, weekdayOverrides: null, createdAt: 1,
      });
      const names = ['Overnight oats with blueberries and peanut butter', 'Chicken burrito bowl', 'Greek yogurt', 'Salmon, rice & broccoli', 'Apple'];
      let n = 0;
      for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
        for (let i = 0; i < perMeal; i++) {
          n++;
          tx.objectStore('foodEntries').put({
            id: `s-${n}`, date: ymd, meal, name: names[(n + i) % names.length], grams: 150, calories: kcal, proteinG: 15, fatG: 9, carbsG: 30,
            source: n % 3 ? 'manual' : 'photo', savedFoodId: null, estimate: null, createdAt: n, updatedAt: n,
          });
        }
      }
      tx.objectStore('meta').put({ key: 'lastBackupAt', value: Date.now() });
      await new Promise((res) => (tx.oncomplete = res));
      db.close();
    },
    { perMeal, goal: opts.goal ?? null, kcal: opts.kcal ?? 250 },
  );
  await page.reload();
}

const fits = (page: Page) => page.evaluate(() => ({ scroll: document.scrollingElement!.scrollHeight, inner: innerHeight }));

test.describe('393×793 (iPhone 15 Pro, default text)', () => {
  test.use({ viewport: { width: 393, height: 793 } });

  test('Story 3: card and the photo action are above the fold, with the tab bar visible', async ({ page }) => {
    await fresh(page);
    await seed(page, { perMeal: 2 });
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    const card = page.getByRole('region', { name: 'What’s left today' });
    await expect(card).toBeInViewport({ ratio: 1 });
    const photo = page.getByRole('main').locator('label.log-photo').first();
    await expect(photo).toBeInViewport({ ratio: 1 });
    const navTop = await page.getByRole('navigation', { name: 'Main' }).evaluate((n) => n.getBoundingClientRect().top);
    const photoBottom = await photo.evaluate((n) => n.getBoundingClientRect().bottom);
    expect(photoBottom).toBeLessThanOrEqual(navTop);
    // Every logged food is listed by meal below (no "+N more").
    await expect(page.getByRole('main').getByRole('region', { name: 'Snacks' }).locator('.list-item-swipe')).toHaveCount(2);
  });

  test('Story 3: Today lists all foods of a meal and opens edit on tap', async ({ page }) => {
    await fresh(page);
    await seed(page, { perMeal: 4 });
    const lunch = page.getByRole('main').getByRole('region', { name: 'Lunch' });
    await expect(lunch.locator('.list-item-swipe')).toHaveCount(4);
    await expect(lunch.getByRole('button', { name: /more$/ })).toHaveCount(0);
    await expect(lunch.getByRole('button', { name: /Add to/ })).toHaveCount(0);
    await lunch.locator('.list-item-swipe').nth(3).getByRole('button').first().click();
    await expect(page.getByRole('dialog', { name: 'Edit food' })).toBeVisible();
  });

  for (const width of [375, 393]) {
    test(`screenshots @${width}: Today, log sheet, Progress`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 393 ? 793 : 812 });
      await fresh(page);
      await seed(page, { perMeal: 2, goal: 'lose' });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `e2e/screenshots/${width}-s3-today.png` });
      await page.screenshot({ path: `e2e/screenshots/${width}-s3-today-full.png`, fullPage: true });
      await openAdd(page);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `e2e/screenshots/${width}-s3-log.png` });
      await page.getByRole('main').getByRole('button', { name: 'Enter yourself' }).click();
      await tab(page, 'Progress').click();
      await page.getByRole('button', { name: 'Log weight' }).waitFor();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `e2e/screenshots/${width}-s3-progress.png`, fullPage: true });
    });
  }
});

test('Nav (Story 5): Home · Progress · Settings; opens on Home; #/today and #/history go to the Meal log; #/targets is under Settings', async ({ page }) => {
  await fresh(page, { at: 'home' });
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('button')).toHaveText(['Home', 'Progress', 'Settings']);
  await expect(tab(page, 'Home')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Philip', level: 1 })).toBeVisible();
  for (const old of ['today', 'history']) {
    await page.goto(`./#/${old}`);
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await expect(tab(page, 'Home')).toHaveAttribute('aria-current', 'page');
    expect(page.url()).toMatch(/#\/meals$/);
  }
  await page.goto('./#/targets');
  await expect(tab(page, 'Settings')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Daily nutrition targets', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Back to Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  // No floating QA button over the nutrition screens.
  await openMealLog(page);
  await expect(page.getByRole('button', { name: 'Capture feedback' })).toHaveCount(0);
});

test('UX-1: heading text on today, ±1 and +2 days (never repeats the date)', async ({ page }) => {
  await fresh(page);
  const expected = await page.evaluate(() => {
    const at = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return d;
    };
    const f = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', o).format(d);
    return {
      today: f(at(0), { weekday: 'long', month: 'long', day: 'numeric' }),
      tomorrow: f(at(1), { weekday: 'long', month: 'long', day: 'numeric' }),
      yesterday: f(at(-1), { weekday: 'long', month: 'long', day: 'numeric' }),
      plus2Title: f(at(2), { weekday: 'long' }),
      plus2Sub: f(at(2), { month: 'long', day: 'numeric' }),
    };
  });
  const head = page.locator('.date-nav-title');
  const check = async (title: string, sub: string) => {
    await expect(head.getByRole('heading')).toHaveText(title);
    await expect(head.locator('.subtle')).toHaveText(sub);
  };
  {
    await openMealLog(page);
    await check('Today', expected.today);
    await page.getByRole('button', { name: 'Next day' }).click();
    await check('Tomorrow', expected.tomorrow);
    await page.getByRole('button', { name: 'Next day' }).click();
    await check(expected.plus2Title, expected.plus2Sub);
    const sub = await head.locator('.subtle').innerText();
    expect(sub).not.toContain(expected.plus2Title);
    await page.locator('.date-nav').screenshot({ path: `e2e/screenshots/375-r2-heading-plus2-meals.png` });
    await page.getByRole('button', { name: 'Previous day' }).click();
    await page.getByRole('button', { name: 'Previous day' }).click();
    await page.getByRole('button', { name: 'Previous day' }).click();
    await check('Yesterday', expected.yesterday);
    await openMealLog(page);
  }
});

test('UX-2: tapping Today resets the date — from another tab and when already on Today; no "Back to today" button', async ({ page }) => {
  await fresh(page);
  await page.getByRole('button', { name: 'Next day' }).click();
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Back to today' })).toHaveCount(0);
  // Already on Today: tapping it again resets.
  await openMealLog(page);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  // From another tab, the Today tab resets too.
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible();
  await tab(page, 'Progress').click();
  await openMealLog(page);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});

test('UX-3: card words and colors follow the phase (cut: left/over; bulk: to go/over; protein always to go)', async ({ page }) => {
  await fresh(page);
  await seed(page, { perMeal: 2, goal: 'lose', kcal: 250 }); // 2,000 of 2,400
  const card = page.getByRole('region', { name: 'What’s left today' });
  const big = card.locator('.today-big');
  await expect(big).toHaveText('400 left');
  await expect(big).toHaveClass(/tone-success/);
  await expect(card.getByRole('listitem').filter({ hasText: 'Protein' })).toContainText('30 g to go');
  await expect(card.getByRole('listitem').filter({ hasText: 'Protein' })).toContainText('120 / 150 g');
  await expect(card.getByText('2,000 of 2,400 kcal eaten')).toBeVisible();
  await expect(card.getByRole('progressbar', { name: 'Calories' })).toHaveAttribute('aria-valuenow', '83');
  await expect(card.getByRole('listitem').filter({ hasText: 'Protein' })).toHaveClass(/tone-warning/);
  await expect(card.getByRole('listitem').filter({ hasText: 'Fat' })).toContainText('2 g over');
  await expect(card.getByRole('listitem').filter({ hasText: 'Fat' })).toHaveClass(/tone-danger/);

  await fresh(page);
  await seed(page, { perMeal: 2, goal: 'lose', kcal: 350 }); // 2,800 of 2,400
  await expect(big).toHaveText('400 over');
  await expect(big).toHaveClass(/tone-danger/);

  await fresh(page);
  await seed(page, { perMeal: 2, goal: 'gain', kcal: 250 });
  await expect(big).toHaveText('400 to go');
  await expect(big).toHaveClass(/tone-warning/);
  await expect(card.getByRole('listitem').filter({ hasText: 'Carbs' })).toContainText('40 g to go');
  await expect(card.getByRole('listitem').filter({ hasText: 'Fat' })).toHaveClass(/tone-success/);
});

test('UX-3: no target → one call to action that opens Settings › Targets', async ({ page }) => {
  await fresh(page);
  const card = page.getByRole('region', { name: 'What’s left today' });
  await expect(card.getByText('No target yet. Give me one and I’ll make every bite count.')).toBeVisible();
  await card.getByRole('button', { name: 'Set my targets' }).click();
  await expect(tab(page, 'Settings')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Daily nutrition targets', level: 1 })).toBeVisible();
});

test('Story 3: daily goal reached shows a calm celebration', async ({ page }) => {
  await fresh(page);
  await seed(page, { perMeal: 2, goal: 'lose', kcal: 290 }); // 2,320 of 2,400; protein 120 of 150 → not yet
  const card = page.getByRole('region', { name: 'What’s left today' });
  // T-009: no separate chip — Philip's line says it.
  await expect(card.getByText('Goal reached')).toHaveCount(0);
  await expect(card.getByText('Good boy. Exactly as instructed.')).toHaveCount(0);
  await page.evaluate(async () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const db: IDBDatabase = await new Promise((res) => {
      const r = indexedDB.open('philip');
      r.onsuccess = () => res(r.result);
    });
    const tx = db.transaction('foodEntries', 'readwrite');
    tx.objectStore('foodEntries').put({ id: 'whey', date: ymd, meal: 'snack', name: 'Whey', grams: 30, calories: 40, proteinG: 30, fatG: 0, carbsG: 0, source: 'manual', savedFoodId: null, estimate: null, createdAt: 99, updatedAt: 99 });
    await new Promise((r) => (tx.oncomplete = r));
    db.close();
  });
  await page.reload(); // raw IndexedDB writes aren't seen by Dexie live queries
  await expect(card.getByText('Goal reached')).toHaveCount(0);
  await expect(card.getByText('Good boy. Exactly as instructed.')).toBeVisible();
});

test('F047E3: log weight (kg), one entry per date (overwrites), chart shows actual vs plan', async ({ page }) => {
  await fresh(page);
  await markBackedUp(page);
  // Kilograms; the calculator writes a plan with a starting weight → expected line.
  await tab(page, 'Settings').click();
  await page.getByRole('radiogroup', { name: 'Body weight' }).getByRole('radio', { name: 'kg' }).click();
  await page.getByRole('radiogroup', { name: 'Height' }).getByRole('radio', { name: 'cm' }).click();
  await openTargets(page);
  const calc = page.getByRole('region', { name: 'Calculator' });
  await calc.getByLabel('Sex').selectOption('male');
  await calc.getByLabel('Date of birth').fill('1998-03-01');
  await calc.getByLabel('Height (cm)').fill('180');
  await calc.getByLabel('Weight (kg)').fill('80');
  await calc.getByLabel('Body fat (%)').fill('18');
  await calc.getByLabel('Activity level').selectOption('moderate');
  await calc.getByRole('radio', { name: 'Lose fat' }).click();
  await calc.getByLabel('Target weight (kg)').fill('76');
  await calc.getByLabel('Rate per week (kg)').fill('0.5');
  await calc.getByRole('button', { name: 'Calculate' }).click();
  await expect(page.getByText('Resting energy (Katch–McArdle)')).toBeVisible();
  await expect(page.getByText(/Goal weight around/)).toBeVisible();
  await page.getByRole('button', { name: 'Use these targets' }).click();

  await tab(page, 'Progress').click();
  const weight = page.getByRole('region', { name: 'Weight log' });
  const form = page.getByRole('region', { name: 'Log weight' });
  await expect(weight.getByText('Log your weight a few times this week')).toBeVisible();
  await form.getByLabel('Weight (kg)').fill('79.6');
  await form.getByRole('button', { name: 'Log weight' }).click();
  await expect(page.getByText('79.6 kg logged.')).toBeVisible();
  await form.getByLabel('Weight (kg)').fill('79.4');
  await form.getByRole('button', { name: 'Log weight' }).click();
  const today = await pageToday(page);
  const count = await page.evaluate(
    (date) =>
      new Promise<[number, number]>((res) => {
        const r = indexedDB.open('philip');
        r.onsuccess = () => {
          const store = r.result.transaction('weightEntries').objectStore('weightEntries');
          const all = store.getAll();
          all.onsuccess = () => res([all.result.length, all.result.find((w: { date: string }) => w.date === date)?.weightKg]);
        };
      }),
    today,
  );
  expect(count).toEqual([1, 79.4]);
  // Plan starts at 80 kg today → 79.4 is 0.6 kg below: ahead on a cut.
  await expect(weight.getByRole('status')).toHaveText('Ahead of plan by 0.6 kg. Show-off.');
  // T-009: plan numbers are label/value rows on the panel.
  await expect(weight.locator('.pm-row', { hasText: 'Plan today' })).toContainText('80 kg');
  const chart = weight.getByRole('img', { name: /Weight in kg, actual against plan/ });
  await expect(chart).toBeVisible();
  await expect(chart.locator('circle')).toHaveCount(1);
  await expect(chart.locator('path[stroke-dasharray]')).toHaveCount(1);
  await expect(weight.locator('.pm-row', { hasText: 'Goal by' })).toContainText('76 kg ·');
  await weight.screenshot({ path: 'e2e/screenshots/375-s3-weight.png' });

  // History: delete a weigh-in, then undo.
  await page.getByText('Weight history').click();
  await page.getByRole('button', { name: /Delete weigh-in from/ }).click();
  await expect(chart.locator('circle')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(chart.locator('circle')).toHaveCount(1);
  // Configuration stays out of Progress.
  await expect(page.getByRole('region', { name: 'Calculator' })).toHaveCount(0);
});
