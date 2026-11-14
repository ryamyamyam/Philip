import { expect, test } from '@playwright/test';
import { addManualFood, addPanel, backToToday, fresh, noHorizontalScroll, openAdd, pickMeal, setManualTargets, tab } from './helpers';

test.beforeEach(async ({ page }) => fresh(page));

test('manual logging updates the Today card and persists; edit, duplicate, delete + undo from Today', async ({ page }) => {
  await setManualTargets(page, { calories: '2200', protein: '160', fat: '70', carbs: '235' });
  const card = page.getByRole('region', { name: 'What’s left today' });
  await expect(card.getByText('2,200 left')).toBeVisible();

  await addManualFood(page, { name: 'Greek yogurt', grams: '170', calories: '146.5', protein: '17.3', fat: '3.8', carbs: '7.9', meal: 'Breakfast' });
  // Today updates immediately, with a calm confirmation and Undo.
  await expect(page.getByRole('status').filter({ hasText: '147 kcal → Breakfast.' })).toBeVisible();
  await expect(card.getByText('2,054 left')).toBeVisible();
  await expect(card.getByRole('listitem').filter({ hasText: 'Protein' })).toContainText('143 g to go');
  await expect(card.getByRole('listitem').filter({ hasText: 'Protein' })).toContainText('17 / 160 g');

  // Persist across reload
  await page.reload();
  const breakfast = page.getByRole('region', { name: 'Breakfast' });
  await expect(breakfast.getByText('Greek yogurt')).toBeVisible();

  // Edit
  await breakfast.getByRole('button', { name: /Greek yogurt/ }).click();
  await page.getByRole('dialog', { name: 'Edit food' }).getByLabel('Calories (kcal)').fill('200');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(breakfast.getByText('200 kcal')).toBeVisible();

  // Duplicate
  await breakfast.getByRole('button', { name: /Greek yogurt/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Duplicate' }).click();
  await expect(breakfast.getByText('400 kcal')).toBeVisible();

  // Delete with confirmation, then undo
  await breakfast.getByRole('button', { name: /Greek yogurt/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(breakfast.getByText('200 kcal')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(breakfast.getByText('400 kcal')).toBeVisible();
  await expect(card.getByText('1,800 left')).toBeVisible();
  await noHorizontalScroll(page);
});

test('Undo on the save toast removes what was just logged', async ({ page }) => {
  await addManualFood(page, { name: 'Cookie', calories: '200', protein: '2', fat: '10', carbs: '25', meal: 'Snacks' });
  await expect(page.getByRole('region', { name: 'Snacks' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Cookie')).toHaveCount(0);
  await expect(page.getByText(/^Nothing yet\./)).toBeVisible();
});

test('validation blocks bad input in the review sheet', async ({ page }) => {
  await openAdd(page);
  await page.getByRole('button', { name: 'Type the numbers' }).click();
  const dlg = page.getByRole('dialog', { name: 'Review' });
  await dlg.getByLabel('Calories (kcal)').fill('abc');
  await dlg.getByRole('button', { name: /^Save to / }).click();
  await expect(dlg.getByText('Enter a name')).toBeVisible();
  await expect(dlg.getByText('Enter a number')).toBeVisible();
  await expect(dlg.getByText('Required').first()).toBeVisible();
});

test('correct a previous day: navigate back, edit the entry, Today is untouched', async ({ page }) => {
  await addManualFood(page, { name: 'Toast', calories: '80', protein: '3', fat: '1', carbs: '15' });
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible();
  await expect(page.getByText('Toast')).toHaveCount(0);
  await expect(page.getByText('Logging goes to this day, not today.')).toBeVisible();
  await addManualFood(page, { name: 'Bagel', grams: '100', calories: '250', protein: '9', fat: '1.5', carbs: '48', meal: 'Lunch' });
  const lunch = page.getByRole('region', { name: 'Lunch' });
  await expect(lunch.getByText('Bagel')).toBeVisible();

  // Fix yesterday's entry: half a bagel. Grams rescale the macros.
  await lunch.getByRole('button', { name: /Bagel/ }).click();
  const edit = page.getByRole('dialog', { name: 'Edit food' });
  await edit.getByLabel('Weight (g)').fill('50');
  await expect(edit.getByLabel('Calories (kcal)')).toHaveValue('125');
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(lunch.getByText('125 kcal')).toBeVisible();
  await page.reload(); // date resets to today on a fresh open
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByRole('region', { name: 'Lunch' }).getByText('125 kcal')).toBeVisible();
  await backToToday(page);
  await expect(page.getByText('Toast')).toBeVisible();
  await expect(page.getByText('Bagel')).toHaveCount(0);
});

test('saved meals: save from review, reuse with adjusted quantities, delete with undo', async ({ page }) => {
  await setManualTargets(page, { calories: '2500', protein: '150', fat: '80', carbs: '300' });
  // Log breakfast once, saving it as a meal.
  await openAdd(page);
  await page.getByRole('button', { name: 'Type the numbers' }).click();
  const dlg = page.getByRole('dialog', { name: 'Review' });
  await pickMeal(page, 'Breakfast');
  const fill = async (row: number, v: string[]) => {
    const r = dlg.getByRole('listitem').nth(row);
    await r.getByLabel('Food name').fill(v[0]!);
    await r.getByLabel('Weight (g)').fill(v[1]!);
    await r.getByLabel('Calories (kcal)').fill(v[2]!);
    await r.getByLabel('Protein (g)').fill(v[3]!);
    await r.getByLabel('Fat (g)').fill(v[4]!);
    await r.getByLabel('Carbs (g)').fill(v[5]!);
  };
  await fill(0, ['Oatmeal', '50', '190', '6.5', '3.5', '33']);
  await dlg.getByRole('button', { name: 'Add item' }).click();
  await fill(1, ['Milk', '200', '128', '6.6', '7', '9.6']);
  await dlg.getByRole('button', { name: 'Add item' }).click();
  await fill(2, ['Eggs', '100', '143', '12.6', '9.5', '0.7']);
  await expect(dlg.getByText('461 kcal')).toBeVisible();
  await dlg.getByLabel('Also save as a meal I can reuse').check();
  await dlg.getByRole('button', { name: 'Save to Breakfast' }).click();
  await expect(dlg.getByText('Enter a name')).toBeVisible(); // a saved meal needs a name
  await dlg.getByLabel('Meal name').fill('Usual breakfast');
  await dlg.getByRole('button', { name: 'Save to Breakfast' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Breakfast' }).getByText('461 kcal')).toBeVisible();

  // Next day: pick the saved meal, change oatmeal to 75 g. Everything rescales before saving.
  await page.getByRole('button', { name: 'Next day' }).click();
  await openAdd(page);
  await page.getByRole('button', { name: 'Log Usual breakfast' }).click();
  const review = page.getByRole('dialog', { name: 'Usual breakfast' });
  await pickMeal(page, 'Breakfast');
  const oat = review.getByRole('listitem', { name: 'Oatmeal' });
  await oat.getByLabel('Weight (g)').fill('75');
  await expect(oat.getByText(/285 kcal/)).toBeVisible();
  await expect(review.getByText('556 kcal')).toBeVisible();
  await review.getByRole('button', { name: 'Save to Breakfast' }).click();
  const breakfast = page.getByRole('region', { name: 'Breakfast' });
  await expect(breakfast.getByText('556 kcal')).toBeVisible();
  await expect(breakfast.getByText('Oatmeal')).toBeVisible();
  await expect(page.getByRole('region', { name: 'What’s left today' })).toContainText('29 / 150 g');

  // Delete the saved meal (confirmed) and undo.
  await openAdd(page);
  await page.getByRole('button', { name: 'Delete saved meal Usual breakfast' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('button', { name: 'Log Usual breakfast' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'Log Usual breakfast' })).toBeVisible();
});

test('no My Foods, recents or favorites in the log sheet', async ({ page }) => {
  await addManualFood(page, { name: 'Protein shake', calories: '160', protein: '30', fat: '2', carbs: '6' });
  await openAdd(page);
  const dlg = addPanel(page);
  // T-009: one photo button (iOS offers camera or library from it).
  await expect(page.getByRole('main').getByText('Take photo')).toHaveCount(0);
  await expect(page.getByRole('main').getByText('Choose photo')).toBeVisible();
  for (const gone of ['More options', 'My Foods', 'Recent', 'Frequent', 'Favorites', 'Log Protein shake']) {
    await expect(dlg.getByRole('button', { name: gone, exact: true })).toHaveCount(0);
  }
});

test('works offline after first load', async ({ page, context, browserName }) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit errors on page.reload() while offline; offline is covered in Chromium and the real-iPhone check (T-003).');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await addManualFood(page, { name: 'Offline apple', calories: '95', protein: '0.5', fat: '0.3', carbs: '25' });
  await expect(page.getByText('Offline apple')).toBeVisible();
  await context.setOffline(false);
  void tab;
});

test('OBS-A0308B: an everyday breakfast is offered while breakfast is empty, logged through review with tweaks', async ({ page }) => {
  // Log breakfast once, saving it as a meal and marking it as the usual breakfast.
  await openAdd(page);
  await page.getByRole('button', { name: 'Type the numbers' }).click();
  const dlg = page.getByRole('dialog', { name: 'Review' });
  await pickMeal(page, 'Breakfast');
  const row = dlg.getByRole('listitem').first();
  await row.getByLabel('Food name').fill('Oatmeal');
  await row.getByLabel('Weight (g)').fill('50');
  await row.getByLabel('Calories (kcal)').fill('190');
  await row.getByLabel('Protein (g)').fill('6.5');
  await row.getByLabel('Fat (g)').fill('3.5');
  await row.getByLabel('Carbs (g)').fill('33');
  await expect(dlg.getByLabel('My usual breakfast. Offer it every day.')).toHaveCount(0);
  await dlg.getByLabel('Also save as a meal I can reuse').check();
  await dlg.getByLabel('Meal name').fill('Oats');
  await dlg.getByLabel('My usual breakfast. Offer it every day.').check();
  await dlg.getByRole('button', { name: 'Save to Breakfast' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Breakfast is logged today, so no offer.
  const usual = page.getByRole('button', { name: 'Log my usual breakfast: Oats' });
  await expect(usual).toHaveCount(0);
  // Next day: offered; tweak the grams in review; once logged, the offer goes away.
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(usual).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({ path: 'e2e/screenshots/393-usual-breakfast.png' });
  await usual.click();
  const review = page.getByRole('dialog', { name: 'Oats' });
  await expect(review.getByRole('radio', { name: 'Breakfast' })).toBeChecked();
  await expect(review.getByLabel('My usual breakfast. Offer it every day.')).toBeChecked();
  await review.getByRole('listitem', { name: 'Oatmeal' }).getByLabel('Weight (g)').fill('75');
  await review.getByRole('button', { name: 'Save to Breakfast' }).click();
  await expect(page.getByRole('region', { name: 'Breakfast' }).getByText('285 kcal')).toBeVisible();
  await expect(usual).toHaveCount(0);

  // The saved meal list shows the tag; unticking stops the offer.
  await page.getByRole('button', { name: 'Next day' }).click();
  await openAdd(page);
  await expect(addPanel(page).getByText('Every day · Breakfast')).toBeVisible();
  await usual.click();
  await page.getByRole('dialog', { name: 'Oats' }).getByLabel('My usual breakfast. Offer it every day.').uncheck();
  await page.getByRole('dialog', { name: 'Oats' }).getByRole('button', { name: 'Save to Breakfast' }).click();
  await page.getByRole('button', { name: 'Next day' }).click();
  await expect(page.getByRole('main').getByRole('region', { name: 'Breakfast' })).toHaveCount(0);
  await expect(usual).toHaveCount(0);
});
