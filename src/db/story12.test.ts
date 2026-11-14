/** Story 12: Re-plan with Philip (manual plans), goal dates, "Your time", backups. */
import { describe, expect, it } from 'vitest';
import { freshDb } from '../test/helpers';
import { applyAvailability, undoAvailability } from './availabilityRepo';
import { addPlanChange, applyGoalPlan, canUndo, undoGoalPlan, UNDO_WINDOW_MS } from './goalRepo';
import { addTargetPlan, saveWorkoutSession, setUpTraining, startCycle, updateProfile } from './repo';
import type { CycleRecord, GoalPlanItems, PlanChange, WorkoutSession } from './types';
import { createBackup, parseBackup, restoreBackup } from '../lib/backup';
import { clampDeadline, continuation, suggestDeadline, withDeadline } from '../lib/goal/deadline';
import { ownGoal, philipNextGoal, repeatGoal } from '../lib/goal/nextGoal';
import { leverRanges, parseProposal, proposalPrompt } from '../lib/goal/proposal';
import { goalWindow } from '../lib/goal/window';
import { isResolved, recentPlan, replanButton, REPLAN_RULES } from '../lib/goal/replan';
import { planForDate } from '../lib/nutrition';
import { calculateTargets, type CalcResult } from '../lib/targets';
import { cardioFor, clampWish, planAvailability } from '../lib/training/availability';
import { calcInputsForGoal } from '../lib/training/cycleGoal';
import { bestDays, closeTriples, planDates, trainingDaysOrDefault } from '../lib/training/schedule';
import { buildSession, SESSION_BUDGET_MIN } from '../lib/training/session';
import { createSession } from '../lib/training/sessionLog';

const TMS = { squat: 135, bench: 90, rdl: 103.5, ohp: 45 };
const cycle1: CycleRecord = {
  index: 1,
  block: 'A',
  startedAt: new Date(2026, 10, 2).getTime(),
  phase: 'gain',
  tms: TMS,
  goal: { startWeightKg: 73, startBfPct: 15, endWeightKg: 75, weeklyRatePct: 0.68, bfLinePct: 15, source: 'user', targetPlanId: null },
};
const keep = { phase: 'gain' as const, startWeightKg: 73.6, startBfPct: 15, endWeightKg: 75, weeklyRatePct: 0.6, bfLinePct: 15, source: 'user' as const };
const fresh = { phase: 'gain' as const, startWeightKg: 73.6, startBfPct: 15, endWeightKg: 76, weeklyRatePct: 0.41, bfLinePct: 16, source: 'user' as const, weeks: 8, deadline: '2027-01-06' };

function manual(over: Partial<PlanChange> = {}): Omit<PlanChange, 'id'> {
  return {
    at: Date.now(),
    cycle: 1,
    event: 'manual',
    reason: 'manual',
    restart: false,
    choice: keep,
    status: 'ready',
    prompt: 'P',
    jobId: null,
    ranges: null,
    proposal: { message: 'Small tune.', kcal: 2900, proteinG: 145, cardioMin: 20, days: [1, 2, 4, 6], swaps: [], why: {}, clamps: [], remember: [], source: { kind: 'claude-paste', model: null }, at: 1 },
    accepted: null,
    undo: null,
    appliedAt: null,
    ...over,
  };
}
const all: GoalPlanItems = { kcal: 2900, proteinG: 145, cardioMin: 20, days: [1, 2, 4, 6], swaps: [] };

function logged(id: string, date: string, cycle: number): WorkoutSession {
  const s = createSession(buildSession({ cycle, week: 1, day: 1, phase: 'gain', tms: TMS, weightUnit: 'kg' }), id, date, 1000);
  return { ...s, status: 'done', finishedAt: 2000 };
}

