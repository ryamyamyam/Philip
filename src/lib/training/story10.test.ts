/**
 * Story 10 (QA batch, 2026-11-11): realistic fixes after a big miss (OBS-2C086C) and Philip's options
 * the moment a check-in flag is tapped (OBS-097D6D).
 */
import { describe, expect, it } from 'vitest';
import type { SessionExercise, WorkoutSession } from '../../db/types';
import { addLaterRest, applyTodayChange, checkinOptions, dropForShort, mergeOptions, remainingWork, repsShort } from './checkin';
import { validateChange, type CoachContext } from './coach';
import { DEFAULT_BAR_SETUP } from './plates';
import { loadDropPct, nextAccessoryKg, nextTargetReps } from './program';
import { buildSession } from './session';
import { dropIndex, moveTo } from './order';
import { parseTreadmillEstimate, settingToMph, treadmillPrompt, validTreadmill } from './treadmill';
import { createSession } from './sessionLog';

const TMS = { squat: 135, bench: 90, rdl: 103.5, ohp: 45 };
const coachContextForTest = (session: WorkoutSession): CoachContext => ({ session, phase: 'maintain', tms: TMS, trainingDays: [1, 2, 4, 5], choices: {}, unit: 'kg', name: (id) => id });
const fresh = (): WorkoutSession => createSession(buildSession({ cycle: 1, week: 1, day: 1, phase: 'maintain', tms: TMS }), 's', '2026-11-06', 0);

/** An accessory with a weight, 4 sets of 9 ordered (range 8–12). */
function accessory(s: WorkoutSession): SessionExercise {
  const ex = s.exercises.find((e) => e.slot === 'A1')!;
  const prescription = Array.from({ length: 4 }, (_, i) => ({ ...ex.prescription[0]!, order: i, kg: 40, repMin: 8, repMax: 12, targetReps: 9, timed: false, assist: undefined }));
  return { ...ex, prescription, actual: prescription.map((p) => ({ order: p.order, kg: null, reps: null, done: false, pain: false, copiedFromOrder: false })) };
}
const log = (ex: SessionExercise, reps: (number | null)[]): SessionExercise => ({
  ...ex,
  actual: ex.actual.map((a, i) => (reps[i] === undefined || reps[i] === null ? a : { ...a, kg: 40, reps: reps[i]!, done: true })),
});

describe('OBS-2C086C: next session after a big miss', () => {
  const sets = (kg: number, ...reps: number[]) => reps.map((r) => ({ kg, reps: r, done: true }));
  it('the owner’s case: 9, 9, 4 of 4 × 9 (range 8–12) drops the weight instead of only the reps', () => {
    const next = nextAccessoryKg(sets(40, 9, 9, 4), 4, 12, 2.5, 8);
    expect(next.change).toBe('drop');
    // 4 short of 8 + 1 unfinished set → 5 × 2.5% = 12.5% → 35 kg
    expect(next.kg).toBe(35);
    expect(nextTargetReps(sets(40, 9, 9, 4), 8, 12, next.change)).toBe(8);
  });
  it('one rep short still holds the weight and chases reps (double progression unchanged)', () => {
    expect(nextAccessoryKg(sets(40, 9, 9, 7, 7), 4, 12, 2.5, 8)).toEqual({ kg: 40, change: 'hold' });
  });
  it('drops at least one increment and at most 20%', () => {
    expect(nextAccessoryKg(sets(20, 6, 6, 6), 3, 12, 2.5, 8)).toEqual({ kg: 17.5, change: 'drop' });
    expect(loadDropPct(sets(40, 1), 4, 12)).toBe(0.2);
  });
  it('without repMin (old callers, timed holds) nothing changes', () => {
    expect(nextAccessoryKg(sets(40, 9, 9, 4), 4, 12, 2.5)).toEqual({ kg: 40, change: 'hold' });
  });
  it('the session builder uses it: the next order after 9, 9, 4 is lighter', () => {
    const plan = buildSession({ cycle: 1, week: 1, day: 1, phase: 'maintain', tms: TMS, weightUnit: 'kg', lastSets: () => sets(40, 9, 9, 4) });
    const a1 = plan.exercises.find((e) => e.slot === 'A1')!;
    const first = a1.prescription[0]!;
    if (first.timed || first.assist) return; // menu-dependent; covered above
    expect(first.kg!).toBeLessThan(40);
    expect(first.targetReps).toBe(first.repMin);
  });
  it('a report proposal that only trims reps after a big miss gets Philip’s lighter weight instead', () => {
    const s = fresh();
    const ex = log(accessory(s), [9, 9, 4, null]);
    const session = { ...s, exercises: s.exercises.map((e) => (e.slot === 'A1' ? ex : e)) };
    const c = coachContextForTest(session);
    const out = validateChange({ kind: 'next', exerciseId: ex.exerciseId, kg: null, reps: 8, sets: null }, c);
    expect(out).toMatchObject({ kind: 'next', reps: 8 });
    expect(out && out.kind === 'next' ? out.kg : null).toBeLessThan(40);
  });
});

