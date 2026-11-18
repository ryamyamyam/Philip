/**
 * Story 17 (D-040): calories follow the real gym days, one-week moves, lift-day swaps, playbook TDEE,
 * the treadmill read, bodyweight progression and today's line. AC 1–9.
 */
import { describe, expect, it } from 'vitest';
import { freshDb } from '../test/helpers';
import { addTargetPlan, setDayOrderScope, setNextLoad, setTrainingDays, setUpTraining, setWeekDays, updateProfile } from './repo';
import { getPlaybookUpdate, needsPlaybookUpdate, runPlaybookUpdate, undoPlaybookUpdate } from './playbookRepo';
import type { CycleRecord, IsoWeekday, TargetPlan, WeightEntry, WorkoutSession } from './types';
import { carbDays } from '../lib/goal/carbDays';
import { carbDayTarget, carbSplitOf, gymDatesInWeek, weekOf, type GymContext } from '../lib/goal/gymDays';
import { planForDate, targetForDate } from '../lib/nutrition';
import { addDays } from '../lib/date';
import { movementOf, PB_BODYWEIGHT, PB_TDEE, PB_TODAY_LINE, tdeeFactor } from '../lib/playbook/rules';
import { dayOrderFor, isTrainingDate, moveDay, planDates, squatRdlAdjacent, swapDays } from '../lib/training/schedule';
import { nextSessionRef } from '../lib/training/progress';
import { nextBodyweight } from '../lib/training/program';
import { buildSession } from '../lib/training/session';
import { bodyweightRatio } from '../lib/strength/e1rm';
import { inclineToPct, parseTreadmillRead, treadmillReadPrompt } from '../lib/training/treadmill';
import { bfRow, chartWindow, goalSpan, linearAt, liftRows, steppedPlanAt, weightRow, weightSeries } from '../lib/goal/todayLine';
import { linesFor } from '../lib/strength/e1rm';
import type { SessionExercise } from './types';

// Tue 17 Nov 2026; the week runs Mon 16 → Sun 22.
const TODAY = '2026-11-17';
const MON = '2026-11-16';
const SAT = '2026-11-21';

/** A carb-day bulk plan for Mon/Tue/Thu/Fri (Ryan's days), solved the app's way. */
function carbPlan(days: IsoWeekday[] = [1, 2, 4, 5], effectiveFrom = '2026-11-01'): TargetPlan {
  const base = { calories: 2700, proteinG: 140, fatG: 70, carbsG: 382 };
  const split = carbDays(base, days, 'male', 74)!;
  return { id: 1, effectiveFrom, ...base, method: 'calculated', inputsSnapshot: { goal: 'gain', carbDays: true }, weekdayOverrides: split.overrides, createdAt: 1 };
}
const ctx = (over: Partial<GymContext> = {}): GymContext => ({ today: TODAY, trainingDays: [1, 2, 4, 5], weekDays: null, sessions: [], ...over });
const weekKcal = (plan: TargetPlan, c: GymContext) => weekOf(TODAY).reduce((s, d) => s + (targetForDate([plan], d, c)?.calories ?? 0), 0);

