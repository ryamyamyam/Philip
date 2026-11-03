import { expect, test, type Page } from '@playwright/test';
import { addManualFood, addPanel, fresh, openAdd, pickMeal, tab } from './helpers';

const PHOTO = 'public/icon-512.png';

async function setKey(page: Page) {
  await tab(page, 'Settings').click();
  await page.getByRole('textbox', { name: 'Gemini API key' }).fill('test-key-123');
  await page.getByRole('region', { name: 'Photo & text analysis (Gemini)' }).getByRole('button', { name: 'Save', exact: true }).click();
  await tab(page, 'Today').click();
}

const reply = {
  items: [
    { name: 'Grilled chicken', description: 'palm-sized breast', grams: 150, calories: 248, protein_g: 46.5, fat_g: 5.4, carbs_g: 0, confidence: 'high' },
    { name: 'Rice', description: '1 cup', grams: 180, calories: 234, protein_g: 4.3, fat_g: 0.5, carbs_g: 51.5, confidence: 'medium' },
  ],
  total: { calories: 482, protein_g: 50.8, fat_g: 5.9, carbs_g: 51.5 },
  uncertainties: ['Cooking oil not visible'],
};

test.beforeEach(async ({ page }) => fresh(page));

/** Story 3: "Take photo" sits on Today — one tap from opening the app. */
async function photoFromToday(page: Page) {
  if ((await tab(page, 'Today').getAttribute('aria-current')) !== 'page') await tab(page, 'Today').click();
  await page.getByRole('main').locator('input[type=file][capture]').setInputFiles(PHOTO);
}

test('photo, Gemini, review, edit, confirm save', async ({ page }) => {
  let keyHeader = '';
  let url = '';
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    keyHeader = route.request().headers()['x-goog-api-key'] ?? '';
    url = route.request().url();
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }] } });
  });
  await setKey(page);
  await photoFromToday(page);
  await expect(page.getByText('Looking at your plate…')).toBeVisible();
  const review = page.getByRole('dialog', { name: 'Review' });
  await expect(review.getByText('Estimate. Check the portions.')).toBeVisible();
  expect(keyHeader).toBe('test-key-123');
  expect(url).not.toContain('test-key-123');
  await page.screenshot({ path: 'e2e/screenshots/375-review.png' });

  // Food names, grams, kcal and P/F/C are all on the compact rows.
  const rice = review.getByRole('listitem', { name: 'Rice' });
  await expect(review.getByRole('listitem', { name: 'Grilled chicken' })).toContainText('248 kcal · P 47 · F 5.4 · C 0');
  await expect(rice.getByLabel('Weight (g)')).toHaveValue('180');
  // Nothing saved yet
  // Edit: change rice weight → macros rescale and total updates
  await rice.getByLabel('Weight (g)').fill('90');
  await expect(rice).toContainText('117 kcal');
  await expect(review.getByText('365 kcal')).toBeVisible();
  // Direct macro edits are one tap away.
  await rice.getByRole('button', { name: 'Edit nutrition' }).click();
  await expect(rice.getByLabel('Calories (kcal)')).toHaveValue('117');
  await pickMeal(page, 'Lunch');
  await review.getByRole('button', { name: 'Save to Lunch' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const lunch = page.getByRole('main').getByRole('region', { name: 'Lunch' });
  await expect(lunch.getByText('Grilled chicken')).toBeVisible();
  await expect(lunch.getByText('365 kcal')).toBeVisible();
  // Today updates immediately.
  await expect(page.getByRole('region', { name: 'What’s left today' })).toContainText('365');
});

test('photo review: add a missing item, remove a wrong one', async ({ page }) => {
  await page.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] } }),
  );
  await setKey(page);
  await photoFromToday(page);
  const review = page.getByRole('dialog', { name: 'Review' });
  await review.getByRole('button', { name: 'Remove item: Rice' }).click();
  await review.getByRole('button', { name: 'Add item' }).click();
  const added = review.getByRole('listitem').last();
  await added.getByLabel('Food name').fill('Broccoli');
  await added.getByLabel('Weight (g)').fill('80');
  await added.getByLabel('Calories (kcal)').fill('27');
  await added.getByLabel('Protein (g)').fill('2.3');
  await added.getByLabel('Fat (g)').fill('0.3');
  await added.getByLabel('Carbs (g)').fill('5.3');
  await expect(review.getByText('275 kcal')).toBeVisible();
  await pickMeal(page, 'Dinner');
  await review.getByRole('button', { name: 'Save to Dinner' }).click();
  const dinner = page.getByRole('main').getByRole('region', { name: 'Dinner' });
  await expect(dinner.getByText('Broccoli')).toBeVisible();
  await expect(dinner.getByText('Rice')).toHaveCount(0);
  await expect(dinner.getByText('275 kcal')).toBeVisible();
});

