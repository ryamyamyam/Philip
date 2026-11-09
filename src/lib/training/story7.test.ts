/** Story 7: gym QA batch (OBS-F52773 order, OBS-93A8C0 cardio, OBS-3DB146 report, OBS-C94181 dumbbells). */
import { describe, expect, it } from 'vitest';
import { applyOrder, canMove, moveExercise, normalizeOrder, orderOf } from './order';
import { CARDIO_MINUTES, canFinishCardio, clampField, plannedCardio } from './cardio';
import { addPhilipTurn, newThread, parseCoachTurn, reportPrompt, validateChange, type CoachContext } from './coach';
import { buildSession, estimateMinutes, SESSION_BUDGET_MIN } from './session';
import { createSession, lastSessionIdFor } from './sessionLog';
import { EXERCISES } from './exercises';
import type { WorkoutSession } from '../../db/types';

const TMS = { squat: 135, bench: 90, rdl: 103.5, ohp: 45 };

describe('exercise order (OBS-F52773)', () => {
  it('keeps the main lift first and every accessory once', () => {
    expect(normalizeOrder(['A2', 'main', 'A1', 'A2', 'x'])).toEqual(['main', 'A2', 'A1', 'B']);
    expect(normalizeOrder(null)).toEqual(['main', 'A1', 'A2', 'B']);
  });

  it('creates the day in the remembered order (A2 before A1)', () => {
    const plan = buildSession({ cycle: 1, week: 1, day: 2, phase: 'gain', tms: TMS });
    const s = createSession(plan, 's', '2026-11-09', 0, { order: ['main', 'A2', 'A1', 'B'] });
    expect(s.exercises.map((e) => e.slot)).toEqual(['main', 'A2', 'A1', 'B']);
    // Orders travel with their exercise.
    expect(s.exercises[1]?.exerciseId).toBe(plan.exercises.find((e) => e.slot === 'A2')?.exerciseId);
    // Same estimate whatever the order (the time model reads slots, not positions).
    expect(estimateMinutes(applyOrder(plan.exercises, ['main', 'B', 'A2', 'A1']))).toBe(plan.estMinutes);
  });

  it('moves accessories but never the main lift or past it', () => {
    const ex = [{ slot: 'main' as const }, { slot: 'A1' as const }, { slot: 'A2' as const }, { slot: 'B' as const }];
    expect(canMove(ex, 0, 1)).toBe(false);
    expect(canMove(ex, 1, -1)).toBe(false);
    expect(canMove(ex, 3, 1)).toBe(false);
    const moved = moveExercise(ex, 2, -1);
    expect(orderOf(moved)).toEqual(['main', 'A2', 'A1', 'B']);
    expect(orderOf(moveExercise(moved, 1, 1))).toEqual(['main', 'A1', 'A2', 'B']);
    expect(moveExercise(ex, 0, 1)).toEqual(ex);
  });
});

describe('cardio finisher (OBS-93A8C0)', () => {
  it('is planned every session, longer on a cut, and needs minutes to be done', () => {
    expect(CARDIO_MINUTES).toEqual({ gain: 15, maintain: 15, lose: 25 });
    const plan = buildSession({ cycle: 1, week: 1, day: 1, phase: 'gain', tms: TMS });
    const s = createSession(plan, 's', '2026-11-09', 0, { speedUnit: 'mph' });
    expect(s.cardio).toEqual(plannedCardio('gain', 'mph'));
    expect(s.cardio?.planMin).toBe(15);
    expect(canFinishCardio({ ...plannedCardio('lose'), minutes: null })).toBe(false);
    expect(canFinishCardio({ ...plannedCardio('lose'), minutes: 20 })).toBe(true);
    expect(clampField('inclinePct', 45)).toBeNull();
    expect(clampField('inclinePct', 12)).toBe(12);
  });

  it('stays outside the 45-minute budget', () => {
    for (const phase of ['gain', 'maintain', 'lose'] as const) {
      const plan = buildSession({ cycle: 3, week: 3, day: 3, phase, tms: TMS });
      expect(plan.estMinutes).toBeLessThanOrEqual(SESSION_BUDGET_MIN);
    }
  });
});

