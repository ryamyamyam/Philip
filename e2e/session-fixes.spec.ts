import { expect, test, type Page } from '@playwright/test';
import { fresh, seedWeights, tab, openSettings } from './helpers';

/** Story 6 (T-021): Philip's numbers on every exercise, swap mid-workout, Time's up banner. */
const main = (page: Page) => page.getByRole('main');
const SHOTS = process.env.STORY6_SHOTS;

async function startDay1(page: Page) {
  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: /^Workout/ }).click();
  const lift = (name: string) => main(page).getByRole('group', { name });
  await lift('Back squat').getByLabel('Weight (kg)').fill('150');
  await lift('Bench press').getByLabel('Weight (kg)').fill('100');
  await lift('Romanian deadlift').getByLabel('Weight (kg)').fill('115');
  await lift('Overhead press').getByLabel('Weight (kg)').fill('50');
  await main(page).getByRole('button', { name: 'Save my numbers' }).click();
  await seedWeights(page, [73, 73.2, 72.8]);
  await page.reload();
  await main(page).getByRole('button', { name: 'Start cycle 1' }).click();
  await main(page).getByRole('button', { name: /Today’s workout: Day 1/ }).click();
  await main(page).getByRole('button', { name: 'Start workout' }).click();
}

test.describe('Session fixes (Story 6, T-021)', () => {
  test.use({ viewport: { width: 393, height: 852 } });

  test('every accessory has Philip’s weight and target reps, marked Estimate the first time', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
    await fresh(page);
    await startDay1(page);
    const a1 = main(page).getByRole('region', { name: /Bulgarian split squat/ });
    // 0.12 × squat TM 135 = 16.2 → rounded down to 35 lb per hand; 8–10 reps → target 9.
    await expect(a1).toContainText(/[34] sets · 2 × 35 lb × 9 per side \(8–10\)/); // Story 7: dumbbells read per hand
    await expect(a1).toContainText('Estimate');
    await expect(a1).toContainText('First time: my estimate.');
    await expect(a1).not.toContainText('Your pick');
    const core = main(page).getByRole('region', { name: /Hanging knee raise/ });
    await expect(core).toContainText('Bodyweight × 12');
    // As ordered copies the target reps.
    await a1.getByRole('button', { name: 'Set 1: as ordered' }).click();
    await expect(a1.getByRole('listitem').first().getByRole('textbox').nth(1)).toHaveValue('9');
    if (SHOTS) await a1.screenshot({ path: `${SHOTS}/t021-orders.png` });
  });

  test('swap mid-workout from the name: today only by default, Keep makes it stick; logged → Skip instead', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
    await fresh(page);
    await startDay1(page);
    // Finish a squat set first: the workout is under way.
    const squat = main(page).getByRole('region', { name: 'Back squat', exact: true });
    await squat.getByRole('listitem').nth(3).getByRole('button', { name: 'Set 4: as ordered' }).click();

    const curl = main(page).getByRole('region', { name: /Lying leg curl/ });
    await curl.getByRole('button', { name: 'Lying leg curl', exact: true }).click();
    const sheet = curl.getByRole('group', { name: 'Approved swaps' });
    await expect(sheet).toContainText('Today only, unless you tick Keep.');
    await expect(sheet.getByRole('button', { name: /Seated leg curl · 55 lb/ })).toBeVisible();
    if (SHOTS) await curl.screenshot({ path: `${SHOTS}/t021-swap.png` });
    await sheet.getByRole('button', { name: /Seated leg curl/ }).click();
    const seated = main(page).getByRole('region', { name: /Seated leg curl/ });
    await expect(seated).toContainText('swapped from Lying leg curl');

    // Today only: Settings › Exercise menu still shows Philip's pick for D1-A2-A.
    // Keep: swap the core slot with Keep ticked.
    const core = main(page).getByRole('region', { name: /Hanging knee raise/ });
    await core.getByRole('button', { name: 'Swap' }).click();
    await core.getByRole('checkbox', { name: 'Keep this swap for future workouts' }).check();
    await core.getByRole('button', { name: /Reverse crunch/ }).click();
    await expect(main(page).getByRole('region', { name: /Reverse crunch/ })).toBeVisible();

    // A logged exercise offers Skip instead of a swap.
    const rc = main(page).getByRole('region', { name: /Reverse crunch/ });
    await rc.getByRole('button', { name: 'Set 1: as ordered' }).click();
    await rc.getByRole('button', { name: 'Swap' }).click();
    await expect(rc).toContainText('Sets logged. Skip the rest instead.');

    // Sticky only for the kept one.
    const choices = await page.evaluate(
      () =>
        new Promise<string>((res) => {
          const r = indexedDB.open('philip');
          r.onsuccess = () => {
            const g = r.result.transaction('slotChoices').objectStore('slotChoices').getAll();
            g.onsuccess = () => res(JSON.stringify(g.result.map((c: { slotKey: string; exerciseId: string }) => [c.slotKey, c.exerciseId])));
          };
        }),
    );
    expect(JSON.parse(choices)).toEqual([['D1-B-A', 'reverse-crunch']]);
  });

  test('rest end: the bar turns into "Time’s up" with the next set, then clears', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-02T10:00:00') });
    await fresh(page);
    await startDay1(page);
    const a1 = main(page).getByRole('region', { name: /Bulgarian split squat/ });
    await a1.getByRole('button', { name: 'Set 1: as ordered' }).click();
    await expect(main(page).getByRole('timer', { name: 'Rest timer' })).toBeVisible();
    await page.clock.runFor(95_000);
    const up = main(page).getByRole('alert').filter({ hasText: 'Time’s up' });
    await expect(up).toContainText(/Time’s up\. Next: Back squat, set 1\./);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/t021-times-up.png` });
    await page.clock.runFor(9_000);
    await expect(up).toHaveCount(0);
  });

  test('Settings › Training › Rest timer: beep toggle; rest alerts hidden without a Worker configured', async ({ page }) => {
    await fresh(page);
    await startDay1(page);
    await openSettings(page);
    const rest = main(page).getByRole('group', { name: 'Rest timer' });
    const beepBox = rest.getByRole('checkbox', { name: 'Beep when rest is over' });
    await expect(beepBox).toBeChecked();
    await beepBox.uncheck();
    await expect(beepBox).not.toBeChecked();
    await expect(rest.getByRole('checkbox', { name: /Rest alerts/ })).toHaveCount(0);
  });
});
