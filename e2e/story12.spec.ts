import { expect, test, type Page } from '@playwright/test';
import { addManualFood, fresh, noHorizontalScroll, seedWeights, tab } from './helpers';

/**
 * Story 12: Re-plan with Philip on demand (manual mode of the goal sheet), the goal date, "Your time",
 * the 60-minute lifting budget, Copy to today, the day slide and the version line.
 */
const main = (page: Page) => page.getByRole('main');
const sheet = (page: Page) => page.getByRole('dialog', { name: 'Re-plan' });
const SHOTS = process.env.STORY12_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};

// Gemini is mocked with page.route(), which misses service-worker fetches (see photo.spec.ts).
test.use({ serviceWorkers: 'block', viewport: { width: 393, height: 793 } });

const PLAN = {
  message: 'You are on pace. A touch more food, the rest stays.',
  kcal: { value: 2900, why: 'Your logs say maintenance is about 2,650.' },
  proteinG: { value: 150, why: 'Two grams per kilo while we build.' },
  cardioMin: { value: 15, why: 'Recovery first.' },
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
  await tab(page, 'Settings').click();
  await page.getByRole('textbox', { name: 'Gemini API key' }).fill('test-key-123');
  await page.getByRole('region', { name: 'Photo & text analysis (Gemini)' }).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Gemini settings saved.' })).toBeVisible();
}

/** Program set up and cycle 1 started on 2 Nov at 73 kg (Philip's goal: 74 kg). */
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

const openAsk = async (page: Page) => {
  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: 'Ask Philip' }).click();
  await expect(page.getByRole('heading', { name: 'Ask Philip', level: 1 })).toBeVisible();
};
const replan = (page: Page) => main(page).getByRole('button', { name: 'Re-plan with Philip' });

test('the button: hidden before the first cycle; on Plan, Goals and Ask Philip during one; disabled while a workout is open', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  await fresh(page, { at: 'home' });
  await openAsk(page);
  await expect(replan(page)).toHaveCount(0);

  await startCycleOne(page);
  await openAsk(page);
  await expect(replan(page)).toBeEnabled();

  await tab(page, 'Progress').click();
  await expect(page.getByRole('region', { name: 'Goals' }).getByRole('button', { name: 'Re-plan with Philip' })).toBeEnabled();

  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: /^Workout/ }).click();
  await main(page).getByRole('button', { name: 'Cycle plan' }).click();
  await expect(main(page)).toContainText('Want a fresh look?');
  await expect(replan(page)).toBeEnabled();
  await noHorizontalScroll(page);
  await shot(page, '1-plan-card');

  // Home keeps its single action and still fits the screen.
  await tab(page, 'Home').click();
  await expect(main(page).getByRole('button', { name: 'Re-plan with Philip' })).toHaveCount(0);

  // Open workout → disabled with the plain line.
  await main(page).getByRole('button', { name: /^Workout/ }).click();
  await main(page).getByRole('button', { name: /Today’s workout/ }).click();
  await expect(main(page)).toContainText('Give me 60 minutes');
  await expect(main(page)).toContainText('(outside the 60)');
  await main(page).getByRole('button', { name: 'Start workout' }).click();
  await openAsk(page);
  await expect(replan(page)).toBeDisabled();
  await expect(main(page)).toContainText('Finish or close the open workout first.');
});

test('keep this goal: Philip tunes the levers, the cycle stays; then "See Philip’s plan", the 7-day note and a goal date', async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  const prompts = mockGemini(page, PLAN);
  await fresh(page, { at: 'home' });
  await setKey(page);
  await startCycleOne(page);
  await page.clock.setFixedTime(new Date('2026-11-12T10:00:00'));
  await page.reload();

  await openAsk(page);
  await replan(page).click();
  const s = sheet(page);
  await expect(s).toBeVisible();
  await expect(s).toContainText('Let’s take a fresh look. Tell me where we’re aiming, and I’ll read your logs.');
  await expect(s.getByRole('radio', { name: 'Keep this goal' })).toHaveAttribute('aria-checked', 'true');
  await expect(s).toContainText('Cycle 1 keeps going.');
  await expect(s).not.toContainText('You re-planned less than a week ago');
  await shot(page, '2-manual-step2');

  await s.getByRole('button', { name: 'Ask Philip for the plan' }).click();
  await expect(s).toContainText('You are on pace.');
  await expect(s).toContainText('150 g');
  expect(prompts).toHaveLength(1);
  expect(prompts[0]).toContain('asked for a fresh look mid-cycle');
  expect(prompts[0]).toContain('keeps the current goal');
  await shot(page, '3-review');

  // Close without answering: the button now reopens this plan instead of asking again.
  await s.getByRole('button', { name: 'Close' }).click();
  await tab(page, 'Home').click();
  await expect(main(page)).not.toContainText('Philip’s plan is ready');
  await expect(main(page).getByRole('button', { name: 'Next goal' })).toHaveCount(0);
  await openAsk(page);
  await expect(replan(page)).toHaveCount(0);
  await main(page).getByRole('button', { name: 'See Philip’s plan' }).click();
  await expect(s).toContainText('You are on pace.');
  expect(prompts).toHaveLength(1);

  await s.getByRole('button', { name: 'Yes, let’s go' }).click();
  await expect(s).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'New plan is live.' })).toBeVisible();
  await tab(page, 'Home').click();
  await expect(main(page).getByRole('button', { name: /^Workout/ })).toContainText('Block A');
  await expect(main(page).getByRole('button', { name: 'Ask Philip' })).toBeVisible();

  // Under 7 days later: Philip's note, nothing blocked.
  await page.clock.setFixedTime(new Date('2026-11-14T10:00:00'));
  await page.reload();
  await openAsk(page);
  await replan(page).click();
  await expect(s).toContainText('You re-planned less than a week ago.');
  await expect(s.getByRole('button', { name: 'Ask Philip for the plan' })).toBeEnabled();
  await shot(page, '4-seven-day-note');

  // A new goal has a goal date: Philip suggests one, the owner can move it, the pace follows.
  await s.getByRole('radio', { name: 'Set my own' }).click();
  await s.getByLabel(/^Goal weight/).fill('168');
  await expect(s).toContainText('Philip suggests');
  await expect(s).toContainText('Cycle 1 ends today. Cycle 2 (Block B) starts with this goal.');
  await s.getByLabel('Goal date').fill('2027-01-09');
  await expect(s).toContainText('Your date: ');
  await expect(s).toContainText('8 weeks');
  await shot(page, '5-goal-date');
  await s.getByRole('button', { name: 'Use Philip’s date' }).click();
  await expect(s).toContainText('Philip suggests');
});

