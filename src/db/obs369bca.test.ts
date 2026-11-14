/** OBS-369BCA: Philip can restructure the plan (exercise order), not just tweak rest. */
import { describe, expect, it } from 'vitest';
import { applyCoachProposals, deleteWorkoutSession, saveCoachThread, saveWorkoutSession, setDayOrder, setUpTraining, startCycle } from './repo';
import { createBackup, parseBackup, restoreBackup } from '../lib/backup';
import { chatPrompt, parseCoachTurn, reportPrompt, targetKey, validateChange, type CoachContext } from '../lib/training/coach';
import { buildSession } from '../lib/training/session';
import { createSession } from '../lib/training/sessionLog';
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
const done = (id = 's1'): WorkoutSession => ({
  ...createSession(buildSession({ cycle: 1, week: 1, day: 2, phase: 'gain', tms: TMS, weightUnit: 'kg' }), id, '2026-11-09', 10),
  status: 'done',
  finishedAt: 20,
});
const ctx = (dayOrder?: CoachContext['dayOrder']): CoachContext => ({
  session: done(),
  phase: 'gain',
  tms: TMS,
  trainingDays: [1, 2, 4, 5],
  choices: {},
  unit: 'kg',
  name: (id) => id,
  dayOrder,
});

async function setup() {
  const db = await freshDb();
  await setUpTraining({ bar: { barKg: 20, plateUnit: 'lb', plates: [45, 25, 10, 5, 2.5] }, weightUnit: 'kg', tms: TMS }, db);
  await startCycle(cycleRecord, db);
  return db;
}

const thread = (): CoachThread => ({
  report: 'Upper chest first from now on.',
  proposals: [
    { id: 'o', change: { kind: 'order', day: 2, order: ['A2', 'A1', 'B'] }, why: 'Incline first while fresh', status: 'open' },
    { id: 'n', change: { kind: 'next', exerciseId: 'incline-db-press', kg: null, reps: null, sets: 4 }, why: '', status: 'open' },
  ],
  messages: [],
  createdAt: 1,
  updatedAt: 1,
});

describe('OBS-369BCA: plan-level proposals', () => {
  it('the prompt shows the whole plan and asks for restructuring on a stated priority', () => {
    const p = chatPrompt(ctx(), { ...thread(), proposals: [] }, 'My upper chest is drastically weaker; optimise my plan for it.');
    expect(p).toContain('day 2 (bench day) order: main > A1 > A2 > B');
    expect(p).toContain('"kind":"order"');
    expect(p).toContain('treat it as a request to restructure the plan, not to tweak rest');
    expect(reportPrompt(ctx({ '2': ['main', 'B', 'A1', 'A2'] }))).toContain('day 2 (bench day) order: main > B > A1 > A2');
  });

  it('validates order proposals: all three slots once, a real day, an actual change', () => {
    expect(validateChange({ kind: 'order', day: 2, order: ['A2', 'A1', 'B'] }, ctx())).toEqual({ kind: 'order', day: 2, order: ['A2', 'A1', 'B'] });
    expect(validateChange({ kind: 'order', day: 2, order: ['A1', 'A2', 'B'] }, ctx())).toBeNull(); // no change
    expect(validateChange({ kind: 'order', day: 2, order: ['A2', 'A1', 'B'] }, ctx({ '2': ['main', 'A2', 'A1', 'B'] }))).toBeNull();
    expect(validateChange({ kind: 'order', day: 2, order: ['A2', 'A1'] }, ctx())).toBeNull();
    expect(validateChange({ kind: 'order', day: 2, order: ['A2', 'A2', 'B'] }, ctx())).toBeNull();
    expect(validateChange({ kind: 'order', day: 2, order: ['main', 'A2', 'A1'] }, ctx())).toBeNull();
    expect(validateChange({ kind: 'order', day: 5, order: ['A2', 'A1', 'B'] }, ctx())).toBeNull();
    expect(targetKey({ kind: 'order', day: 3, order: ['B', 'A1', 'A2'] })).toBe('order:3');
    const turn = parseCoachTurn(
      { message: 'Incline goes first now.', changes: [{ kind: 'order', day: 2, order: ['A2', 'A1', 'B'], why: 'fresh' }, { kind: 'rest', extraSec: 45, why: 'recover' }] },
      ctx(),
    );
    expect(turn?.changes.map((c) => c.change.kind)).toEqual(['order', 'rest']);
  });

  it('applying sets the day order; deleting the log puts it back unless reordered since', async () => {
    const db = await setup();
    await saveWorkoutSession(done(), db);
    await saveCoachThread('s1', thread(), db);
    expect(await applyCoachProposals('s1', ['o', 'n'], db)).toEqual(['o', 'n']);
    expect((await db.trainingProgram.get('me'))?.dayOrder).toEqual({ '2': ['main', 'A2', 'A1', 'B'] });
    expect((await db.workoutSessions.get('s1'))?.reviewApplied?.orders).toEqual([{ day: 2, from: null, to: ['main', 'A2', 'A1', 'B'] }]);
    // Backup round trip keeps the proposal and what it applied.
    const text = JSON.stringify(await createBackup(db));
    const b = await freshDb();
    await restoreBackup(b, parseBackup(text).file, 'replace');
    expect((await b.workoutSessions.get('s1'))?.reviewApplied?.orders).toEqual([{ day: 2, from: null, to: ['main', 'A2', 'A1', 'B'] }]);
    expect((await b.workoutSessions.get('s1'))?.coach?.proposals[0]?.change).toEqual({ kind: 'order', day: 2, order: ['A2', 'A1', 'B'] });
    // Undo.
    await deleteWorkoutSession('s1', db);
    expect((await db.trainingProgram.get('me'))?.dayOrder?.['2']).toBeUndefined();
  });

  it('an order the owner changed after applying is left alone on delete', async () => {
    const db = await setup();
    await setDayOrder(2, ['main', 'B', 'A1', 'A2'], db);
    await saveWorkoutSession(done(), db);
    await saveCoachThread('s1', thread(), db);
    await applyCoachProposals('s1', ['o'], db);
    await setDayOrder(2, ['main', 'A1', 'B', 'A2'], db);
    await deleteWorkoutSession('s1', db);
    expect((await db.trainingProgram.get('me'))?.dayOrder?.['2']).toEqual(['main', 'A1', 'B', 'A2']);
  });

  it('delete restores the previous custom order', async () => {
    const db = await setup();
    await setDayOrder(2, ['main', 'B', 'A1', 'A2'], db);
    await saveWorkoutSession(done(), db);
    await saveCoachThread('s1', thread(), db);
    await applyCoachProposals('s1', ['o'], db);
    await deleteWorkoutSession('s1', db);
    expect((await db.trainingProgram.get('me'))?.dayOrder?.['2']).toEqual(['main', 'B', 'A1', 'A2']);
  });
});
