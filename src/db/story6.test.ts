import { describe, expect, it } from 'vitest';
import {
  allTmHistory,
  applyReview,
  deleteWorkoutSession,
  LockedSessionError,
  saveWorkoutSession,
  setTrainingDays,
  setUpTraining,
  startCycle,
} from './repo';
import { createBackup, parseBackup, restoreBackup } from '../lib/backup';
import { buildSession } from '../lib/training/session';
import { nextSessionRef, tmsForCycle } from '../lib/training/progress';
import { freshDb } from '../test/helpers';
import type { CycleRecord, WorkoutSession } from './types';

const TMS = { squat: 100, bench: 90, rdl: 103.5, ohp: 45 };

const cycleRecord = (index: number): CycleRecord => ({
  index,
  block: 'A',
  startedAt: 1,
  phase: 'gain',
  tms: TMS,
  goal: { startWeightKg: 73, startBfPct: 15, endWeightKg: 74, weeklyRatePct: 0.3, bfLinePct: 16, source: 'philip', targetPlanId: null },
});

function session(id: string, cycle: number, week: 1 | 2 | 3 | 4, day: 1 | 2 | 3 | 4, status: WorkoutSession['status'] = 'done'): WorkoutSession {
  const plan = buildSession({ cycle, week, day, phase: 'gain', tms: TMS });
  return {
    id, date: '2026-11-06', cycle, block: plan.block, week, day, status, estMinutes: plan.estMinutes, startedAt: 10, finishedAt: status === 'done' ? 20 : null,
    exercises: plan.exercises.map((e) => ({
      slot: e.slot, exerciseId: e.exerciseId, swappedFrom: null, note: '', prescription: e.prescription,
      actual: e.prescription.map((p) => ({ order: p.order, kg: null, reps: null, done: false, pain: false, copiedFromOrder: false })),
    })),
  };
}

async function setup(cycle = 1) {
  const db = await freshDb();
  await setUpTraining({ bar: { barKg: 20, plateUnit: 'lb', plates: [45, 25, 10, 5, 2.5] }, weightUnit: 'kg', tms: TMS }, db);
  await startCycle(cycleRecord(cycle), db);
  return db;
}

describe('applyReview (Story 6 §4)', () => {
  it('appends adjust rows, raises the rest bonus (capped) and records what changed', async () => {
    const db = await setup();
    await saveWorkoutSession(session('s1', 1, 1, 1), db);
    const applied = await applyReview('s1', [{ kind: 'tm', lift: 'squat', factor: 0.95 }, { kind: 'rest', extraSec: 30 }], db);
    expect(applied).toEqual({ tm: [{ lift: 'squat', fromKg: 100, toKg: 95 }], restBonusAddedSec: 30 });
    expect(tmsForCycle(await allTmHistory(db), 1).squat).toBe(95);
    expect((await db.cycles.get(1))?.restBonusSec).toBe(30);
    expect(await db.workoutSessions.get('s1')).toMatchObject({ reviewed: true, reviewApplied: applied });
  });

  it('records only the rest actually added under the 90 s cap', async () => {
    const db = await setup();
    await db.cycles.update(1, { restBonusSec: 75 });
    await saveWorkoutSession(session('s1', 1, 1, 1), db);
    expect((await applyReview('s1', [{ kind: 'rest', extraSec: 30 }], db)).restBonusAddedSec).toBe(15);
  });
});