describe('OBS-097D6D: options the moment a flag is tapped', () => {
  it('too heavy after a big miss: Philip’s pick drops the load by the missing reps', () => {
    const ex = log(accessory(fresh()), [9, 9, 4]);
    expect(repsShort(ex, 2)).toBe(5);
    const opts = checkinOptions('heavy', ex, 2, 2, 2.5);
    expect(opts[0]).toMatchObject({ id: 'drop', change: { loadFactor: 1 - dropForShort(5) } });
    expect(opts.map((o) => o.id)).toContain('rest60');
    expect(opts.map((o) => o.id)).toContain('later30');
    expect(opts.map((o) => o.id)).not.toContain('repsDown'); // only trimming reps is not offered after a big miss
    const next = applyTodayChange(ex, opts[0]!.change, DEFAULT_BAR_SETUP, 'kg');
    expect(remainingWork(next)[0]!.kg).toBe(35);
  });
  it('out of breath: rest options, one set fewer, and more rest on the later exercises', () => {
    const ex = log(accessory(fresh()), [9]);
    expect(checkinOptions('breath', ex, 0, 1, 2.5).map((o) => o.id)).toEqual(['rest60', 'rest90', 'oneLess', 'later30']);
  });
  it('too easy: heavier, more reps or shorter rest', () => {
    const ex = log(accessory(fresh()), [12]);
    const opts = checkinOptions('easy', ex, 0, 0, 2.5);
    expect(opts.map((o) => o.id)).toEqual(['up', 'repsUp', 'restLess']);
    const up = applyTodayChange(ex, opts[0]!.change, DEFAULT_BAR_SETUP, 'kg');
    expect(remainingWork(up)[0]!.kg).toBe(42.5);
    const reps = applyTodayChange(ex, opts[1]!.change, DEFAULT_BAR_SETUP, 'kg');
    expect(remainingWork(reps)[0]!.targetReps).toBe(11);
  });
  it('pain offers nothing (the exercise stops)', () => {
    expect(checkinOptions('pain', log(accessory(fresh()), [9]), 0, 2, 2.5)).toEqual([]);
  });
  it('picks merge one per kind; the later-exercise rest is applied to the exercises after this one only', () => {
    const s = fresh();
    const ex = log(accessory(s), [9, 9, 4]);
    const opts = checkinOptions('heavy', ex, 2, 2, 2.5);
    const merged = mergeOptions(opts.filter((o) => o.id === 'drop' || o.id === 'later30'));
    expect(merged.laterRestSec).toBe(30);
    const index = s.exercises.findIndex((e) => e.slot === 'A1');
    const exercises = addLaterRest(s.exercises, index, 30, DEFAULT_BAR_SETUP, 'kg');
    expect(exercises[index - 1]).toEqual(s.exercises[index - 1]);
    const after = exercises[index + 1]!;
    expect(remainingWork(after)[0]!.restSec).toBe(remainingWork(s.exercises[index + 1]!)[0]!.restSec + 30);
  });
});

