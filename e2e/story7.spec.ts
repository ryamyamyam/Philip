import { expect, test, type Page } from '@playwright/test';
import { fresh, noHorizontalScroll, seedWeights, tab, openSettings } from './helpers';

/** Story 7: gym QA batch (OBS-C94181, OBS-F52773, OBS-93A8C0, OBS-3DB146). */
const main = (page: Page) => page.getByRole('main');
const SHOTS = process.env.STORY7_SHOTS;

// Gemini is mocked with page.route(), which misses service-worker fetches (see photo.spec.ts).
test.use({ serviceWorkers: 'block', viewport: { width: 393, height: 793 } });

async function setKey(page: Page) {
  await openSettings(page);
  await page.getByRole('textbox', { name: 'Gemini API key' }).fill('test-key-123');
  await page.getByRole('region', { name: 'Photo & text analysis (Gemini)' }).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Gemini settings saved.' })).toBeVisible();
}

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

/** The nth exercise card's title (waits for it). */
const card = (page: Page, n: number) => main(page).locator('.ex-card .ex-name').nth(n);

test('OBS-C94181: dumbbell pairs read per hand, "2 × 35 lb × 9", with the total', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  await fresh(page);
  await setUpAndOpenDay1(page);
  await main(page).getByRole('button', { name: 'Start workout' }).click();
  const bss = main(page).getByRole('region', { name: /Bulgarian split squat/ });
  await expect(bss).toContainText(/[34] sets · 2 × 35 lb × 9 per side \(8–10\)/);
  const set1 = bss.getByRole('listitem').first();
  await expect(set1).toContainText('2 × 35 lb · 15.9 kg × 9 per side');
  await expect(set1).toContainText('70 lb total');
  await expect(set1.getByRole('textbox', { name: 'Set 1: weight per hand in lb' })).toBeVisible();
  // A machine stays a plain number.
  const curl = main(page).getByRole('region', { name: /Lying leg curl/ });
  await expect(curl).not.toContainText('2 ×');
  if (SHOTS) await bss.screenshot({ path: `${SHOTS}/obs-c94181-dumbbells.png` });
  await noHorizontalScroll(page);
});

