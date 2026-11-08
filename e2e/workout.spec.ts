import { expect, test, type Page } from '@playwright/test';
import { fresh, noHorizontalScroll, seedWeights, tab } from './helpers';

const main = (page: Page) => page.getByRole('main');

async function openWorkout(page: Page) {
  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: /^Workout/ }).click();
  await expect(page.getByRole('heading', { name: 'Workout', level: 1 })).toBeVisible();
}

/** Workout opens on the calendar once a cycle runs; tap today's button to get into the session. */
async function openToday(page: Page) {
  await main(page).getByRole('button', { name: /Today’s workout|Next workout|Resume:/ }).click();
}

/** Setup with test numbers (squat 150, bench 100, OHP 50 kg 1RM; RDL left blank), then start cycle 1. */
async function setUpAndStart(page: Page) {
  await openWorkout(page);
  const lift = (name: string) => main(page).getByRole('group', { name });
  await lift('Back squat').getByLabel('Weight (kg)').fill('150');
  await lift('Bench press').getByLabel('Weight (kg)').fill('100');
  await lift('Overhead press').getByLabel('Weight (kg)').fill('50');
  await expect(lift('Bench press')).toContainText('training max 90 kg');
  await expect(lift('Romanian deadlift')).toContainText('we calibrate it on its day');
  await main(page).getByRole('button', { name: 'Save my numbers' }).click();
  // Briefing needs weigh-ins first.
  await expect(main(page).getByRole('button', { name: 'Start cycle 1' })).toBeDisabled();
  await seedWeights(page, [73, 73.2, 72.8]);
  await page.reload();
  await expect(main(page)).toContainText('Goal in 4 weeks');
  await main(page).getByRole('button', { name: 'Start cycle 1' }).click();
  await openToday(page);
  await expect(main(page).getByRole('heading', { name: 'Day 1: Back squat' })).toBeVisible();
}

