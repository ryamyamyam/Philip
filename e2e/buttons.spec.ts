import { expect, test, type Locator, type Page } from '@playwright/test';
import { expandSettings, fresh, pageToday } from './helpers';
import { addDays, strengthSeed } from './story16-seed';

/**
 * Story 16 §3.5: every button works. At 393×793, on every screen and the main sheets, tap each enabled
 * button once (fresh state each time) and require an observable effect: the page changed (navigation,
 * sheet, toast, pressed state, text), a file chooser or download opened, or IndexedDB was written.
 * ALLOW lists intentional no-ops with a reason; it must stay empty or justified.
 */
test.use({ serviceWorkers: 'block', viewport: { width: 393, height: 793 } });
test.setTimeout(420_000);

const ALLOW: Record<string, string> = {
  // (none: every button found has an effect)
};

let SEED: { s: ReturnType<typeof strengthSeed>; today: string; plan: Record<string, unknown> } | null = null;

async function seedAll(page: Page) {
  await fresh(page, { at: 'home' });
  await expect.poll(async () => page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('philip'); r.onsuccess = () => res(r.result); });
    const n = await new Promise<number>((res) => { const q = db.transaction('meta').objectStore('meta').count('playbookUpdate'); q.onsuccess = () => res(q.result); });
    db.close();
    return n;
  })).toBe(1);
  const today = await pageToday(page);
  const s = strengthSeed(today);
  SEED = { s, today, plan: { effectiveFrom: addDays(today, -10), calories: 2900, proteinG: 140, fatG: 75, carbsG: 380, method: 'calculated', inputsSnapshot: { goal: 'gain', weightKg: 73, targetWeightKg: 75, weeklyRateKg: 0.2 }, weekdayOverrides: null, createdAt: 1 } };
  await restore(page);
}

/** Puts the test data back (the previous tap may have skipped a workout, deleted food, …). Test data only. */
async function restore(page: Page) {
  if (!SEED) return;
  const { s, today, plan } = SEED;
  await page.evaluate(
    async ({ s, today, plan }) => {
      const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open('philip'); r.onsuccess = () => res(r.result); });
      const names = ['profile', 'trainingProgram', 'cycles', 'tmHistory', 'workoutSessions', 'slotChoices', 'targetPlans', 'foodEntries', 'weightEntries', 'meta', 'planChanges', 'coachMessages', 'coachNotes'];
      const tx = db.transaction(names, 'readwrite');
      for (const n of names) if (n !== 'profile' && n !== 'meta') tx.objectStore(n).clear();
      const p = tx.objectStore('profile');
      const get = p.get('me');
      get.onsuccess = () => p.put({ ...get.result, sex: 'male', heightCm: 178, birthDate: '1998-01-01', activityLevel: 'moderate', weightKg: 73, goal: 'gain', trainingYears: 2 });
      tx.objectStore('trainingProgram').put(s.program);
      for (const c of s.cycles) tx.objectStore('cycles').put(c);
      for (const r of s.tmHistory) tx.objectStore('tmHistory').put(r);
      for (const r of s.sessions) tx.objectStore('workoutSessions').put(r);
      for (const r of s.slotChoices) tx.objectStore('slotChoices').put(r);
      tx.objectStore('targetPlans').put(plan);
      tx.objectStore('foodEntries').put({ id: 'f1', date: today, meal: 'breakfast', name: 'Oats', grams: 80, calories: 300, proteinG: 10, fatG: 5, carbsG: 50, source: 'manual', savedFoodId: null, estimate: null, createdAt: 1, updatedAt: 1 });
      for (const d of [0, 2, 4]) {
        const dt = new Date(); dt.setDate(dt.getDate() - d);
        const y = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        tx.objectStore('weightEntries').put({ date: y, weightKg: 73 + d / 10, createdAt: 1, updatedAt: 1 });
      }
      tx.objectStore('meta').put({ key: 'lastBackupAt', value: Date.now() });
      await new Promise((res) => (tx.oncomplete = res));
      db.close();
    },
    { s, today, plan },
  );
}

/** A cheap fingerprint of what the owner can see, plus a count of IndexedDB writes (see the init script). */
async function fingerprint(page: Page): Promise<string> {
  return page.evaluate(() => [location.hash, document.body.innerHTML, String((window as unknown as { __idbWrites?: number }).__idbWrites ?? 0)].join('|'));
}

interface Screen {
  name: string;
  open: (page: Page) => Promise<void>;
  /** Where the buttons are: the main screen or the open dialog. */
  scope: (page: Page) => Locator;
}