async function setup() {
  const db = await freshDb();
  await updateProfile({ sex: 'male', heightCm: 184, birthDate: '1998-01-01', activityLevel: 'moderate', goal: 'gain', weightKg: 73 }, db);
  await setUpTraining({ bar: { barKg: 20, plateUnit: 'lb', plates: [45, 25, 10, 5, 2.5] }, weightUnit: 'lb', tms: TMS }, db);
  await startCycle(cycle1, db);
  await addTargetPlan({ effectiveFrom: '2026-11-02', calories: 2800, proteinG: 140, fatG: 80, carbsG: 350, method: 'calculated', inputsSnapshot: { weightKg: 73 }, weekdayOverrides: null }, db);
  return db;
}

describe('manual plan: keep this goal', () => {
  it('applies the levers left on; the cycle, its goal and its logs stay', async () => {
    const db = await setup();
    await saveWorkoutSession(logged('s1', '2026-11-03', 1), db);
    const id = await addPlanChange(manual(), db);
    const next = await applyGoalPlan(id, { ...all, proteinG: null }, '2026-11-12', null, db);
    expect(next).toBeNull();
    const c = await db.cycles.get(1);
    expect(c?.endedEarly).toBeUndefined();
    expect(c?.goal).toEqual(cycle1.goal);
    expect(c?.cardioMin).toBe(20);
    expect((await db.trainingProgram.get('me'))).toMatchObject({ currentCycle: 1, trainingDays: [1, 2, 4, 6] });
    expect(planForDate(await db.targetPlans.toArray(), '2026-11-12')).toMatchObject({ calories: 2900, proteinG: 140 });
    expect(await db.workoutSessions.count()).toBe(1);
    expect(await db.cycles.count()).toBe(1);
  });

  it('Undo restores everything (24 h)', async () => {
    const db = await setup();
    const id = await addPlanChange(manual(), db);
    await applyGoalPlan(id, all, '2026-11-12', 'note', db);
    const pc = (await db.planChanges.get(id))!;
    expect(canUndo(pc, [], pc.appliedAt! + UNDO_WINDOW_MS + 1)).toBe('expired');
    await undoGoalPlan(id, '2026-11-12', db);
    expect((await db.cycles.get(1))?.cardioMin).toBeUndefined();
    expect((await db.trainingProgram.get('me'))?.trainingDays).toBeUndefined();
    expect(planForDate(await db.targetPlans.toArray(), '2026-11-12')).toMatchObject({ calories: 2800, proteinG: 140 });
    expect(await db.coachNotes.count()).toBe(0);
    expect((await db.planChanges.get(id))?.status).toBe('undone');
  });
});

describe('manual plan: a new goal restarts the cycle', () => {
  it("ends the cycle early as a restart (no reachedAt) and starts the next block with the new goal and its date", async () => {
    const db = await setup();
    const id = await addPlanChange(manual({ restart: true, choice: fresh }), db);
    const next = await applyGoalPlan(id, all, '2026-11-12', null, db);
    expect(next).toBe(2);
    const old = await db.cycles.get(1);
    expect(old?.endedEarly?.reason).toBe('restart');
    expect(old?.reachedAt).toBeUndefined();
    expect(await db.cycles.get(2)).toMatchObject({ block: 'B', goal: { endWeightKg: 76, weeks: 8, deadline: '2027-01-06', bfLinePct: 16 } });
    // 2.4 kg over 8 weeks.
    expect((await db.profile.get('me'))?.weeklyRateKg).toBe(0.3);
  });

  it('Undo works until the new cycle has a logged session', async () => {
    const db = await setup();
    const id = await addPlanChange(manual({ restart: true, choice: fresh }), db);
    await applyGoalPlan(id, all, '2026-11-12', null, db);
    const pc = (await db.planChanges.get(id))!;
    expect(canUndo(pc, [{ cycle: 2 }], Date.now())).toBe('trained');
    await undoGoalPlan(id, '2026-11-12', db);
    expect(await db.cycles.get(2)).toBeUndefined();
    expect((await db.cycles.get(1))?.endedEarly).toBeUndefined();
    expect((await db.trainingProgram.get('me'))?.currentCycle).toBe(1);
  });
});