describe('§3.1 nutrition follows the days he trains (OBS-F17324)', () => {
  const plan = carbPlan();
  const split = carbSplitOf(plan)!;

  it('reads the gym and rest macros off a carb-day plan; manual weekly plans are left alone', () => {
    expect(split.train.carbsG).toBeGreaterThan(split.rest.carbsG);
    expect(carbSplitOf({ ...plan, inputsSnapshot: { goal: 'gain' } })).toBeNull();
    expect(carbDayTarget({ ...plan, method: 'manual', inputsSnapshot: null }, TODAY, ctx())).toBeNull();
  });

  it('AC 1: training days Sat instead of Tue → Tuesday is a rest day, Saturday a gym day, week total = flat plan', () => {
    const before = ctx();
    expect(targetForDate([plan], TODAY, before)).toEqual(split.train);
    const after = ctx({ trainingDays: [1, 4, 5, 6] });
    expect(targetForDate([plan], TODAY, after)).toEqual(split.rest);
    expect(targetForDate([plan], SAT, after)).toEqual(split.train);
    expect(Math.abs(weekKcal(plan, after) - plan.calories * 7)).toBeLessThanOrEqual(7 * 4);
  });

  it('AC 2: a one-week move changes only this week', () => {
    const moved = ctx({ weekDays: { weekStart: MON, days: [1, 4, 5, 6] } });
    expect(targetForDate([plan], TODAY, moved)).toEqual(split.rest);
    expect(targetForDate([plan], SAT, moved)).toEqual(split.train);
    // Next Tuesday: back on the usual days.
    expect(targetForDate([plan], addDays(TODAY, 7), moved)).toEqual(split.train);
  });

  it('AC 3: a workout on a planned rest day flips that day to gym macros and re-solves gym days for the week', () => {
    const sat: Pick<WorkoutSession, 'date' | 'status'> = { date: SAT, status: 'in_progress' };
    const c = ctx({ sessions: [sat] });
    expect(gymDatesInWeek(SAT, c).size).toBe(5);
    const gym = targetForDate([plan], SAT, c)!;
    expect(gym.proteinG).toBe(split.train.proteinG);
    expect(gym.fatG).toBe(split.train.fatG);
    expect(gym.carbsG).toBeLessThan(split.train.carbsG); // 5 gym days share the same weekly extra
    expect(targetForDate([plan], '2026-11-22', c)).toEqual(split.rest);
    expect(Math.abs(weekKcal(plan, c) - plan.calories * 7)).toBeLessThanOrEqual(7 * 4);
    // A skipped session doesn't count.
    expect(gymDatesInWeek(SAT, ctx({ sessions: [{ date: SAT, status: 'skipped' }] })).has(SAT)).toBe(false);
  });

  it('weeks before this one keep the numbers stored on their plan (history never re-solved)', () => {
    const lastTue = addDays(TODAY, -7);
    const after = ctx({ trainingDays: [1, 4, 5, 6] });
    expect(targetForDate([plan], lastTue, after)).toEqual(plan.weekdayOverrides?.[2]);
  });

  it('no gym day (or all) this week → the flat plan', () => {
    const none = ctx({ weekDays: { weekStart: MON, days: [] } });
    expect(targetForDate([plan], TODAY, none)).toEqual({ calories: 2700, proteinG: 140, fatG: 70, carbsG: 382 });
  });

  it('Settings › Training days clears any one-week move', async () => {
    const db = await freshDb();
    await setUpTraining({ bar: { barKg: 20, plateUnit: 'lb', plates: [45, 25, 10, 5, 2.5] }, weightUnit: 'lb', tms: { squat: 135, bench: 90, rdl: 103.5, ohp: 45 } }, db);
    await setWeekDays({ weekStart: MON, days: [6, 1, 4, 5] }, db);
    expect((await db.trainingProgram.get('me'))?.weekDays).toEqual({ weekStart: MON, days: [1, 4, 5, 6] });
    await setTrainingDays([1, 3, 4, 6], db);
    const p = await db.trainingProgram.get('me');
    expect(p?.weekDays).toBeUndefined();
    expect(p?.trainingDays).toEqual([1, 3, 4, 6]);
  });
});

describe('§3.2 one-week move: schedule', () => {
  it('moveDay swaps one weekday for a free one; impossible moves are null', () => {
    expect(moveDay([1, 2, 4, 5], 6 as IsoWeekday, 2)).toBeNull();
    expect(moveDay([1, 4, 5, 6], 6, 2)).toEqual([1, 2, 4, 5]);
    expect(moveDay([1, 2, 4, 5], 2, 4)).toBeNull();
  });
  it('planned dates follow this week’s move and go back next week', () => {
    const wd = { weekStart: MON, days: [1, 4, 5, 6] as IsoWeekday[] };
    expect(isTrainingDate(TODAY, [1, 2, 4, 5], wd)).toBe(false);
    expect(isTrainingDate(SAT, [1, 2, 4, 5], wd)).toBe(true);
    expect(isTrainingDate(addDays(TODAY, 7), [1, 2, 4, 5], wd)).toBe(true);
    const dates = planDates({ today: TODAY, trainingDays: [1, 2, 4, 5], sessions: [], cycle: 1, weekDays: wd }).map((p) => p.date);
    expect(dates.slice(0, 4)).toEqual(['2026-11-19', '2026-11-20', SAT, '2026-11-23']);
  });
});

