/** Story 11: goal plan Apply / Undo, the v6 migration, backups and the cloud client. */
import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { freshDb } from '../test/helpers';
import { PhilipDB } from './db';
import { addPlanChange, applyGoalPlan, canUndo, firedPrompts, GoalApplyError, markPromptFired, undoGoalPlan, UNDO_WINDOW_MS } from './goalRepo';
import { addTargetPlan, saveWorkoutSession, setUpTraining, startCycle, updateProfile } from './repo';
import type { CycleRecord, GoalPlanItems, PlanChange, WorkoutSession } from './types';
import { createBackup, parseBackup, restoreBackup } from '../lib/backup';
import { buildSession } from '../lib/training/session';
import { createSession } from '../lib/training/sessionLog';
import { slotKey, menuSlot } from '../lib/training/exercises';
import { planForDate } from '../lib/nutrition';
import { tmsForCycle } from '../lib/training/progress';
import { askCloud, cloudJob, CloudError, pingCloud } from '../services/coachCloud';

const TMS = { squat: 135, bench: 90, rdl: 103.5, ohp: 45 };
const cycle1: CycleRecord = {
  index: 1,
  block: 'A',
  startedAt: new Date(2026, 10, 2).getTime(),
  phase: 'gain',
  tms: TMS,
  goal: { startWeightKg: 73, startBfPct: 15, endWeightKg: 75, weeklyRatePct: 0.68, bfLinePct: 15, source: 'user', targetPlanId: null },
};

function done(id: string, date: string, week: 1 | 2 | 3 | 4, day: 1 | 2 | 3 | 4, keyReps: number): WorkoutSession {
  const s = createSession(buildSession({ cycle: 1, week, day, phase: 'gain', tms: TMS, weightUnit: 'kg' }), id, date, 1000);
  return {
    ...s,
    status: 'done',
    finishedAt: 2000,
    exercises: s.exercises.map((e) => ({
      ...e,
      actual: e.actual.map((a) => {
        const p = e.prescription.find((x) => x.order === a.order)!;
        return { ...a, kg: p.kg ?? 0, reps: p.kind === 'amrap' || p.kind === 'top' ? keyReps : (p.targetReps ?? p.repMin), done: true };
      }),
    })),
  };
}

const choice = { phase: 'gain' as const, startWeightKg: 75.1, startBfPct: 15, endWeightKg: 77.1, weeklyRatePct: 0.67, bfLinePct: 15, source: 'repeat' as const };

function change(over: Partial<PlanChange> = {}): Omit<PlanChange, 'id'> {
  return {
    at: Date.now(),
    cycle: 1,
    event: 'reached',
    reason: 'weight',
    restart: true,
    choice,
    status: 'ready',
    prompt: 'P',
    jobId: null,
    ranges: null,
    proposal: { message: 'Go.', kcal: 3000, proteinG: 150, cardioMin: 20, days: [1, 2, 4, 6], swaps: [], why: {}, clamps: [], remember: ['Likes Saturday sessions'], source: { kind: 'gemini-cloud', model: 'm' }, at: 1 },
    accepted: null,
    undo: null,
    appliedAt: null,
    ...over,
  };
}

async function setup() {
  const db = await freshDb();
  await updateProfile({ sex: 'male', heightCm: 184, birthDate: '1998-01-01', activityLevel: 'moderate', goal: 'gain' }, db);
  await setUpTraining({ bar: { barKg: 20, plateUnit: 'lb', plates: [45, 25, 10, 5, 2.5] }, weightUnit: 'lb', tms: TMS }, db);
  await startCycle(cycle1, db);
  await addTargetPlan({ effectiveFrom: '2026-11-02', calories: 2800, proteinG: 140, fatG: 80, carbsG: 350, method: 'calculated', inputsSnapshot: { weightKg: 73 }, weekdayOverrides: null }, db);
  // Week 1 done: squat hit, bench missed its + set; RDL and OHP not logged yet.
  await saveWorkoutSession(done('s1', '2026-11-03', 1, 1, 8), db);
  await saveWorkoutSession(done('s2', '2026-11-04', 1, 2, 2), db);
  return db;
}