test('OBS-F52773: move A2 above A1; the order is remembered for the day and can change again', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  await fresh(page);
  await setUpAndOpenDay1(page);
  await main(page).getByRole('button', { name: 'Start workout' }).click();
  await expect(card(page, 1)).toContainText('Bulgarian split squat');
  // Story 10 (OBS-DD5F16): reorder mode. Main lift can't move; A1 can't go above it.
  await main(page).getByRole('button', { name: 'Change the order (or long-press a title)' }).click();
  await expect(main(page).getByRole('button', { name: 'Move Back squat up' })).toHaveCount(0);
  await expect(main(page).getByRole('button', { name: 'Move Bulgarian split squat up' })).toBeDisabled();
  await main(page).getByRole('button', { name: 'Move Lying leg curl up' }).click();
  await main(page).getByRole('button', { name: 'Save order' }).click();
  await expect(card(page, 0)).toContainText('Back squat');
  await expect(card(page, 1)).toContainText('Lying leg curl');
  await expect(card(page, 2)).toContainText('Bulgarian split squat');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/obs-f52773-order.png`, fullPage: true });

  // Survives a reload (autosave), then discard and start again: the day opens in the new order.
  await page.reload();
  await main(page).getByRole('button', { name: /Resume|Today’s workout/ }).first().click();
  await expect(card(page, 1)).toContainText('Lying leg curl');
  await main(page).getByRole('button', { name: 'Discard workout' }).click();
  await page.getByRole('alertdialog', { name: 'Discard this workout?' }).getByRole('button', { name: 'Discard' }).click();
  await main(page).getByRole('button', { name: /Today’s workout: Day 1/ }).click();
  const preview = main(page).locator('.start-list');
  await expect(preview.locator('li').nth(1)).toContainText('Lying leg curl');
  await main(page).getByRole('button', { name: 'Start workout' }).click();
  await expect(card(page, 1)).toContainText('Lying leg curl');
  // Changed again: back to A1 first.
  await main(page).getByRole('button', { name: 'Change the order (or long-press a title)' }).click();
  await main(page).getByRole('button', { name: 'Move Lying leg curl down' }).click();
  await main(page).getByRole('button', { name: 'Save order' }).click();
  await expect(card(page, 1)).toContainText('Bulgarian split squat');
  await noHorizontalScroll(page);
});

test('OBS-93A8C0: incline walk after the lifts, outside the lifting minutes; logged on the summary; no key → plain report note', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  await fresh(page);
  await setUpAndOpenDay1(page);
  await expect(main(page).locator('.start-list')).toContainText('+ Cardio: incline walk 15 min (outside the 60)');
  await main(page).getByRole('button', { name: 'Start workout' }).click();
  const cardio = main(page).getByRole('region', { name: 'Cardio: incline walk' });
  await expect(cardio).toContainText('15 min or more on the ramp. Not counted in the 60.');
  const doneBtn = cardio.getByRole('button', { name: 'Done' });
  await expect(doneBtn).toBeDisabled();
  await cardio.getByRole('textbox', { name: 'Minutes' }).fill('18');
  await cardio.getByRole('textbox', { name: 'Incline %' }).fill('12');
  await cardio.getByRole('textbox', { name: 'Speed (mph)' }).fill('3');
  await doneBtn.click();
  await expect(cardio.getByRole('button', { name: 'Undo done' })).toBeVisible();
  if (SHOTS) await cardio.screenshot({ path: `${SHOTS}/obs-93a8c0-cardio.png` });
  await main(page).getByRole('button', { name: 'Finish workout' }).click();
  await main(page).getByRole('button', { name: 'Yes, that is right' }).click();
  await expect(main(page)).toContainText(/Cardio\s*18 min at 12%/);
  const report = main(page).getByRole('region', { name: 'Philip’s report' });
  await expect(report).toContainText('need a Gemini key');
  await noHorizontalScroll(page);
});

test('OBS-3DB146: after Finish, Philip writes a report with proposals; apply one, then chat and get a new one', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  const prompts: string[] = [];
  const replies = [
    {
      message: 'Squat moved clean. Split squats looked easy, so they go up.',
      changes: [
        { kind: 'next', exerciseId: 'bulgarian-split-squat', kg: 18, reps: 10, sets: null, why: 'You owned 9 reps.' },
        { kind: 'swap', day: 1, slot: 'A2', exerciseId: 'not-on-the-menu' },
      ],
    },
    { message: 'Machines busy? Fine. Seated curl from now on.', changes: [{ kind: 'swap', day: 1, slot: 'A2', exerciseId: 'seated-leg-curl', why: 'Same job.' }] },
  ];
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const body = route.request().postDataJSON() as { contents: { parts: { text: string }[] }[] };
    prompts.push(body.contents[0]?.parts[0]?.text ?? '');
    const r = replies[Math.min(prompts.length - 1, replies.length - 1)];
    await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(r) }] }, finishReason: 'STOP' }] } });
  });
  await fresh(page);
  await setKey(page);
  await setUpAndOpenDay1(page);
  await main(page).getByRole('button', { name: 'Start workout' }).click();
  const bss = main(page).getByRole('region', { name: /Bulgarian split squat/ });
  await bss.getByRole('button', { name: 'Set 1: as ordered' }).click();
  await main(page).getByRole('button', { name: 'Finish workout' }).click();
  await main(page).getByRole('button', { name: 'Yes, that is right' }).click();

  const report = main(page).getByRole('region', { name: 'Philip’s report' });
  await expect(report).toContainText('Squat moved clean.');
  expect(prompts[0]).toContain('bulgarian-split-squat');
  // The invalid swap was dropped; the valid next-time order is offered.
  const items = report.locator('.report-proposal');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Bulgarian split squat next time: 2 × 40 lb · 10 reps');
  await items.first().getByRole('button', { name: 'Apply' }).click();
  await expect(items.first()).toContainText('Applied');

  await report.getByRole('textbox', { name: 'Talk to Philip about this workout' }).fill('The leg curl machines were all taken');
  await report.getByRole('button', { name: 'Send' }).click();
  await expect(report).toContainText('You: The leg curl machines were all taken');
  await expect(report).toContainText('Philip: Machines busy? Fine.');
  expect(prompts[1]).toContain('The leg curl machines were all taken');
  await expect(items.nth(1)).toContainText('Day 1 A2: Lying leg curl → Seated leg curl');
  await items.nth(1).getByRole('button', { name: 'Apply' }).click();
  await expect(items.nth(1)).toContainText('Applied');
  // The label still says what it replaced after applying.
  await expect(items.nth(1)).toContainText('Day 1 A2: Lying leg curl → Seated leg curl');
  if (SHOTS) await report.screenshot({ path: `${SHOTS}/obs-3db146-report.png` });
  await noHorizontalScroll(page);

  // Stored: the swap is sticky for the slot; the report thread is on the session.
  const stored = await page.evaluate(
    () =>
      new Promise<string>((res) => {
        const r = indexedDB.open('philip');
        r.onsuccess = () => {
          const tx = r.result.transaction(['slotChoices', 'workoutSessions']);
          const c = tx.objectStore('slotChoices').getAll();
          const s = tx.objectStore('workoutSessions').getAll();
          tx.oncomplete = () => res(JSON.stringify({ choices: c.result, sessions: s.result }));
        };
      }),
  );
  const { choices, sessions } = JSON.parse(stored) as { choices: { slotKey: string; exerciseId: string }[]; sessions: { coach?: { messages: unknown[] } }[] };
  expect(choices.map((c) => [c.slotKey, c.exerciseId])).toEqual([['D1-A2-A', 'seated-leg-curl']]);
  expect(sessions[0]?.coach?.messages).toHaveLength(2);
});

test('OBS-369BCA: a stated priority in the chat restructures the plan — Philip reorders a day, applied in one tap', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-02T10:00:00'));
  const prompts: string[] = [];
  const replies = [
    { message: 'Solid squat day.', changes: [] },
    {
      message: 'Weak link, top priority. On day 1 the leg curl goes first after squats while you are fresh.',
      changes: [
        { kind: 'order', day: 1, order: ['A2', 'A1', 'B'], why: 'Train the weak point fresh.' },
        { kind: 'rest', extraSec: 45, why: 'Recover between sets.' },
      ],
    },
  ];
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const body = route.request().postDataJSON() as { contents: { parts: { text: string }[] }[] };
    prompts.push(body.contents[0]?.parts[0]?.text ?? '');
    const r = replies[Math.min(prompts.length - 1, replies.length - 1)];
    await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(r) }] }, finishReason: 'STOP' }] } });
  });
  await fresh(page);
  await setKey(page);
  await setUpAndOpenDay1(page);
  await main(page).getByRole('button', { name: 'Start workout' }).click();
  await main(page).getByRole('region', { name: /Bulgarian split squat/ }).getByRole('button', { name: 'Set 1: as ordered' }).click();
  await main(page).getByRole('button', { name: 'Finish workout' }).click();
  await main(page).getByRole('button', { name: 'Yes, that is right' }).click();
  const report = main(page).getByRole('region', { name: 'Philip’s report' });
  await expect(report).toContainText('Solid squat day.');
  // The whole plan, including each day's order, is in front of Philip.
  expect(prompts[0]).toContain('day 1 (squat day) order: main > A1 > A2 > B');

  await report.getByRole('textbox', { name: 'Talk to Philip about this workout' }).fill('My hamstrings are drastically weaker than my quads. Optimise the plan for this.');
  await report.getByRole('button', { name: 'Send' }).click();
  await expect(report).toContainText('Weak link, top priority.');
  expect(prompts[1]).toContain('treat it as a request to restructure the plan');
  const items = report.locator('.report-proposal');
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText('Day 1 order: Lying leg curl > Bulgarian split squat > ');
  await items.first().getByRole('button', { name: 'Apply' }).click();
  await expect(items.first()).toContainText('Applied');
  await noHorizontalScroll(page);
  const order = await page.evaluate(
    () =>
      new Promise<unknown>((res) => {
        const r = indexedDB.open('philip');
        r.onsuccess = () => {
          const g = r.result.transaction('trainingProgram').objectStore('trainingProgram').get('me');
          g.onsuccess = () => res((g.result as { dayOrder?: unknown }).dayOrder);
        };
      }),
  );
  expect(order).toEqual({ '1': ['main', 'A2', 'A1', 'B'] });
});
