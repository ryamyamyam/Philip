import { describe, expect, it } from 'vitest';
import {
  blockForCycle,
  cycleOutcome,
  epley,
  nextAccessoryKg,
  nextTm,
  tmFromOneRm,
  warmupSets,
  workSets,
  type Block,
  type LiftId,
  type Week,
} from './program';

const loads = (tm: number, block: Block, week: Week, lift: LiftId = 'squat') =>
  workSets(block, week, lift).map((s) => [Math.round(tm * s.pct * 100) / 100, s.reps, s.kind]);

describe('training max and estimates', () => {
  it('TM is 90% of the 1RM (owner numbers entered in setup, not seeded)', () => {
    expect(tmFromOneRm(150)).toBe(135);
    expect(tmFromOneRm(100)).toBe(90);
    expect(tmFromOneRm(50)).toBe(45);
    expect(tmFromOneRm(115)).toBe(103.5);
  });
  it('Epley: a single is its own 1RM; 100 × 5 ≈ 116.7', () => {
    expect(epley(100, 1)).toBe(100);
    expect(epley(100, 5)).toBeCloseTo(116.67, 2);
  });
});

describe('block rotation', () => {
  it('cycles 1–4 are A–D and cycle 5 is A again', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(blockForCycle)).toEqual(['A', 'B', 'C', 'D', 'A', 'B', 'A']);
  });
});

describe('main-lift sets (spec §4.2, AC 3)', () => {
  it('Block A week 1 at TM 100: 65 / 75 / 85 × 5 / 5 / 5+', () => {
    expect(loads(100, 'A', 1)).toEqual([[65, 5, 'main'], [75, 5, 'main'], [85, 5, 'amrap']]);
  });
  it('Block A week 3: 75/85/95 × 5/3/1+, but the RDL caps at 87.5% × 3+', () => {
    expect(loads(100, 'A', 3)).toEqual([[75, 5, 'main'], [85, 3, 'main'], [95, 1, 'amrap']]);
    expect(loads(100, 'A', 3, 'rdl')).toEqual([[75, 5, 'main'], [82.5, 3, 'main'], [87.5, 3, 'amrap']]);
  });
  it('Block C week 3: top 92.5 × 2 then 3 × 3 @ 80', () => {
    expect(loads(100, 'C', 3)).toEqual([[92.5, 2, 'top'], [80, 3, 'backoff'], [80, 3, 'backoff'], [80, 3, 'backoff']]);
  });
  it('Block B is 4 × 8/7/6 and block D 4 × 5/4/3, no + sets', () => {
    expect(workSets('B', 1, 'bench').map((s) => [s.pct, s.reps])).toEqual(Array(4).fill([0.65, 8]));
    expect(workSets('D', 3, 'ohp').map((s) => [s.pct, s.reps])).toEqual(Array(4).fill([0.7, 3]));
    for (const b of ['B', 'D'] as const) for (const w of [1, 2, 3] as const) {
      expect(workSets(b, w, 'squat').some((s) => s.kind === 'amrap')).toBe(false);
    }
  });
  it('deload is 40 / 50 / 60 × 5 in every block, with no warm-ups', () => {
    for (const b of ['A', 'B', 'C', 'D'] as const) {
      expect(loads(100, b, 4)).toEqual([[40, 5, 'main'], [50, 5, 'main'], [60, 5, 'main']]);
      expect(warmupSets(b, 4)).toEqual([]);
    }
  });
  it('the RDL never gets a single and always keeps 2+ reps in reserve', () => {
    for (const b of ['A', 'B', 'C', 'D'] as const) for (const w of [1, 2, 3, 4] as const) {
      for (const s of workSets(b, w, 'rdl')) {
        expect(s.reps).toBeGreaterThanOrEqual(3);
        expect(s.rir).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('TM progression (§4.4, §4.5)', () => {
  const main = (targetReps: number, actualReps: number | null, extra: Partial<{ pain: boolean }> = {}) => ({
    kind: 'amrap' as const,
    targetReps,
    actualReps,
    done: actualReps !== null,
    pain: false,
    ...extra,
  });
  it('outcome: miss when a + set falls short, pain beats everything, none when nothing logged', () => {
    expect(cycleOutcome([main(5, 8), main(3, 5), main(1, 3)])).toBe('hit');
    expect(cycleOutcome([main(5, 8), main(3, 2)])).toBe('miss');
    expect(cycleOutcome([main(5, 8, { pain: true })])).toBe('pain');
    expect(cycleOutcome([main(5, null)])).toBe('none');
  });
  it('increments by phase: cut +0 upper / +2.5 lower; maintain and bulk +2.5 / +5', () => {
    expect(nextTm(90, 'bench', 'lose', 'hit', false).tmKg).toBe(90);
    expect(nextTm(135, 'squat', 'lose', 'hit', false).tmKg).toBe(137.5);
    expect(nextTm(90, 'bench', 'gain', 'hit', false).tmKg).toBe(92.5);
    expect(nextTm(103.5, 'rdl', 'maintain', 'hit', false).tmKg).toBe(108.5);
  });
  it('a miss holds; two misses in a row reset to 90%; pain holds', () => {
    expect(nextTm(90, 'bench', 'gain', 'miss', false)).toEqual({ tmKg: 90, reason: 'miss' });
    expect(nextTm(90, 'bench', 'gain', 'miss', true)).toEqual({ tmKg: 81, reason: 'miss' });
    expect(nextTm(90, 'bench', 'gain', 'pain', false)).toEqual({ tmKg: 90, reason: 'pain' });
  });
});

describe('accessory double progression', () => {
  const sets = (kg: number, ...reps: number[]) => reps.map((r) => ({ kg, reps: r, done: true }));
  it('no history → Philip asks for a starting weight', () => {
    expect(nextAccessoryKg(null, 3, 12, 2.5)).toEqual({ kg: null, change: 'first' });
  });
  it('every set at the top of the range → add the smallest increment', () => {
    expect(nextAccessoryKg(sets(20, 12, 12, 12), 3, 12, 2.5)).toEqual({ kg: 22.5, change: 'add' });
  });
  it('otherwise hold and chase reps', () => {
    expect(nextAccessoryKg(sets(20, 12, 12, 10), 3, 12, 2.5)).toEqual({ kg: 20, change: 'hold' });
    expect(nextAccessoryKg(sets(20, 12, 12), 3, 12, 2.5)).toEqual({ kg: 20, change: 'hold' });
  });
});
