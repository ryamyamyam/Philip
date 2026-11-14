import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { PhilipDB, initDatabase } from './db';
import {
  addTm,
  allTmHistory,
  logWeight,
  resetTrainingProgram,
  saveWorkoutSession,
  setSlotChoice,
  setUpTraining,
  startCycle,
  updateProfile,
} from './repo';
import { createBackup, deleteAllData, parseBackup, restoreBackup } from '../lib/backup';
import { buildSession } from '../lib/training/session';
import { nextCycleIndex, nextSessionRef, tmsForCycle } from '../lib/training/progress';
import { DEFAULT_BAR_SETUP } from '../lib/training/plates';
import { freshDb } from '../test/helpers';
import type { CycleRecord, WorkoutSession } from './types';

let n = 0;

describe('Dexie v4 migration (Story 5: training)', () => {
  it('keeps every v3 record, adds empty training tables and profile.targetBodyFatPct = null', async () => {
    const name = `mig4-${Date.now()}-${n++}`;
    const v3 = new Dexie(name);
    v3.version(1).stores({ profile: 'id', targetPlans: '++id, effectiveFrom', foodEntries: 'id, date, createdAt, savedFoodId, name', savedFoods: 'id, name, lastUsedAt, useCount', meta: 'key' });
    v3.version(2).stores({ weightEntries: 'date' });
    v3.version(3).stores({ savedMeals: 'id, name, lastUsedAt' });
    await v3.open();
    await v3.table('profile').put({ id: 'me', weightKg: 73, bodyFatPct: 15, goal: 'gain', unitPrefs: { weight: 'kg', height: 'cm' } });
    await v3.table('savedMeals').put({ id: 'm1', name: 'Usual', items: [], useCount: 1, lastUsedAt: 1, createdAt: 1, updatedAt: 1 });
    await v3.table('weightEntries').put({ date: '2026-11-01', weightKg: 73, createdAt: 1, updatedAt: 1 });
    v3.close();

    const db = new PhilipDB(name);
    await initDatabase(db);
    expect(db.verno).toBe(6);
    expect(await db.profile.get('me')).toMatchObject({ weightKg: 73, bodyFatPct: 15, targetBodyFatPct: null });
    expect(await db.savedMeals.count()).toBe(1);
    expect(await db.weightEntries.count()).toBe(1);
    for (const t of [db.trainingProgram, db.tmHistory, db.cycles, db.workoutSessions, db.slotChoices]) expect(await t.count()).toBe(0);
    db.close();
  });
});

const TMS = { squat: 135, bench: 90, rdl: 103.5, ohp: 45 };

function cycleRecord(index: number): CycleRecord {
  return {
    index,
    block: 'A',
    startedAt: 1,
    phase: 'gain',
    tms: TMS,
    goal: { startWeightKg: 73, startBfPct: 15, endWeightKg: 74, weeklyRatePct: 0.3, bfLinePct: 16, source: 'philip', targetPlanId: null },
  };
}

function sessionFrom(id: string, week: 1 | 2 | 3 | 4, day: 1 | 2 | 3 | 4, status: WorkoutSession['status']): WorkoutSession {
  const plan = buildSession({ cycle: 1, week, day, phase: 'gain', tms: TMS });
  return {
    id,
    date: '2026-11-06',
    cycle: 1,
    block: plan.block,
    week,
    day,
    status,
    estMinutes: plan.estMinutes,
    startedAt: 10,
    finishedAt: status === 'done' ? 20 : null,
    exercises: plan.exercises.map((e) => ({
      slot: e.slot,
      exerciseId: e.exerciseId,
      swappedFrom: null,
      note: '',
      prescription: e.prescription,
      actual: e.prescription.map((p) => ({ order: p.order, kg: null, reps: null, done: false, pain: false, copiedFromOrder: false })),
    })),
  };
}