describe('§3.6 swap lift days (OBS-4DC2DF)', () => {
  it('dayOrderFor: this-week swap first, then the rotation, else 1–4', () => {
    expect(dayOrderFor(null, 1, 1)).toEqual([1, 2, 3, 4]);
    expect(dayOrderFor({ dayRotation: [4, 2, 3, 1] }, 1, 2)).toEqual([4, 2, 3, 1]);
    expect(dayOrderFor({ dayRotation: [4, 2, 3, 1], weekSwap: { cycle: 1, week: 2, order: [2, 1, 3, 4] } }, 1, 2)).toEqual([2, 1, 3, 4]);
    expect(dayOrderFor({ weekSwap: { cycle: 1, week: 2, order: [2, 1, 3, 4] } }, 1, 3)).toEqual([1, 2, 3, 4]);
    expect(dayOrderFor({ dayRotation: [1, 1, 2, 3] as never }, 1, 1)).toEqual([1, 2, 3, 4]);
  });
  it('AC 8: OHP day ↔ squat day; the cycle stays 16 sessions and each lift keeps its week', () => {
    const order = swapDays([1, 2, 3, 4], 4, 1);
    expect(order).toEqual([4, 2, 3, 1]);
    expect(nextSessionRef([], 1, { dayRotation: order })).toEqual({ week: 1, day: 4 });
    const refs = planDates({ today: TODAY, trainingDays: [1, 2, 4, 5], sessions: [], cycle: 1, order: { dayRotation: order } });
    expect(refs).toHaveLength(16);
    expect(refs.slice(0, 4).map((r) => r.lift)).toEqual(['ohp', 'bench', 'rdl', 'squat']);
    expect(refs.filter((r) => r.lift === 'squat').map((r) => r.week)).toEqual([1, 2, 3, 4]);
  });
  it('warns when squat and RDL end up back to back', () => {
    expect(squatRdlAdjacent([1, 2, 3, 4])).toBe(false);
    expect(squatRdlAdjacent([1, 3, 2, 4])).toBe(true);
    expect(squatRdlAdjacent([3, 2, 4, 1])).toBe(true); // across the week's wrap
  });
  it('this week only vs from now on', async () => {
    const db = await freshDb();
    await setUpTraining({ bar: { barKg: 20, plateUnit: 'lb', plates: [45, 25, 10, 5, 2.5] }, weightUnit: 'lb', tms: { squat: 135, bench: 90, rdl: 103.5, ohp: 45 } }, db);
    await setDayOrderScope('week', [4, 2, 3, 1], { cycle: 1, week: 1 }, db);
    let p = await db.trainingProgram.get('me');
    expect(p?.weekSwap).toEqual({ cycle: 1, week: 1, order: [4, 2, 3, 1] });
    expect(dayOrderFor(p, 1, 2)).toEqual([1, 2, 3, 4]);
    await setDayOrderScope('always', [2, 1, 3, 4], { cycle: 1, week: 1 }, db);
    p = await db.trainingProgram.get('me');
    expect(p?.weekSwap).toBeUndefined();
    expect(dayOrderFor(p, 1, 3)).toEqual([2, 1, 3, 4]);
    await setDayOrderScope('always', null, { cycle: 1, week: 1 }, db);
    expect((await db.trainingProgram.get('me'))?.dayRotation).toBeUndefined();
  });
});

