/** OBS-41CEBE: Philip keeps machine, cable, dumbbell and barbell loads apart. */
import { describe, expect, it } from 'vitest';
import { reportPrompt, type CoachContext } from './coach';
import { LOAD_RULE, loadKind, slotKey } from './exercises';
import { blockForCycle } from './program';
import { buildSession } from './session';
import { createSession } from './sessionLog';
import { askPrompt } from '../coach/memory';
import { screenshotFileName } from '../../modules/qa-feedback/browser';

const TMS = { squat: 135, bench: 90, rdl: 103.5, ohp: 45 };
const base = { cycle: 1, week: 1 as const, day: 2 as const, phase: 'maintain' as const, tms: TMS, bodyWeightKg: 73, weightUnit: 'kg' as const };

describe('OBS-41CEBE: machine vs dumbbell loads', () => {
  it('the rule engine gives a swapped machine its own weight, not the dumbbell one', () => {
    const db = buildSession(base).exercises.find((e) => e.slot === 'A2');
    const key = slotKey(2, 'A2', blockForCycle(1));
    const machine = buildSession({ ...base, choices: { [key]: 'incline-machine-press' } }).exercises.find((e) => e.slot === 'A2');
    expect(db?.exerciseId).toBe('incline-db-press');
    expect(machine?.exerciseId).toBe('incline-machine-press');
    expect(db?.prescription[0]?.kg).toBe(25); // per hand
    expect(machine?.prescription[0]?.kg).toBe(52.5); // stack: bench TM 90 × 0.6, rounded down
  });

  it('a machine with its own log follows that log, not the dumbbell history', () => {
    const key = slotKey(2, 'A2', blockForCycle(1));
    const set = (kg: number, reps: number) => ({ kg, reps, done: true });
    const lastSets = (id: string) => (id === 'incline-machine-press' ? [set(60, 10), set(60, 10), set(60, 10)] : id === 'incline-db-press' ? [set(22.5, 12)] : null);
    const machine = buildSession({ ...base, choices: { [key]: 'incline-machine-press' }, lastSets }).exercises.find((e) => e.slot === 'A2');
    expect(machine?.prescription[0]?.kg).toBe(60);
    expect(machine?.prescription[0]?.estimate ?? false).toBe(false);
  });

  it('tells Gemini what kg means per exercise and what was swapped', () => {
    expect(loadKind('incline-db-press')).toContain('per hand');
    expect(loadKind('incline-machine-press')).toContain('machine');
    expect(loadKind('bench')).toContain('barbell');
    const plan = buildSession(base);
    const s = createSession(plan, 's1', '2026-11-12', 1000);
    const swapped = { ...s, exercises: s.exercises.map((e) => (e.slot === 'A2' ? { ...e, exerciseId: 'incline-machine-press', swappedFrom: 'incline-db-press' } : e)) };
    const c: CoachContext = { session: swapped, phase: 'maintain', tms: TMS, trainingDays: [1, 2, 4, 5], choices: {}, unit: 'kg', name: (id) => id };
    const p = reportPrompt(c);
    expect(p).toContain(LOAD_RULE);
    expect(p).toContain('incline-machine-press [id incline-machine-press] (machine, cable or one weight, kg as set on it)');
    expect(p).toContain('Swapped in today for incline-db-press [id incline-db-press] (two dumbbells, kg per hand); not comparable.');
    expect(askPrompt('brief', [], 'q')).toContain(LOAD_RULE);
  });
});

describe('OBS-41CEBE: screenshots leave the QA tool as files', () => {
  it('keeps the original name so it matches the prompt, else ref + number', () => {
    expect(screenshotFileName('OBS-41CEBE', 0, 'IMG_6946.png', 'image/png')).toBe('IMG_6946.png');
    expect(screenshotFileName('OBS-41CEBE', 1, null, 'image/jpeg')).toBe('OBS-41CEBE-2.jpg');
  });
});