describe('dumbbell pairs (OBS-C94181)', () => {
  it('marks two-dumbbell exercises, not single-dumbbell or machine ones', () => {
    const info = EXERCISES as Record<string, { pair?: boolean }>;
    for (const id of ['incline-db-press', 'db-curl', 'db-lateral-raise', 'cs-db-row', 'bulgarian-split-squat']) expect(info[id]?.pair).toBe(true);
    for (const id of ['single-arm-db-row', 'goblet-squat', 'db-kickback', 'cable-curl', 'bench', 'single-leg-db-calf-raise']) expect(info[id]?.pair).toBeUndefined();
  });

  it('keeps the stored weight per hand (incline DB press at bench TM 90 is 25 kg per hand)', () => {
    const plan = buildSession({ cycle: 1, week: 1, day: 2, phase: 'maintain', tms: TMS, bodyWeightKg: 73, weightUnit: 'kg' });
    const a2 = plan.exercises.find((e) => e.slot === 'A2');
    expect(a2?.exerciseId).toBe('incline-db-press');
    expect(a2?.prescription[0]?.kg).toBe(25);
  });
});

/* ---------------- Philip's report (OBS-3DB146) ---------------- */

function doneSession(): WorkoutSession {
  const plan = buildSession({ cycle: 1, week: 1, day: 2, phase: 'gain', tms: TMS, weightUnit: 'kg', bodyWeightKg: 73 });
  const s = createSession(plan, 's1', '2026-11-09', 1000);
  return {
    ...s,
    status: 'done',
    finishedAt: 1000 + 40 * 60000,
    exercises: s.exercises.map((e) => ({ ...e, actual: e.actual.map((a, i) => ({ ...a, kg: e.prescription[i]?.kg ?? null, reps: 8, done: true })) })),
  };
}

const ctx = (session = doneSession()): CoachContext => ({
  session,
  phase: 'gain',
  tms: TMS,
  trainingDays: [1, 2, 4, 5],
  choices: {},
  unit: 'kg',
  name: (id) => id,
});

