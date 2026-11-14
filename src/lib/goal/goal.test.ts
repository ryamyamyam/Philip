/** Story 11: goal check, next-goal options, the goal window and Philip's proposal (pure). */
import { describe, expect, it } from 'vitest';
import type { CycleRecord, WeightEntry, WorkoutSession } from '../../db/types';
import { daysSinceWeighIn, goalEta, goalEvent, isNewEvent } from './goalCheck';
import { ownGoal, philipNextGoal, recommendNextPhase, repeatGoal } from './nextGoal';
import { goalWindow, windowText } from './window';
import { leverRanges, macrosFor, parseProposal, ProposalError, proposalPrompt, type LeverRanges } from './proposal';
import { calculateTargets } from '../targets';
import { buildSession } from '../training/session';
import { createSession } from '../training/sessionLog';
import { menuSlot } from '../training/exercises';

const start = new Date(2026, 10, 2, 9).getTime(); // 2 Nov 2026
const cycle = (over: Partial<CycleRecord> = {}): CycleRecord => ({
  index: 3,
  block: 'C',
  startedAt: start,
  phase: 'gain',
  tms: { squat: 135, bench: 90, rdl: 103.5, ohp: 45 },
  goal: { startWeightKg: 73, startBfPct: 15, endWeightKg: 75, weeklyRatePct: 0.68, bfLinePct: 15, source: 'user', targetPlanId: null },
  ...over,
});
const w = (date: string, kg: number): WeightEntry => ({ date, weightKg: kg, createdAt: 1, updatedAt: 1 });

