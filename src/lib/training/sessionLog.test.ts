import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../../db/types';
import { buildSession } from './session';
import { canCopyOrder, canMarkDone, copyOrder, createSession, emptyActual, lastSetsFor, liftOf, summarize } from './sessionLog';

const TMS = { squat: 135, bench: 90, rdl: 103.5, ohp: 45 };

function session(id: string, start: number, plusReps: number | null, status: WorkoutSession['status'] = 'done'): WorkoutSession {
  const s = createSession(buildSession({ cycle: 1, week: 1, day: 2, phase: 'gain', tms: TMS }), id, '2026-11-06', start);
  const main = s.exercises[0]!;
  main.actual = main.actual.map((a) => {
    const p = main.prescription.find((x) => x.order === a.order)!;
    if (p.kind === 'warmup') return a;
    if (p.kind === 'amrap') return plusReps === null ? a : { ...a, kg: p.kg, reps: plusReps, done: true };
    return copyOrder(p, a);
  });
  return { ...s, status, finishedAt: status === 'done' ? start + 40 * 60000 : null };
}

describe('createSession', () => {
  it('freezes the orders and starts an empty log', () => {
    const plan = buildSession({ cycle: 1, week: 1, day: 2, phase: 'gain', tms: TMS });
    const s = createSession(plan, 's1', '2026-11-06', 1000);
    expect(s.status).toBe('in_progress');
    expect(s.exercises[0]?.prescription).toEqual(plan.exercises[0]?.prescription);
    expect(s.exercises.every((e) => e.actual.every((a) => a.kg === null && a.reps === null && !a.done))).toBe(true);
  });
});

describe('orders vs actuals', () => {
  const plan = buildSession({ cycle: 1, week: 1, day: 2, phase: 'gain', tms: TMS });
  const sets = plan.exercises[0]!.prescription;
  it('As ordered copies weight and reps and marks the copy', () => {
    const p = sets.find((x) => x.kind === 'main')!;
    expect(copyOrder(p, emptyActual(p))).toMatchObject({ kg: p.kg, reps: p.repMax, done: true, copiedFromOrder: true });
  });
  it('is not offered for + sets or orders with no weight yet', () => {
    expect(canCopyOrder(sets.find((x) => x.kind === 'amrap')!)).toBe(false);
    expect(canCopyOrder(plan.exercises[1]!.prescription[0]!)).toBe(false); // accessory, no history → no kg
  });
  it('a set is done only with reps, and a weight unless bodyweight', () => {
    const a = emptyActual(sets[0]!);
    expect(canMarkDone({ ...a, reps: 5 }, false)).toBe(false);
    expect(canMarkDone({ ...a, reps: 5, kg: 60 }, false)).toBe(true);
    expect(canMarkDone({ ...a, reps: 8 }, true)).toBe(true);
    expect(canMarkDone({ ...a, reps: 0, kg: 60 }, false)).toBe(false);
  });
});

describe('summarize', () => {
  it('counts work sets, reports e1RM from the + set and flags a PR over earlier sessions', () => {
    const earlier = session('a', 0, 6);
    const today = session('b', 10_000_000, 9);
    const sum = summarize(today, [earlier, today], 10_000_000 + 41 * 60000);
    expect(sum.e1rmKg).toBeCloseTo(76.7 * (1 + 9 / 30), 0);
    expect(sum.pr).toBe(true);
    expect(sum.missed).toBe(false);
    expect(sum.minutes).toBe(40);
    expect(sum.setsDone).toBe(3);
    expect(sum.setsTotal).toBeGreaterThan(3);
  });
  it('no PR on the first ever session; a short + set is a miss', () => {
    const first = session('a', 0, 4);
    const sum = summarize(first, [first], 0);
    expect(sum.pr).toBe(false);
    expect(sum.missed).toBe(true);
  });
});

describe('helpers', () => {
  it('liftOf maps main lifts and their variants; accessories are null', () => {
    expect(liftOf('bench')).toBe('bench');
    expect(liftOf('pause-rdl')).toBe('rdl');
    expect(liftOf('db-curl')).toBeNull();
  });
  it('lastSetsFor returns the newest finished log for an exercise', () => {
    const a = session('a', 0, 6);
    const b = session('b', 5_000_000, 7);
    const sets = lastSetsFor([a, b], 'bench');
    expect(sets?.find((x) => x.reps === 7)).toBeTruthy();
    expect(lastSetsFor([session('c', 0, 6, 'in_progress')], 'bench')).toBeNull();
  });
});