const all: GoalPlanItems = { kcal: 3000, proteinG: 150, cardioMin: 20, days: [1, 2, 4, 6], swaps: [] };

describe('apply a goal plan (goal reached → new cycle)', () => {
  it('ends the cycle, progresses TMs from what was logged, starts the next block with the new goal, food and training', async () => {
    const db = await setup();
    const id = await addPlanChange(change(), db);
    const slot = menuSlot(2, 'A1', 'B');
    const next = await applyGoalPlan(id, { ...all, swaps: [{ day: 2, slot: 'A1', exerciseId: slot.swaps[0]! }] }, '2026-11-18', 'Reached 75 kg.', db);
    expect(next).toBe(2);
    const program = await db.trainingProgram.get('me');
    expect(program).toMatchObject({ currentCycle: 2, trainingDays: [1, 2, 4, 6] });
    const old = await db.cycles.get(1);
    expect(old?.endedEarly?.reason).toBe('goal-reached');
    expect(old?.reachedAt).toBe('2026-11-18');
    const c2 = await db.cycles.get(2);
    expect(c2).toMatchObject({ block: 'B', phase: 'gain', cardioMin: 20, goal: { startWeightKg: 75.1, endWeightKg: 77.1, bfLinePct: 15, source: 'user' } });
    // Squat hit → +5; bench missed → holds; RDL/OHP not logged → hold.
    const tms = tmsForCycle(await db.tmHistory.toArray(), 2);
    expect(tms).toEqual({ squat: 140, bench: 90, rdl: 103.5, ohp: 45 });
    // Old logs untouched.
    expect(await db.workoutSessions.count()).toBe(2);
    const plan = planForDate(await db.targetPlans.toArray(), '2026-11-18');
    expect(plan).toMatchObject({ calories: 3000, proteinG: 150 });
    expect(plan?.inputsSnapshot?.source).toBe('goalPlan');
    expect(c2?.goal.targetPlanId).toBe(plan?.id);
    expect((await db.slotChoices.get(slotKey(2, 'A1', 'B')))?.exerciseId).toBe(slot.swaps[0]);
    expect((await db.profile.get('me'))?.targetWeightKg).toBe(77.1);
    expect((await db.coachNotes.toArray()).map((n) => n.text)).toEqual(['Reached 75 kg.', 'Likes Saturday sessions']);
    expect((await db.planChanges.get(id))?.status).toBe('applied');
  });

  it('only the levers left on are applied', async () => {
    const db = await setup();
    const id = await addPlanChange(change(), db);
    await applyGoalPlan(id, { kcal: null, proteinG: null, cardioMin: null, days: null, swaps: [] }, '2026-11-18', null, db);
    expect(planForDate(await db.targetPlans.toArray(), '2026-11-18')?.calories).toBe(2800);
    expect((await db.trainingProgram.get('me'))?.trainingDays).toBeUndefined();
    expect((await db.cycles.get(2))?.cardioMin).toBeUndefined();
  });

  it('refuses with a workout open, or twice', async () => {
    const db = await setup();
    const id = await addPlanChange(change(), db);
    const open = createSession(buildSession({ cycle: 1, week: 1, day: 3, phase: 'gain', tms: TMS, weightUnit: 'kg' }), 'open', '2026-11-18', 5);
    await saveWorkoutSession(open, db);
    await expect(applyGoalPlan(id, all, '2026-11-18', null, db)).rejects.toMatchObject({ code: 'workoutOpen' });
    await db.workoutSessions.delete('open');
    await applyGoalPlan(id, all, '2026-11-18', null, db);
    await expect(applyGoalPlan(id, all, '2026-11-18', null, db)).rejects.toBeInstanceOf(GoalApplyError);
  });

  it('Undo restores the old cycle, food, days, swaps, profile and notes; not after a new session', async () => {
    const db = await setup();
    const id = await addPlanChange(change(), db);
    const slot = menuSlot(2, 'A1', 'B');
    await applyGoalPlan(id, { ...all, swaps: [{ day: 2, slot: 'A1', exerciseId: slot.swaps[0]! }] }, '2026-11-18', 'note', db);
    const pc = (await db.planChanges.get(id))!;
    expect(canUndo(pc, await db.workoutSessions.toArray(), Date.now())).toBe('ok');
    expect(canUndo(pc, [], Date.now() + UNDO_WINDOW_MS + 1)).toBe('expired');
    expect(canUndo(pc, [{ cycle: 2 }], Date.now())).toBe('trained');
    await undoGoalPlan(id, '2026-11-18', db);
    expect((await db.trainingProgram.get('me'))?.currentCycle).toBe(1);
    expect((await db.trainingProgram.get('me'))?.trainingDays).toBeUndefined();
    expect(await db.cycles.get(2)).toBeUndefined();
    expect((await db.cycles.get(1))?.endedEarly).toBeUndefined();
    expect(planForDate(await db.targetPlans.toArray(), '2026-11-18')?.calories).toBe(2800);
    expect(await db.slotChoices.get(slotKey(2, 'A1', 'B'))).toBeUndefined();
    expect((await db.profile.get('me'))?.targetWeightKg).toBeNull();
    expect(await db.coachNotes.count()).toBe(0);
    expect((await db.planChanges.get(id))?.status).toBe('undone');
    // The cycle can be started again later: the new rows win over the undone ones.
    const id2 = await addPlanChange(change(), db);
    await applyGoalPlan(id2, all, '2026-11-19', null, db);
    expect(tmsForCycle(await db.tmHistory.toArray(), 2).squat).toBe(140);
  });
});

