import { describe, expect, it } from 'vitest';
import { EXERCISE_IDS, MENU } from './exercises';
import { KG_PER_LB } from './plates';
import { buildSession } from './session';
import { firstTargetReps, floorToStep, startingKg, startRule, UNCOVERED_EXERCISES } from './startLoad';

const RYAN = { tms: { squat: 135, bench: 90, rdl: 103.5, ohp: 45 }, bodyWeightKg: 73, unit: 'kg' as const };

describe('starting weights (Story 6 §6)', () => {
  it('every exercise in the library has a rule (load, assist, bodyweight, timed, band or main)', () => {
    expect(UNCOVERED_EXERCISES()).toEqual([]);
    for (const id of EXERCISE_IDS) expect(() => startRule(id)).not.toThrow();
    for (const m of MENU) for (const id of [m.pick, ...m.swaps]) expect(startRule(id).kind).not.toBe('main');
  });

  it('AC 9 example: incline DB press 25 kg per hand at bench TM 90 (0.28 × 90, rounded down)', () => {
    expect(startingKg('incline-db-press', RYAN)).toBe(25);
    expect(startingKg('lat-pulldown', RYAN)).toBe(42.5); // 0.6 × 73 body weight
    expect(startingKg('db-lateral-raise', RYAN)).toBe(7.5); // 0.18 × OHP 45 = 8.1
    expect(startingKg('pull-up', RYAN)).toBeNull(); // bodyweight reps
    expect(startingKg('side-plank', RYAN)).toBeNull(); // timed
    expect(startingKg('band-pull-apart', RYAN)).toBeNull();
    expect(startingKg('assisted-pull-up', RYAN)).toBe(20); // assistance 0.3 × 73
  });

  it('rounds down to 2.5 kg or 5 lb, never below one step', () => {
    expect(floorToStep(8.1, 'kg')).toBe(7.5);
    expect(floorToStep(1, 'kg')).toBe(2.5);
    expect(floorToStep(25.2, 'lb')).toBeCloseTo(11 * 5 * KG_PER_LB, 2); // 55 lb
    expect(startingKg('incline-db-press', { ...RYAN, unit: 'lb' })).toBeCloseTo(55 * KG_PER_LB, 2);
  });

  it('falls back to body weight when the anchor TM is missing, and to null with nothing to anchor on', () => {
    const noOhp = { ...RYAN, tms: { ...RYAN.tms, ohp: null } };
    expect(startingKg('db-curl', noOhp)).toBe(7.5); // 73 × 0.45 × 0.25 = 8.2
    expect(startingKg('db-curl', { ...noOhp, bodyWeightKg: null })).toBeNull();
    expect(startingKg('lat-pulldown', { ...RYAN, bodyWeightKg: null })).toBeNull();
  });

  it('target reps start in the middle of the range, rounded down', () => {
    expect(firstTargetReps(8, 12)).toBe(10);
    expect(firstTargetReps(12, 15)).toBe(13);
    expect(firstTargetReps(6, 8)).toBe(7);
  });

  it('sessions carry the estimate, target reps and bodyweight orders without a weight', () => {
    const day4 = buildSession({ cycle: 1, week: 1, day: 4, phase: 'maintain', tms: RYAN.tms, weightUnit: 'kg', bodyWeightKg: 73 });
    const pull = day4.exercises.find((e) => e.slot === 'A1')?.prescription[0];
    expect(pull).toMatchObject({ kg: null, targetReps: 8 }); // pull-up 6–10, bodyweight
    expect(pull?.estimate).toBeUndefined();
    const lateral = day4.exercises.find((e) => e.slot === 'A2')?.prescription[0];
    expect(lateral).toMatchObject({ kg: 7.5, estimate: true, targetReps: 16 });
  });
});
