/** Story 16 (D-039): today's plan follows the playbook (§3.2) and the one-time load sweep (§3.3). AC 5, AC 7. */
import { describe, expect, it } from 'vitest';
import { freshDb } from '../test/helpers';
import { addTargetPlan, saveWorkoutSession, setUpTraining, startCycle, updateProfile, updateTrainingProgram } from './repo';
import { canUndoPlaybook, getPlaybookUpdate, markPlaybookFresh, needsPlaybookUpdate, PLAYBOOK_UNDO_MS, runPlaybookUpdate, undoPlaybookUpdate } from './playbookRepo';
import type { CycleRecord, FoodEntry, WorkoutSession } from './types';
import { planForDate } from '../lib/nutrition';
import { playbookReplan } from '../lib/playbook/replan';
import { sweepNextOrders } from '../lib/playbook/sweep';
import { loadProfileFrom } from '../lib/playbook/loadContext';
import { fatFloorG } from '../lib/playbook/rules';
import { buildSession } from '../lib/training/session';
import { createSession } from '../lib/training/sessionLog';
import { DEFAULT_BAR_SETUP, KG_PER_LB } from '../lib/training/plates';

const TMS = { squat: 135, bench: 90, rdl: 103.5, ohp: 45 };
const cycle1: CycleRecord = {
  index: 1,
  block: 'A',
  startedAt: new Date(2026, 10, 2).getTime(),
  phase: 'gain',
  tms: TMS,
  goal: { startWeightKg: 73, startBfPct: 15, endWeightKg: 75, weeklyRatePct: 0.5, bfLinePct: 15, source: 'user', targetPlanId: null },
};
const TODAY = '2026-11-15';

/** A bulk plan made under the old rules: 0.5%/week (now above the 1–3 year band), fat at the old 25% floor. */
async function setup(trainingYears: number | null = 2) {
  const db = await freshDb();
  await updateProfile({ sex: 'male', heightCm: 178, birthDate: '1998-01-01', activityLevel: 'moderate', goal: 'gain', weightKg: 73, bodyFatPct: null, trainingYears }, db);
  await setUpTraining({ bar: { barKg: 20, plateUnit: 'lb', plates: [45, 25, 10, 5, 2.5] }, weightUnit: 'lb', tms: TMS }, db);
  await startCycle(cycle1, db);
  await addTargetPlan({ effectiveFrom: '2026-11-02', calories: 3200, proteinG: 100, fatG: 40, carbsG: 610, method: 'calculated', inputsSnapshot: { goal: 'gain', weightKg: 73 }, weekdayOverrides: null }, db);
  return db;
}

const food = (id: string): FoodEntry => ({ id, date: TODAY, meal: 'breakfast', name: 'Oats', grams: 80, calories: 300, proteinG: 10, fatG: 5, carbsG: 50, source: 'manual', savedFoodId: null, estimate: null, createdAt: 1, updatedAt: 1 });