test('closing the review discards nothing silently', async ({ page }) => {
  await page.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] } }),
  );
  await setKey(page);
  await photoFromToday(page);
  await page.getByRole('dialog', { name: 'Review' }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Discard this estimate?' })).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByText('Grilled chicken')).toHaveCount(0);
});

test('rate limit shows retry, manual and Claude fallback; retry succeeds', async ({ page }) => {
  let calls = 0;
  await page.route('https://generativelanguage.googleapis.com/**', (route) => {
    calls++;
    if (calls === 1)
      return route.fulfill({ status: 429, json: { error: { code: 429, message: 'quota', details: [{ retryDelay: '20s' }] } } });
    return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] } });
  });
  await setKey(page);
  await photoFromToday(page);
  await expect(page.getByRole('alert')).toContainText('free-tier limit');
  await expect(page.getByRole('button', { name: 'Enter it yourself' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use the Claude app' })).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/375-photo-error.png' });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Estimate. Check the portions.')).toBeVisible();
});

test('analysis failure → enter it yourself opens the review with one manual row', async ({ page }) => {
  await page.route('https://generativelanguage.googleapis.com/**', (route) => route.fulfill({ status: 503, json: { error: { code: 503, message: 'down' } } }));
  await setKey(page);
  await photoFromToday(page);
  await page.getByRole('button', { name: 'Enter it yourself' }).click();
  const review = page.getByRole('dialog', { name: 'Review' });
  await expect(review.getByLabel('Food name')).toHaveCount(1);
  await expect(review.getByLabel('Calories (kcal)')).toBeVisible();
  await expect(review.getByText('Estimate. Check the portions.')).toHaveCount(0);
});

test('invalid key and no key are handled', async ({ page }) => {
  await page.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({ status: 400, json: { error: { code: 400, message: 'API key not valid.', details: [{ reason: 'API_KEY_INVALID' }] } } }),
  );
  await photoFromToday(page);
  await expect(page.getByText(/Add a Gemini API key in Settings/)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await setKey(page);
  await photoFromToday(page);
  await expect(page.getByRole('alert')).toContainText('rejected the API key');
});

test('Claude handoff: paste reply, review, save', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions only grantable in Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await photoFromToday(page);
  await page.getByRole('button', { name: 'Use the Claude app' }).click();
  const sheet = page.getByRole('dialog', { name: 'Analyze with Claude' });
  await sheet.getByRole('button', { name: 'Copy prompt' }).click();
  await expect(sheet.getByRole('button', { name: 'Copied' })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('"protein_g"');
  await page.screenshot({ path: 'e2e/screenshots/375-handoff.png' });
  await sheet.getByLabel('Claude’s reply').fill('Sure! Here is the estimate:\n```json\n' + JSON.stringify(reply) + '\n```');
  await sheet.getByRole('button', { name: 'Review estimate' }).click();
  const review = page.getByRole('dialog', { name: 'Review' });
  await review.getByRole('button', { name: /^Save to / }).click();
  await expect(page.getByText('Rice')).toBeVisible();
});

test('handoff rejects garbage', async ({ page }) => {
  await photoFromToday(page);
  await page.getByRole('button', { name: 'Use the Claude app' }).click();
  const sheet = page.getByRole('dialog', { name: 'Analyze with Claude' });
  await sheet.getByLabel('Claude’s reply').fill('I see a sandwich!');
  await sheet.getByRole('button', { name: 'Review estimate' }).click();
  await expect(sheet.getByText(/Couldn’t find valid nutrition JSON/)).toBeVisible();
});

/* ---------- OBS-BC1840 / OBS-A2F21F: photo-first sheet + one text box ---------- */

const textReply = (items: { name: string; grams: number; calories: number; p: number; f: number; c: number }[]) => ({
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify({
              items: items.map((i) => ({ name: i.name, description: `${i.grams} g`, grams: i.grams, calories: i.calories, protein_g: i.p, fat_g: i.f, carbs_g: i.c, confidence: 'high' })),
              total: { calories: items.reduce((a, b) => a + b.calories, 0), protein_g: 0, fat_g: 0, carbs_g: 0 },
              uncertainties: [],
            }),
          },
        ],
      },
      finishReason: 'STOP',
    },
  ],
});

