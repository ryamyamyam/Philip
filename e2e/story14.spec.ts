import { expect, test, type Page } from '@playwright/test';
import { fresh, noHorizontalScroll, seedWeights, tab, openSettings } from './helpers';

/**
 * Story 14.
 * OBS-0327E3: "Keep this goal", "Philip's pick" and "Set my own" stopped responding once Philip had been
 * asked (from a weigh-in, Re-plan auto-asks) and the request was left waiting (no AI set up, offline, or
 * queued in the cloud). Each choice must work, and the plan step must say what happens next.
 * OBS-92D8DB: "Why this plan" explains the plan and labels each rule by its evidence.
 */
const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Re-plan' });
const SHOTS = process.env.STORY14_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};

test.use({ serviceWorkers: 'block', viewport: { width: 393, height: 793 } });

async function setKey(page: Page) {
  await openSettings(page);
  await page.getByRole('textbox', { name: 'Gemini API key' }).fill('test-key-123');
  await page.getByRole('region', { name: 'Photo & text analysis (Gemini)' }).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Gemini settings saved.' })).toBeVisible();
}

async function startCycleOne(page: Page) {
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
  await expect(main(page).getByRole('button', { name: /Today’s workout: Day 1/ })).toBeVisible();
}

// OBS-0327E3's three e2e tests drove the manual "Re-plan" sheet, which Story 15 replaced with "Update goals"
// (e2e/story15.spec.ts). The fix itself (request.ts › noAi, goalChoice.ts) still serves the goal-reached and
// off-track sheet and stays unit-tested in src/lib/goal/story14.test.ts.

test('OBS-92D8DB: Workout › Plan › Why this plan: cut vs bulk side by side, labels and sources; Ask has the bulk vs cut chip', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  await fresh(page, { at: 'home' });
  await setKey(page);
  await startCycleOne(page);
  await main(page).getByRole('button', { name: 'Cycle plan' }).click();
  await main(page).getByRole('region', { name: 'Why this plan' }).getByRole('button', { name: 'Why this plan' }).click();

  const s = page.getByRole('dialog', { name: 'Why this plan' });
  await expect(s).toBeVisible();
  await expect(s).toContainText('Cut vs bulk: what changes');
  await expect(s).toContainText('You’re on a bulk now.');
  await expect(s).toContainText('Bulk (now):');
  await expect(s).toContainText('Lose 0.5–1% of body weight a week');
  await expect(s).toContainText('same reps on a cut and a bulk');
  await expect(s).toContainText('Research-backed');
  await expect(s).toContainText('Reasonable practice');
  await expect(s).toContainText('Philip’s default');
  await expect(s).toContainText('Source: Morton et al., 2018');
  await expect(s).toContainText('60 minutes of lifting');
  await noHorizontalScroll(page);
  await shot(page, '4-why-this-plan');
  await s.getByText('Your week', { exact: true }).scrollIntoViewIfNeeded();
  await shot(page, '5-why-week');
  await s.getByRole('button', { name: 'Close' }).click();

  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: 'Ask Philip' }).click();
  await main(page).getByRole('button', { name: 'Bulk vs cut training' }).click();
  await expect(main(page).getByLabel('Your question')).toHaveValue(/bulk and on a cut/);
  await main(page).getByRole('button', { name: 'Why this plan' }).click();
  await expect(page.getByRole('dialog', { name: 'Why this plan' })).toBeVisible();
});
