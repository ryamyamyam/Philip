/** Story 10 (OBS-7BAD75): reopening a finished log to fix it. */
import { describe, expect, it } from 'vitest';
import { allTmHistory, applyReview, deleteWorkoutSession, LockedSessionError, OpenSessionError, reopenWorkoutSession, saveWorkoutSession, setUpTraining, startCycle } from './repo';
import { createBackup, parseBackup } from '../lib/backup';
import { buildSession } from '../lib/training/session';
import { tmsForCycle, workoutCardState } from '../lib/training/progress';
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
function session(id: string, cycle: number, status: WorkoutSession['status'] = 'done'): WorkoutSession {
  const plan = buildSession({ cycle, week: 1, day: 1, phase: 'gain', tms: TMS });
  return {
    id, date: '2026-11-06', cycle, block: plan.block, week: 1, day: 1, status, estMinutes: plan.estMinutes, startedAt: 10, finishedAt: status === 'done' ? 20 : null,
    exercises: plan.exercises.map((e) => ({
      slot: e.slot, exerciseId: e.exerciseId, swappedFrom: null, note: '', prescription: e.prescription,
      actual: e.prescription.map((p) => ({ order: p.order, kg: null, reps: null, done: false, pain: false, copiedFromOrder: false })),
    })),
  };
}
async function setup() {
  const db = await freshDb();
  await setUpTraining({ bar: { barKg: 20, plateUnit: 'lb', plates: [45, 25, 10, 5, 2.5] }, weightUnit: 'kg', tms: TMS }, db);
  await startCycle(cycleRecord(1), db);
  return db;
}

describe('reopenWorkoutSession (OBS-7BAD75)', () => {
  it('undoes the applied review, clears the report, keeps the log and finish time, and marks it editing', async () => {
    const db = await setup();
    await saveWorkoutSession({ ...session('s1', 1), coach: { report: 'r', proposals: [], messages: [], createdAt: 1, updatedAt: 1 } }, db);
    await applyReview('s1', [{ kind: 'tm', lift: 'squat', factor: 0.95 }], db);
    await reopenWorkoutSession('s1', db);
    expect(tmsForCycle(await allTmHistory(db), 1).squat).toBe(100);
    const s = await db.workoutSessions.get('s1');
    expect(s).toMatchObject({ status: 'in_progress', editing: true, finishedAt: 20 });
    expect(s?.reviewed).toBeUndefined();
    expect(s?.reviewApplied).toBeUndefined();
    expect(s?.coach).toBeUndefined();
    // It is now the open workout, so the session screen resumes it.
    expect(workoutCardState({ currentCycle: 1 }, await db.workoutSessions.toArray(), '2026-11-11')).toMatchObject({ kind: 'resume', session: { id: 's1' } });
  });

  it('refuses while another workout is open', async () => {
    const db = await setup();
    await saveWorkoutSession(session('s1', 1), db);
    await saveWorkoutSession({ ...session('s2', 1, 'in_progress'), week: 1, day: 2 }, db);
    await expect(reopenWorkoutSession('s1', db)).rejects.toBeInstanceOf(OpenSessionError);
    expect((await db.workoutSessions.get('s1'))?.status).toBe('done');
  });

  it('OBS-59DEFD: reopens a log from a finished cycle without touching the TMs, review or report', async () => {
    const db = await setup();
    await saveWorkoutSession(session('old', 1), db);
    await applyReview('old', [{ kind: 'tm', lift: 'squat', factor: 0.95 }], db);
    await db.workoutSessions.update('old', { coach: { report: 'r', proposals: [], messages: [], createdAt: 1, updatedAt: 1 } });
    await startCycle({ ...cycleRecord(2), block: 'B' }, db);
    const before = await allTmHistory(db);
    await reopenWorkoutSession('old', db);
    expect(await allTmHistory(db)).toEqual(before);
    const s = await db.workoutSessions.get('old');
    expect(s).toMatchObject({ status: 'in_progress', editing: true, finishedAt: 20, reviewed: true, coach: { report: 'r' } });
    expect(s?.reviewApplied?.tm).toHaveLength(1);
    // Delete stays off for finished cycles.
    await saveWorkoutSession({ ...s!, status: 'done' }, db);
    await expect(deleteWorkoutSession('old', db)).rejects.toBeInstanceOf(LockedSessionError);
  });

  it('the editing flag survives a backup round trip', async () => {
    const db = await setup();
    await saveWorkoutSession(session('s1', 1), db);
    await reopenWorkoutSession('s1', db);
    const parsed = parseBackup(JSON.stringify(await createBackup(db)));
    expect(parsed.file.data.training?.sessions.find((s) => s.id === 's1')?.editing).toBe(true);
  });
});