test.describe('Workout (Story 5, T-013)', () => {
  test('setup → cycle 1 → Day 1 orders with plates, As ordered, + set, rest timer, resume, finish', async ({ page }) => {
    await fresh(page);
    await setUpAndStart(page);
    await main(page).getByRole('button', { name: 'Start workout' }).click();

    const squat = main(page).getByRole('region', { name: 'Back squat', exact: true });
    // 85% of TM 135 = 114.75 → 115.3 kg loaded as 45+45+10+5 lb per side (20 kg bar, lb plates).
    await expect(squat).toContainText('Per side: 45 + 45 + 10 + 5 lb');
    // Orders are read-only text; the log starts empty.
    const firstWork = squat.getByRole('listitem').nth(3);
    await expect(firstWork.getByRole('textbox').first()).toHaveValue('');
    await firstWork.getByRole('button', { name: 'Set 4: as ordered' }).click();
    await expect(firstWork.getByRole('button', { name: /Set 4: done/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(main(page).getByRole('timer', { name: 'Rest timer' })).toBeVisible();

    // The + set has no "As ordered" and can't be done without reps.
    const plus = squat.getByRole('listitem').nth(5);
    await expect(plus.getByRole('button', { name: /as ordered/ })).toHaveCount(0);
    await plus.getByRole('textbox').first().fill('115');
    await expect(plus.getByRole('button', { name: 'Set 6: mark done' })).toBeDisabled();
    await plus.getByRole('textbox').nth(1).fill('8');
    await plus.getByRole('button', { name: 'Set 6: mark done' }).click();

    // Autosave: reload resumes with the log intact.
    await page.reload();
    await openWorkout(page);
    await openToday(page);
    const again = main(page).getByRole('region', { name: 'Back squat', exact: true });
    await expect(again.getByRole('listitem').nth(5).getByRole('textbox').nth(1)).toHaveValue('8');
    await noHorizontalScroll(page);

    await main(page).getByRole('button', { name: 'Finish workout' }).click();
    await expect(main(page)).toContainText('Workout done');
    await expect(main(page)).toContainText('Back squat e1RM');
    await main(page).getByRole('button', { name: 'Back to Home' }).last().click();
    // Story 6 §2: one workout a day — Home says done and names the next day instead of offering it.
    await expect(main(page).getByRole('button', { name: /^Workout/ })).toContainText('Done today');
    await expect(main(page).getByRole('button', { name: /^Workout/ })).toContainText('Next: Day 2, Bench press');
  });

  test('Hurts stops the exercise with plain text; a blank lift is calibrated on its day', async ({ page }) => {
    await fresh(page);
    await setUpAndStart(page);
    await main(page).getByRole('button', { name: 'Start workout' }).click();
    const squat = main(page).getByRole('region', { name: 'Back squat', exact: true });
    await squat.getByRole('button', { name: 'Hurts' }).click();
    await expect(squat.getByRole('alert')).toContainText('Stop this exercise');
    await main(page).getByRole('button', { name: 'Finish workout' }).click();
    await main(page).getByRole('button', { name: 'Back to Home' }).last().click();
    // One workout a day (Story 6): come back tomorrow.
    await page.clock.setSystemTime(new Date(Date.now() + 86_400_000));
    await page.reload();
    // Day 2: skip it. Day 3 is the RDL, which has no training max yet.
    await openWorkout(page);
    await openToday(page);
    await main(page).getByRole('button', { name: 'Skip this day' }).click();
    await expect(main(page).getByRole('heading', { name: 'Calibrate: Romanian deadlift' })).toBeVisible();
    await main(page).getByRole('radio', { name: 'kg' }).click();
    await main(page).getByLabel('Weight (kg)').fill('100');
    await main(page).getByLabel('Reps').fill('5');
    await expect(main(page)).toContainText('Training max: 105 kg');
    await main(page).getByRole('button', { name: 'Save and build today' }).click();
    await expect(main(page).getByRole('heading', { name: 'Day 3: Romanian deadlift' })).toBeVisible();
  });

  test('accessory swap: only approved options, and the pick sticks', async ({ page }) => {
    await fresh(page);
    await setUpAndStart(page);
    await main(page).getByRole('button', { name: 'Start workout' }).click();
    const a1 = main(page).getByRole('region', { name: 'Bulgarian split squat' });
    await a1.getByRole('button', { name: 'Swap' }).click();
    const options = a1.getByRole('group', { name: 'Approved swaps' }).getByRole('button');
    await expect(options).toHaveCount(3);
    await options.filter({ hasText: 'Hack squat' }).click();
    await expect(main(page).getByRole('region', { name: 'Hack squat' })).toBeVisible();
  });
});

test.describe('Workout T-014: briefing, plan, strength, settings', () => {
  test('briefing: Set my own is checked by the safety rules; Philip’s goal is the default', async ({ page }) => {
    await fresh(page);
    await openWorkout(page);
    await main(page).getByRole('group', { name: 'Back squat' }).getByLabel('Weight (kg)').fill('150');
    await main(page).getByRole('group', { name: 'Bench press' }).getByLabel('Weight (kg)').fill('100');
    await main(page).getByRole('group', { name: 'Romanian deadlift' }).getByLabel('Weight (kg)').fill('115');
    await main(page).getByRole('group', { name: 'Overhead press' }).getByLabel('Weight (kg)').fill('50');
    await main(page).getByRole('button', { name: 'Save my numbers' }).click();
    await seedWeights(page, [73, 73, 73]);
    await page.reload();
    await main(page).getByRole('radio', { name: 'Bulk' }).click();
    await expect(main(page)).toContainText('Goal in 4 weeks: 163 lb'); // default unit is lb; 74.0 kg
    await main(page).getByRole('radio', { name: 'Set my own' }).click();
    await main(page).getByLabel('Weight in 4 weeks (lb)').fill('164');
    await main(page).getByLabel('Body fat target % (optional)').fill('9');
    await expect(main(page).getByRole('alert')).toContainText('below 10%');
    await expect(main(page).getByRole('button', { name: 'Start cycle 1' })).toBeDisabled();
    await main(page).getByLabel('Body fat target % (optional)').fill('14');
    await main(page).getByRole('button', { name: 'Start cycle 1' }).click();
    await openToday(page);
    await expect(main(page).getByRole('heading', { name: 'Day 1: Back squat' })).toBeVisible();

    // The plan: week tabs, every day, the next block.
    await main(page).getByRole('button', { name: 'Cycle plan' }).click();
    await expect(page.getByRole('heading', { name: 'Cycle plan', level: 1 })).toBeVisible();
    await expect(main(page).getByRole('heading', { name: 'Day 3: Romanian deadlift' })).toBeVisible();
    await main(page).getByRole('tab', { name: 'Deload' }).click();
    await expect(main(page).getByRole('heading', { name: 'Next: Block B' })).toBeVisible();
    await noHorizontalScroll(page);
  });

  test('Progress › Strength shows e1RM after a + set; Settings › Training re-tests, swaps and resets', async ({ page }) => {
    await fresh(page);
    await setUpAndStart(page);
    await main(page).getByRole('button', { name: 'Start workout' }).click();
    const plus = main(page).getByRole('region', { name: 'Back squat', exact: true }).getByRole('listitem').nth(5);
    await plus.getByRole('textbox').first().fill('254');
    await plus.getByRole('textbox').nth(1).fill('7');
    await plus.getByRole('button', { name: 'Set 6: mark done' }).click();
    await main(page).getByRole('button', { name: 'Finish workout' }).click();

    await tab(page, 'Progress').click();
    await page.getByRole('tab', { name: 'Strength' }).click();
    await expect(main(page)).toContainText('Back squat: latest e1RM');

    await tab(page, 'Settings').click();
    const training = main(page).getByRole('region', { name: 'Training' });
    await training.getByRole('radio', { name: 'Bench' }).click();
    await training.getByRole('textbox', { name: 'Weight (kg)' }).fill('90');
    await training.getByRole('textbox', { name: 'Reps' }).fill('5');
    await training.getByRole('button', { name: 'Save new training max' }).click();
    await expect(page.getByText('Bench press: new training max saved.')).toBeVisible();

    await training.getByRole('radio', { name: /Leg press · Philip/ }).count();
    await training.getByRole('radio', { name: /^Hack squat$/ }).first().click();
    await expect(training.getByRole('radio', { name: /Hack squat/ }).first()).toHaveAttribute('aria-checked', 'true');

    await training.getByRole('button', { name: 'Reset program' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Reset' }).click();
    await openWorkout(page);
    await expect(main(page).getByRole('heading', { name: 'Your lifts' })).toBeVisible();
  });
});

test.describe('Workout owner feedback (Nov 5)', () => {
  test('one weigh-in is enough to start; the day preview swaps a missing machine', async ({ page }) => {
    await fresh(page);
    await openWorkout(page);
    for (const [n, v] of [['Back squat', '150'], ['Bench press', '100'], ['Romanian deadlift', '115'], ['Overhead press', '50']] as const) {
      await main(page).getByRole('group', { name: n }).getByLabel('Weight (kg)').fill(v);
    }
    await main(page).getByRole('button', { name: 'Save my numbers' }).click();
    await seedWeights(page, [73]);
    await page.reload();
    await expect(main(page)).toContainText('From your latest weigh-in');
    await main(page).getByRole('button', { name: 'Start cycle 1' }).click();
    await openToday(page);

    await main(page).getByRole('button', { name: /A1 Bulgarian split squat/ }).click();
    await main(page).getByRole('radio', { name: 'Hack squat' }).click();
    await expect(main(page).getByRole('button', { name: /A1 Hack squat/ })).toBeVisible();
    await main(page).getByRole('button', { name: 'Start workout' }).click();
    await expect(main(page).getByRole('region', { name: 'Hack squat' })).toBeVisible();
  });
});

test.describe('Story 5 at 150% text (T-015)', () => {
  for (const width of [375, 440]) {
    test(`no horizontal scroll on the workout screens at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await fresh(page);
      await page.addStyleTag({ content: 'html { font-size: 150% !important; }' });
      const check = async () => {
        await page.addStyleTag({ content: 'html { font-size: 150% !important; }' });
        await noHorizontalScroll(page);
      };
      await tab(page, 'Home').click();
      await check();
      await setUpAndStart(page);
      await check();
      await main(page).getByRole('button', { name: 'Start workout' }).click();
      await check();
      await main(page).getByRole('button', { name: 'Cycle plan' }).click();
      await check();
      await tab(page, 'Progress').click();
      await page.getByRole('tab', { name: 'Strength' }).click();
      await check();
      await tab(page, 'Settings').click();
      await check();
    });
  }
});

test.describe('Check-in and calendar (T-017)', () => {
  test('flag a set → Philip lightens the rest of today; review applies to the cycle', async ({ page }) => {
    await fresh(page);
    await setUpAndStart(page);
    await main(page).getByRole('button', { name: 'Start workout' }).click();
    const squat = main(page).getByRole('region', { name: 'Back squat', exact: true });
    const firstWork = squat.getByRole('listitem').nth(3);
    await firstWork.getByRole('button', { name: 'Set 4: as ordered' }).click();
    await firstWork.getByRole('button', { name: 'Tell Philip' }).click();
    await firstWork.getByRole('radio', { name: 'Too heavy' }).click();
    await firstWork.getByRole('button', { name: 'Send' }).click();
    await expect(squat).toContainText('10% lighter on the sets left');
    await squat.getByRole('button', { name: 'OK, change it' }).click();
    // 85% of TM 135 → 115.3 kg; 10% lighter → about 104 kg on the + set.
    await expect(squat).not.toContainText('Per side: 45 + 45 + 10 + 5 lb');
    await noHorizontalScroll(page);

    await main(page).getByRole('button', { name: 'Finish workout' }).click();
    await expect(main(page)).toContainText('Philip’s review');
    await expect(main(page)).toContainText('Back squat: training max');
    await main(page).getByRole('button', { name: 'OK, apply' }).click();
    await expect(main(page)).toContainText('The rest of the cycle is updated');
  });

  test('calendar: today selected; a trained day is marked and shows the log', async ({ page }) => {
    await fresh(page);
    await setUpAndStart(page);
    await main(page).getByRole('button', { name: 'Start workout' }).click();
    const firstWork = main(page).getByRole('region', { name: 'Back squat', exact: true }).getByRole('listitem').nth(3);
    await firstWork.getByRole('button', { name: 'Set 4: as ordered' }).click();
    await main(page).getByRole('button', { name: 'Finish workout' }).click();
    await main(page).getByRole('button', { name: 'Back to Home' }).last().click();
    await openWorkout(page);
    const grid = main(page).getByRole('grid');
    await expect(grid.locator('.cal-day.is-today')).toHaveAttribute('aria-selected', 'true');
    await expect(grid.locator('.cal-day.is-today')).toHaveAttribute('aria-label', /trained/);
    await main(page).locator('.cal-session summary').first().click();
    await expect(main(page).locator('.cal-log')).toContainText('Back squat');
    // Story 6 §2: no second workout today.
    await expect(main(page)).toContainText('Done for today');
    await expect(main(page)).toContainText('Next: Day 2, Bench press');
    await expect(main(page).getByRole('button', { name: /Today’s workout|Next workout/ })).toHaveCount(0);
    await noHorizontalScroll(page);
  });
});