describe('goalEvent (§3)', () => {
  it('bulk: the 7-day average reaching the goal is "reached"; one heavy weigh-in is not', () => {
    expect(goalEvent(cycle(), [w('2026-11-18', 75.4)], null, '2026-11-18')).toBeNull(); // one weigh-in: no average
    expect(goalEvent(cycle(), [w('2026-11-14', 74.0), w('2026-11-18', 75.0)], null, '2026-11-18')).toBeNull(); // average 74.5
    const e = goalEvent(cycle(), [w('2026-11-14', 74.8), w('2026-11-18', 75.4)], null, '2026-11-18');
    expect(e).toMatchObject({ kind: 'reached', reason: 'weight', cycle: 3, daysIn: 16 });
    expect(e?.avgKg).toBeCloseTo(75.1);
  });

  it('bulk: crossing the BF ceiling is never "reached", it is off track', () => {
    const e = goalEvent(cycle(), [w('2026-11-14', 73.4), w('2026-11-16', 73.6)], { pct: 16, date: '2026-11-16' }, '2026-11-16');
    expect(e).toMatchObject({ kind: 'offtrack', reason: 'bfCeiling' });
    // A BF reading from before the cycle, or older than 14 days, doesn't count.
    expect(goalEvent(cycle(), [w('2026-11-14', 73.4), w('2026-11-16', 73.6)], { pct: 16, date: '2026-11-01' }, '2026-11-16')).toBeNull();
  });

  it('weight reached beats the BF line (Philip handles the phase in the next goal)', () => {
    const e = goalEvent(cycle(), [w('2026-11-14', 75), w('2026-11-16', 75.2)], { pct: 16, date: '2026-11-16' }, '2026-11-16');
    expect(e?.kind).toBe('reached');
  });

  it('cut: weight or BF target', () => {
    const cut = cycle({ phase: 'lose', goal: { startWeightKg: 80, startBfPct: 20, endWeightKg: 78, weeklyRatePct: -0.6, bfLinePct: 19, source: 'philip', targetPlanId: null } });
    expect(goalEvent(cut, [w('2026-11-10', 77.9), w('2026-11-11', 78)], null, '2026-11-11')?.reason).toBe('weight');
    expect(goalEvent(cut, [w('2026-11-10', 79.5), w('2026-11-11', 79.4)], { pct: 18.8, date: '2026-11-11' }, '2026-11-11')?.reason).toBe('bf');
  });

  it('off track: stalled from day 21, too fast from day 14; maintain only drifts', () => {
    const slow = goalEvent(cycle(), [w('2026-11-22', 73.1), w('2026-11-23', 73.1)], null, '2026-11-23');
    expect(slow).toMatchObject({ kind: 'offtrack', reason: 'stalled' });
    expect(goalEvent(cycle(), [w('2026-11-14', 73.1), w('2026-11-15', 73.1)], null, '2026-11-15')).toBeNull(); // day 13
    const fast = goalEvent(cycle({ goal: { ...cycle().goal, endWeightKg: 76, weeklyRatePct: 0.3 } }), [w('2026-11-16', 74.4), w('2026-11-17', 74.6)], null, '2026-11-17');
    expect(fast).toMatchObject({ kind: 'offtrack', reason: 'tooFast' });
    const hold = cycle({ phase: 'maintain', goal: { ...cycle().goal, endWeightKg: 73, weeklyRatePct: 0 } });
    expect(goalEvent(hold, [w('2026-11-16', 73.2), w('2026-11-17', 73.3)], null, '2026-11-17')).toBeNull();
    expect(goalEvent(hold, [w('2026-11-16', 74.2), w('2026-11-17', 74.3)], null, '2026-11-17')?.reason).toBe('tooFast');
  });

  it('a cycle that already ended fires nothing; each event fires once', () => {
    expect(goalEvent(cycle({ endedEarly: { at: 1, reason: 'goal-reached' } }), [w('2026-11-14', 76), w('2026-11-15', 76)], null, '2026-11-15')).toBeNull();
    const e = goalEvent(cycle(), [w('2026-11-14', 75), w('2026-11-15', 75.2)], null, '2026-11-15')!;
    expect(isNewEvent(e, [])).toBe(true);
    expect(isNewEvent(e, [{ cycle: 3, kind: 'reached', reason: 'bf' }])).toBe(false);
    expect(isNewEvent(e, [{ cycle: 2, kind: 'reached', reason: 'weight' }])).toBe(true);
  });

  it('ETA and days since the last weigh-in', () => {
    // +1 kg in 14 days → 1 kg more in 14 days.
    expect(goalEta(cycle(), [w('2026-11-15', 73.9), w('2026-11-16', 74.1)], '2026-11-16')).toBe('2026-11-30');
    expect(goalEta(cycle(), [w('2026-11-15', 72.9), w('2026-11-16', 72.9)], '2026-11-16')).toBeNull(); // wrong way
    expect(daysSinceWeighIn([w('2026-11-01', 73)], '2026-11-09')).toBe(8);
    expect(daysSinceWeighIn([], '2026-11-09')).toBeNull();
  });
});

describe('next goal (§4)', () => {
  const prev = { phase: 'gain' as const, goal: cycle().goal };

  it('"Same again" repeats the change and the BF line from where he is now (owner example: +2 kg, hold 15%)', () => {
    const g = repeatGoal(prev, 75.1, 15);
    expect(g).toMatchObject({ phase: 'gain', startWeightKg: 75.1, endWeightKg: 77.1, bfLinePct: 15, source: 'repeat' });
    // +2 kg in 4 weeks at 75 kg is ~0.67%/week: above the lean-bulk range, so Philip warns.
    expect(g.issues.map((i) => i.code)).toContain('rateOutOfRange');
    expect(g.issues.every((i) => i.level === 'warning')).toBe(true);
  });

  it('Philip switches phase at the BF ceiling, at 20%+ or at the long-term target (OBS-FF441B: never maintain)', () => {
    expect(recommendNextPhase(prev, 15, null)).toEqual({ phase: 'lose', why: 'bfCeiling' });
    expect(recommendNextPhase(prev, 14, null)).toEqual({ phase: 'gain', why: 'same' });
    expect(recommendNextPhase(prev, 21, null).phase).toBe('lose');
    const cut = { phase: 'lose' as const, goal: { ...prev.goal, bfLinePct: 12 } };
    expect(recommendNextPhase(cut, 12, 12)).toEqual({ phase: 'gain', why: 'bfTarget' });
    const hold = { phase: 'maintain' as const, goal: { ...prev.goal, bfLinePct: 15 } };
    expect(recommendNextPhase(hold, 14, null)).toEqual({ phase: 'gain', why: 'leanEnough' });
    expect(recommendNextPhase(hold, 17, null)).toEqual({ phase: 'lose', why: 'notLean' });
  });

  it('Philip’s pick uses the Story 5 default; own goals are checked', () => {
    const g = philipNextGoal(prev, 75, 14.5, 'gain', 16);
    expect(g.source).toBe('philip');
    expect(g.weeklyRatePct).toBeGreaterThanOrEqual(0.25);
    expect(g.weeklyRatePct).toBeLessThanOrEqual(0.5);
    expect(ownGoal(75, 15, 'gain', 76, 9).issues.some((i) => i.level === 'error')).toBe(true);
  });
});