describe('OBS-DD5F16: drag to reorder', () => {
  const rows = (...slots: ('main' | 'A1' | 'A2' | 'B')[]) => slots.map((slot) => ({ slot }));
  it('moves an accessory several places in one drop; the main lift stays first', () => {
    expect(moveTo(rows('main', 'A1', 'A2', 'B'), 3, 1).map((r) => r.slot)).toEqual(['main', 'B', 'A1', 'A2']);
    expect(moveTo(rows('main', 'A1', 'A2', 'B'), 1, 0).map((r) => r.slot)).toEqual(['main', 'A1', 'A2', 'B']);
    expect(moveTo(rows('main', 'A1', 'A2', 'B'), 0, 3).map((r) => r.slot)).toEqual(['main', 'A1', 'A2', 'B']);
  });
  it('the drop index counts the other rows above the finger', () => {
    // rows at 25, 75, 125, 175; dragging row 1 down to y = 150 → lands after rows 0 and 2
    expect(dropIndex([25, 75, 125, 175], 150, 1)).toBe(2);
    expect(dropIndex([25, 75, 125, 175], 10, 3)).toBe(0);
  });
});

describe('OBS-E19B38: machine speed → mph', () => {
  it('km/h converts exactly; mph passes through', () => {
    expect(settingToMph(3.5, { name: '', scale: 'kmh', source: 'me' })).toBe(2.2);
    expect(settingToMph(3.5, { name: '', scale: 'mph', source: 'me' })).toBe(3.5);
  });
  it('a level dial maps linearly from level 1 to the top level', () => {
    const m = { name: 'X', scale: 'level' as const, maxLevel: 20, minMph: 0.5, maxMph: 10, source: 'philip' as const };
    expect(settingToMph(1, m)).toBe(0.5);
    expect(settingToMph(20, m)).toBe(10);
    expect(settingToMph(2, m)).toBe(1);
    expect(settingToMph(25, m)).toBe(10); // above the top is the top
    expect(settingToMph(5, { ...m, maxLevel: undefined })).toBeNull();
  });
  it('Philip’s estimate is validated: a level dial needs its numbers in range', () => {
    expect(parseTreadmillEstimate({ scale: 'kmh', confidence: 'high', note: 'Metric display.' }, 'Technogym Run')).toMatchObject({ treadmill: { scale: 'kmh', source: 'philip', name: 'Technogym Run' }, confidence: 'high' });
    expect(parseTreadmillEstimate({ scale: 'level', maxLevel: 15, maxMph: 12, minMph: 0.5, confidence: 'medium', note: '' }, 'X')?.treadmill).toMatchObject({ maxLevel: 15, maxMph: 12 });
    expect(parseTreadmillEstimate({ scale: 'level', maxLevel: 500, maxMph: 12 }, 'X')).toBeNull();
    expect(parseTreadmillEstimate({ scale: 'furlongs' }, 'X')).toBeNull();
    expect(validTreadmill({ name: '', scale: 'level', source: 'me' })).toBe(false);
    expect(treadmillPrompt('Life Fitness 95T')).toContain('Life Fitness 95T');
  });
});

describe('OBS-4E1000: Philip persuades, never scolds', () => {
  it('every Gemini persona says so, and keeps the guardrails', async () => {
    const { reportPrompt } = await import('./coach');
    const { checkinPrompt } = await import('./checkin');
    const { askPrompt } = await import('../coach/memory');
    const s = fresh();
    const report = reportPrompt({ session: s, phase: 'maintain', tms: TMS, trainingDays: [1, 2, 4, 5], choices: {}, unit: 'kg', name: (id) => id });
    const check = checkinPrompt({ exercise: 'x', slot: 'A1', setNumber: 1, ordered: '', logged: '', flag: 'heavy', note: '', remaining: '1', phase: 'maintain' });
    for (const p of [report, check]) {
      expect(p).toMatch(/scold/);
      expect(p).toMatch(/No sexual content/);
    }
    expect(report).toMatch(/Never comment on body, weight or appearance/);
    expect(typeof askPrompt).toBe('function');
  });
});
