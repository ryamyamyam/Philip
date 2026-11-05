import { expect, test, type Page } from '@playwright/test';
import { fresh, noHorizontalScroll, seedWeights, tab } from './helpers';

const main = (page: Page) => page.getByRole('main');

async function openWorkout(page: Page) {
  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: /^Workout/ }).click();
  await expect(page.getByRole('heading', { name: 'Workout', level: 1 })).toBeVisible();
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
  await expect(main(page).getByRole('heading', { name: 'Day 1: Back squat' })).toBeVisible();
}

test.describe('Workout (Story 5, T-013)', () => {
  test('setup → cycle 1 → Day 1 orders with plates, As ordered, + set, rest timer, resume, finish', async ({ page }) => {
    await fresh(page);
    await setUpAndStart(page);
    await main(page).getByRole('button', { name: 'Start workout' }).click();

    const squat = main(page).getByRole('region', { name: 'Back squat' });
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
    const again = main(page).getByRole('region', { name: 'Back squat' });
    await expect(again.getByRole('listitem').nth(5).getByRole('textbox').nth(1)).toHaveValue('8');
    await noHorizontalScroll(page);

    await main(page).getByRole('button', { name: 'Finish workout' }).click();
    await expect(main(page)).toContainText('Workout done');
    await expect(main(page)).toContainText('Back squat e1RM');
    await main(page).getByRole('button', { name: 'Back to Home' }).last().click();
    await expect(main(page).getByRole('button', { name: /^Workout/ })).toContainText('Day 2: Bench press');
  });

  test('Hurts stops the exercise with plain text; a blank lift is calibrated on its day', async ({ page }) => {
    await fresh(page);
    await setUpAndStart(page);
    await main(page).getByRole('button', { name: 'Start workout' }).click();
    const squat = main(page).getByRole('region', { name: 'Back squat' });
    await squat.getByRole('button', { name: 'Hurts' }).click();
    await expect(squat.getByRole('alert')).toContainText('Stop this exercise');
    await main(page).getByRole('button', { name: 'Finish workout' }).click();
    await main(page).getByRole('button', { name: 'Back to Home' }).last().click();
    // Day 2: skip it. Day 3 is the RDL, which has no training max yet.
    await openWorkout(page);
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
