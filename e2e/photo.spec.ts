import { expect, test, type Page } from '@playwright/test';
import { fresh, tab } from './helpers';

const PHOTO = 'public/icon-512.png';

async function setKey(page: Page) {
  await tab(page, 'Settings').click();
  await page.getByRole('textbox', { name: 'Gemini API key' }).fill('test-key-123');
  await page.getByRole('region', { name: 'Photo analysis (Gemini)' }).getByRole('button', { name: 'Save', exact: true }).click();
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
  await page.getByRole('button', { name: 'Add food' }).first().click();
  await page.getByRole('dialog').getByRole('radio', { name: 'Lunch' }).click();
  await page.locator('input[type=file][capture]').setInputFiles(PHOTO);
  await expect(page.getByText('Analyzing your photo…')).toBeVisible();
  const review = page.getByRole('dialog', { name: 'Photo estimate' });
  await expect(review.getByText('Estimate — please check portions.')).toBeVisible();
  expect(keyHeader).toBe('test-key-123');
  expect(url).not.toContain('test-key-123');
  await page.screenshot({ path: 'e2e/screenshots/375-review.png' });

  // Nothing saved yet
  // Edit: change rice weight → macros rescale and total updates
  const rice = review.getByRole('region', { name: 'Rice' });
  await rice.getByLabel('Weight (g)').fill('90');
  await expect(rice.getByLabel('Calories (kcal)')).toHaveValue('117');
  await expect(review.getByText('365 kcal')).toBeVisible();
  await review.getByRole('button', { name: 'Save 2 items' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const lunch = page.getByRole('region', { name: 'Lunch' });
  await expect(lunch.getByText('Grilled chicken')).toBeVisible();
  await expect(lunch.getByText('365 kcal')).toBeVisible();
});

test('closing the review discards nothing silently', async ({ page }) => {
  await page.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] } }),
  );
  await setKey(page);
  await page.getByRole('button', { name: 'Add food' }).first().click();
  await page.locator('input[type=file][capture]').setInputFiles(PHOTO);
  await page.getByRole('dialog', { name: 'Photo estimate' }).getByRole('button', { name: 'Close' }).click();
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
  await page.getByRole('button', { name: 'Add food' }).first().click();
  await page.locator('input[type=file][capture]').setInputFiles(PHOTO);
  await expect(page.getByRole('alert')).toContainText('free-tier limit');
  await expect(page.getByRole('button', { name: 'Enter manually instead' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use Claude app instead' })).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/375-photo-error.png' });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Estimate — please check portions.')).toBeVisible();
});

test('invalid key and no key are handled', async ({ page }) => {
  await page.route('https://generativelanguage.googleapis.com/**', (route) =>
    route.fulfill({ status: 400, json: { error: { code: 400, message: 'API key not valid.', details: [{ reason: 'API_KEY_INVALID' }] } } }),
  );
  await page.getByRole('button', { name: 'Add food' }).first().click();
  await page.locator('input[type=file][capture]').setInputFiles(PHOTO);
  await expect(page.getByText(/Add a Gemini API key in Settings/)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await setKey(page);
  await page.getByRole('button', { name: 'Add food' }).first().click();
  await page.locator('input[type=file][capture]').setInputFiles(PHOTO);
  await expect(page.getByRole('alert')).toContainText('rejected the API key');
});

test('Claude handoff: paste reply, review, save', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions only grantable in Chromium');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Add food' }).first().click();
  await page.locator('input[type=file][capture]').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Use Claude app instead' }).click();
  const sheet = page.getByRole('dialog', { name: 'Analyze with Claude' });
  await sheet.getByRole('button', { name: 'Copy prompt' }).click();
  await expect(sheet.getByRole('button', { name: 'Copied' })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('"protein_g"');
  await page.screenshot({ path: 'e2e/screenshots/375-handoff.png' });
  await sheet.getByLabel('Claude’s reply').fill('Sure! Here is the estimate:\n```json\n' + JSON.stringify(reply) + '\n```');
  await sheet.getByRole('button', { name: 'Review estimate' }).click();
  const review = page.getByRole('dialog', { name: 'Photo estimate' });
  await review.getByRole('button', { name: 'Save 2 items' }).click();
  await expect(page.getByText('Rice')).toBeVisible();
});

test('handoff rejects garbage', async ({ page }) => {
  await page.getByRole('button', { name: 'Add food' }).first().click();
  await page.locator('input[type=file][capture]').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Use Claude app instead' }).click();
  const sheet = page.getByRole('dialog', { name: 'Analyze with Claude' });
  await sheet.getByLabel('Claude’s reply').fill('I see a sandwich!');
  await sheet.getByRole('button', { name: 'Review estimate' }).click();
  await expect(sheet.getByText(/Couldn’t find valid nutrition JSON/)).toBeVisible();
});
