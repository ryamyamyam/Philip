import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { fresh, seedWeights, tab } from './helpers';

/**
 * Story 8 (T-025): efficiency budgets. Chromium only (CDP). Numbers are printed as `PERF {...}`
 * lines so a run can be compared with the baseline in docs/stories/STORY_8_EFFICIENCY.md.
 * Budgets are deliberately loose: they catch regressions, not noise.
 */

const IDLE_MS = 10_000;

export const BUDGET = {
  /** Script/style/layout CPU per idle second, at 4× CPU slowdown (ms per s). */
  idleCpuMsPerSec: { home: 15, session: 25 },
  /** Infinite CSS/Web animations running while nothing happens. */
  infiniteAnimations: { home: 0, session: 0 },
  /** Cold start (no SW, no cache) to first contentful paint, at 4× CPU slowdown. */
  coldFcpMs: 2500,
};

const main = (page: Page) => page.getByRole('main');

async function metrics(cdp: CDPSession): Promise<Record<string, number>> {
  const { metrics: m } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(m.map((x) => [x.name, x.value]));
}

/** CPU busy time (script + style + layout) over an idle window, plus what's running in it. */
async function idle(page: Page, cdp: CDPSession, label: string) {
  await page.waitForTimeout(1500); // let entry animations finish
  const a = await metrics(cdp);
  await page.waitForTimeout(IDLE_MS);
  const b = await metrics(cdp);
  const busy = (k: string) => ((b[k] ?? 0) - (a[k] ?? 0)) * 1000;
  const cpu = busy('ScriptDuration') + busy('RecalcStyleDuration') + busy('LayoutDuration');
  const anims = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((x) => x.playState === 'running' && x.effect?.getTiming().iterations === Infinity)
      .map((x) => ((x as CSSAnimation).animationName ?? 'web-animation') + '@' + ((x.effect as KeyframeEffect | null)?.target as Element | null)?.className),
  );
  const out = {
    label,
    cpuMsPerSec: Math.round((cpu / (IDLE_MS / 1000)) * 10) / 10,
    styleRecalcs: (b.RecalcStyleCount ?? 0) - (a.RecalcStyleCount ?? 0),
    layouts: (b.LayoutCount ?? 0) - (a.LayoutCount ?? 0),
    infiniteAnimations: anims,
  };
  console.log('PERF ' + JSON.stringify(out));
  return out;
}

test.describe('Efficiency budgets (Story 8)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP metrics are Chromium-only');

  test('cold start paints within budget', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto('./');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    const t = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return {
        fcpMs: Math.round(fcp?.startTime ?? -1),
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
        loadMs: Math.round(nav.loadEventEnd),
        jsRequests: res.filter((r) => r.name.endsWith('.js')).length,
        transferKb: Math.round(res.reduce((s, r) => s + (r.encodedBodySize || 0), 0) / 1024),
      };
    });
    console.log('PERF ' + JSON.stringify({ label: 'cold-start', ...t }));
    expect(t.fcpMs).toBeGreaterThan(0);
    expect(t.fcpMs).toBeLessThan(BUDGET.coldFcpMs);
  });

  test('Home is quiet when idle', async ({ page, context }) => {
    await fresh(page, { at: 'home' });
    await seedWeights(page, [73, 73.2]);
    await page.reload();
    await expect(main(page).getByRole('button', { name: /^Workout/ })).toBeVisible();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const r = await idle(page, cdp, 'home-idle');
    expect(r.infiniteAnimations).toHaveLength(BUDGET.infiniteAnimations.home);
    expect(r.cpuMsPerSec).toBeLessThan(BUDGET.idleCpuMsPerSec.home);
  });

  test('a session with the rest timer running stays cheap', async ({ page, context }) => {
    await fresh(page, { at: 'home' });
    await tab(page, 'Home').click();
    await main(page).getByRole('button', { name: /^Workout/ }).click();
    const lift = (name: string) => main(page).getByRole('group', { name });
    await lift('Back squat').getByLabel('Weight (kg)').fill('150');
    await lift('Bench press').getByLabel('Weight (kg)').fill('100');
    await lift('Overhead press').getByLabel('Weight (kg)').fill('50');
    await lift('Romanian deadlift').getByLabel('Weight (kg)').fill('120');
    await main(page).getByRole('button', { name: 'Save my numbers' }).click();
    await seedWeights(page, [73, 73.2, 72.8]);
    await page.reload();
    await main(page).getByRole('button', { name: 'Start cycle 1' }).click();
    await main(page).getByRole('button', { name: /Today’s workout|Next workout|Resume:/ }).click();
    await main(page).getByRole('button', { name: 'Start workout' }).click();
    const squat = main(page).getByRole('region', { name: 'Back squat', exact: true });
    await squat.getByRole('listitem').nth(3).getByRole('button', { name: 'Set 4: as ordered' }).click();
    await expect(main(page).getByRole('timer', { name: 'Rest timer' })).toBeVisible();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const r = await idle(page, cdp, 'session-rest-idle');
    expect(r.infiniteAnimations).toHaveLength(BUDGET.infiniteAnimations.session);
    expect(r.cpuMsPerSec).toBeLessThan(BUDGET.idleCpuMsPerSec.session);
  });
});
