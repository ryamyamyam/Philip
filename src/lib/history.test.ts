import { describe, expect, it } from 'vitest';
import type { FoodEntry, TargetPlan } from '../db/types';
import { averages, summarizeDays, summarizeWeek } from './history';

const e = (date: string, calories: number, proteinG = 100): FoodEntry => ({
  id: `${date}-${calories}-${Math.random()}`,
  date,
  meal: 'lunch',
  name: 'x',
  grams: null,
  calories,
  proteinG,
  fatG: 60,
  carbsG: 200,
  source: 'manual',
  savedFoodId: null,
  estimate: null,
  createdAt: 1,
  updatedAt: 1,
});

const plans: TargetPlan[] = [
  { id: 1, effectiveFrom: '2026-10-01', calories: 2000, proteinG: 150, fatG: 60, carbsG: 200, method: 'manual', inputsSnapshot: null, createdAt: 1 },
  { id: 2, effectiveFrom: '2026-10-25', calories: 2500, proteinG: 150, fatG: 60, carbsG: 200, method: 'manual', inputsSnapshot: null, createdAt: 2 },
];

describe('history summaries', () => {
  it('uses the plan active on each date', () => {
    const days = summarizeDays([e('2026-10-24', 1000), e('2026-10-24', 900), e('2026-10-25', 2400)], plans, '2026-10-23', '2026-10-25');
    expect(days.map((d) => d.target?.calories)).toEqual([2000, 2000, 2500]);
    expect(days.map((d) => d.totals.calories)).toEqual([0, 1900, 2400]);
    expect(days.map((d) => d.logged)).toEqual([false, true, true]);
  });

  it('averages only logged days', () => {
    const days = summarizeDays([e('2026-10-24', 2000), e('2026-10-26', 2400)], plans, '2026-10-20', '2026-10-26');
    const a = averages(days);
    expect(a.loggedDays).toBe(2);
    expect(a.avg?.calories).toBe(2200);
    expect(a.avgTarget?.calories).toBe(2250);
  });

  it('summarizes a week: planned vs actual', () => {
    const w = summarizeWeek([e('2026-10-26', 2500), e('2026-10-27', 2400)], plans, '2026-10-26');
    expect(w.planned?.calories).toBe(2500 * 7);
    expect(w.actual.calories).toBe(4900);
    expect(w.loggedDays).toBe(2);
    expect(w.dailyAvg?.calories).toBe(2450);
  });

  it('planned is null when some days have no target', () => {
    expect(summarizeWeek([], plans, '2026-09-28').planned).toBeNull();
  });
});
