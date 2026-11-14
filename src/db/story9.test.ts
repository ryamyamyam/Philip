/** Story 9: Philip's memory — brief, notes, Ask chat, backup, migration, sharing toggle. */
import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import {
  addCoachMessage,
  addCoachNotes,
  clearCoachNotes,
  MEMORY,
  META,
  saveCoachThread,
  saveWorkoutSession,
  setMeta,
  setUpTraining,
  startCycle,
} from './repo';
import { loadBrief } from './coachBrief';
import { PhilipDB } from './db';
import { createBackup, parseBackup, restoreBackup } from '../lib/backup';
import { BRIEF_BUDGET, buildBrief, exerciseHistory, topSet, type BriefInput } from '../lib/coach/brief';
import { askPrompt, parseAskReply, parseRemember } from '../lib/coach/memory';
import { chatPrompt, parseCoachTurn, reportPrompt, type CoachContext } from '../lib/training/coach';
import { buildSession } from '../lib/training/session';
import { createSession } from '../lib/training/sessionLog';
import { freshDb } from '../test/helpers';
import type { CycleRecord, WorkoutSession } from './types';

const TMS = { squat: 100, bench: 90, rdl: 103.5, ohp: 45 };
const cycleRecord: CycleRecord = {
  index: 1,
  block: 'A',
  startedAt: new Date(2026, 10, 2).getTime(),
  phase: 'gain',
  tms: TMS,
  goal: { startWeightKg: 73, startBfPct: 15, endWeightKg: 74, weeklyRatePct: 0.3, bfLinePct: 16, source: 'philip', targetPlanId: null },
};

/** A done session with the main lift's work sets logged as ordered (+ reps on the key set). */
function doneSession(id: string, date: string, day: 1 | 2 | 3 | 4, keyReps = 8, extra: Partial<WorkoutSession> = {}): WorkoutSession {
  const s = createSession(buildSession({ cycle: 1, week: 1, day, phase: 'gain', tms: TMS, weightUnit: 'kg' }), id, date, 1000);
  const exercises = s.exercises.map((e) => ({
    ...e,
    actual: e.actual.map((a) => {
      const p = e.prescription.find((x) => x.order === a.order)!;
      const reps = p.kind === 'amrap' || p.kind === 'top' ? keyReps : (p.targetReps ?? p.repMin);
      return { ...a, kg: p.kg ?? 0, reps, done: true };
    }),
  }));
  return { ...s, exercises, status: 'done', finishedAt: 1000 + 45 * 60000, ...extra };
}

const name = (id: string) => id.replace(/-/g, ' ');

function input(over: Partial<BriefInput> = {}): BriefInput {
  return {
    today: '2026-11-10',
    profile: { sex: 'male', birthDate: '1996-05-01', heightCm: 178, bodyFatPct: 15, targetWeightKg: 75, targetBodyFatPct: 14 },
    weights: [
      { date: '2026-11-08', weightKg: 73.2, createdAt: 1, updatedAt: 1 },
      { date: '2026-11-09', weightKg: 73.4, createdAt: 1, updatedAt: 1 },
      { date: '2026-10-20', weightKg: 72.6, createdAt: 1, updatedAt: 1 },
    ],
    food: { days: [{ date: '2026-11-09', calories: 2500, proteinG: 150 }], target: { calories: 2600, proteinG: 150, fatG: 70, carbsG: 300 } },
    currentCycle: 1,
    cycles: [cycleRecord],
    tmHistory: (['squat', 'bench', 'rdl', 'ohp'] as const).map((lift, i) => ({ id: i, lift, tmKg: TMS[lift], effectiveCycle: 1, reason: 'setup' as const, createdAt: 1 })),
    sessions: [doneSession('a', '2026-11-02', 1, 9), doneSession('b', '2026-11-03', 2, 7), doneSession('c', '2026-11-09', 1, 10)],
    notes: [{ id: 1, text: 'Left knee complains on walking lunges', source: 'report', sessionId: 'a', createdAt: 5 }],
    chat: [
      { from: 'me', text: 'Can I train Saturday instead?', at: 10, where: 'Ask' },
      { from: 'philip', text: 'Saturday works. Keep two days between squat and RDL.', at: 11, where: 'Ask' },
    ],
    name,
    ...over,
  };
}