const toRoute = (hash: string, after?: (page: Page) => Promise<void>) => async (page: Page) => {
  await page.goto(`./${hash}`);
  await restore(page);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  // Lazy screens: wait for their heading.
  await expect(page.getByRole('main').getByRole('heading').first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  if (after) await after(page);
};

const main = (p: Page) => p.getByRole('main');
const dialog = (p: Page) => p.getByRole('dialog').last();

const SCREENS: Screen[] = [
  { name: 'Home', open: toRoute('#/home'), scope: main },
  { name: 'Meal log', open: toRoute('#/meals'), scope: main },
  { name: 'Progress', open: toRoute('#/progress'), scope: main },
  { name: 'Progress › Strength', open: toRoute('#/progress', async (p) => main(p).getByRole('tab', { name: 'Strength' }).click()), scope: main },
  { name: 'Settings', open: toRoute('#/settings', expandSettings), scope: main },
  { name: 'Targets', open: toRoute('#/targets'), scope: main },
  { name: 'Workout calendar', open: toRoute('#/workout'), scope: main },
  { name: 'Workout plan', open: toRoute('#/workout/plan'), scope: main },
  { name: 'Ask Philip', open: toRoute('#/ask'), scope: main },
  {
    name: 'Workout preview',
    open: toRoute('#/workout', async (p) => main(p).getByRole('button', { name: /Today’s workout/ }).click()),
    scope: main,
  },
  {
    name: 'Workout session',
    open: toRoute('#/workout', async (p) => {
      const resume = main(p).getByRole('button', { name: /Resume:/ });
      if (await resume.count()) await resume.click();
      else {
        await main(p).getByRole('button', { name: /Today’s workout/ }).click();
        await main(p).getByRole('button', { name: 'Start workout' }).click();
      }
      await expect(main(p).getByRole('button', { name: 'Finish workout' })).toBeVisible();
    }),
    scope: main,
  },
  { name: 'Sheet: playbook', open: toRoute('#/settings', async (p) => { await expandSettings(p); await main(p).getByRole('button', { name: 'Today’s plan by the playbook' }).click(); await expect(dialog(p)).toBeVisible(); }), scope: dialog },
  { name: 'Sheet: Update goals', open: toRoute('#/progress', async (p) => { await main(p).getByRole('button', { name: /Update goals/ }).first().click(); await expect(dialog(p)).toBeVisible(); }), scope: dialog },
  { name: 'Sheet: Why this plan', open: toRoute('#/workout/plan', async (p) => { await main(p).getByRole('button', { name: 'Why this plan' }).first().click(); await expect(dialog(p)).toBeVisible(); }), scope: dialog },
  { name: 'Sheet: Review (type the numbers)', open: toRoute('#/meals', async (p) => { await main(p).getByRole('button', { name: 'Enter yourself' }).click(); await p.getByRole('region', { name: 'Add food' }).getByRole('button', { name: 'Type the numbers' }).click(); await expect(dialog(p)).toBeVisible(); }), scope: dialog },
];

test.beforeEach(async ({ page }) => {
  // Counts IndexedDB writes, so a button whose only effect is saving still counts as working.
  await page.addInitScript(() => {
    const w = window as unknown as { __idbWrites: number };
    w.__idbWrites = 0;
    for (const m of ['put', 'add', 'delete', 'clear'] as const) {
      const orig = IDBObjectStore.prototype[m] as (...a: unknown[]) => IDBRequest;
      (IDBObjectStore.prototype as unknown as Record<string, unknown>)[m] = function (this: IDBObjectStore, ...a: unknown[]) {
        w.__idbWrites++;
        return orig.apply(this, a);
      };
    }
  });
});

const GROUPS: [string, string[]][] = [
  ['food and progress', ['Home', 'Meal log', 'Progress', 'Progress › Strength', 'Targets']],
  ['settings and Philip', ['Settings', 'Ask Philip']],
  ['workout', ['Workout calendar', 'Workout plan', 'Workout preview', 'Workout session']],
  ['sheets', ['Sheet: playbook', 'Sheet: Update goals', 'Sheet: Why this plan', 'Sheet: Review (type the numbers)']],
];

for (const [group, names] of GROUPS)
test(`every enabled button works: ${group}`, async ({ page }) => {
  await seedAll(page);
  const dead: string[] = [];
  let tapped = 0;
  for (const screen of SCREENS.filter((x) => names.includes(x.name))) {
    await screen.open(page);
    const count = await screen.scope(page).getByRole('button').count();
    console.log(`${screen.name}: ${count} buttons`);
    for (let i = 0; i < count; i++) {
      if (i > 0) await screen.open(page);
      const btn = screen.scope(page).getByRole('button').nth(i);
      if (!(await btn.count()) || !(await btn.isVisible()) || !(await btn.isEnabled())) continue;
      // Hidden file inputs are driven by their own visible buttons (Choose photo, Import), crawled separately.
      if (await btn.evaluate((el) => el instanceof HTMLInputElement && el.type === 'file')) continue;
      const label = (
        await btn.evaluate((el) => {
          const by = el.getAttribute('aria-labelledby');
          const named = el.getAttribute('aria-label') ?? (by ? document.getElementById(by)?.textContent : null) ?? el.textContent ?? '';
          return named.trim() || el.getAttribute('title') || el.outerHTML.slice(0, 80);
        })
      ).replace(/\s+/g, ' ').trim().slice(0, 80);
      const key = `${screen.name} › ${label}`;
      const before = await fingerprint(page);
      let side = false;
      const onSide = () => (side = true);
      page.on('filechooser', onSide);
      page.on('download', onSide);
      page.on('popup', onSide);
      await btn.click({ timeout: 3000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      page.off('filechooser', onSide);
      page.off('download', onSide);
      page.off('popup', onSide);
      tapped++;
      const after = await fingerprint(page);
      if (!side && after === before && !(key in ALLOW)) dead.push(key);
    }
  }
  console.log(`button crawl: ${tapped} buttons tapped`);
  expect(dead, `dead buttons:\n${dead.join('\n')}`).toEqual([]);
  expect(tapped).toBeGreaterThan(5);
  for (const [k, why] of Object.entries(ALLOW)) expect(why.length, `ALLOW entry needs a reason: ${k}`).toBeGreaterThan(10);
});
