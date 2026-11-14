import { expect, test, type Page } from '@playwright/test';
import { fresh, noHorizontalScroll, seedWeights, tab, openSettings } from './helpers';

/** Story 10: QA batch of 2026-11-11 (OBS-4E1000, E19B38, DD5F16, 7BAD75, 9F203A, 5042CD, 2C086C, 097D6D). */
const main = (page: Page) => page.getByRole('main');
const card = (page: Page, n: number) => main(page).locator('.ex-card .ex-name').nth(n);
const SHOTS = process.env.STORY10_SHOTS;

test.use({ serviceWorkers: 'block', viewport: { width: 393, height: 793 } });

async function setUpAndOpenDay1(page: Page) {
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
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  await fresh(page);
  await setUpAndOpenDay1(page);
  await main(page).getByRole('button', { name: 'Start workout' }).click();
});

test('OBS-DD5F16: long-press a title bar, drag an exercise, Save; the order sticks', async ({ page }) => {
  await expect(card(page, 1)).toContainText('Bulgarian split squat');
  // Long press on the A2 title bar (not on the swap button text: the header itself).
  const head = main(page).locator('.ex-card .ex-head').nth(2);
  await head.scrollIntoViewIfNeeded();
  const box = (await head.boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  const list = main(page).getByRole('region', { name: 'Your order today' });
  await expect(list).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/obs-dd5f16-reorder.png` });
  // Drag the last row (B) to just under the main lift.
  const rows = list.locator('.reorder-row');
  await list.scrollIntoViewIfNeeded();
  const last = (await rows.nth(3).boundingBox())!;
  const second = (await rows.nth(1).boundingBox())!;
  await page.mouse.move(last.x + 20, last.y + last.height / 2);
  await page.mouse.down();
  for (let y = last.y + last.height / 2; y > second.y + 4; y -= 10) await page.mouse.move(last.x + 20, y);
  await page.mouse.up();
  const draggedName = (await rows.nth(1).locator('.reorder-name').textContent()) ?? '';
  await list.getByRole('button', { name: 'Save order' }).click();
  await expect(card(page, 0)).toContainText('Back squat');
  await expect(card(page, 1)).toContainText(draggedName);
  await expect(card(page, 2)).toContainText('Bulgarian split squat');
  await noHorizontalScroll(page);
});

test('OBS-2C086C + OBS-097D6D: a big miss gets lighter options at once; a flag tap answers without Send', async ({ page }) => {
  const a1 = main(page).getByRole('region', { name: 'Bulgarian split squat', exact: true });
  const set1 = a1.getByRole('listitem').first();
  // Log 4 reps where Philip ordered more: Philip offers to drop the weight, not just the reps.
  await set1.getByRole('textbox', { name: /Set 1: (your weight|weight per hand)/ }).fill('10');
  await set1.getByRole('textbox', { name: 'Set 1: your reps' }).fill('4');
  await set1.getByRole('button', { name: 'Set 1: mark done' }).click();
  await expect(a1).toContainText(/Short by \d+ reps/);
  const pick = a1.getByRole('checkbox', { name: /Drop to .* for the sets left/ }).first();
  await expect(pick).toHaveAttribute('aria-checked', 'true');
  await expect(a1.getByRole('checkbox', { name: /Keep the weight/ })).toHaveCount(0);
  if (SHOTS) await a1.screenshot({ path: `${SHOTS}/obs-2c086c-miss.png` });
  await a1.getByRole('button', { name: 'Apply' }).click();
  await expect(a1.getByRole('checkbox')).toHaveCount(0);

  // Out of breath on set 2: options appear on the tap.
  const set2 = a1.getByRole('listitem').nth(1);
  await set2.getByRole('button', { name: 'Set 2: as ordered' }).click();
  await set2.getByRole('button', { name: 'Tell Philip' }).click();
  await set2.getByRole('radio', { name: 'Out of breath' }).click();
  await expect(a1.getByRole('checkbox', { name: '60 s more rest between sets · Philip’s pick' })).toBeVisible();
  await expect(a1.getByRole('checkbox', { name: /Also 30 s more rest on every exercise after this/ })).toBeVisible();
  if (SHOTS) await a1.screenshot({ path: `${SHOTS}/obs-097d6d-options.png` });
  await a1.getByRole('checkbox', { name: /Also 30 s more rest/ }).click();
  await a1.getByRole('button', { name: 'Apply' }).click();
  await noHorizontalScroll(page);
});

test('OBS-7BAD75: Finish reads back the log; No goes back, Yes completes; the log can be edited later', async ({ page }) => {
  const squat = main(page).getByRole('region', { name: 'Back squat', exact: true });
  await squat.getByRole('listitem').nth(3).getByRole('button', { name: 'Set 4: as ordered' }).click();
  await main(page).getByRole('button', { name: 'Finish workout' }).click();
  const check = main(page).getByRole('region', { name: 'What you did today' });
  await expect(check).toContainText('Back squat');
  await expect(check).toContainText(/\d+ (lb|kg) × \d+/);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/obs-7bad75-check.png`, fullPage: true });
  await main(page).getByRole('button', { name: 'No, let me fix it' }).click();
  await expect(main(page).getByRole('button', { name: 'Finish workout' })).toBeVisible();
  await main(page).getByRole('button', { name: 'Finish workout' }).click();
  await main(page).getByRole('button', { name: 'Yes, that is right' }).click();
  await expect(main(page)).toContainText('Workout done');
  await main(page).getByRole('button', { name: 'Back to calendar' }).last().click();

  // Edit later from the calendar day box.
  await main(page).getByRole('button', { name: 'Edit log' }).first().click();
  await page.getByRole('alertdialog', { name: 'Edit this log?' }).getByRole('button', { name: 'Edit log' }).click();
  await expect(main(page)).toContainText('Fixing the log from');
  await expect(main(page).getByRole('button', { name: 'Discard workout' })).toHaveCount(0);
  await main(page).getByRole('button', { name: 'Save my fixes' }).click();
  await main(page).getByRole('button', { name: 'Yes, that is right' }).click();
  await expect(main(page)).toContainText('Workout done');
});

test('OBS-E19B38: a km/h treadmill shows the mph next to the setting', async ({ page }) => {
  await openSettings(page);
  const scale = page.getByRole('radiogroup', { name: 'The speed number is' });
  await scale.getByRole('radio', { name: 'km/h' }).click();
  await expect(page.getByText('Setting 5 = about 3.1 mph')).toBeVisible();
  await page.getByRole('button', { name: 'Save treadmill' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Treadmill saved' })).toBeVisible();
  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: /^Workout/ }).click();
  await main(page).getByRole('button', { name: /Resume|Today’s workout/ }).first().click();
  const cardio = main(page).getByRole('region', { name: 'Cardio: incline walk' });
  await cardio.getByRole('textbox', { name: 'Speed (km/h)' }).fill('3.5');
  await expect(cardio).toContainText('= 2.2 mph');
});

test('OBS-5042CD: no scroll indicator and no rubber-band at the edges', async ({ page }) => {
  const css = await page.evaluate(() => {
    const h = getComputedStyle(document.documentElement);
    const b = getComputedStyle(document.body);
    return { html: h.overscrollBehaviorY, body: b.overscrollBehaviorY, bar: h.scrollbarWidth };
  });
  expect(css).toEqual({ html: 'none', body: 'none', bar: 'none' });
});