describe('manual plans and the goal reminder', () => {
  it('an applied or dismissed manual plan never resolves a pending reached or off-track event', () => {
    const m = (status: PlanChange['status']) => ({ status, event: 'manual' as const, reason: 'manual' as const });
    expect(isResolved([m('applied'), m('dismissed')], 'reached', 'weight')).toBe(false);
    expect(isResolved([m('applied')], 'offtrack', 'stalled')).toBe(false);
    expect(isResolved([{ status: 'dismissed', event: 'offtrack', reason: 'stalled' }], 'offtrack', 'stalled')).toBe(true);
    expect(isResolved([{ status: 'applied', event: 'reached', reason: 'weight' }], 'offtrack', 'tooFast')).toBe(true);
  });

  it('button: hidden without a cycle, disabled in a workout, reopens a waiting request, else asks', () => {
    const base = { cycleActive: true, workoutOpen: false, open: null, openManual: null };
    expect(replanButton({ ...base, cycleActive: false })).toEqual({ state: 'hidden' });
    expect(replanButton({ ...base, workoutOpen: true })).toEqual({ state: 'disabled', reason: 'workoutOpen' });
    expect(replanButton({ ...base, openManual: { status: 'waiting' } })).toEqual({ state: 'see', manual: true });
    expect(replanButton({ ...base, open: { status: 'ready' }, openManual: { status: 'ready' } })).toEqual({ state: 'see', manual: false });
    expect(replanButton(base)).toEqual({ state: 'ask' });
  });

  it('the 7-day note: only applied plans inside the window count', () => {
    const now = 1_000 * 24 * 3600_000;
    const day = 24 * 3600_000;
    expect(REPLAN_RULES.recentDays).toBe(7);
    expect(recentPlan([{ status: 'applied', appliedAt: now - 3 * day }], now)).toBe(true);
    expect(recentPlan([{ status: 'applied', appliedAt: now - 8 * day }], now)).toBe(false);
    expect(recentPlan([{ status: 'undone', appliedAt: now - day }], now)).toBe(false);
  });
});

describe('goal date (deadline)', () => {
  it("Philip suggests the weeks the change needs at the phase's default pace, never under 4", () => {
    // +3 kg from 75 kg = 4%; bulk default 0.3%/week → 14 weeks.
    expect(suggestDeadline('gain', 75, 78, '2026-11-13')).toEqual({ weeks: 14, date: '2027-02-19' });
    expect(suggestDeadline('gain', 75, 75.5, '2026-11-13').weeks).toBe(4);
    expect(suggestDeadline('lose', 80, 76, '2026-11-13').weeks).toBe(9); // 5% at 0.6%/week
    expect(suggestDeadline('lose', 80, 50, '2026-11-13').weeks).toBe(26);
    expect(suggestDeadline('maintain', 75, 75, '2026-11-13').weeks).toBe(4);
  });

  it('the date sets the pace; dates are kept inside 2–26 weeks', () => {
    const g = withDeadline(ownGoal(75, 15, 'gain', 78, 16), '2026-11-13', '2027-02-19');
    expect(g).toMatchObject({ weeks: 14, deadline: '2027-02-19', weeklyRatePct: 0.29 });
    expect(clampDeadline('2026-11-13', '2026-11-15')).toBe('2026-11-27');
    expect(clampDeadline('2026-11-13', '2028-01-01')).toBe('2027-05-14');
  });

  it('own goal over 14 weeks is inside the bulk range; the same goal in 4 weeks is flagged', () => {
    expect(ownGoal(75, 15, 'gain', 78, 16, 14).issues).toEqual([]);
    expect(ownGoal(75, 15, 'gain', 78, 16).issues.map((i) => i.code)).toEqual(['rateOutOfRange']);
    expect(repeatGoal({ phase: 'gain', goal: { ...cycle1.goal, weeks: 8 } }, 75, 15).weeks).toBe(8);
    expect(philipNextGoal({ phase: 'gain', goal: cycle1.goal }, 75, 15, 'gain', 14, 8).endWeightKg).toBeGreaterThan(philipNextGoal({ phase: 'gain', goal: cycle1.goal }, 75, 15, 'gain', 14).endWeightKg);
  });

  it('a longer goal asks the calculator for a slower weekly rate', () => {
    const p = { sex: 'male' as const, birthDate: '1998-01-01', heightCm: 184, activityLevel: 'moderate' as const, trainingDaysPerWeek: 4, bodyFatPct: 15 };
    expect(calcInputsForGoal(p, 'gain', { startWeightKg: 75, endWeightKg: 77 }, '2026-11-13')?.weeklyRateKg).toBe(0.5);
    expect(calcInputsForGoal(p, 'gain', { startWeightKg: 75, endWeightKg: 77, weeks: 8 }, '2026-11-13')?.weeklyRateKg).toBe(0.25);
  });

  it('a goal with a date ahead carries into the next cycle; a reached or past one does not', () => {
    const last = { phase: 'gain' as const, goal: { endWeightKg: 78, bfLinePct: 16, deadline: '2027-02-19', source: 'user' as const } };
    expect(continuation(last, 76, 15.5, 'gain', '2026-12-11')).toMatchObject({ endWeightKg: 78, deadline: '2027-02-19', weeks: 10, startWeightKg: 76 });
    expect(continuation(last, 78.2, 15.5, 'gain', '2026-12-11')).toBeNull();
    expect(continuation(last, 76, 15.5, 'gain', '2027-02-17')).toBeNull();
    expect(continuation(last, 76, 15.5, 'lose', '2026-12-11')).toBeNull();
    expect(continuation({ ...last, goal: { ...last.goal, deadline: undefined } }, 76, 15.5, 'gain', '2026-12-11')).toBeNull();
  });
});