test('log sheet: photo buttons, text box, saved meals, manual — no Claude handoff button', async ({ page }) => {
  await openAdd(page);
  const dlg = addPanel(page);
  await expect(page.getByRole('main').getByText('Take photo')).toBeVisible();
  await expect(page.getByRole('main').getByText('Choose photo')).toBeVisible();
  await expect(dlg.getByRole('textbox', { name: 'Describe what you ate' })).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Type the numbers' })).toBeVisible();
  // The Claude handoff stays as a fallback only when photo analysis fails.
  await expect(dlg.getByRole('button', { name: /Claude app/ })).toHaveCount(0);
  await expect(dlg.getByRole('searchbox')).toHaveCount(0);
});

test('text → Gemini → review; more text appends; edit/remove; save logs to the meal and date', async ({ page }) => {
  const bodies: string[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    bodies.push(route.request().postData() ?? '');
    const first = bodies.length === 1;
    await route.fulfill({
      json: first
        ? textReply([
            { name: 'Eggs', grams: 100, calories: 143, p: 12.6, f: 9.5, c: 0.7 },
            { name: 'White rice', grams: 150, calories: 195, p: 4, f: 0.4, c: 43 },
          ])
        : textReply([{ name: 'Olive oil', grams: 14, calories: 124, p: 0, f: 14, c: 0 }]),
    });
  });
  await setKey(page);
  await openAdd(page);
  await page.getByRole('textbox', { name: 'Describe what you ate' }).fill('2 eggs, 150 g rice');
  await page.getByRole('button', { name: 'Send' }).click();
  const review = page.getByRole('dialog', { name: 'Review' });
  await expect(review.getByRole('listitem', { name: 'Eggs' })).toBeVisible();
  await pickMeal(page, 'Lunch');
  const sent = JSON.parse(bodies[0]!);
  expect(sent.contents[0].parts).toHaveLength(1);
  expect(sent.contents[0].parts[0].inline_data).toBeUndefined();
  expect(sent.contents[0].parts[0].text).toContain('2 eggs, 150 g rice');

  // Same text box on the review list: sending appends.
  await review.getByRole('textbox', { name: 'Describe what you ate' }).fill('1 tbsp olive oil');
  await review.getByRole('button', { name: 'Send' }).click();
  await expect(review.getByRole('listitem', { name: 'Olive oil' })).toBeVisible();
  await expect(review.getByLabel('Food name')).toHaveCount(3);

  // Edit and remove before saving.
  await review.getByRole('listitem', { name: 'White rice' }).getByLabel('Food name').fill('Jasmine rice');
  await review.getByRole('button', { name: 'Remove item: Olive oil' }).click();
  await page.screenshot({ path: 'e2e/screenshots/375-add-text-review.png' });
  await review.getByRole('button', { name: 'Save to Lunch' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const lunch = page.getByRole('main').getByRole('region', { name: 'Lunch' });
  await expect(lunch.getByText('Jasmine rice')).toBeVisible();
  await expect(lunch.getByText('338 kcal')).toBeVisible();
  await expect(lunch.getByText('Olive oil')).toHaveCount(0);
});

test('photo → review, then the text box appends to the same list', async ({ page }) => {
  let n = 0;
  await page.route('https://generativelanguage.googleapis.com/**', (route) => {
    n++;
    return route.fulfill(n === 1 ? { json: { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] } } : { json: textReply([{ name: 'Iced latte', grams: 350, calories: 130, p: 7, f: 5, c: 13 }]) });
  });
  await setKey(page);
  await photoFromToday(page);
  const review = page.getByRole('dialog', { name: 'Review' });
  await expect(review.getByRole('listitem', { name: 'Rice' })).toBeVisible();
  await pickMeal(page, 'Lunch');
  await review.getByRole('textbox', { name: 'Describe what you ate' }).fill('iced latte');
  await review.getByRole('button', { name: 'Send' }).click();
  await expect(review.getByRole('listitem', { name: 'Iced latte' })).toBeVisible();
  await review.getByRole('button', { name: 'Save to Lunch' }).click();
  // Today lists every food of the day (no "+N more").
  const lunch = page.getByRole('main').getByRole('region', { name: 'Lunch' });
  await expect(lunch.getByText('Iced latte')).toBeVisible();
  await expect(lunch.getByRole('button', { name: /more/ })).toHaveCount(0);
});

