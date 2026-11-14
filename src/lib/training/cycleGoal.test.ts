import { describe, expect, it } from 'vitest';
import { checkUserGoal, coachPhase, defaultRatePct, kcalPerDayFor, philipGoal, recommendPhase, rollingWeight } from './cycleGoal';

describe('philipGoal', () => {
  it('spec example: 73 kg, 15%, bulk → 74.0 kg after 4 weeks, BF ceiling 16%', () => {
    expect(philipGoal(73, 15, 'gain')).toMatchObject({ endWeightKg: 74, weeklyRatePct: 0.3, bfLinePct: 16, source: 'philip' });
  });
  it('cut lowers weight and targets −1 BF point; maintain holds', () => {
    expect(philipGoal(80, 22, 'lose')).toMatchObject({ endWeightKg: 78, bfLinePct: 21 });
    expect(philipGoal(73, 15, 'maintain')).toMatchObject({ endWeightKg: 73, bfLinePct: 15 });
  });
  it('without a BF reading there is no BF line', () => {
    expect(philipGoal(73, null, 'gain').bfLinePct).toBeNull();
  });
});

describe('defaultRatePct', () => {
  it('slows a bulk that ran fast and added more than 1 BF point; speeds one that stalled', () => {
    expect(defaultRatePct('gain', { phase: 'gain', plannedRatePct: 0.3, actualRatePct: 0.5, bfDelta: 1.5 })).toBe(0.25);
    expect(defaultRatePct('gain', { phase: 'gain', plannedRatePct: 0.3, actualRatePct: 0, bfDelta: 0 })).toBe(0.4);
    expect(defaultRatePct('gain', { phase: 'gain', plannedRatePct: 0.5, actualRatePct: 0, bfDelta: 0 })).toBe(0.5);
  });
  it('OBS-FF441B: speeds up a cut that lost too slowly; slows one that went past the range', () => {
    expect(defaultRatePct('lose', { phase: 'lose', plannedRatePct: -0.6, actualRatePct: -0.2, bfDelta: null })).toBe(-0.7);
    expect(defaultRatePct('lose', { phase: 'lose', plannedRatePct: -0.6, actualRatePct: -0.55, bfDelta: null })).toBe(-0.6);
    expect(defaultRatePct('lose', { phase: 'lose', plannedRatePct: -1.0, actualRatePct: -1.4, bfDelta: null })).toBe(-0.9);
  });
});

describe('recommendPhase (OBS-FF441B: bulk or cut, never 0%)', () => {
  it('20% BF or more → cut; first cycle otherwise → bulk; keeps a running bulk or cut', () => {
    expect(recommendPhase(21, null, 'gain')).toBe('lose');
    expect(recommendPhase(15, null, null)).toBe('gain');
    expect(recommendPhase(17, null, 'gain')).toBe('gain');
    expect(recommendPhase(17, null, 'lose')).toBe('lose');
  });
  it('a cut that reached the long-term target becomes a lean bulk', () => {
    expect(coachPhase(12, 12, 'lose')).toEqual({ phase: 'gain', why: 'bfTarget' });
  });
  it('after a maintain phase (or none), BF decides: lean → bulk, over 15% or over target → cut', () => {
    expect(coachPhase(15, null, 'maintain')).toEqual({ phase: 'gain', why: 'leanEnough' });
    expect(coachPhase(16, null, 'maintain')).toEqual({ phase: 'lose', why: 'notLean' });
    expect(coachPhase(14, 12, 'maintain')).toEqual({ phase: 'lose', why: 'aboveTarget' });
    expect(coachPhase(13, 12, null)).toEqual({ phase: 'gain', why: 'leanEnough' });
    expect(coachPhase(null, null, 'maintain')).toEqual({ phase: 'gain', why: 'noData' });
  });
  it('never recommends maintain', () => {
    for (const bf of [null, 8, 12, 15, 16, 19, 25])
      for (const t of [null, 10, 12, 15])
        for (const last of [null, 'gain', 'lose', 'maintain'] as const) expect(recommendPhase(bf, t, last)).not.toBe('maintain');
  });
});