describe('manual prompt', () => {
  const window = goalWindow({ start: '2026-11-02', today: '2026-11-12', startKg: 73, weights: [], food: [], targetOn: () => null, sessions: [], cycle: 1 });
  const ranges = leverRanges({ choice: fresh, calc: null, window, sex: 'male', heightCm: 184, block: 'A', trainingDays: [1, 3, 5], choices: {}, cardioCap: 20, strengthMin: 60 });

  it('says he asked mid-cycle, that keeping everything is valid, and names the goal date', () => {
    const base = { event: 'manual' as const, reason: 'manual', choice: fresh, ranges, window, brief: 'B', name: (id: string) => id };
    const text = proposalPrompt({ ...base, restart: false });
    expect(text).toContain('asked for a fresh look mid-cycle');
    expect(text).toContain('keeps the current goal');
    expect(text).toContain('Keep everything as it is');
    expect(text).toContain('by 2027-01-06 (8 weeks)');
    expect(text).toContain('exactly 3 training weekdays');
    expect(text).toContain('outside the 60-minute lifting budget');
    expect(proposalPrompt({ ...base, restart: true })).toContain('picked a new goal');
  });

  it('his cardio minutes cap the range, and day picks must match his count', () => {
    expect(ranges.cardioMin).toEqual({ min: 15, max: 20, def: 15 });
    const raw = { message: 'ok', proteinG: { value: 140 }, cardioMin: { value: 25 }, days: { value: [1, 2, 4, 5] } };
    const p = parseProposal(raw, ranges, { kind: 'claude-paste', model: null }, 1);
    expect(p.cardioMin).toBe(20);
    expect(p.days).toBeNull();
    expect(parseProposal({ ...raw, days: { value: [2, 4, 6] } }, ranges, { kind: 'claude-paste', model: null }, 1).days).toEqual([2, 4, 6]);
  });
});