describe('§3.2: today’s plan follows the playbook (AC 5)', () => {
  it('pure: calories into the training-age band, protein into its band, fat up to its floor, split re-solved — each with its PB ID', () => {
    const r = playbookReplan({
      plan: { id: 1, effectiveFrom: '2026-11-02', calories: 3200, proteinG: 100, fatG: 40, carbsG: 610, method: 'calculated', inputsSnapshot: { goal: 'gain', weightKg: 73 }, weekdayOverrides: null, createdAt: 1 },
      today: TODAY,
      now: 2,
      sex: 'male',
      weightKg: 73,
      heightCm: 178,
      bodyFatPct: null,
      trainingYears: 2,
      maintenanceKcal: 2800,
      trainingDays: [1, 2, 4, 5],
      carbOn: true,
    });
    const by = Object.fromEntries(r.changes.map((c) => [c.field, c]));
    // 3,200 at 2,800 maintenance = +0.55%/week; the 1–3 year band tops out at 0.35% → 2,800 + 0.35% × 73 × 7,700 ÷ 7.
    expect(by.calories).toMatchObject({ before: 3200, after: 3080, pbIds: ['PB-2.3'] });
    expect(by.proteinG).toMatchObject({ before: 100, after: Math.round(1.6 * 73), pbIds: ['PB-3.1'] });
    expect(by.fatG?.after).toBe(Math.ceil(fatFloorG(3080, 73)));
    expect(by.fatG?.pbIds).toEqual(['PB-3.2']);
    expect(by.carbsG?.pbIds).toEqual(['PB-3.3']);
    expect(r.splitChanged).toBe(true);
    expect(r.plan).toMatchObject({ effectiveFrom: TODAY, calories: 3080, method: 'calculated' });
  });

  it('a manual plan is left alone; a high BF only suggests a cut (the phase never changes by itself)', () => {
    const base = { id: 1, effectiveFrom: '2026-11-02', calories: 2500, proteinG: 150, fatG: 70, carbsG: 300, createdAt: 1, weekdayOverrides: null };
    const manual = playbookReplan({ plan: { ...base, method: 'manual', inputsSnapshot: null }, today: TODAY, now: 2, sex: 'male', weightKg: 80, heightCm: 180, bodyFatPct: 20, trainingYears: 2, maintenanceKcal: 2600, trainingDays: [1, 2, 4, 5], carbOn: false });
    expect(manual).toMatchObject({ plan: null, manual: true, suggestCut: true });
    const bulk = playbookReplan({ plan: { ...base, method: 'calculated', inputsSnapshot: { goal: 'gain', weightKg: 80 } }, today: TODAY, now: 2, sex: 'male', weightKg: 80, heightCm: 180, bodyFatPct: 20, trainingYears: 2, maintenanceKcal: 2400, trainingDays: [1, 2, 4, 5], carbOn: false });
    expect(bulk.suggestCut).toBe(true);
    expect(bulk.plan?.inputsSnapshot?.goal).toBe('gain');
  });

  it('on first launch today’s targets change, logged food stays, the record has before → after with PB IDs, Undo restores the old plan', async () => {
    const db = await setup();
    await db.foodEntries.put(food('f1'));
    expect(await needsPlaybookUpdate(db)).toBe(true);
    const rec = await runPlaybookUpdate(TODAY, db);
    expect(rec.status).toBe('applied');
    expect(rec.changes.length).toBeGreaterThan(0);
    expect(rec.changes.every((c) => c.pbIds.every((id) => /^PB-\d/.test(id)))).toBe(true);
    const now = planForDate(await db.targetPlans.toArray(), TODAY)!;
    expect(now.calories).not.toBe(3200);
    expect(now.fatG).toBeGreaterThanOrEqual(Math.floor(fatFloorG(now.calories, 73)));
    expect(await db.foodEntries.count()).toBe(1);
    // Append-only: the old plan is still there.
    expect(await db.targetPlans.count()).toBe(2);
    // Runs once.
    expect(await needsPlaybookUpdate(db)).toBe(false);
    expect((await runPlaybookUpdate(TODAY, db)).at).toBe(rec.at);
    expect(canUndoPlaybook(rec, rec.at + PLAYBOOK_UNDO_MS + 1)).toBe(false);
    await undoPlaybookUpdate(TODAY, db);
    expect(planForDate(await db.targetPlans.toArray(), TODAY)).toMatchObject({ calories: 3200, proteinG: 100, fatG: 40, carbsG: 610 });
    expect((await getPlaybookUpdate(db))?.status).toBe('undone');
    expect(await db.foodEntries.count()).toBe(1);
  });

  it('a new install is marked done and never asked', async () => {
    const db = await freshDb();
    expect(await needsPlaybookUpdate(db)).toBe(false);
    await markPlaybookFresh(db);
    expect((await getPlaybookUpdate(db))?.status).toBe('fresh');
  });
});

/** A finished day-3 session where the walking lunge was logged at 80 lb per hand (a total typed as per hand). */
function lungeSession(): WorkoutSession {
  const s = createSession(buildSession({ cycle: 1, week: 1, day: 3, phase: 'gain', tms: TMS, weightUnit: 'lb' }), 's1', '2026-11-10', 1000);
  return {
    ...s,
    status: 'done',
    finishedAt: 2000,
    exercises: s.exercises.map((e) => (e.exerciseId === 'walking-lunge' ? { ...e, actual: e.actual.map((a) => ({ ...a, kg: 80 * KG_PER_LB, reps: 10, done: true })) } : e)),
  };
}

describe('§3.3: the one-time sweep (AC 7)', () => {
  it('pure: fixes an implausible stored next order and lists it; plausible ones are untouched', () => {
    const s = lungeSession();
    const res = sweepNextOrders({
      overrides: [{ exerciseId: 'walking-lunge', afterSessionId: 's1', kg: 85 * KG_PER_LB, reps: 10, sets: 3 }],
      sessions: [s],
      block: 'A',
      choices: {},
      profile: loadProfileFrom(TMS, 73),
      unit: 'lb',
      bar: DEFAULT_BAR_SETUP,
    });
    const fix = res.fixes.find((f) => f.exerciseId === 'walking-lunge');
    expect(fix).toMatchObject({ source: 'override' });
    expect(Math.round(fix!.fromKg / KG_PER_LB)).toBe(85);
    expect(fix!.toKg).toBeLessThan(20);
    expect(res.overrides[0]!.kg).toBe(fix!.toKg);
    expect(res.fixes.every((f) => f.exerciseId === 'walking-lunge' || f.source === 'next')).toBe(true);
  });

  it('the update stores the fixed order and lists it; Undo puts the old one back', async () => {
    const db = await setup();
    await saveWorkoutSession(lungeSession(), db);
    await updateTrainingProgram({ nextOverrides: [{ exerciseId: 'walking-lunge', afterSessionId: 's1', kg: 85 * KG_PER_LB, reps: 10, sets: 3 }] }, db);
    const rec = await runPlaybookUpdate(TODAY, db);
    expect(rec.loads.some((l) => l.exerciseId === 'walking-lunge' && l.source === 'override')).toBe(true);
    const fixed = (await db.trainingProgram.get('me'))!.nextOverrides![0]!;
    expect(fixed.kg!).toBeLessThan(20);
    await undoPlaybookUpdate(TODAY, db);
    expect(Math.round((await db.trainingProgram.get('me'))!.nextOverrides![0]!.kg! / KG_PER_LB)).toBe(85);
  });
});
