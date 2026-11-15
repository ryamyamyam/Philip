import { expect, test, type Page } from '@playwright/test';
import { fresh, openSettings, pageToday, tab } from './helpers';
import { addDays, KG_PER_LB, strengthSeed } from './story16-seed';

/**
 * Story 16 (D-039): Philip's Playbook. Today's plan follows the playbook with Undo (AC 5), the
 * plausibility check corrects the 85 lb lunge (AC 6), notes are saved and acted on (AC 8), the exercise
 * card shows last week / this week (AC 11), and lifting lighter than planned moves the strength date in
 * the report and on the calendar while the body-weight goal date stays (AC 12).
 */
const main = (page: Page) => page.getByRole('main');
const NEXT = 'Next month';
const SHOTS = process.env.STORY16_SHOTS;
const shot = async (page: Page, name: string, el?: ReturnType<Page['locator']>) => {
  if (!SHOTS) return;
  if (el) await el.screenshot({ path: `${SHOTS}/${name}.png` });
  else await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test.use({ serviceWorkers: 'block', viewport: { width: 393, height: 793 } });

/** Writes records straight into IndexedDB (test data only) and optionally deletes meta keys. */
async function seed(page: Page, stores: Record<string, unknown[]>, deleteMeta: string[] = []) {
  await page.evaluate(
    async ({ stores, deleteMeta }) => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const r = indexedDB.open('philip');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const names = [...new Set([...Object.keys(stores), ...(deleteMeta.length ? ['meta'] : [])])];
      const tx = db.transaction(names, 'readwrite');
      for (const [name, rows] of Object.entries(stores)) for (const row of rows) tx.objectStore(name).put(row);
      for (const k of deleteMeta) tx.objectStore('meta').delete(k);
      await new Promise((res, rej) => {
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
      db.close();
    },
    { stores, deleteMeta },
  );
}

async function readStore<T>(page: Page, name: string): Promise<T[]> {
  return page.evaluate(async (name) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open('philip');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const rows = await new Promise<unknown[]>((res) => {
      const q = db.transaction(name).objectStore(name).getAll();
      q.onsuccess = () => res(q.result);
    });
    db.close();
    return rows;
  }, name) as Promise<T[]>;
}

async function profile(page: Page, over: Record<string, unknown> = {}) {
  const [p] = await readStore<Record<string, unknown>>(page, 'profile');
  return { ...p, sex: 'male', heightCm: 178, birthDate: '1998-01-01', activityLevel: 'moderate', weightKg: 73, goal: 'gain', ...over };
}

/** Waits until the app has marked a fresh install (so later seeding isn't treated as an update). */
async function waitFresh(page: Page) {
  await expect.poll(async () => (await readStore<{ key: string }>(page, 'meta')).some((m) => m.key === 'playbookUpdate')).toBe(true);
}

test('AC 5: first launch of 0.16.1 → today’s plan follows the playbook, logged food stays, Undo restores it', async ({ page }) => {
  await fresh(page, { at: 'home' });
  await waitFresh(page);
  const today = await pageToday(page);
  await seed(
    page,
    {
      profile: [await profile(page, { trainingYears: null })],
      // A plan made under the old rules: +0.55%/week (above the 1–3 year band), protein and fat under their floors.
      targetPlans: [{ effectiveFrom: addDays(today, -13), calories: 3200, proteinG: 100, fatG: 40, carbsG: 610, method: 'calculated', inputsSnapshot: { goal: 'gain', weightKg: 73 }, weekdayOverrides: null, createdAt: 1 }],
      foodEntries: [{ id: 'f1', date: today, meal: 'breakfast', name: 'Oats', grams: 80, calories: 300, proteinG: 10, fatG: 5, carbsG: 50, source: 'manual', savedFoodId: null, estimate: null, createdAt: 1, updatedAt: 1 }],
    },
    ['playbookUpdate'],
  );
  await page.reload();
  const sheet = page.getByRole('dialog', { name: 'Today’s plan, by the playbook' });
  await expect(sheet).toBeVisible();
  // Asked once: years of lifting.
  await sheet.getByRole('button', { name: '1 to 3 years' }).click();
  await expect(sheet).toContainText('Today’s targets');
  await expect(sheet).toContainText('Calories');
  await expect(sheet).toContainText('3,200 kcal →');
  await expect(sheet).toContainText('Rule PB-2.3');
  await expect(sheet).toContainText('Rule PB-3.1');
  await expect(sheet).toContainText('Rule PB-3.2');
  await expect(sheet).toContainText('Gym days and rest days');
  await expect(sheet).toContainText('Undo is here for 24 hours.');
  await shot(page, 'story16-today-plan-sheet');
  await sheet.getByRole('button', { name: 'Got it' }).click();

  const plans = await readStore<{ effectiveFrom: string; calories: number; createdAt: number }>(page, 'targetPlans');
  expect(plans).toHaveLength(2);
  const newest = plans.sort((a, b) => b.createdAt - a.createdAt)[0]!;
  expect(newest.effectiveFrom).toBe(today);
  expect(newest.calories).toBeLessThan(3200);
  expect((await readStore<{ trainingYears?: number }>(page, 'profile'))[0]?.trainingYears).toBe(2);
  // Food logged today stays.
  await main(page).getByRole('button', { name: /^Meal log/ }).click();
  await expect(main(page)).toContainText('Oats');

  // Settings › Training reopens it; Undo brings the old plan back (append-only).
  await openSettings(page);
  await main(page).getByRole('button', { name: 'Today’s plan by the playbook' }).click();
  await sheet.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Undone. Your old plan is back.' })).toBeVisible();
  const after = (await readStore<{ calories: number; createdAt: number }>(page, 'targetPlans')).sort((a, b) => b.createdAt - a.createdAt);
  expect(after).toHaveLength(3);
  expect(after[0]?.calories).toBe(3200);
});

async function seedStrength(page: Page) {
  await fresh(page, { at: 'home' });
  await waitFresh(page);
  const today = await pageToday(page);
  const s = strengthSeed(today);
  await seed(page, {
    profile: [await profile(page, { trainingYears: 2 })],
    weightEntries: [0, 2, 4].map((d) => ({ date: addDays(today, -d), weightKg: 73, createdAt: 1, updatedAt: 1 })),
    trainingProgram: [s.program],
    cycles: s.cycles,
    tmHistory: s.tmHistory,
    workoutSessions: s.sessions,
    slotChoices: s.slotChoices,
    meta: [{ key: 'lastBackupAt', value: Date.now() }],
  });
  await page.reload();
  return today;
}

async function openWorkout(page: Page) {
  await tab(page, 'Home').click();
  await main(page).getByRole('button', { name: /^Workout/ }).click();
  await expect(page.getByRole('heading', { name: 'Workout', level: 1 })).toBeVisible();
}

/** The calendar cell with the strength-date marker (moves month by month until it shows; up to a year). */
async function markerLabel(page: Page): Promise<string> {
  for (let i = 0; i < 12 && (await page.getByTestId('strength-marker').count()) === 0; i++) await main(page).getByRole('button', { name: NEXT }).click();
  await expect(page.getByTestId('strength-marker')).toHaveCount(1);
  return (await page.getByTestId('strength-marker').locator('xpath=..').getAttribute('aria-label')) ?? '';
}

test('AC 6, 8, 11, 12: corrected lunge, last week / this week, notes acted on, lighter day moves the strength date', async ({ page }) => {
  const today = await seedStrength(page);
  await openWorkout(page);
  // The strength-date marker (separate from the goal flower) sits on the calendar.
  const before = await markerLabel(page);
  expect(before).toContain('Strength date');
  await openWorkout(page);
  await main(page).getByRole('button', { name: /Today’s workout: Day 1/ }).click();
  // Pre-workout check: last week / this week under each exercise.
  await expect(main(page).getByTestId('strength-strip').first()).toContainText('Last week:');
  await main(page).getByRole('button', { name: 'Start workout' }).click();

  // AC 11: the squat card shows last week and this week as weight × reps × sets, and e1RM vs plan.
  const squat = main(page).getByRole('region', { name: 'Back squat', exact: true });
  const strip = squat.getByTestId('strength-strip');
  await expect(strip).toContainText(/Last week: [\d.,]+ lb × \d+ × \d+/);
  await expect(strip).toContainText(/This week: [\d.,]+ lb × \d+ × \d+/);
  await expect(strip).toContainText(/e1RM .* plan .*(On track|Ahead|Behind)/);
  await shot(page, 'story16-exercise-card', squat);

  // AC 6: the 85 lb per hand lunge is corrected, with the reason in one line; dumbbells read "2 × …".
  const lunge = main(page).getByRole('region', { name: 'Walking lunge', exact: true });
  const fix = lunge.getByTestId('load-corrected');
  await expect(fix).toContainText('Corrected');
  await expect(fix).toContainText('My old number, 2 × 85 lb, was wrong');
  await expect(lunge.getByTestId('strength-strip')).toContainText(/Last week: 2 × 80 lb × 10 × \d+/);
  await shot(page, 'story16-corrected-load', lunge);

  // AC 8: notes save on Enter / blur and say so.
  await lunge.getByRole('button', { name: 'Note', exact: true }).click();
  const lungeNote = lunge.getByRole('textbox', { name: 'Note' });
  await lungeNote.fill('Still way too heavy for me');
  await lungeNote.press('Enter');
  await expect(lunge).toContainText('Saved');
  const curl = main(page).getByRole('region', { name: 'Assisted Nordic curl', exact: true });
  await curl.getByRole('button', { name: 'Note', exact: true }).click();
  await curl.getByRole('textbox', { name: 'Note' }).fill('Sharp pain behind my knee');
  await page.getByTestId('day-note').click();
  await expect(curl).toContainText('Saved');
  await page.getByTestId('day-note').fill('Slept five hours');
  await page.getByTestId('day-note').press('Enter');
  await expect(main(page).getByRole('region', { name: 'Notes for today' })).toContainText('Saved');
  const stored = (await readStore<{ status: string; note?: string; exercises: { exerciseId: string; note: string }[] }>(page, 'workoutSessions')).find((x) => x.status === 'in_progress')!;
  expect(stored.note).toBe('Slept five hours');
  expect(stored.exercises.find((e) => e.exerciseId === 'walking-lunge')?.note).toBe('Still way too heavy for me');

  // AC 12: the top set lighter than ordered (20 kg less).
  const top = squat.getByRole('listitem').filter({ hasText: 'Top set' });
  const order = await top.locator('.set-target').innerText();
  const lb = Number((/([\d.]+)\s*lb/.exec(order) ?? [])[1]);
  await top.getByRole('textbox').first().fill(String(Math.round(lb - 20 / KG_PER_LB)));
  await top.getByRole('textbox').nth(1).fill('5');
  await top.getByRole('button', { name: /mark done/ }).click();
  await page.waitForTimeout(300);

  await main(page).getByRole('button', { name: 'Finish workout' }).click();
  // The read-back shows the notes.
  await expect(main(page)).toContainText('note: “Still way too heavy for me”');
  await expect(main(page)).toContainText('Slept five hours');
  await main(page).getByRole('button', { name: 'Yes, that is right' }).click();

  // The day's final report: the strength-date change, and the body-weight goal date stays.
  const line = main(page).getByTestId('strength-date-line');
  await expect(line).toContainText('Lighter than planned today');
  await expect(line).toContainText('Your body-weight goal date stays where it is');
  await shot(page, 'story16-report-strength-date', main(page).getByRole('region', { name: 'Workout done' }));
  // Notes become proposals: pain → the PB-7.4 safety line; "too heavy" → the pushback weight.
  await expect(main(page).getByTestId('note-safety')).toContainText('Assisted Nordic curl');
  await expect(main(page).getByTestId('note-safety')).toContainText('PB-7.4');
  await expect(main(page).getByTestId('note-ack')).toContainText('Slept five hours');

  // History keeps the notes; the calendar marker has moved (the goal flower is separate).
  await main(page).getByRole('button', { name: 'Back to calendar' }).last().click();
  const after = await markerLabel(page);
  expect(after).not.toBe(before);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/story16-calendar-marker.png` });
  void today;
});

test('Story 16: a "too heavy" note on a plausible load proposes the +2 RIR weight; Yes applies it to the next order', async ({ page }) => {
  await seedStrength(page);
  await openWorkout(page);
  await main(page).getByRole('button', { name: /Today’s workout: Day 1/ }).click();
  await main(page).getByRole('button', { name: 'Start workout' }).click();
  const lunge = main(page).getByRole('region', { name: 'Walking lunge', exact: true });
  // Keep the corrected weight; the note says it was still too heavy.
  for (const b of await lunge.getByRole('button', { name: /as ordered/ }).all()) await b.click();
  await lunge.getByRole('button', { name: 'Note', exact: true }).click();
  await lunge.getByRole('textbox', { name: 'Note' }).fill('too heavy');
  await lunge.getByRole('textbox', { name: 'Note' }).press('Enter');
  await main(page).getByRole('button', { name: 'Finish workout' }).click();
  await main(page).getByRole('button', { name: 'Yes, that is right' }).click();
  const review = main(page).getByRole('region', { name: 'Philip’s review' });
  await expect(review).toContainText(/Walking lunge next time: 2 × [\d.]+ lb → 2 × [\d.]+ lb\. You said it was too heavy/);
  await review.getByRole('button', { name: 'OK, apply' }).click();
  const program = (await readStore<{ nextOverrides?: { exerciseId: string; kg: number | null }[] }>(page, 'trainingProgram'))[0]!;
  const next = program.nextOverrides?.find((o) => o.exerciseId === 'walking-lunge');
  expect(next?.kg ?? 99).toBeLessThan(16);
});