describe('Philip’s brief (pure)', () => {
  it('carries notes, lifter, program, every main lift’s history, workouts, accessories and chat', () => {
    const b = buildBrief(input());
    expect(b).toContain('Left knee complains on walking lunges');
    expect(b).toContain('Lifter: male, 30 y, 178 cm.');
    expect(b).toContain('7-day average 73.3 kg');
    expect(b).toContain('Food, last 7 days: logged 1 of 7 days; average on logged days 2500 kcal, 150 g protein; target 2600 kcal, 150 g protein.');
    expect(b).toContain('Program: cycle 1 (block A), phase gain, started 2026-11-02.');
    expect(b).toMatch(/- squat: 11-09 [\d.]+x10 \(e1RM [\d.]+\), 11-02 [\d.]+x9/);
    expect(b).toMatch(/- bench: 11-03 [\d.]+x7/);
    expect(b).toContain('2026-11-09 W1 D1 squat; 45 min');
    expect(b).toContain('Accessories, latest log each:');
    expect(b).toContain('[Ask] Lifter: Can I train Saturday instead?');
  });

  it('leaves out body and food when sharing is off', () => {
    const b = buildBrief(input({ profile: null, weights: [], food: null }));
    expect(b).toContain('body and food data not shared');
    expect(b).not.toContain('kcal');
    expect(b).not.toContain('73.3');
  });

  it('skips the session the prompt already details', () => {
    expect(buildBrief(input({ excludeSessionId: 'c' }))).not.toContain('2026-11-09 W1 D1');
  });

  it('never passes the character budget, cutting the lowest-priority lines first', () => {
    const many = Array.from({ length: 80 }, (_, i) => doneSession(`s${i}`, `2026-${String(9 + Math.floor(i / 28)).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`, (((i % 4) + 1) as 1 | 2 | 3 | 4), 8, { coach: { report: 'x'.repeat(300), proposals: [], messages: [], createdAt: 1, updatedAt: 1 } }));
    const notes = Array.from({ length: 40 }, (_, i) => ({ id: i, text: `note ${i} `.repeat(15), source: 'ask' as const, sessionId: null, createdAt: i }));
    const chat = Array.from({ length: 50 }, (_, i) => ({ from: 'me' as const, text: 'y'.repeat(500), at: i, where: 'Ask' }));
    const b = buildBrief(input({ sessions: many, notes, chat }));
    expect(b.length).toBeLessThanOrEqual(BRIEF_BUDGET.chars);
    expect(b).toContain('(brief cut short)');
    expect(b).toContain('Your notes about the lifter');
    expect(b.endsWith('--- end of brief ---')).toBe(true);
  });

  it('a realistic month stays well under the budget', () => {
    const month = Array.from({ length: 16 }, (_, i) => doneSession(`m${i}`, `2026-11-${String(i + 1).padStart(2, '0')}`, (((i % 4) + 1) as 1 | 2 | 3 | 4)));
    const b = buildBrief(input({ sessions: month }));
    expect(b.length).toBeLessThan(BRIEF_BUDGET.chars);
    expect(b).not.toContain('(brief cut short)');
  });

  it('topSet picks the key set; exerciseHistory lists the last logs', () => {
    const s = doneSession('a', '2026-11-02', 1, 9);
    const t = topSet(s)!;
    expect(t.lift).toBe('squat');
    expect(t.reps).toBe(9);
    expect(t.e1rm).not.toBeNull();
    const id = s.exercises.find((e) => e.slot !== 'main')!.exerciseId;
    expect(exerciseHistory([s], id, null)).toMatch(/^Earlier logs of this exercise \(kg x reps\): 2026-11-02: /);
    expect(exerciseHistory([s], id, 'a')).toBe('First time logging this exercise.');
  });
});