describe('your time', () => {
  it('60 minutes of lifting by default; a shorter budget trims, never pads', () => {
    expect(SESSION_BUDGET_MIN).toBe(60);
    const input = { cycle: 1, week: 1 as const, day: 1 as const, phase: 'gain' as const, tms: TMS, weightUnit: 'kg' as const };
    const full = buildSession(input);
    const short = buildSession({ ...input, budgetMin: 30 });
    expect(full.estMinutes).toBeLessThanOrEqual(60);
    expect(short.estMinutes).toBeLessThanOrEqual(full.estMinutes);
    expect(short.trims.length).toBeGreaterThanOrEqual(full.trims.length);
    expect(buildSession({ ...input, budgetMin: 90 }).estMinutes).toBe(buildSession({ ...input, budgetMin: 200 }).estMinutes);
  });

  it('3–5 weekdays: fewest squat/RDL clashes, most days kept', () => {
    const three = bestDays(3, [1, 2, 4, 5]);
    expect(three).toHaveLength(3);
    expect(three.every((d) => [1, 2, 4, 5].includes(d))).toBe(true);
    expect(closeTriples(three)).toBe(0);
    const five = bestDays(5, [1, 2, 4, 5]);
    expect(five).toHaveLength(5);
    expect([1, 2, 4, 5].every((d) => five.includes(d as 1))).toBe(true);
    expect(closeTriples(five)).toBe(1);
    expect(trainingDaysOrDefault(five)).toEqual(five);
    // 16 sessions on 3 days a week: the goal day is 15 training days after the first.
    const dates = planDates({ today: '2026-11-16', trainingDays: [1, 3, 5], sessions: [], cycle: 1 });
    expect(dates).toHaveLength(16);
    expect(dates.at(-1)?.date).toBe('2026-12-21');
  });

  it('cardio: his minutes are a ceiling; room is used on a cut only', () => {
    expect(cardioFor('gain', 10, 15)).toBe(10);
    expect(cardioFor('gain', 45, 15)).toBe(15);
    expect(cardioFor('lose', 30, 25)).toBe(30);
    expect(cardioFor('lose', 45, 25)).toBe(40);
    expect(clampWish({ daysPerWeek: 9, strengthMin: 52, cardioMin: 3 })).toEqual({ daysPerWeek: 5, strengthMin: 50, cardioMin: 10 });
  });

  const cur = { days: [1, 2, 4, 5] as const, strengthMin: 60, cardioPlanned: 25, phase: 'lose' as const, plan: { calories: 2200, proteinG: 172, fatG: 61, carbsG: 240 }, weightKg: 78, heightCm: 184 };
  const calcFor = (n: number): CalcResult | null => {
    const i = calcInputsForGoal({ sex: 'male', birthDate: '1998-01-01', heightCm: 184, activityLevel: 'moderate', trainingDaysPerWeek: 4, bodyFatPct: null }, 'lose', { startWeightKg: 78, endWeightKg: 76 }, '2026-11-13', n);
    return i ? calculateTargets(i) : null;
  };

  it('nutrition moves only when the calculator says so (cut: protein per kg at under four days)', () => {
    const three = planAvailability({ daysPerWeek: 3, strengthMin: 60, cardioMin: 25 }, cur, calcFor);
    expect(three.daysChanged).toBe(true);
    expect(three.nutritionChanged).toBe(true);
    expect(three.nutrition?.proteinG).toBe(172 - (calcFor(4)!.proteinG - calcFor(3)!.proteinG));
    expect(three.nutrition?.calories).toBe(2200);
    const five = planAvailability({ daysPerWeek: 5, strengthMin: 45, cardioMin: 25 }, cur, calcFor);
    expect(five).toMatchObject({ nutritionChanged: false, strengthChanged: true, cardioChanged: false, changed: true, closeDays: true });
    expect(planAvailability({ daysPerWeek: 4, strengthMin: 60, cardioMin: 25 }, cur, calcFor).changed).toBe(false);
    // Bulk: days don't move protein in the calculator, so food stays.
    expect(planAvailability({ daysPerWeek: 3, strengthMin: 60, cardioMin: 25 }, { ...cur, phase: 'gain', cardioPlanned: 15 }, () => calcFor(4)).nutritionChanged).toBe(false);
  });

  it('Confirm writes days, minutes, cardio and a plan in one go; Undo puts them back', async () => {
    const db = await setup();
    const plan = planAvailability({ daysPerWeek: 3, strengthMin: 45, cardioMin: 10 }, { days: [1, 2, 4, 5], strengthMin: 60, cardioPlanned: 15, phase: 'gain', plan: null, weightKg: 73, heightCm: 184 }, () => null);
    const undo = await applyAvailability({ ...plan, nutrition: { calories: 2750, proteinG: 140, fatG: 80, carbsG: 340 } }, '2026-11-13', 'gain', db);
    expect(await db.trainingProgram.get('me')).toMatchObject({ trainingDays: plan.days, availability: { strengthMin: 45, cardioMin: 10 } });
    expect((await db.cycles.get(1))?.cardioMin).toBe(10);
    const p = planForDate(await db.targetPlans.toArray(), '2026-11-13');
    expect(p).toMatchObject({ calories: 2750 });
    expect(p?.inputsSnapshot?.source).toBe('availability');
    await undoAvailability(undo, '2026-11-13', db);
    const program = await db.trainingProgram.get('me');
    expect(program?.trainingDays).toBeUndefined();
    expect(program?.availability).toBeUndefined();
    expect((await db.cycles.get(1))?.cardioMin).toBeUndefined();
    expect(planForDate(await db.targetPlans.toArray(), '2026-11-13')).toMatchObject({ calories: 2800 });
    expect(await db.targetPlans.count()).toBe(3); // append-only
  });
});

