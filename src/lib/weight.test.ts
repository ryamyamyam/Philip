import { describe, expect, it } from 'vitest';
import type { TargetPlan } from '../db/types';
import { expectedWeightOn, goalDate, latestWeight, weightPlanLine } from './weight';

const plan = (over: Partial<TargetPlan> = {}): TargetPlan => ({
  id: 1,
  effectiveFrom: '2026-11-01',
  calories: 2300,
  proteinG: 150,
  fatG: 70,
  carbsG: 260,
  method: 'calculated',
  inputsSnapshot: { weightKg: 80, goal: 'lose', targetWeightKg: 76, weeklyRateKg: 0.5 },
  weekdayOverrides: null,
  createdAt: 1,
  ...over,
});
const profile = { weeklyRateKg: -0.5, targetWeightKg: 76, goal: 'lose' as const };

describe('F047E3 expected weight curve', () => {
  it('starts at the plan’s starting weight on effectiveFrom and moves by weeklyRateKg', () => {
    const line = weightPlanLine([plan()], profile, '2026-11-20')!;
    expect(line).toEqual({ startDate: '2026-11-01', startKg: 80, rateKg: -0.5, targetKg: 76 });
    expect(expectedWeightOn(line, '2026-11-01')).toBe(80);
    expect(expectedWeightOn(line, '2026-11-15')).toBe(79);
    expect(expectedWeightOn(line, '2026-10-20')).toBe(80); // flat before the start
  });

  it('stops at the goal weight and estimates the goal date', () => {
    const line = weightPlanLine([plan()], profile, '2026-11-20')!;
    expect(expectedWeightOn(line, '2027-06-01')).toBe(76);
    expect(goalDate(line)).toBe('2026-12-27'); // 4 kg at 0.5 kg/week = 8 weeks
  });

  it('applies the calculator’s rate cap (1%/week loss) to the line', () => {
    const line = weightPlanLine([plan()], { ...profile, weeklyRateKg: -2 }, '2026-11-20')!;
    expect(line.rateKg).toBe(-0.8);
  });

  it('gain goals slope up; maintain is flat with no goal date', () => {
    const gain = weightPlanLine([plan({ inputsSnapshot: { weightKg: 73, goal: 'gain', targetWeightKg: 76 } })], { weeklyRateKg: 0.25, targetWeightKg: 76, goal: 'gain' }, '2026-12-01')!;
    expect(gain.rateKg).toBe(0.25);
    expect(expectedWeightOn(gain, '2026-11-29')).toBe(74);
    const keep = weightPlanLine([plan({ inputsSnapshot: { weightKg: 73, goal: 'maintain' } })], { weeklyRateKg: null, targetWeightKg: null, goal: 'maintain' }, '2026-12-01')!;
    expect(keep.rateKg).toBe(0);
    expect(goalDate(keep)).toBeNull();
  });

  it('uses the newest calculated plan in effect; manual plans give no line', () => {
    const older = plan({ id: 1, effectiveFrom: '2026-10-01', inputsSnapshot: { weightKg: 82, goal: 'lose' } });
    const newer = plan({ id: 2, effectiveFrom: '2026-11-01' });
    const future = plan({ id: 3, effectiveFrom: '2027-01-01', inputsSnapshot: { weightKg: 70, goal: 'lose' } });
    expect(weightPlanLine([older, newer, future], profile, '2026-11-10')!.startKg).toBe(80);
    expect(weightPlanLine([plan({ method: 'manual', inputsSnapshot: null })], profile, '2026-11-10')).toBeNull();
  });

  it('latestWeight picks the newest entry on or before a date', () => {
    const e = [
      { date: '2026-11-01', weightKg: 80, createdAt: 0, updatedAt: 0 },
      { date: '2026-11-05', weightKg: 79.6, createdAt: 0, updatedAt: 0 },
    ];
    expect(latestWeight(e)?.weightKg).toBe(79.6);
    expect(latestWeight(e, '2026-11-03')?.weightKg).toBe(80);
    expect(latestWeight([], undefined)).toBeNull();
  });
});

describe('Story 3: am I on track?', () => {
  const w = (date: string, weightKg: number) => ({ date, weightKg, createdAt: 1, updatedAt: 1 });
  const bulk = { startDate: '2026-10-01', startKg: 70, rateKg: 0.25, targetKg: 75 };

  it('weekly trend needs 2+ weigh-ins over 7+ days in the last 4 weeks', async () => {
    const { weeklyTrend } = await import('./weight');
    expect(weeklyTrend([w('2026-10-30', 70)], '2026-11-02')).toBeNull();
    expect(weeklyTrend([w('2026-10-30', 70), w('2026-11-02', 70.2)], '2026-11-02')).toBeNull();
    expect(weeklyTrend([w('2026-10-19', 70), w('2026-10-26', 70.25), w('2026-11-02', 70.5)], '2026-11-02')).toBe(0.25);
    // Old entries outside the window are ignored.
    expect(weeklyTrend([w('2026-08-01', 60), w('2026-10-19', 70), w('2026-11-02', 70.5)], '2026-11-02')).toBe(0.25);
  });

  it('on track / ahead / behind relative to the plan direction; reached; needs data', async () => {
    const { weightProgress } = await import('./weight');
    // Plan on 2026-10-29 (4 weeks in): 71.0 kg.
    expect(weightProgress([w('2026-10-29', 71.2)], bulk, '2026-10-29')).toMatchObject({ status: 'onTrack', diffKg: 0.2, expectedTodayKg: 71 });
    expect(weightProgress([w('2026-10-29', 72)], bulk, '2026-10-29').status).toBe('ahead');
    expect(weightProgress([w('2026-10-29', 70)], bulk, '2026-10-29').status).toBe('behind');
    expect(weightProgress([w('2026-10-29', 75.1)], bulk, '2026-10-29').status).toBe('reached');
    const cut = { startDate: '2026-10-01', startKg: 80, rateKg: -0.5, targetKg: 76 };
    expect(weightProgress([w('2026-10-29', 77.3)], cut, '2026-10-29').status).toBe('ahead'); // plan 78
    expect(weightProgress([w('2026-10-29', 79)], cut, '2026-10-29').status).toBe('behind');
    const maintain = { startDate: '2026-10-01', startKg: 70, rateKg: 0, targetKg: null };
    expect(weightProgress([w('2026-10-29', 71)], maintain, '2026-10-29').status).toBe('off');
    expect(weightProgress([], bulk, '2026-10-29').status).toBe('needMore');
    expect(weightProgress([w('2026-10-29', 71)], null, '2026-10-29')).toMatchObject({ status: 'needMore', expectedTodayKg: null });
  });
});