describe('remember + prompts', () => {
  it('parseRemember keeps at most 2 short, clean, distinct facts', () => {
    expect(parseRemember({ remember: ['  Gym has no leg press ', 'gym has no leg press', 'Prefers mornings', 'third'] })).toEqual(['Gym has no leg press', 'Prefers mornings']);
    expect(parseRemember({ remember: 'nope' })).toEqual([]);
    expect(parseRemember({ remember: ['x'.repeat(300)] })[0]).toHaveLength(140);
  });

  it('report and chat prompts carry the brief before today’s workout; replies carry remember', () => {
    const s = doneSession('c', '2026-11-09', 1);
    const c: CoachContext = { session: s, phase: 'gain', tms: TMS, trainingDays: [1, 2, 4, 5], choices: {}, unit: 'kg', name };
    const p = reportPrompt(c, 'BRIEF-TEXT');
    expect(p.indexOf('BRIEF-TEXT')).toBeGreaterThan(0);
    expect(p.indexOf('BRIEF-TEXT')).toBeLessThan(p.indexOf("Today's workout:"));
    expect(p).toContain('"remember": [string]');
    expect(chatPrompt(c, { report: 'r', proposals: [], messages: [], createdAt: 1, updatedAt: 1 }, 'hi', 'BRIEF-TEXT')).toContain('BRIEF-TEXT');
    expect(reportPrompt(c)).not.toContain('BRIEF');
    expect(parseCoachTurn({ message: 'ok', changes: [], remember: ['No dip station'] }, c)?.remember).toEqual(['No dip station']);
  });

  it('askPrompt sends the brief, the recent chat and the question; parseAskReply validates', () => {
    const p = askPrompt('BRIEF-TEXT', [{ from: 'me', text: 'earlier q', at: 1 }], 'How is my bench?');
    expect(p).toContain('BRIEF-TEXT');
    expect(p).toContain('Lifter: earlier q');
    expect(p.trim().endsWith('Lifter: How is my bench?')).toBe(true);
    expect(parseAskReply({ message: '' })).toBeNull();
    expect(parseAskReply({ message: 'Bench is up.', remember: ['Wants a 100 kg bench'] })).toEqual({ message: 'Bench is up.', remember: ['Wants a 100 kg bench'] });
  });
});