describe('checkUserGoal', () => {
  it('warns outside the phase range and on the wrong direction', () => {
    expect(checkUserGoal(73, 'gain', 74, null).issues).toEqual([]);
    expect(checkUserGoal(73, 'gain', 76, null).issues[0]?.code).toBe('rateOutOfRange');
    expect(checkUserGoal(73, 'gain', 72, null).issues[0]?.code).toBe('directionMismatch');
  });
  it('refuses a BF target below 10% and warns below 12%', () => {
    expect(checkUserGoal(73, 'lose', 72, 9).issues.map((i) => [i.code, i.level])).toContainEqual(['bfBelowFloor', 'error']);
    expect(checkUserGoal(73, 'lose', 72, 11).issues.map((i) => [i.code, i.level])).toContainEqual(['bfLow', 'warning']);
    expect(checkUserGoal(73, 'lose', 72, 12).issues.some((i) => i.code.startsWith('bf'))).toBe(false);
  });
});

describe('rollingWeight', () => {
  const e = (date: string, weightKg: number) => ({ date, weightKg });
  it('needs 2 weigh-ins in the last 7 days (owner: about twice a week)', () => {
    expect(rollingWeight([e('2026-11-05', 73.2)], '2026-11-05')).toBeNull();
    expect(rollingWeight([e('2026-10-28', 80), e('2026-11-05', 73.2)], '2026-11-05')).toBeNull();
    expect(rollingWeight([e('2026-11-01', 73), e('2026-11-05', 73.2)], '2026-11-05')).toBeCloseTo(73.1, 5);
    expect(rollingWeight([e('2026-10-29', 80), e('2026-10-30', 73), e('2026-11-02', 73.2), e('2026-11-05', 73.4)], '2026-11-05')).toBeCloseTo(73.2, 5);
  });
});

describe('kcalPerDayFor', () => {
  it('about +240 kcal/day for 0.3%/wk at 73 kg', () => {
    expect(kcalPerDayFor(73, 0.3)).toBe(240);
  });
});

describe('calcInputsForGoal', () => {
  const p = { sex: 'male' as const, birthDate: '1998-03-01', heightCm: 184, activityLevel: 'moderate' as const, trainingDaysPerWeek: 3, bodyFatPct: 15 };
  it('turns the cycle goal into calculator inputs (4 training days, weekly rate from the goal)', async () => {
    const { calcInputsForGoal } = await import('./cycleGoal');
    const i = calcInputsForGoal(p, 'gain', { startWeightKg: 73, endWeightKg: 74 }, '2026-11-05');
    expect(i).toMatchObject({ goal: 'gain', weightKg: 73, targetWeightKg: 74, weeklyRateKg: 0.25, trainingDaysPerWeek: 4, bodyFatPct: 15, ageYears: 28 });
    expect(calcInputsForGoal(p, 'maintain', { startWeightKg: 73, endWeightKg: 73 }, '2026-11-05')).toMatchObject({ targetWeightKg: null, weeklyRateKg: null });
  });
  it('returns null when body stats are missing', async () => {
    const { calcInputsForGoal } = await import('./cycleGoal');
    expect(calcInputsForGoal({ ...p, heightCm: null }, 'gain', { startWeightKg: 73, endWeightKg: 74 }, '2026-11-05')).toBeNull();
  });
});

describe('startingWeight', () => {
  const e = (date: string, weightKg: number) => ({ date, weightKg });
  it('7-day average first, then the latest recent weigh-in, then the Targets weight', async () => {
    const { startingWeight } = await import('./cycleGoal');
    expect(startingWeight([e('2026-11-01', 73), e('2026-11-03', 73.2), e('2026-11-05', 73.4)], '2026-11-05', 70)).toMatchObject({ source: 'average' });
    expect(startingWeight([e('2026-10-30', 73.6)], '2026-11-05', 70)).toEqual({ kg: 73.6, source: 'latest' });
    expect(startingWeight([e('2026-10-01', 75)], '2026-11-05', 73)).toEqual({ kg: 73, source: 'profile' });
    expect(startingWeight([], '2026-11-05', null)).toBeNull();
  });
});