describe('backup', () => {
  it('round-trips a manual plan change, a goal date and "your time"; older backups restore cleanly', async () => {
    const db = await setup();
    const id = await addPlanChange(manual({ restart: true, choice: fresh }), db);
    await applyGoalPlan(id, all, '2026-11-12', null, db);
    await applyAvailability(planAvailability({ daysPerWeek: 5, strengthMin: 75, cardioMin: 20 }, { days: [1, 2, 4, 6], strengthMin: 60, cardioPlanned: 20, phase: 'gain', plan: null, weightKg: 73, heightCm: 184 }, () => null), '2026-11-12', 'gain', db);
    const json = JSON.parse(JSON.stringify(await createBackup(db)));
    const db2 = await freshDb();
    await restoreBackup(db2, parseBackup(JSON.stringify(json)).file, 'replace');
    const pcs = await db2.planChanges.toArray();
    expect(pcs).toHaveLength(1);
    expect(pcs[0]).toMatchObject({ event: 'manual', reason: 'manual', status: 'applied', choice: { weeks: 8, deadline: '2027-01-06' } });
    expect((await db2.cycles.get(2))?.goal).toMatchObject({ weeks: 8, deadline: '2027-01-06' });
    const program = await db2.trainingProgram.get('me');
    expect(program?.availability).toEqual({ strengthMin: 75, cardioMin: 20 });
    expect(program?.trainingDays).toHaveLength(5);

    // A pre-Story-12 backup: no manual rows, no dates, no availability.
    const old = JSON.parse(JSON.stringify(json));
    old.data.training.planChanges = [{ ...old.data.training.planChanges[0], event: 'offtrack', reason: 'stalled', choice: { ...keep } }];
    delete old.data.training.program.availability;
    for (const c of old.data.training.cycles) {
      delete c.goal.weeks;
      delete c.goal.deadline;
    }
    const db3 = await freshDb();
    await restoreBackup(db3, parseBackup(JSON.stringify(old)).file, 'replace');
    expect((await db3.planChanges.toArray())[0]).toMatchObject({ event: 'offtrack', reason: 'stalled' });
    expect((await db3.trainingProgram.get('me'))?.availability).toBeUndefined();
    expect((await db3.cycles.get(2))?.goal.deadline).toBeUndefined();
    expect(() => parseBackup(JSON.stringify({ ...old, data: { ...old.data, training: { ...old.data.training, planChanges: [{ ...old.data.training.planChanges[0], event: 'nope' }] } } }))).toThrow();
  });
});