test('your time: days a week and minutes re-plan on Confirm; the version line', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  await fresh(page, { at: 'home' });
  await startCycleOne(page);
  await tab(page, 'Settings').click();
  await expect(main(page)).toContainText('Version 0.12.1');
  const time = main(page).getByRole('group', { name: 'Your time' });
  await expect(time.getByRole('radio', { name: '4' })).toHaveAttribute('aria-checked', 'true');
  await expect(time.getByLabel('Lifting, minutes a session')).toHaveValue('60');
  await time.getByRole('radio', { name: '3' }).click();
  await time.getByLabel('Lifting, minutes a session').selectOption('45');
  await expect(time).toContainText('Training days: Mon Tue Thu Fri →');
  await expect(time).toContainText('about 5.3 weeks at 3 days a week');
  await expect(time).toContainText('Lifting: up to 45 min a session (was 60)');
  await expect(time).toContainText('Food stays as it is.');
  await shot(page, '6-your-time');
  await time.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your time is saved.' })).toBeVisible();
  await expect(main(page).getByRole('group', { name: 'Training days' })).toContainText('Pick 3.');
  await expect(time.getByRole('button', { name: 'Confirm' })).toBeDisabled();

  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: /^Workout/ }).click();
  await main(page).getByRole('button', { name: /Today’s workout/ }).click();
  await expect(main(page)).toContainText('Give me 45 minutes');
});

test('copy to today from a swipe, with a meal choice; the day slides when it changes', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit has no Touch constructor for synthetic swipes; verify on a real iPhone.');
  await fresh(page, { at: 'meals' });
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(page.getByRole('heading', { name: 'Yesterday' })).toBeVisible();
  await addManualFood(page, { name: 'Chicken rice', calories: '600', protein: '40', fat: '15', carbs: '70', meal: 'Lunch' });
  await expect(page.getByRole('region', { name: 'Lunch' }).getByText('Chicken rice')).toBeVisible();
  await page.evaluate(() => {
    const el = document.querySelector('.meal-card[aria-label="Lunch"] .swipe-content');
    if (!el) throw new Error('row not found');
    const r = el.getBoundingClientRect();
    const y = r.top + r.height / 2;
    const x0 = r.left + r.width * 0.7;
    const touch = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    const fire = (type: string, x: number, list: boolean) =>
      el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: list ? [touch(x)] : [], changedTouches: [touch(x)] }));
    fire('touchstart', x0, true);
    for (let i = 1; i <= 6; i++) fire('touchmove', x0 - (200 * i) / 6, true);
    fire('touchend', x0 - 200, false);
  });
  const actions = page.getByRole('group', { name: /Actions for “Chicken rice”/ });
  await expect(actions.getByRole('button', { name: 'Move' })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Delete' })).toBeVisible();
  await actions.getByRole('button', { name: 'Copy to today' }).click();
  const dlg = page.getByRole('dialog', { name: 'Copy “Chicken rice” to today' });
  await expect(dlg.getByRole('radio', { name: 'Lunch' })).toHaveAttribute('aria-checked', 'true');
  await dlg.getByRole('radio', { name: 'Dinner' }).click();
  await dlg.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Copied to today’s dinner' })).toBeVisible();
  // The original stays.
  await expect(page.getByRole('region', { name: 'Lunch' }).getByText('Chicken rice')).toBeVisible();

  // Forward: the new day comes in from the right.
  const dx = await page.evaluate(async () => {
    (document.querySelector('button[aria-label="Next day"]') as HTMLButtonElement).click();
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const a = document.querySelector('.day-slide')?.getAnimations()[0];
      const k = (a?.effect as KeyframeEffect | undefined)?.getKeyframes()[0];
      if (k) return String(k.transform);
    }
    return null;
  });
  expect(dx).toBe('translateX(36px)');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Dinner' }).getByText('Chicken rice')).toBeVisible();
  await noHorizontalScroll(page);
});
