/** Story 7: remembered order, slot-matched autosave, report apply + undo on delete, backup round-trip. */
import { describe, expect, it } from 'vitest';
import {
  allTmHistory,
  applyCoachProposals,
  applyReview,
  deleteWorkoutSession,
  saveCoachThread,
  saveWorkoutSession,
  setDayOrder,
  setSlotChoice,
  setUpTraining,
  startCycle,
} from './repo';
import { createBackup, parseBackup, restoreBackup } from '../lib/backup';
import { buildSession } from '../lib/training/session';
import { createSession } from '../lib/training/sessionLog';
import { moveExercise } from '../lib/training/order';
import { tmsForCycle } from '../lib/training/progress';
import { freshDb } from '../test/helpers';
import type { CoachThread, CycleRecord, WorkoutSession } from './types';

const TMS = { squat: 100, bench: 90, rdl: 103.5, ohp: 45 };

const cycleRecord: CycleRecord = {
  index: 1,
  block: 'A',
  startedAt: 1,
  phase: 'gain',
  tms: TMS,
  goal: { startWeightKg: 73, startBfPct: 15, endWeightKg: 74, weeklyRatePct: 0.3, bfLinePct: 16, source: 'philip', targetPlanId: null },
};

async function setup() {
  const db = await freshDb();
  await setUpTraining({ bar: { barKg: 20, plateUnit: 'lb', plates: [45, 25, 10, 5, 2.5] }, weightUnit: 'kg', tms: TMS }, db);
  await startCycle(cycleRecord, db);
  return db;
}

const done = (id = 's1'): WorkoutSession => ({
  ...createSession(buildSession({ cycle: 1, week: 1, day: 2, phase: 'gain', tms: TMS, weightUnit: 'kg' }), id, '2026-11-09', 10),
  status: 'done',
  finishedAt: 20,
});

const thread = (): CoachThread => ({
  report: 'Bench moved. Incline press next time heavier.',
  proposals: [
    { id: 'a', change: { kind: 'tm', lift: 'bench', toKg: 85.5 }, why: '', status: 'open' },
    { id: 'b', change: { kind: 'swap', day: 2, slot: 'A2', exerciseId: 'incline-machine-press' }, why: '', status: 'open' },
    { id: 'c', change: { kind: 'next', exerciseId: 'incline-db-press', kg: 27.5, reps: 10, sets: 4 }, why: '', status: 'open' },
    { id: 'd', change: { kind: 'days', days: [1, 3, 5, 6] }, why: '', status: 'open' },
    { id: 'e', change: { kind: 'rest', extraSec: 30 }, why: '', status: 'open' },
  ],
  messages: [{ from: 'me', text: 'Machines were busy', at: 5 }],
  createdAt: 1,
  updatedAt: 1,
});

describe('exercise order (OBS-F52773)', () => {
  it('remembers the order per day, and autosave keeps each exercise\'s frozen orders after a move', async () => {
    const db = await setup();
    const s = { ...done(), status: 'in_progress' as const, finishedAt: null };
    await saveWorkoutSession(s, db);
    const moved = { ...s, exercises: moveExercise(s.exercises, 2, -1) };
    await saveWorkoutSession(moved, db);
    const stored = await db.workoutSessions.get('s1');
    expect(stored?.exercises.map((e) => e.slot)).toEqual(['main', 'A2', 'A1', 'B']);
    for (const e of stored?.exercises ?? []) expect(e.prescription).toEqual(s.exercises.find((x) => x.slot === e.slot)?.prescription);

    await setDayOrder(2, ['main', 'A2', 'A1', 'B'], db);
    await setDayOrder(2, ['main', 'B', 'A2', 'A1'], db);
    expect((await db.trainingProgram.get('me'))?.dayOrder).toEqual({ '2': ['main', 'B', 'A2', 'A1'] });
  });
});