describe('§3.3 playbook TDEE (PB-2.2)', () => {
  it('table and mapping', () => {
    expect(tdeeFactor('sedentary', 4)).toBe(PB_TDEE.sedentary['3-4']);
    expect(tdeeFactor('light', 3)).toBe(1.45);
    expect(tdeeFactor('moderate', 5)).toBe(1.75);
    expect(tdeeFactor('sedentary', 2)).toBe(1.2); // under 3 lifting days: the general table
    expect(movementOf('veryActive')).toBe('active');
    expect(movementOf(null)).toBe('sedentary');
  });

  it('AC 5: the one-time maintenance re-check moves calories into the pace band, says PB-2.2, and Undo restores', async () => {
    const db = await freshDb();
    await updateProfile({ sex: 'male', heightCm: 184, birthDate: '1998-01-01', activityLevel: 'sedentary', goal: 'gain', weightKg: 74, bodyFatPct: 15, trainingYears: 2 }, db);
    await setUpTraining({ bar: { barKg: 20, plateUnit: 'lb', plates: [45, 25, 10, 5, 2.5] }, weightUnit: 'lb', tms: { squat: 135, bench: 90, rdl: 103.5, ohp: 45 } }, db);
    // Made with the old sedentary 1.2: maintenance ≈ 2,075, +250 → 2,330. Under PB-2.2 (1.45) that's a 0% pace.
    await addTargetPlan({ effectiveFrom: '2026-11-02', calories: 2330, proteinG: 140, fatG: 70, carbsG: 285, method: 'calculated', inputsSnapshot: { goal: 'gain', weightKg: 74 }, weekdayOverrides: null }, db);
    expect(await needsPlaybookUpdate(db, 'tdee')).toBe(true);
    const rec = await runPlaybookUpdate(TODAY, db, 'tdee');
    const kcal = rec.changes.find((c) => c.field === 'calories');
    expect(kcal?.pbIds[0]).toBe('PB-2.2');
    expect(kcal?.after).toBeGreaterThan(2330);
    expect(rec.loads).toEqual([]); // no load sweep on this run
    expect(planForDate(await db.targetPlans.toArray(), TODAY)?.calories).toBe(kcal?.after);
    expect(await needsPlaybookUpdate(db, 'tdee')).toBe(false);
    // Story 16's record is separate.
    expect(await getPlaybookUpdate(db)).toBeNull();
    await undoPlaybookUpdate(TODAY, db, 'tdee');
    expect(planForDate(await db.targetPlans.toArray(), TODAY)?.calories).toBe(2330);
  });
});

describe('§3.4 treadmill read (OBS-A4F4B9)', () => {
  it('AC 6: "woodway / 14 / 2.5" → incline % kept (already %) and mph from the machine’s dial', () => {
    const p = treadmillReadPrompt('woodway', 14, 2.5);
    expect(p).toContain('Machine: "woodway"');
    expect(p).toContain('Incline shown: 14');
    const r = parseTreadmillRead({ inclineScale: 'pct', scale: 'mph', confidence: 'medium', note: 'Woodway shows mph and % grade.' }, 'woodway', 14, 2.5)!;
    expect(r.inclinePct).toBe(14);
    expect(r.mph).toBe(2.5);
    expect(r.inclineWasPct).toBe(true);
    expect(r.treadmill.incline).toEqual({ scale: 'pct' });
  });
  it('level dials are converted by the app’s own math; incomplete level dials are rejected', () => {
    const r = parseTreadmillRead({ inclineScale: 'level', inclineMaxLevel: 30, inclineMaxPct: 15, scale: 'kmh', confidence: 'low', note: '' }, 'Gym brand X', 14, 4)!;
    expect(r.inclinePct).toBe(7);
    expect(r.mph).toBe(2.5);
    expect(r.confidence).toBe('low');
    expect(parseTreadmillRead({ inclineScale: 'level', scale: 'mph' }, 'x', 14, 2.5)).toBeNull();
    expect(inclineToPct(40, { name: 'x', scale: 'mph', source: 'me', incline: { scale: 'level', maxLevel: 30, maxPct: 15 } })).toBe(15);
  });
});