describe('coach report proposals (OBS-3DB146)', () => {
  it('puts the log, the plan and the approved swaps in the prompt', () => {
    const p = reportPrompt(ctx());
    expect(p).toContain('incline-db-press');
    expect(p).toContain('day 2 A2');
    expect(p).toContain('Cardio: incline walk, planned 15 min');
    expect(p).toContain('Reply ONLY with JSON');
  });

  it('clamps TM changes to 10% and drops no-ops', () => {
    expect(validateChange({ kind: 'tm', lift: 'bench', toKg: 50 }, ctx())).toEqual({ kind: 'tm', lift: 'bench', toKg: 81 });
    expect(validateChange({ kind: 'tm', lift: 'bench', toKg: 90 }, ctx())).toBeNull();
    expect(validateChange({ kind: 'tm', lift: 'deadlift', toKg: 90 }, ctx())).toBeNull();
  });

  it('only allows next-time orders for today\'s accessories, within bounds', () => {
    const c = ctx();
    expect(validateChange({ kind: 'next', exerciseId: 'incline-db-press', kg: 40, reps: 30, sets: 9 }, c)).toEqual({
      kind: 'next',
      exerciseId: 'incline-db-press',
      kg: 30,
      reps: 12,
      sets: 5,
    });
    expect(validateChange({ kind: 'next', exerciseId: 'bench', kg: 100, reps: 5, sets: 3 }, c)).toBeNull();
    expect(validateChange({ kind: 'next', exerciseId: 'leg-press', kg: 100, reps: 5, sets: 3 }, c)).toBeNull();
  });

  it('only allows swaps from the approved menu, and exactly 4 training days', () => {
    const c = ctx();
    expect(validateChange({ kind: 'swap', day: 2, slot: 'A2', exerciseId: 'incline-machine-press' }, c)).toEqual({ kind: 'swap', day: 2, slot: 'A2', exerciseId: 'incline-machine-press' });
    expect(validateChange({ kind: 'swap', day: 2, slot: 'A2', exerciseId: 'leg-press' }, c)).toBeNull();
    expect(validateChange({ kind: 'swap', day: 2, slot: 'A2', exerciseId: 'incline-db-press' }, c)).toBeNull();
    expect(validateChange({ kind: 'days', days: [1, 3, 5, 6] }, c)).toEqual({ kind: 'days', days: [1, 3, 5, 6] });
    expect(validateChange({ kind: 'days', days: [1, 3, 5] }, c)).toBeNull();
    expect(validateChange({ kind: 'days', days: [5, 4, 2, 1] }, c)).toBeNull();
    expect(validateChange({ kind: 'rest', extraSec: 200 }, c)).toEqual({ kind: 'rest', extraSec: 60 });
  });

  it('parses a reply, strips emoji, drops invalid changes and keeps one per target', () => {
    const turn = parseCoachTurn(
      {
        message: 'Solid day 💪 Bench moved well.',
        changes: [
          { kind: 'next', exerciseId: 'incline-db-press', kg: 27.5, why: 'Owned the reps.' },
          { kind: 'next', exerciseId: 'incline-db-press', kg: 27.5, reps: 10 },
          { kind: 'swap', day: 9, slot: 'A1', exerciseId: 'x' },
        ],
      },
      ctx(),
    );
    expect(turn?.message).toBe('Solid day  Bench moved well.');
    expect(turn?.changes).toHaveLength(1);
    expect(turn?.changes[0]?.change).toEqual({ kind: 'next', exerciseId: 'incline-db-press', kg: 27.5, reps: 10, sets: null });
    expect(parseCoachTurn({ changes: [] }, ctx())).toBeNull();
  });

  it('threads the chat: a newer proposal for the same target replaces the open one', () => {
    let n = 0;
    const id = () => `p${n++}`;
    const first = parseCoachTurn({ message: 'Report.', changes: [{ kind: 'rest', extraSec: 30 }] }, ctx());
    const thread = newThread(first!, 1, id);
    expect(thread.proposals).toEqual([{ id: 'p0', change: { kind: 'rest', extraSec: 30 }, why: '', status: 'open' }]);
    const reply = parseCoachTurn({ message: 'Fine, 15.', changes: [{ kind: 'rest', extraSec: 15 }] }, ctx());
    const next = addPhilipTurn({ ...thread, messages: [{ from: 'me', text: 'Too much rest', at: 2 }] }, reply!, 3, id);
    expect(next.proposals.map((p) => p.status)).toEqual(['declined', 'open']);
    expect(next.messages.map((m) => m.from)).toEqual(['me', 'philip']);
  });
});

describe('next-time overrides (OBS-3DB146)', () => {
  it('sets weight, reps and sets for that exercise only', () => {
    const plan = buildSession({
      cycle: 1, week: 1, day: 2, phase: 'maintain', tms: TMS, weightUnit: 'kg', bodyWeightKg: 73,
      override: (id) => (id === 'incline-db-press' ? { kg: 27.5, reps: 9, sets: 4 } : null),
    });
    const a2 = plan.exercises.find((e) => e.slot === 'A2');
    expect(a2?.prescription).toHaveLength(4);
    expect(a2?.prescription[0]).toMatchObject({ kg: 27.5, targetReps: 9 });
    expect(a2?.prescription[0]?.estimate).toBeUndefined();
    const a1 = plan.exercises.find((e) => e.slot === 'A1');
    expect(a1?.prescription[0]?.estimate).toBe(true);
  });

  it('keys on the latest session where the exercise was logged', () => {
    const s = doneSession();
    expect(lastSessionIdFor([s], 'incline-db-press')).toBe('s1');
    expect(lastSessionIdFor([{ ...s, id: 's2', finishedAt: s.finishedAt! + 1, exercises: [] }, s], 'incline-db-press')).toBe('s1');
    expect(lastSessionIdFor([s], 'leg-press')).toBeNull();
  });
});