describe('training repo', () => {
  it('setup writes the program and one setup TM per entered lift; the first cycle waits for the briefing', async () => {
    const db = await freshDb();
    await setUpTraining({ bar: { ...DEFAULT_BAR_SETUP, plates: [...DEFAULT_BAR_SETUP.plates] }, weightUnit: 'lb', tms: { squat: 135, bench: 90, ohp: 45 } }, db);
    expect(await db.trainingProgram.get('me')).toMatchObject({ currentCycle: 0, weightUnit: 'lb' });
    const tms = tmsForCycle(await allTmHistory(db), 1);
    expect(tms).toEqual({ squat: 135, bench: 90, rdl: null, ohp: 45 });
    expect((await allTmHistory(db)).every((r) => r.reason === 'setup')).toBe(true);
  });

  it('TM history is append-only and the latest row for a cycle wins', async () => {
    const db = await freshDb();
    await setUpTraining({ bar: { barKg: 20, plateUnit: 'lb', plates: [45, 25, 10, 5, 2.5] }, weightUnit: 'lb', tms: TMS }, db);
    await addTm({ lift: 'bench', tmKg: 92.5, effectiveCycle: 2, reason: 'cycle' }, db);
    const all = await allTmHistory(db);
    expect(all).toHaveLength(5);
    expect(tmsForCycle(all, 1).bench).toBe(90);
    expect(tmsForCycle(all, 2).bench).toBe(92.5);
  });

  it('starting a cycle snapshots it and moves the program to it', async () => {
    const db = await freshDb();
    await setUpTraining({ bar: { barKg: 20, plateUnit: 'lb', plates: [45] }, weightUnit: 'lb', tms: TMS }, db);
    await startCycle(cycleRecord(1), db);
    expect((await db.trainingProgram.get('me'))?.currentCycle).toBe(1);
    expect((await db.cycles.get(1))?.goal.endWeightKg).toBe(74);
  });

  it('autosave keeps the frozen orders even if a caller sends changed ones', async () => {
    const db = await freshDb();
    const s = sessionFrom('s1', 1, 2, 'in_progress');
    await saveWorkoutSession(s, db);
    const tampered = structuredClone(s);
    tampered.exercises[0]!.prescription[0]!.kg = 999;
    tampered.exercises[0]!.actual[0] = { order: 0, kg: 30, reps: 5, done: true, pain: false, copiedFromOrder: false };
    await saveWorkoutSession(tampered, db);
    const saved = await db.workoutSessions.get('s1');
    expect(saved?.exercises[0]?.prescription[0]?.kg).toBe(s.exercises[0]?.prescription[0]?.kg);
    expect(saved?.exercises[0]?.actual[0]).toMatchObject({ kg: 30, reps: 5, done: true });
  });

  it('days are a sequence: the next session is the first day not done or skipped', () => {
    const sessions = [sessionFrom('a', 1, 1, 'done'), sessionFrom('b', 1, 2, 'skipped'), sessionFrom('c', 1, 3, 'in_progress')];
    expect(nextSessionRef(sessions, 1)).toEqual({ week: 1, day: 3 });
    expect(nextSessionRef([], 1)).toEqual({ week: 1, day: 1 });
  });

  it('reset keeps session logs, and cycle numbers continue past them', async () => {
    const db = await freshDb();
    await setUpTraining({ bar: { barKg: 20, plateUnit: 'lb', plates: [45] }, weightUnit: 'lb', tms: TMS }, db);
    await startCycle(cycleRecord(1), db);
    await saveWorkoutSession(sessionFrom('a', 1, 1, 'done'), db);
    await setSlotChoice('D1-A1-A', 'hack-squat', db);
    await resetTrainingProgram(db);
    expect(await db.trainingProgram.count()).toBe(0);
    expect(await db.slotChoices.count()).toBe(0);
    expect(await db.workoutSessions.count()).toBe(1);
    expect(nextCycleIndex(await db.cycles.toArray(), await db.workoutSessions.toArray())).toBe(2);
  });
});

describe('training in backups', () => {
  async function seeded() {
    const db = await freshDb();
    await updateProfile({ weightKg: 73, bodyFatPct: 15, targetBodyFatPct: 12 }, db);
    await logWeight('2026-11-01', 73, db);
    await setUpTraining({ bar: { barKg: 20, plateUnit: 'lb', plates: [45, 35, 25, 10, 5, 2.5] }, weightUnit: 'lb', tms: TMS }, db);
    await startCycle(cycleRecord(1), db);
    await saveWorkoutSession(sessionFrom('s1', 1, 1, 'done'), db);
    await setSlotChoice('D1-A1-A', 'hack-squat', db);
    return db;
  }

  it('round-trips program, TMs, cycles, sessions, swaps and the BF target (replace)', async () => {
    const a = await seeded();
    const text = JSON.stringify(await createBackup(a));
    const b = await freshDb();
    const summary = await restoreBackup(b, parseBackup(text).file, 'replace');
    expect(summary.sessionsAdded).toBe(1);
    expect(await b.trainingProgram.get('me')).toEqual(await a.trainingProgram.get('me'));
    expect(tmsForCycle(await allTmHistory(b), 1)).toEqual(TMS);
    expect(await b.cycles.toArray()).toEqual(await a.cycles.toArray());
    expect(await b.workoutSessions.toArray()).toEqual(await a.workoutSessions.toArray());
    expect(await b.slotChoices.toArray()).toEqual(await a.slotChoices.toArray());
    expect((await b.profile.get('me'))?.targetBodyFatPct).toBe(12);
  });

  it('a pre-Story-5 backup (no training block) restores cleanly and leaves training empty', async () => {
    const a = await seeded();
    const file = await createBackup(a);
    const { training: _t, ...data } = file.data;
    const old = JSON.stringify({ ...file, data });
    const b = await seeded();
    await restoreBackup(b, parseBackup(old).file, 'replace');
    expect(await b.trainingProgram.count()).toBe(0);
    expect(await b.workoutSessions.count()).toBe(0);
    const c = await seeded();
    await restoreBackup(c, parseBackup(old).file, 'merge');
    expect(await c.workoutSessions.count()).toBe(1);
  });

  it('merge keeps the local program and adds sessions it does not have', async () => {
    const a = await seeded();
    await saveWorkoutSession(sessionFrom('s2', 1, 2, 'done'), a);
    const text = JSON.stringify(await createBackup(a));
    const b = await seeded();
    await addTm({ lift: 'bench', tmKg: 95, effectiveCycle: 1, reason: 'retest' }, b);
    const summary = await restoreBackup(b, parseBackup(text).file, 'merge');
    expect(summary.sessionsAdded).toBe(1);
    expect(await b.workoutSessions.count()).toBe(2);
    expect(tmsForCycle(await allTmHistory(b), 1).bench).toBe(95);
  });

  it('rejects a malformed training block without touching data', async () => {
    const a = await seeded();
    const file = await createBackup(a);
    const bad = JSON.stringify({ ...file, data: { ...file.data, training: { ...file.data.training, cycles: [{ index: 1, block: 'Z' }] } } });
    expect(() => parseBackup(bad)).toThrow(/training\.cycles\[0\]/);
  });

  it('Delete all clears training too', async () => {
    const a = await seeded();
    await deleteAllData(a);
    for (const t of [a.trainingProgram, a.tmHistory, a.cycles, a.workoutSessions, a.slotChoices]) expect(await t.count()).toBe(0);
  });
});