describe('memory in the database', () => {
  it('addCoachNotes dedupes and keeps the newest notesMax', async () => {
    const db = await freshDb();
    expect(await addCoachNotes(['No leg press', 'no  LEG press', ''], { source: 'ask', sessionId: null }, 1, db)).toBe(1);
    for (let i = 0; i < MEMORY.notesMax + 3; i++) await addCoachNotes([`fact ${i}`], { source: 'ask', sessionId: null }, 10 + i * 10, db);
    const all = await db.coachNotes.orderBy('createdAt').toArray();
    expect(all).toHaveLength(MEMORY.notesMax);
    expect(all.at(-1)?.text).toBe(`fact ${MEMORY.notesMax + 2}`);
    expect(all.some((n) => n.text === 'No leg press')).toBe(false);
    await clearCoachNotes(db);
    expect(await db.coachNotes.count()).toBe(0);
  });

  it('the Ask chat is trimmed to askMessagesMax', async () => {
    const db = await freshDb();
    for (let i = 0; i < MEMORY.askMessagesMax + 5; i++) await addCoachMessage({ from: 'me', text: `q${i}`, at: i }, db);
    expect(await db.coachMessages.count()).toBe(MEMORY.askMessagesMax);
    expect((await db.coachMessages.orderBy('at').first())?.text).toBe('q5');
  });

  it('loadBrief reads the whole history, other threads’ chats, and honours the sharing switch', async () => {
    const db = await freshDb();
    await setUpTraining({ bar: { barKg: 20, plateUnit: 'kg', plates: [20, 10, 5, 2.5, 1.25] }, weightUnit: 'kg', tms: TMS }, db);
    await startCycle(cycleRecord, db);
    await db.weightEntries.bulkPut([
      { date: '2026-11-08', weightKg: 73.2, createdAt: 1, updatedAt: 1 },
      { date: '2026-11-09', weightKg: 73.4, createdAt: 1, updatedAt: 1 },
    ]);
    await saveWorkoutSession(doneSession('a', '2026-11-02', 1, 9), db);
    await saveWorkoutSession(doneSession('b', '2026-11-09', 2, 7), db);
    await saveCoachThread('a', { report: 'Squat moved.', proposals: [], messages: [{ from: 'me', text: 'Knee felt odd on lunges', at: 3 }], createdAt: 1, updatedAt: 1 }, db);
    await addCoachNotes(['Left knee complains on lunges'], { source: 'report', sessionId: 'a' }, 4, db);
    await addCoachMessage({ from: 'me', text: 'What should I eat before squats?', at: 5 }, db);

    const b = await loadBrief('2026-11-10', { excludeSessionId: 'b' }, db);
    expect(b).toContain('Left knee complains on lunges');
    expect(b).toContain('[workout 2026-11-02] Lifter: Knee felt odd on lunges');
    expect(b).toContain('[Ask] Lifter: What should I eat before squats?');
    expect(b).toContain('7-day average 73.3 kg');
    expect(b).toMatch(/- bench: 11-09/);
    expect(b).not.toContain('2026-11-09 W1 D2');

    // The report for b excludes b's own chat lines (they're in the prompt already).
    await saveCoachThread('b', { report: 'r', proposals: [], messages: [{ from: 'me', text: 'ONLY-IN-B', at: 6 }], createdAt: 1, updatedAt: 1 }, db);
    expect(await loadBrief('2026-11-10', { excludeSessionId: 'b' }, db)).not.toContain('ONLY-IN-B');

    await setMeta(META.coachShareBody, false, db);
    const off = await loadBrief('2026-11-10', {}, db);
    expect(off).not.toContain('73.3');
    expect(off).toContain('body and food data not shared');
    expect(off).toContain('Left knee complains on lunges');
  });

  it('backup round-trips notes and the Ask chat; old backups restore with none', async () => {
    const db = await freshDb();
    await addCoachNotes(['No dip station'], { source: 'ask', sessionId: null }, 1, db);
    await addCoachMessage({ from: 'philip', text: 'Eat.', at: 2 }, db);
    const text = JSON.stringify(await createBackup(db));
    const parsed = parseBackup(text).file;
    expect(parsed.schemaVersion).toBe(1);
    const b = await freshDb();
    await restoreBackup(b, parsed, 'replace');
    expect((await b.coachNotes.toArray()).map((n) => n.text)).toEqual(['No dip station']);
    expect((await b.coachMessages.toArray()).map((m) => m.text)).toEqual(['Eat.']);
    // Merge doesn't duplicate.
    await restoreBackup(b, parsed, 'merge');
    expect(await b.coachNotes.count()).toBe(1);
    expect(await b.coachMessages.count()).toBe(1);
    // A backup without the fields (pre-Story 9) restores cleanly with none.
    const old = JSON.parse(text);
    delete old.data.training.coachNotes;
    delete old.data.training.coachMessages;
    const c = await freshDb();
    await addCoachNotes(['local'], { source: 'ask', sessionId: null }, 1, c);
    await restoreBackup(c, parseBackup(JSON.stringify(old)).file, 'replace');
    expect(await c.coachNotes.count()).toBe(0);
  });

  it('v4 → v5 keeps every record and adds the two empty tables', async () => {
    const dbName = `v4-${Date.now()}`;
    const v4 = new Dexie(dbName);
    v4.version(4).stores({
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
    });
    await v4.open();
    await v4.table('workoutSessions').put(doneSession('keep', '2026-11-02', 1));
    await v4.table('weightEntries').put({ date: '2026-11-02', weightKg: 73, createdAt: 1, updatedAt: 1 });
    v4.close();
    const db = new PhilipDB(dbName);
    await db.open();
    expect(db.verno).toBe(6);
    expect(await db.workoutSessions.get('keep')).toBeTruthy();
    expect(await db.weightEntries.count()).toBe(1);
    expect(await db.coachNotes.count()).toBe(0);
    expect(await db.coachMessages.count()).toBe(0);
    db.close();
  });
});