describe('§3.5 bodyweight moves (OBS-0E95EF, PB-4.8)', () => {
  const set = (reps: number, kg: number | null = null) => ({ kg, reps, done: true });
  const bw = (last: Parameters<typeof nextBodyweight>[0], sets = 3, kg: number | null = 74) => nextBodyweight(last, sets, 6, 10, kg, PB_BODYWEIGHT);

  it('AC 7: reps first, then a set, then (his yes) load — never automatically', () => {
    expect(bw(null)).toMatchObject({ change: 'first', addedKg: 0, sets: 3, targetReps: 8 });
    expect(bw([set(8), set(7), set(7)])).toMatchObject({ change: 'reps', addedKg: 0, sets: 3, targetReps: 8 });
    expect(bw([set(10), set(10), set(10)])).toMatchObject({ change: 'set', addedKg: 0, sets: 4, targetReps: 10 });
    expect(bw([set(10), set(10), set(10), set(10)])).toMatchObject({ change: 'offerLoad', addedKg: 0, sets: 4 });
  });
  it('a weight close to his body weight is read as body weight, not as added load', () => {
    expect(bw([set(10, 74), set(10, 74), set(10, 74)])).toMatchObject({ addedKg: 0, change: 'set' });
    expect(bw([set(8, 5), set(8, 5), set(8, 5)])).toMatchObject({ addedKg: 5, change: 'reps' });
  });
  it('far under the range → the assisted version', () => {
    expect(bw([set(3), set(2)])).toMatchObject({ change: 'assisted' });
  });
  it('the session shows body weight × reps × sets (kg null) and his accepted load applies once', async () => {
    const plan = buildSession({ cycle: 1, week: 1, day: 4, phase: 'maintain', tms: { squat: 135, bench: 90, rdl: 103.5, ohp: 45 }, choices: {}, bodyWeightKg: 74, lastSets: () => [set(10), set(10), set(10)] });
    const pull = plan.exercises.find((e) => e.exerciseId === 'pull-up');
    expect(pull).toBeDefined();
    expect(pull!.prescription.every((p) => p.kg === null)).toBe(true);
    expect(pull!.prescription).toHaveLength(4);
    expect(pull!.prescription[0]?.bw).toBe('set');
    const withLoad = buildSession({ cycle: 1, week: 1, day: 4, phase: 'maintain', tms: { squat: 135, bench: 90, rdl: 103.5, ohp: 45 }, choices: {}, bodyWeightKg: 74, lastSets: () => [set(10), set(10), set(10), set(10)], override: (id) => (id === 'pull-up' ? { exerciseId: id, afterSessionId: 's', kg: 2.5, reps: 6, sets: null } : null) });
    const p2 = withLoad.exercises.find((e) => e.exerciseId === 'pull-up')!;
    expect(p2.prescription[0]).toMatchObject({ kg: 2.5, targetReps: 6 });
    const db = await freshDb();
    await setUpTraining({ bar: { barKg: 20, plateUnit: 'lb', plates: [45, 25, 10, 5, 2.5] }, weightUnit: 'lb', tms: { squat: 135, bench: 90, rdl: 103.5, ohp: 45 } }, db);
    await setNextLoad('pull-up', 's1', 2.5, 6, db);
    expect((await db.trainingProgram.get('me'))?.nextOverrides).toEqual([{ exerciseId: 'pull-up', afterSessionId: 's1', kg: 2.5, reps: 6, sets: null }]);
  });
  it('e1RM for a bodyweight move uses body weight + added load', () => {
    const ex = {
      slot: 'A1',
      exerciseId: 'pull-up',
      prescription: [{ order: 0, kind: 'accessory', kg: null, pct: null, repMin: 6, repMax: 10, timed: false, perSide: false, rir: 1, restSec: 90, targetReps: 8 }],
      actual: [{ order: 0, kg: null, reps: 8, done: true, pain: false, copiedFromOrder: false }],
      skipped: false,
      note: '',
    } as unknown as SessionExercise;
    const r = bodyweightRatio(ex, 74)!;
    expect(r.actual).toBeCloseTo(74 * (1 + 9 / 30), 1);
    expect(bodyweightRatio(ex, null)).toBeNull();
  });
});