const TMS = { squat: 135, bench: 90, rdl: 103.5, ohp: 45 };
function done(id: string, date: string, day: 1 | 2 | 3 | 4, keyReps: number): WorkoutSession {
  const s = createSession(buildSession({ cycle: 3, week: 1, day, phase: 'gain', tms: TMS, weightUnit: 'kg' }), id, date, 1000);
  return {
    ...s,
    status: 'done',
    finishedAt: 2000,
    exercises: s.exercises.map((e) => ({
      ...e,
      actual: e.actual.map((a) => {
        const p = e.prescription.find((x) => x.order === a.order)!;
        return { ...a, kg: p.kg ?? 0, reps: p.kind === 'amrap' || p.kind === 'top' ? keyReps : (p.targetReps ?? p.repMin), done: true };
      }),
    })),
  };
}

describe('goal window (§5.1)', () => {
  const food = Array.from({ length: 14 }, (_, i) => ({ date: `2026-11-${String(2 + i).padStart(2, '0')}`, calories: 3000, proteinG: 150 }));
  const base = {
    start: '2026-11-02',
    today: '2026-11-15',
    startKg: 73,
    weights: [w('2026-11-14', 74), w('2026-11-15', 74)],
    targetOn: () => ({ calories: 2900, proteinG: 140 }),
    sessions: [done('a', '2026-11-03', 1, 8), done('b', '2026-11-10', 1, 9)],
    cycle: 3,
  };

  it('measures maintenance from intake vs weight change when the log is trustworthy', () => {
    const win = goalWindow({ ...base, food });
    expect(win.days).toBe(14);
    expect(win.reliable).toBe(true);
    // 3000 − (1 kg × 7700 / 14 days) = 2450.
    expect(win.maintenanceKcal).toBe(2450);
    expect(win.sessionsDone).toBe(2);
    expect(win.lifts[0]).toMatchObject({ lift: 'squat' });
    expect(win.lifts[0]!.last).toBeGreaterThan(win.lifts[0]!.first);
    expect(windowText(win)).toContain('Measured maintenance');
  });

  it('under half the days logged → not reliable, says so', () => {
    const win = goalWindow({ ...base, food: food.slice(0, 5) });
    expect(win.reliable).toBe(false);
    expect(win.maintenanceKcal).toBeNull();
    expect(windowText(win)).toContain('not reliable');
  });
});