test('no Gemini key: text becomes local rows, matched foods are prefilled, empty macros are filled by hand', async ({ page }) => {
  let calls = 0;
  await page.route('https://generativelanguage.googleapis.com/**', (route) => {
    calls++;
    return route.abort();
  });
  await addManualFood(page, { name: 'Egg', grams: '50', calories: '72', protein: '6.3', fat: '4.8', carbs: '0.4', meal: 'Breakfast' });
  await openAdd(page);
  await page.getByRole('textbox', { name: 'Describe what you ate' }).fill('2 eggs, 150 g rice');
  await page.getByRole('button', { name: 'Send' }).click();
  const review = page.getByRole('dialog', { name: 'Review' });
  await pickMeal(page, 'Dinner');
  await expect(review.getByText(/No Gemini key/)).toBeVisible();
  const egg = review.getByRole('listitem', { name: 'Egg' });
  await expect(egg).toContainText('144 kcal');
  await expect(egg.getByLabel('Weight (g)')).toHaveValue('100');
  const rice = review.getByRole('listitem', { name: 'rice' });
  await expect(rice.getByLabel('Weight (g)')).toHaveValue('150');
  await expect(rice.getByLabel('Calories (kcal)')).toHaveValue('');
  await page.screenshot({ path: 'e2e/screenshots/375-add-text-nokey.png' });
  // Saving isn't blocked by AI: fill the empty row and save.
  await rice.getByLabel('Calories (kcal)').fill('195');
  await rice.getByLabel('Protein (g)').fill('4');
  await rice.getByLabel('Fat (g)').fill('0.4');
  await rice.getByLabel('Carbs (g)').fill('43');
  await review.getByRole('button', { name: 'Save to Dinner' }).click();
  const dinner = page.getByRole('main').getByRole('region', { name: 'Dinner' });
  await expect(dinner.getByText('339 kcal')).toBeVisible();
  // Locally parsed rows are manual entries: no AI chip.
  await expect(dinner.locator('.chip-warning')).toHaveCount(0);
  expect(calls).toBe(0);
});

test('Gemini error on text falls back to local rows with the reason', async ({ page }) => {
  await page.route('https://generativelanguage.googleapis.com/**', (route) => route.fulfill({ status: 503, json: { error: { code: 503, message: 'overloaded' } } }));
  await setKey(page);
  await openAdd(page);
  await page.getByRole('textbox', { name: 'Describe what you ate' }).fill('banana');
  await page.getByRole('button', { name: 'Send' }).click();
  const review = page.getByRole('dialog', { name: 'Review' });
  await expect(review.getByText(/Gemini is having trouble right now.*split it into rows/)).toBeVisible();
  await expect(review.getByRole('listitem', { name: 'banana' }).getByLabel('Calories (kcal)')).toHaveValue('');
});

/* ---------- Story 3: optional "What should I eat?" ---------- */

test('suggestions: without a key, point to Settings; with a key, options fit what is left and log through review', async ({ page }) => {
  const { setManualTargets } = await import('./helpers');
  await setManualTargets(page, { calories: '2000', protein: '150', fat: '70', carbs: '200' });
  await page.getByRole('button', { name: 'What should I eat?' }).click();
  await expect(page.getByRole('dialog', { name: 'What to eat next' })).toContainText('Suggestions use Gemini');
  await page.getByRole('button', { name: 'Open Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

  let prompt = '';
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    prompt = JSON.parse(route.request().postData() ?? '{}').contents[0].parts[0].text;
    await route.fulfill({ json: textReply([{ name: 'Greek yogurt', grams: 250, calories: 150, p: 25, f: 0.5, c: 9 }, { name: 'Tuna sandwich', grams: 200, calories: 420, p: 32, f: 12, c: 40 }]) });
  });
  await setKey(page);
  await page.getByRole('button', { name: 'What should I eat?' }).click();
  const sheet = page.getByRole('dialog', { name: 'What to eat next' });
  await expect(sheet.getByText('Greek yogurt', { exact: true })).toBeVisible();
  expect(prompt).toContain('Calories: 2000 kcal');
  expect(prompt).toContain('Protein: 150 g');
  const yogurt = sheet.getByRole('listitem').filter({ hasText: 'Greek yogurt' });
  await expect(yogurt).toContainText('250 g · 150 kcal');
  await expect(yogurt).toContainText('After this: 1,850 kcal left · protein 125 g to go');
  await yogurt.getByRole('button', { name: 'Log Greek yogurt' }).click();
  const review = page.getByRole('dialog', { name: 'Review' });
  await expect(review.getByText('Estimate. Check the portions.')).toBeVisible(); // never saved without review
  await pickMeal(page, 'Snacks');
  await review.getByRole('button', { name: 'Save to Snacks' }).click();
  await expect(page.getByRole('region', { name: 'What’s left today' }).getByText('1,850 kcal left')).toBeVisible();
});
