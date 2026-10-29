import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { addManualFood, fresh, tab } from './helpers';

test('export, delete all, import round trip', async ({ page }, info) => {
  await fresh(page);
  await addManualFood(page, { name: 'Banana', grams: '118', calories: '105', protein: '1.3', fat: '0.4', carbs: '27' });
  await tab(page, 'Settings').click();
  await page.evaluate(() => {
    // Force the download path (Web Share isn't available in headless browsers).
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()]);
  const path = info.outputPath('backup.json');
  await download.saveAs(path);
  const json = JSON.parse(readFileSync(path, 'utf8'));
  expect(json.format).toBe('philip-backup');
  expect(json.data.foodEntries).toHaveLength(1);
  await expect(page.getByText(/Last backup:/)).toBeVisible();

  // Delete all requires typing DELETE
  await page.getByRole('button', { name: 'Delete all data' }).click();
  const dlg = page.getByRole('alertdialog');
  await expect(dlg.getByRole('button', { name: 'Delete' })).toBeDisabled();
  await dlg.getByRole('textbox').fill('DELETE');
  await dlg.getByRole('button', { name: 'Delete' }).click();
  await tab(page, 'Today').click();
  await expect(page.getByText('Banana')).toHaveCount(0);

  // Invalid file is rejected without changes
  const bad = info.outputPath('bad.json');
  writeFileSync(bad, '{"format":"philip-backup","schemaVersion":7,"data":{}}');
  await tab(page, 'Settings').click();
  await page.locator('input[type=file][accept*=json]').setInputFiles(bad);
  await expect(page.getByRole('alert')).toContainText('format version 7');

  // Restore
  await page.locator('input[type=file][accept*=json]').setInputFiles(path);
  const restore = page.getByRole('alertdialog', { name: 'Restore backup' });
  await expect(restore).toContainText('1 food entries');
  await restore.getByRole('radio', { name: 'Replace' }).click();
  await restore.getByRole('button', { name: 'Restore' }).click();
  await tab(page, 'Today').click();
  await expect(page.getByText('Banana')).toBeVisible();
});