describe('§3.7 today’s line (N-2, N-3)', () => {
  const cycle: CycleRecord = {
    index: 1,
    block: 'A',
    startedAt: new Date(2026, 10, 2).getTime(),
    phase: 'gain',
    tms: { squat: 135, bench: 90, rdl: 103.5, ohp: 45 },
    goal: { startWeightKg: 74, startBfPct: 15, endWeightKg: 78, weeklyRatePct: 0.3, bfLinePct: 17, source: 'user', targetPlanId: null, weeks: 19, deadline: '2027-03-20' },
  };
  const span = goalSpan(cycle);
  const w = (date: string, kg: number): WeightEntry => ({ date, weightKg: kg, createdAt: 1, updatedAt: 1 } as WeightEntry);

  it('the window: deadline minus its weeks, never before the cycle', () => {
    expect(span.end).toBe('2027-03-20');
    expect(span.start).toBe('2026-11-07'); // 20 Mar − 19 weeks
    expect(goalSpan({ ...cycle, goal: { ...cycle.goal, weeks: 30 } }).start).toBe('2026-11-02');
  });

  it('AC 9: expected weight is the straight line (start, middle, end; clamped outside)', () => {
    expect(linearAt(span.start, span.end, 74, 78, span.start)).toBe(74);
    expect(linearAt(span.start, span.end, 74, 78, span.end)).toBe(78);
    const mid = addDays(span.start, 67);
    expect(linearAt(span.start, span.end, 74, 78, mid)).toBeCloseTo(76, 1);
    expect(linearAt(span.start, span.end, 74, 78, '2026-10-01')).toBe(74);
    expect(linearAt(span.start, span.end, 74, 78, '2027-06-01')).toBe(78);
  });

  it('actual weight = the 7-day average; ±0.5 kg on track; heavier on a bulk = ahead (fast)', () => {
    const exp = weightRow(span, [], TODAY, null).expected;
    const near = [w('2026-11-15', exp + 0.2), w('2026-11-16', exp + 0.4), w(TODAY, exp)];
    expect(weightRow(span, near, TODAY, null)).toMatchObject({ source: 'average', status: 'onTrack' });
    const heavy = [w('2026-11-15', exp + 1), w(TODAY, exp + 1.2)];
    expect(weightRow(span, heavy, TODAY, null).status).toBe('aheadFast');
    const light = [w('2026-11-15', exp - 1), w(TODAY, exp - 1)];
    expect(weightRow(span, light, TODAY, null).status).toBe('behind');
    expect(weightRow(span, [], TODAY, null)).toMatchObject({ actual: null, status: 'noData' });
    expect(PB_TODAY_LINE.weightKg).toBe(0.5);
  });

  it('body fat: linear, whole points, ceiling on a bulk, old readings ask for a new one', () => {
    const r = bfRow(span, { pct: 15, date: TODAY }, TODAY);
    expect(Number.isInteger(r.expected)).toBe(true);
    expect(r.status).toBe('onTrack');
    expect(bfRow(span, { pct: 18, date: TODAY }, TODAY).status).toBe('above');
    expect(bfRow(span, { pct: 12, date: TODAY }, TODAY).status).toBe('onTrack'); // under a bulk ceiling: fine, never praised
    expect(bfRow(span, { pct: 15, date: '2026-10-01' }, TODAY).status).toBe('weighBf');
    expect(bfRow({ ...span, bfLine: null }, { pct: 15, date: TODAY }, TODAY).expected).toBeNull();
  });

  it('Big 4: the planned line as weekly steps, from Story 16', () => {
    const line = linesFor(cycle).squat!;
    expect(steppedPlanAt(line, addDays(line.startDate, 6))).toBe(line.start);
    expect(steppedPlanAt(line, addDays(line.startDate, 7))).toBeCloseTo(line.start + line.perWeek, 6);
    const rows = liftRows(cycle, [cycle], [], TODAY, span.start, span.end);
    expect(rows.map((r) => r.lift)).toEqual(['squat', 'bench', 'rdl', 'ohp']);
    expect(rows[0]).toMatchObject({ actual: null, status: 'noData' });
    expect(rows[0]!.expected).not.toBeNull();
  });

  it('weight series: faint weigh-ins plus the 7-day average; the 4-week window ends today', () => {
    const s = weightSeries([w('2026-11-10', 74), w('2026-11-12', 74.4), w(TODAY, 74.6)], span.start, span.end);
    expect(s.dots).toHaveLength(3);
    expect(s.avg.map((a) => a[0])).toEqual(['2026-11-12', TODAY]);
    expect(chartWindow(span, TODAY, '4wk')).toEqual({ from: span.start, to: TODAY });
    expect(chartWindow(span, '2027-01-20', '4wk')).toEqual({ from: '2026-12-23', to: '2027-01-20' });
  });
});

describe('Bug C: every carb-day path moves fat (PB-3.4)', () => {
  it('gym fat = the floor, rest fat = 1.0 g/kg when the weight is passed', () => {
    const r = carbDays({ calories: 2700, proteinG: 140, fatG: 70, carbsG: 382 }, [1, 2, 4, 5], 'male', 74)!;
    expect(r.rest.fatG).toBe(74);
    expect(r.train.fatG).toBe(Math.round(Math.max(0.6 * 74, (0.2 * r.train.calories) / 9)));
  });
});