describe('deleteWorkoutSession (Story 6 §4)', () => {
  it('AC 4: undo appends a TM row back to 100 and lowers the rest bonus by 30; history only grows', async () => {
    const db = await setup();
    await saveWorkoutSession(session('s1', 1, 1, 1), db);
    await applyReview('s1', [{ kind: 'tm', lift: 'squat', factor: 0.95 }, { kind: 'rest', extraSec: 30 }], db);
    const before = (await allTmHistory(db)).length;
    await deleteWorkoutSession('s1', db);
    const after = await allTmHistory(db);
    expect(after).toHaveLength(before + 1);
    expect(after.at(-1)).toMatchObject({ lift: 'squat', tmKg: 100, reason: 'undo', effectiveCycle: 1 });
    expect(tmsForCycle(after, 1).squat).toBe(100);
    expect((await db.cycles.get(1))?.restBonusSec).toBe(0);
    expect(await db.workoutSessions.get('s1')).toBeUndefined();
  });

  it('undo is additive: a later change survives', async () => {
    const db = await setup();
    await saveWorkoutSession(session('s1', 1, 1, 1), db);
    await applyReview('s1', [{ kind: 'tm', lift: 'squat', factor: 0.95 }], db); // 100 → 95
    await saveWorkoutSession(session('s2', 1, 2, 1), db);
    await applyReview('s2', [{ kind: 'tm', lift: 'squat', factor: 0.95 }], db); // 95 → 90.5
    await deleteWorkoutSession('s1', db); // +5
    expect(tmsForCycle(await allTmHistory(db), 1).squat).toBe(95.5);
  });

  it('the deleted day is open again and becomes the next session', async () => {
    const db = await setup();
    await saveWorkoutSession(session('a', 1, 1, 1), db);
    await saveWorkoutSession(session('b', 1, 1, 2), db);
    expect(nextSessionRef(await db.workoutSessions.toArray(), 1)).toEqual({ week: 1, day: 3 });
    await deleteWorkoutSession('a', db);
    expect(nextSessionRef(await db.workoutSessions.toArray(), 1)).toEqual({ week: 1, day: 1 });
  });

  it('a pre-Story-6 reviewed session (no reviewApplied) deletes without touching TMs; in-progress sessions can be discarded', async () => {
    const db = await setup();
    await saveWorkoutSession({ ...session('old', 1, 1, 1), reviewed: true }, db);
    await saveWorkoutSession(session('open', 1, 1, 2, 'in_progress'), db);
    const n = (await allTmHistory(db)).length;
    await deleteWorkoutSession('old', db);
    await deleteWorkoutSession('open', db);
    expect(await db.workoutSessions.count()).toBe(0);
    expect(await allTmHistory(db)).toHaveLength(n);
  });

  it('logs from finished cycles are locked', async () => {
    const db = await setup(2);
    await saveWorkoutSession(session('c1', 1, 1, 1), db);
    await expect(deleteWorkoutSession('c1', db)).rejects.toBeInstanceOf(LockedSessionError);
    expect(await db.workoutSessions.get('c1')).toBeDefined();
  });
});

describe('training days + backup (Story 6 §3.1, §4)', () => {
  it('saves sorted training days, clears them back to Philip\'s pick, and round-trips new fields', async () => {
    const db = await setup();
    await setTrainingDays([5, 1, 3, 2], db);
    expect((await db.trainingProgram.get('me'))?.trainingDays).toEqual([1, 2, 3, 5]);
    await saveWorkoutSession(session('s1', 1, 1, 1), db);
    await applyReview('s1', [{ kind: 'tm', lift: 'bench', factor: 0.95 }], db);

    const text = JSON.stringify(await createBackup(db));
    const b = await freshDb();
    await restoreBackup(b, parseBackup(text).file, 'replace');
    expect((await b.trainingProgram.get('me'))?.trainingDays).toEqual([1, 2, 3, 5]);
    const s1 = await b.workoutSessions.get('s1');
    expect(s1?.reviewApplied).toEqual({ tm: [{ lift: 'bench', fromKg: 90, toKg: 85.5 }], restBonusAddedSec: 0 });
    expect(s1?.exercises[1]?.prescription[0]).toMatchObject({ estimate: true });

    await setTrainingDays(null, db);
    expect((await db.trainingProgram.get('me'))?.trainingDays).toBeUndefined();
  });
});
