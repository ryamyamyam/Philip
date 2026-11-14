import { expect, test, type Page } from '@playwright/test';
import { fresh, noHorizontalScroll, seedWeights, tab, openSettings } from './helpers';

/** Story 6 (T-020): training calendar, done stamp, delete log, goal day, training days. */
const main = (page: Page) => page.getByRole('main');
const SHOTS = process.env.STORY6_SHOTS;

async function openWorkout(page: Page) {
  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: /^Workout/ }).click();
  await expect(page.getByRole('heading', { name: 'Workout', level: 1 })).toBeVisible();
}

/** Monday 2 Nov 2026, 10:00 local: a training day under Philip's pick (Mon/Tue/Thu/Fri). */
async function atMonday(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
}

async function setUpAndStart(page: Page) {
  await openWorkout(page);
  const lift = (name: string) => main(page).getByRole('group', { name });
  await lift('Back squat').getByLabel('Weight (kg)').fill('150');
  await lift('Bench press').getByLabel('Weight (kg)').fill('100');
  await lift('Romanian deadlift').getByLabel('Weight (kg)').fill('115');
  await lift('Overhead press').getByLabel('Weight (kg)').fill('50');
  await main(page).getByRole('button', { name: 'Save my numbers' }).click();
  await seedWeights(page, [73, 73.2, 72.8]);
  await page.reload();
  await main(page).getByRole('button', { name: 'Start cycle 1' }).click();
}

async function finishDay1(page: Page) {
  await main(page).getByRole('button', { name: /Today’s workout: Day 1/ }).click();
  await main(page).getByRole('button', { name: 'Start workout' }).click();
  const squat = main(page).getByRole('region', { name: 'Back squat', exact: true });
  await squat.getByRole('listitem').nth(3).getByRole('button', { name: 'Set 4: as ordered' }).click();
  await main(page).getByRole('button', { name: 'Finish workout' }).click();
  await main(page).getByRole('button', { name: 'Yes, that is right' }).click();
  await main(page).getByRole('button', { name: 'Back to calendar' }).last().click();
}

test.describe('Training calendar (Story 6, T-020)', () => {
  test.use({ viewport: { width: 393, height: 852 } });

  test('planned days, goal flower and goal box; done stamp + done box; no second workout today', async ({ page }) => {
    await atMonday(page);
    await fresh(page);
    await setUpAndStart(page);
    const grid = main(page).getByRole('grid');
    // Planned tags on Mon/Tue/Thu/Fri; the goal flower on Fri 27 Nov.
    await expect(grid.getByRole('gridcell', { name: /November 3.*planned: Day 2, Bench press/ })).toContainText('BP');
    await expect(grid.getByRole('gridcell', { name: /November 4/ })).not.toContainText(/SQ|BP|RDL|OHP/);
    await expect(grid.getByRole('gridcell', { name: /November 27.*goal day: end of cycle 1/ })).toBeVisible();
    await expect(main(page)).toContainText('Day 1. Back squat. I planned this one for you. Come see.');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/t020-calendar-planned.png`, fullPage: true });

    // Goal day box: the cycle goal from the briefing, wording per phase, the honest footnote.
    await grid.getByRole('gridcell', { name: /November 27/ }).click();
    await expect(main(page)).toContainText('Hit this and you earn the flower.');
    await expect(main(page)).toContainText('Goal day: end of cycle 1');
    await expect(main(page)).toContainText(/Body fat|no reading yet/);
    await expect(main(page)).toContainText('Body-fat readings carry a few points of error.');
    await expect(main(page)).toContainText('Planned: Day 4, Overhead press · Block A · Week 4');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/t020-goal-day.png`, fullPage: true });

    // Finish today → back to the calendar: stamp in the cell, done box, no start button.
    await grid.getByRole('gridcell', { name: /November 2/ }).first().click();
    await finishDay1(page);
    const todayCell = main(page).getByRole('grid').locator('.cal-day.is-today');
    await expect(todayCell).toHaveAttribute('aria-label', /trained/);
    await expect(todayCell.locator('.pm-stamp-done')).toHaveCount(1);
    await expect(main(page)).toContainText('Done for today. Go eat, go sleep.');
    await expect(main(page)).toContainText('Next: Day 2, Bench press');
    await expect(main(page).getByRole('button', { name: /Today’s workout|Next workout/ })).toHaveCount(0);
    await expect(main(page).getByRole('button', { name: 'Delete log' })).toBeVisible();
    await noHorizontalScroll(page);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/t020-done-today.png`, fullPage: true });

    // Home says done too.
    await tab(page, 'Home').click();
    await expect(main(page).getByRole('button', { name: /^Workout/ })).toContainText('Done today');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/t020-home-done.png` });
  });

  test('delete log from the done box: confirm, toast, the day is open again', async ({ page }) => {
    await atMonday(page);
    await fresh(page);
    await setUpAndStart(page);
    await finishDay1(page);
    await main(page).getByRole('button', { name: 'Delete log' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Delete this workout log?' });
    await expect(dialog).toContainText('Your sets, notes and check-ins are deleted.');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/t020-delete-confirm.png` });
    await dialog.getByRole('button', { name: 'Delete log' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Log deleted.' })).toBeVisible();
    await expect(main(page).getByRole('button', { name: /Today’s workout: Day 1, Back squat/ })).toBeVisible();
    await expect(main(page).getByRole('grid').locator('.cal-day.is-today .pm-stamp-done')).toHaveCount(0);
  });

  test('discard an in-progress workout from the session screen', async ({ page }) => {
    await atMonday(page);
    await fresh(page);
    await setUpAndStart(page);
    await main(page).getByRole('button', { name: /Today’s workout: Day 1/ }).click();
    await main(page).getByRole('button', { name: 'Start workout' }).click();
    await main(page).getByRole('button', { name: 'Discard workout' }).click();
    await page.getByRole('alertdialog', { name: 'Discard this workout?' }).getByRole('button', { name: 'Discard' }).click();
    await expect(main(page).getByRole('button', { name: /Today’s workout: Day 1, Back squat/ })).toBeVisible();
  });

  test('Settings › Training days: exactly 4, warning, Philip’s pick; dates move live', async ({ page }) => {
    await atMonday(page);
    await fresh(page);
    await setUpAndStart(page);
    await openSettings(page);
    const days = main(page).getByRole('group', { name: 'Training days' });
    await expect(days).toContainText('Philip’s pick');
    await days.getByRole('button', { name: 'Fri' }).click();
    await expect(days).toContainText('3 of 4 picked');
    await expect(days.getByRole('button', { name: 'Save training days' })).toBeDisabled();
    await days.getByRole('button', { name: 'Wed' }).click();
    await expect(days).toContainText('two days apart');
    if (SHOTS) await days.screenshot({ path: `${SHOTS}/t020-training-days.png` });
    await days.getByRole('button', { name: 'Save training days' }).click();
    await openWorkout(page);
    // Mon/Tue/Wed/Thu now: Day 3 (RDL) is planned on Wed 4 Nov.
    await expect(main(page).getByRole('grid').getByRole('gridcell', { name: /November 4.*planned: Day 3, Romanian deadlift/ })).toContainText('RDL');
    await openSettings(page);
    await main(page).getByRole('group', { name: 'Training days' }).getByRole('button', { name: 'Use Philip’s pick' }).click();
    await expect(main(page).getByRole('group', { name: 'Training days' })).toContainText('Philip’s pick');
  });
});