describe('proposal (§5)', () => {
  const choice = { phase: 'gain' as const, startWeightKg: 75, startBfPct: 15, endWeightKg: 76, weeklyRatePct: 0.33, bfLinePct: 16, source: 'philip' as const };
  const calc = calculateTargets({ sex: 'male', ageYears: 28, heightCm: 184, weightKg: 75, activityLevel: 'moderate', trainingDaysPerWeek: 4, goal: 'gain', targetWeightKg: 76, weeklyRateKg: 0.25, bodyFatPct: 15 });
  const win = goalWindow({
    start: '2026-11-02',
    today: '2026-11-15',
    startKg: 73,
    weights: [w('2026-11-14', 75), w('2026-11-15', 75)],
    food: Array.from({ length: 14 }, (_, i) => ({ date: `2026-11-${String(2 + i).padStart(2, '0')}`, calories: 3100, proteinG: 150 })),
    targetOn: () => null,
    sessions: [],
    cycle: 3,
  });
  const ranges: LeverRanges = leverRanges({ choice, calc, window: win, sex: 'male', heightCm: 184, block: 'D', trainingDays: [1, 2, 4, 5], choices: {} });

  it('ranges come from the formula, his measured maintenance and the protein band', () => {
    expect(ranges.kcal).not.toBeNull();
    expect(ranges.kcal!.def).toBe(calc.calories);
    expect(ranges.kcal!.min).toBeLessThanOrEqual(calc.calories);
    expect(ranges.kcal!.max).toBeGreaterThanOrEqual(calc.calories);
    expect(ranges.kcal!.max - ranges.kcal!.min).toBeLessThanOrEqual(800);
    expect(ranges.proteinG).toMatchObject({ min: 120, max: 150 }); // bulk 1.6–2.0 g/kg (Story 12 update)
    expect(ranges.cardioMin).toMatchObject({ min: 15, max: 25 });
  });

  it('the prompt carries the goal, his window, the ranges and the menu', () => {
    const p = proposalPrompt({ event: 'reached', reason: 'weight', restart: true, choice, ranges, window: win, brief: 'BRIEF', name: (id) => id });
    expect(p).toContain('75 kg -> 76 kg');
    expect(p).toContain(`kcal: ${ranges.kcal!.min}-${ranges.kcal!.max}`);
    expect(p).toContain('Day 2 A1:');
    expect(p).toContain('BRIEF');
  });

  it('Philip’s picks: out-of-range numbers are capped and shown; invalid swaps and days are dropped', () => {
    const slot = menuSlot(2, 'A1', 'D');
    const raw = {
      message: 'Weight is up on plan and lifts moved. Small surplus, more protein.',
      kcal: { value: 9000, why: 'surplus' },
      proteinG: { value: 150, why: '2 g/kg' },
      cardioMin: { value: 20, why: 'walk' },
      days: { value: [1, 2, 4, 6], why: 'Fri is busy' },
      swaps: [
        { day: 2, slot: 'A1', exerciseId: slot.swaps[0], why: 'upper chest first' },
        { day: 2, slot: 'A1', exerciseId: 'made-up' },
        { day: 9, slot: 'B', exerciseId: 'x' },
      ],
      remember: ['Prefers Saturday sessions'],
    };
    const p = parseProposal(raw, ranges, { kind: 'gemini-cloud', model: 'm' }, 1);
    expect(p.kcal).toBe(ranges.kcal!.max);
    expect(p.clamps).toEqual([{ lever: 'kcal', asked: 9000, used: ranges.kcal!.max }]);
    expect(p.proteinG).toBe(150);
    expect(p.days).toEqual([1, 2, 4, 6]);
    expect(p.swaps).toEqual([{ day: 2, slot: 'A1', exerciseId: slot.swaps[0] }]);
    expect(p.remember).toEqual(['Prefers Saturday sessions']);
  });

  it('a reply missing a lever is rejected, never filled with defaults', () => {
    expect(() => parseProposal({ message: 'hi', proteinG: 150, cardioMin: 20 }, ranges, { kind: 'claude-paste', model: null }, 1)).toThrow(ProposalError);
    expect(() => parseProposal('nope', ranges, { kind: 'claude-paste', model: null }, 1)).toThrow(ProposalError);
  });

  it('macros: fat on the calculator floor, carbs fill the rest', () => {
    const m = macrosFor(3000, 150, 75, 184);
    expect(m.fatG).toBe(83);
    expect(m.carbsG).toBe(Math.round((3000 - 600 - 83 * 9) / 4));
  });
});
