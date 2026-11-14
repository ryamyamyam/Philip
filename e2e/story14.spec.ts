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

const PLAN = {
  message: 'You are on pace. A touch more food, the rest stays.',
  kcal: { value: 2900, why: 'Your logs say maintenance is about 2,650.', basis: 'practice' },
  proteinG: { value: 140, why: 'Plenty while we build.', basis: 'research' },
  cardioMin: { value: 15, why: 'Recovery first.', basis: 'default' },
  days: null,
  swaps: [],
  remember: [],
};

function mockGemini(page: Page, reply: object) {
  const prompts: string[] = [];
  void page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const body = route.request().postDataJSON() as { contents: { parts: { text: string }[] }[] };
    prompts.push(body.contents[0]?.parts[0]?.text ?? '');
    await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }] } });
  });
  return prompts;
}

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

async function weighInReplan(page: Page) {
  await tab(page, 'Progress').click();
  const card = page.getByRole('region', { name: 'Log weight' });
  await card.getByLabel(/^Weight/).fill('163');
  await card.getByRole('button', { name: 'Log weight' }).click();
  await page.getByRole('button', { name: 'Let Philip re-plan' }).click();
}

test('OBS-0327E3: with no AI set up, the weigh-in re-plan leaves all three goal choices working', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  await fresh(page, { at: 'home' });
  await startCycleOne(page);
  await page.clock.setFixedTime(new Date('2026-11-12T10:00:00'));
  await page.reload();
  await weighInReplan(page);

  const s = sheet(page);
  await expect(s).toContainText('Philip needs a way to think');
  // Not "you're offline": nothing is waiting to be sent.
  await expect(s).not.toContainText('You’re offline');
  await shot(page, '1-no-ai');

  // Each choice selects, says what it does, and leads to Ask.
  await s.getByRole('radio', { name: 'Philip’s pick' }).click();
  await expect(s.getByRole('radio', { name: 'Philip’s pick' })).toHaveAttribute('aria-checked', 'true');
  await expect(s).toContainText('Starts a new cycle today');
  await expect(s.getByRole('button', { name: 'Ask Philip for the plan' })).toBeEnabled();

  await s.getByRole('radio', { name: 'Set my own' }).click();
  await expect(s.getByRole('radio', { name: 'Set my own' })).toHaveAttribute('aria-checked', 'true');
  await expect(s.getByLabel(/^Goal weight/)).toBeVisible();
  await expect(s.getByRole('button', { name: 'Ask Philip for the plan' })).toBeDisabled();
  await expect(s).toContainText('Type your goal weight first.');
  await s.getByLabel(/^Goal weight/).fill('168');
  await expect(s.getByRole('button', { name: 'Ask Philip for the plan' })).toBeEnabled();
  await shot(page, '2-own');

  await s.getByRole('radio', { name: 'Keep this goal' }).click();
  await expect(s.getByRole('radio', { name: 'Keep this goal' })).toHaveAttribute('aria-checked', 'true');
  await expect(s).toContainText('Same goal, same cycle.');
  await noHorizontalScroll(page);
});

test('OBS-0327E3: a ready plan can go back to change the goal; asking again replaces it, once', async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  const prompts = mockGemini(page, PLAN);
  await fresh(page, { at: 'home' });
  await setKey(page);
  await startCycleOne(page);
  await page.clock.setFixedTime(new Date('2026-11-12T10:00:00'));
  await page.reload();
  await weighInReplan(page);

  const s = sheet(page);
  await expect(s).toContainText('You are on pace.');
  expect(prompts).toHaveLength(1);
  // Evidence labels on Philip's levers (OBS-92D8DB).
  await expect(s).toContainText('Research-backed');
  await expect(s).toContainText('Philip’s default');

  await s.getByRole('button', { name: 'Change the goal' }).click();
  await expect(s.getByRole('radio', { name: 'Keep this goal' })).toHaveAttribute('aria-checked', 'true');
  await s.getByRole('radio', { name: 'Philip’s pick' }).click();
  await expect(s.getByRole('radio', { name: 'Philip’s pick' })).toHaveAttribute('aria-checked', 'true');
  await shot(page, '3-change-goal');
  await s.getByRole('button', { name: 'Ask Philip for the plan' }).click();
  await expect(s.getByRole('button', { name: 'Yes, let’s go' })).toBeVisible();
  expect(prompts).toHaveLength(2);
  expect(prompts[1]).toContain('restart');
  await expect(s).toContainText('Cycle 1 ends today.');
});

test('OBS-0327E3: offline, the request waits but the choices stay live; a new choice asks with the new goal', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  const prompts = mockGemini(page, PLAN);
  await fresh(page, { at: 'home' });
  await setKey(page);
  await startCycleOne(page);
  await page.clock.setFixedTime(new Date('2026-11-12T10:00:00'));
  await page.reload();
  // Lazy chunks (Progress, the sheet) load online; the SW is blocked here, so they can't load offline.
  await tab(page, 'Progress').click();
  await page.getByRole('region', { name: 'Goals' }).getByRole('button', { name: 'Re-plan with Philip' }).click();
  const s = sheet(page);
  await expect(s).toBeVisible();
  await context.setOffline(true);
  await s.getByRole('button', { name: 'Ask Philip for the plan' }).click();
  await expect(s).toContainText('You’re offline');
  expect(prompts).toHaveLength(0);

  await s.getByRole('radio', { name: 'Set my own' }).click();
  await expect(s.getByRole('radio', { name: 'Set my own' })).toHaveAttribute('aria-checked', 'true');
  await s.getByLabel(/^Goal weight/).fill('168');
  // A different goal is not the one waiting: no "offline" line for it, and Ask is back.
  await expect(s).not.toContainText('You’re offline');
  await context.setOffline(false);
  await s.getByRole('button', { name: 'Ask Philip for the plan' }).click();
  await expect(s.getByRole('button', { name: 'Yes, let’s go' })).toBeVisible();
  // Back online, the watcher may also send the old waiting request; the plan on screen is the new goal's.
  expect(prompts.at(-1)).toContain('restarts');
  await expect(s).toContainText('168 lb');
  await expect(s).toContainText('Cycle 1 ends today.');
});

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