describe('Philip\'s report (OBS-3DB146)', () => {
  it('applies the OK\'d proposals in one go and records them', async () => {
    const db = await setup();
    await saveWorkoutSession(done(), db);
    await saveCoachThread('s1', thread(), db);
    const applied = await applyCoachProposals('s1', ['a', 'b', 'c', 'd', 'e', 'zzz'], db);
    expect(applied).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(tmsForCycle(await allTmHistory(db), 1).bench).toBe(85.5);
    expect((await db.slotChoices.get('D2-A2-A'))?.exerciseId).toBe('incline-machine-press');
    const program = await db.trainingProgram.get('me');
    expect(program?.trainingDays).toEqual([1, 3, 5, 6]);
    expect(program?.nextOverrides).toEqual([{ exerciseId: 'incline-db-press', afterSessionId: 's1', kg: 27.5, reps: 10, sets: 4 }]);
    expect((await db.cycles.get(1))?.restBonusSec).toBe(30);
    const s = await db.workoutSessions.get('s1');
    expect(s?.coach?.proposals.every((p) => p.status === 'applied')).toBe(true);
    expect(s?.coach?.messages).toHaveLength(1);
    expect(s?.reviewApplied).toEqual({
      tm: [{ lift: 'bench', fromKg: 90, toKg: 85.5 }],
      restBonusAddedSec: 30,
      swaps: [{ slotKey: 'D2-A2-A', from: null, to: 'incline-machine-press' }],
      days: { from: null, to: [1, 3, 5, 6] },
    });
    // Applying twice does nothing more.
    expect(await applyCoachProposals('s1', ['a'], db)).toEqual([]);
  });

  it('merges with the rules review instead of overwriting it', async () => {
    const db = await setup();
    await saveWorkoutSession(done(), db);
    await applyReview('s1', [{ kind: 'rest', extraSec: 30 }], db);
    await saveCoachThread('s1', thread(), db);
    await applyCoachProposals('s1', ['a'], db);
    expect((await db.workoutSessions.get('s1'))?.reviewApplied).toEqual({ tm: [{ lift: 'bench', fromKg: 90, toKg: 85.5 }], restBonusAddedSec: 30 });
  });

  it('deleting the log undoes every applied change', async () => {
    const db = await setup();
    await setSlotChoice('D2-A2-A', 'incline-bb-press', db);
    await saveWorkoutSession(done(), db);
    await saveCoachThread('s1', thread(), db);
    await applyCoachProposals('s1', ['a', 'b', 'c', 'd', 'e'], db);
    await deleteWorkoutSession('s1', db);
    expect(tmsForCycle(await allTmHistory(db), 1).bench).toBe(90);
    expect((await db.slotChoices.get('D2-A2-A'))?.exerciseId).toBe('incline-bb-press');
    const program = await db.trainingProgram.get('me');
    expect(program?.trainingDays).toBeUndefined();
    expect(program?.nextOverrides).toBeUndefined();
    expect((await db.cycles.get(1))?.restBonusSec).toBe(0);
  });

  it('round-trips order, overrides, cardio and the report thread in a backup', async () => {
    const db = await setup();
    await setDayOrder(2, ['main', 'A2', 'A1', 'B'], db);
    const s = done();
    await saveWorkoutSession({ ...s, cardio: { ...s.cardio!, minutes: 18, inclinePct: 12, speed: 3, done: true } }, db);
    await saveCoachThread('s1', thread(), db);
    await applyCoachProposals('s1', ['b', 'c'], db);

    const text = JSON.stringify(await createBackup(db));
    const b = await freshDb();
    await restoreBackup(b, parseBackup(text).file, 'replace');
    const program = await b.trainingProgram.get('me');
    expect(program?.dayOrder).toEqual({ '2': ['main', 'A2', 'A1', 'B'] });
    expect(program?.nextOverrides).toHaveLength(1);
    const r = await b.workoutSessions.get('s1');
    expect(r?.cardio).toMatchObject({ planMin: 15, minutes: 18, inclinePct: 12, done: true });
    expect(r?.coach?.proposals.map((p) => p.status)).toEqual(['open', 'applied', 'applied', 'open', 'open']);
    expect(r?.reviewApplied?.swaps).toEqual([{ slotKey: 'D2-A2-A', from: null, to: 'incline-machine-press' }]);
  });
});