describe('off track, same cycle', () => {
  it('keeps the cycle and its goal; food, cardio and days change now', async () => {
    const db = await setup();
    const id = await addPlanChange(change({ event: 'offtrack', reason: 'stalled', restart: false, choice: { ...choice, startWeightKg: 73.1, endWeightKg: 75, source: 'user' } }), db);
    expect(await applyGoalPlan(id, all, '2026-11-24', null, db)).toBeNull();
    const c1 = await db.cycles.get(1);
    expect(c1?.endedEarly).toBeUndefined();
    expect(c1?.goal.endWeightKg).toBe(75);
    expect(c1?.cardioMin).toBe(20);
    expect((await db.trainingProgram.get('me'))?.currentCycle).toBe(1);
    expect(planForDate(await db.targetPlans.toArray(), '2026-11-24')?.calories).toBe(3000);
    await undoGoalPlan(id, '2026-11-24', db);
    expect((await db.cycles.get(1))?.cardioMin).toBeUndefined();
  });
});

describe('prompts, migration and backup', () => {
  it('each event is remembered once', async () => {
    const db = await freshDb();
    await markPromptFired({ cycle: 1, kind: 'reached', reason: 'weight' }, db);
    await markPromptFired({ cycle: 1, kind: 'reached', reason: 'weight' }, db);
    expect(await firedPrompts(db)).toEqual([{ cycle: 1, kind: 'reached', reason: 'weight' }]);
  });

  it('body fat remembers the day it changed', async () => {
    const db = await freshDb();
    await updateProfile({ bodyFatPct: 15 }, db);
    expect((await db.profile.get('me'))?.bodyFatDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await updateProfile({ bodyFatPct: 15.5, bodyFatDate: '2026-11-01' }, db);
    expect((await db.profile.get('me'))?.bodyFatDate).toBe('2026-11-01');
  });

  it('v5 → v6 keeps every record and adds an empty planChanges table', async () => {
    const name = `v5-${Date.now()}`;
    const v5 = new Dexie(name);
    v5.version(5).stores({
      profile: 'id',
      targetPlans: '++id, effectiveFrom',
      foodEntries: 'id, date, createdAt, savedFoodId, name',
      savedFoods: 'id, name, lastUsedAt, useCount',
      meta: 'key',
      weightEntries: 'date',
      savedMeals: 'id, name, lastUsedAt',
      trainingProgram: 'id',
      tmHistory: '++id, lift, effectiveCycle',
      cycles: 'index',
      workoutSessions: 'id, date, [cycle+week+day], status',
      slotChoices: 'slotKey',
      coachNotes: '++id, createdAt',
      coachMessages: '++id, at',
    });
    await v5.open();
    await v5.table('cycles').put(cycle1);
    await v5.table('coachNotes').add({ text: 'keep', source: 'ask', sessionId: null, createdAt: 1 });
    v5.close();
    const db = new PhilipDB(name);
    await db.open();
    expect(db.verno).toBe(6);
    expect(await db.cycles.get(1)).toMatchObject({ index: 1 });
    expect(await db.coachNotes.count()).toBe(1);
    expect(await db.planChanges.count()).toBe(0);
    db.close();
  });

  it('backup round-trips cycles with the new fields and plan history (Undo data dropped); old backups restore', async () => {
    const db = await setup();
    const id = await addPlanChange(change(), db);
    await applyGoalPlan(id, all, '2026-11-18', null, db);
    await addPlanChange(change({ status: 'waiting', at: Date.now() + 5 }), db);
    const text = JSON.stringify(await createBackup(db));
    const parsed = parseBackup(text).file;
    expect(parsed.schemaVersion).toBe(1);
    const b = await freshDb();
    await restoreBackup(b, parsed, 'replace');
    expect((await b.cycles.get(1))?.reachedAt).toBe('2026-11-18');
    expect((await b.cycles.get(2))?.cardioMin).toBe(20);
    const restored = await b.planChanges.orderBy('at').toArray();
    expect(restored.map((c) => c.status)).toEqual(['applied', 'dismissed']);
    expect(restored.every((c) => c.undo === null)).toBe(true);
    await restoreBackup(b, parsed, 'merge');
    expect(await b.planChanges.count()).toBe(2);
    const old = JSON.parse(text);
    delete old.data.training.planChanges;
    const c = await freshDb();
    await restoreBackup(c, parseBackup(JSON.stringify(old)).file, 'replace');
    expect(await c.planChanges.count()).toBe(0);
  });
});

describe('cloud client', () => {
  const opts = (f: typeof fetch) => ({ url: 'https://w.example', token: 'tok', fetchImpl: f });
  it('sends the token, returns the text, or a queued job', async () => {
    let seen: RequestInit | undefined;
    const r = await askCloud('P', opts(async (_u, init) => {
      seen = init;
      return new Response(JSON.stringify({ text: '{"a":1}', model: 'm' }), { status: 200 });
    }) as never);
    expect(r).toEqual({ status: 'ok', text: '{"a":1}', model: 'm' });
    expect((seen?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const q = await askCloud('P', { ...opts((async () => new Response(JSON.stringify({ jobId: 'abc' }), { status: 202 })) as never), queue: true });
    expect(q).toEqual({ status: 'queued', jobId: 'abc' });
  });

  it('maps refusals and polls jobs', async () => {
    await expect(askCloud('P', opts((async () => new Response('{}', { status: 401 })) as never))).rejects.toMatchObject({ code: 'unauthorized' });
    await expect(askCloud('P', opts((async () => new Response('{}', { status: 429 })) as never))).rejects.toBeInstanceOf(CloudError);
    await expect(askCloud('P', { ...opts((async () => new Response('{}')) as never), token: null })).rejects.toMatchObject({ code: 'notPaired' });
    expect(await cloudJob('abc', opts((async () => new Response(JSON.stringify({ status: 'waiting' }))) as never))).toEqual({ status: 'waiting' });
    expect(await cloudJob('abc', opts((async () => new Response(JSON.stringify({ status: 'done', text: 'T', model: 'm' }))) as never))).toEqual({ status: 'ok', text: 'T', model: 'm' });
    expect(await cloudJob('abc', opts((async () => new Response('{}', { status: 404 })) as never))).toEqual({ status: 'gone' });
    expect(await pingCloud('tok', { url: 'https://w.example', fetchImpl: (async () => new Response('{}', { status: 401 })) as never })).toBe('unauthorized');
  });
});
