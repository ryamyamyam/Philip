/** Story 15: Update goals (now → target → Philip's plan → tick + Others → confirm), the cycle kept. */
import { describe, expect, it } from 'vitest';
import { freshDb } from '../test/helpers';
import { addPlanChange, applyGoalPlan, undoGoalPlan } from './goalRepo';
import { addTargetPlan, setUpTraining, startCycle, updateProfile } from './repo';
import type { CycleRecord, GoalProposalRecord, PlanChange } from './types';
import { planForDate } from '../lib/nutrition';
import { leverRanges, parseProposal, proposalPrompt, type LeverRanges } from '../lib/goal/proposal';
import { draftProposal, estimateDate, fatRange, inferPhase, itemsText, kcalForRate, macroPct, macrosWithFat, refinePrompt, UPDATE_RULES, updateKcalRange, type UpdateFrame } from '../lib/goal/update';
import { goalWindow } from '../lib/goal/window';
import { SAFETY } from '../lib/targets';

const frame: UpdateFrame = { phase: 'gain', nowKg: 73, endKg: 75, maintenanceKcal: 2600, maintenanceSource: 'measured', today: '2026-11-14' };
const choice = { phase: 'gain' as const, startWeightKg: 73, startBfPct: 15, endWeightKg: 75, weeklyRatePct: 0.3, bfLinePct: 15, source: 'user' as const, weeks: 9, deadline: '2027-01-16' };
const window = goalWindow({ start: '2026-11-02', today: '2026-11-14', startKg: 73, weights: [], food: [], targetOn: () => null, sessions: [], cycle: 1 });

function ranges(over: Partial<Parameters<typeof leverRanges>[0]> = {}): LeverRanges {
  return leverRanges({
    choice,
    calc: null,
    window,
    sex: 'male',
    heightCm: 184,
    block: 'A',
    trainingDays: [1, 2, 4, 5],
    choices: {},
    tms: [{ lift: 'bench', kg: 90 }],
    loads: [{ exerciseId: 'db_incline_press', kg: 22, sets: 3, reps: 10 }],
    update: frame,
    ...over,
  });
}

describe('Update goals engine', () => {
  it('reads the phase from now → target (under 0.5 kg = maintain)', () => {
    expect(inferPhase(73, 75)).toBe('gain');
    expect(inferPhase(80, 76)).toBe('lose');
    expect(inferPhase(73, 73.3)).toBe('maintain');
  });

  it('calories span the safe weekly pace around maintenance', () => {
    const r = updateKcalRange(frame, 'male');
    // Story 16 (PB-2.3): unknown training age → the 1–3 year bulk band.
    expect(r.min).toBe(kcalForRate(frame, 0.2));
    expect(r.max).toBe(kcalForRate(frame, 0.35));
    expect(r.def).toBe(kcalForRate(frame, 0.3));
    // A known training age moves the band.
    const vet = updateKcalRange({ ...frame, rate: { min: 0.1, max: 0.2, def: 0.15 } }, 'male');
    expect(vet.max).toBe(kcalForRate(frame, 0.2));
    // A cut never goes under the calorie floor.
    const cut = updateKcalRange({ ...frame, phase: 'lose', endKg: 60, nowKg: 62, maintenanceKcal: 1700 }, 'male');
    expect(cut.min).toBeGreaterThanOrEqual(SAFETY.calorieFloor.male);
  });

  it('estimates the goal date from the calories (energy balance), or says it is not reachable', () => {
    const e = estimateDate(frame, 2840)!;
    // 240 kcal/day over maintenance ≈ 0.031 kg/day → 2 kg in about 65 days.
    expect(e.weeks).toBeCloseTo(9.3, 1);
    expect(e.weeklyRatePct).toBeCloseTo(0.3, 1);
    expect(estimateDate(frame, 2950)!.date < e.date).toBe(true); // more food on a bulk = sooner
    expect(estimateDate(frame, 2500)).toBeNull(); // a deficit doesn't reach a bulk goal
    expect(estimateDate(frame, 2610)).toBeNull(); // longer than 26 weeks
    expect(estimateDate({ ...frame, phase: 'maintain' }, 2600)).toBeNull();
  });

  it('P/F/C % add up to 100; fat range sits on the floor and the cap', () => {
    const m = macrosWithFat(2800, 140, 80);
    expect(m.carbsG).toBe(Math.round((2800 - 560 - 720) / 4));
    const pct = macroPct(m);
    expect(pct.p + pct.f + pct.c).toBe(100);
    const fr = fatRange(2800, 73, 184);
    expect(fr.min).toBe(Math.round(Math.max((2800 * SAFETY.minFatPct) / 9, 73 * SAFETY.minFatGPerKg)));
    expect(fr.max).toBe(Math.round((2800 * UPDATE_RULES.fatMaxPct) / 9));
  });

  it('parses fat, carb days, 3–5 days and accessory sets/reps; clamps what is out of range', () => {
    const r = ranges();
    expect(r.kcal).toEqual(updateKcalRange(frame, 'male'));
    const p = parseProposal(
      {
        message: 'Here is the plan.',
        kcal: { value: 2840 },
        proteinG: { value: 140 },
        fatG: { value: 400, why: 'too much' },
        carbDays: { value: false },
        cardioMin: 15,
        days: { value: [1, 3, 5] },
        loads: [{ exerciseId: 'db_incline_press', kg: 22, sets: 9, reps: 12 }],
      },
      r,
      { kind: 'claude-paste', model: null },
      1,
    );
    expect(p.fatG).toBe(fatRange(2840, 73, 184).max);
    expect(p.clamps.some((c) => c.lever === 'fatG')).toBe(true);
    expect(p.carbDays).toBe(false);
    expect(p.days).toEqual([1, 3, 5]);
    expect(p.loads?.[0]).toMatchObject({ toKg: 22, sets: UPDATE_RULES.sets[1], reps: 12, fromSets: 3, fromReps: 10 });
    // Outside Update goals, the day count stays and sets/reps are not levers.
    const { update: _u, ...plain } = r;
    const q = parseProposal({ message: 'm', kcal: 2840, proteinG: 140, cardioMin: 15, days: [1, 3, 5], loads: [{ exerciseId: 'db_incline_press', kg: 22, sets: 4 }] }, { ...plain, kcal: { min: 2000, max: 3500, def: 2800 } }, { kind: 'claude-paste', model: null }, 1);
    expect(q.days).toBeNull();
    expect(q.loads ?? []).toEqual([]);
    expect(q.fatG).toBeUndefined();
  });

  it('the prompt says the date follows the calories and lists the new levers', () => {
    const text = proposalPrompt({ event: 'manual', reason: 'manual', restart: false, choice, ranges: ranges(), window, brief: 'B', name: (x) => x });
    expect(text).toContain('estimates the goal date');
    expect(text).toContain('fatG');
    expect(text).toContain('carbDays');
    expect(text).toContain(`${UPDATE_RULES.days[0]}-${UPDATE_RULES.days[1]} training weekdays`);
    expect(text).toContain('no restart');
  });

  it('the draft is the formula at the default pace, training untouched, marked as the app’s', () => {
    const d = draftProposal(ranges(), 'draft', 1);
    expect(d.source.kind).toBe('engine');
    expect(d.kcal).toBe(kcalForRate(frame, 0.3));
    expect(d.fatG).toBe(fatRange(d.kcal!, 73, 184).min);
    expect(d.days).toBeNull();
    expect(d.tms).toBeUndefined();
  });

  it('a note goes back to Philip with what he kept and unticked', () => {
    const p: GoalProposalRecord = { ...draftProposal(ranges(), 'm', 1), tms: [{ lift: 'bench', fromKg: 90, toKg: 92.5 }] };
    const kept = { kcal: p.kcal, proteinG: null, fatG: null, carbDays: true, cardioMin: p.cardioMin, days: null, swaps: [], tms: [], loads: [] };
    const text = refinePrompt('FIRST', p, kept, 'I wanna do this earlier. Protein 30% please.');
    expect(text.startsWith('FIRST')).toBe(true);
    expect(text).toContain('KEPT kcal');
    expect(text).toContain('UNTICKED proteinG');
    expect(text).toContain('UNTICKED tm bench');
    expect(text).toContain('I wanna do this earlier');
    expect(itemsText(p, kept).length).toBeGreaterThan(3);
  });
});

const TMS = { squat: 135, bench: 90, rdl: 103.5, ohp: 45 };
const cycle1: CycleRecord = {
  index: 1,
  block: 'A',
  startedAt: new Date(2026, 10, 2).getTime(),
  phase: 'gain',
  tms: TMS,
  goal: { startWeightKg: 73, startBfPct: 15, endWeightKg: 75, weeklyRatePct: 0.5, bfLinePct: 15, source: 'user', targetPlanId: null },
};

async function setup() {
  const db = await freshDb();
  await updateProfile({ sex: 'male', heightCm: 184, birthDate: '1998-01-01', activityLevel: 'moderate', goal: 'gain', weightKg: 73 }, db);
  await setUpTraining({ bar: { barKg: 20, plateUnit: 'kg', plates: [20, 10, 5, 2.5, 1.25] }, weightUnit: 'kg', tms: TMS }, db);
  await startCycle(cycle1, db);
  await addTargetPlan({ effectiveFrom: '2026-11-02', calories: 2800, proteinG: 140, fatG: 80, carbsG: 350, method: 'calculated', inputsSnapshot: { weightKg: 73 }, weekdayOverrides: null }, db);
  return db;
}

describe('Update goals: confirm applies in place (cycle kept), Undo restores', () => {
  const cut = { phase: 'lose' as const, startWeightKg: 74, startBfPct: 18, endWeightKg: 70, weeklyRatePct: -0.6, bfLinePct: 13, source: 'user' as const, weeks: 9, deadline: '2027-01-16' };
  const pc = (): Omit<PlanChange, 'id'> => ({
    at: Date.now(),
    cycle: 1,
    event: 'manual',
    reason: 'manual',
    restart: false,
    choice: cut,
    status: 'ready',
    prompt: 'P',
    jobId: null,
    ranges: null,
    proposal: null,
    accepted: null,
    undo: null,
    appliedAt: null,
  });

  it('new goal and phase on the same cycle; profile, P/F/C with fat, even days, days a week', async () => {
    const db = await setup();
    const id = await addPlanChange(pc(), db);
    const next = await applyGoalPlan(id, { kcal: 2300, proteinG: 160, fatG: 70, carbDays: false, cardioMin: 30, days: [1, 3, 5], swaps: [], tms: [], loads: [] }, '2026-11-14', null, db);
    expect(next).toBeNull();
    expect(await db.cycles.count()).toBe(1);
    const c = await db.cycles.get(1);
    expect(c?.endedEarly).toBeUndefined();
    expect(c).toMatchObject({ phase: 'lose', cardioMin: 30, goal: { endWeightKg: 70, deadline: '2027-01-16', bfLinePct: 13 } });
    expect(await db.profile.get('me')).toMatchObject({ goal: 'lose', targetWeightKg: 70, targetBodyFatPct: 13 });
    const plan = planForDate(await db.targetPlans.toArray(), '2026-11-14')!;
    expect(plan).toMatchObject({ calories: 2300, proteinG: 160, fatG: 70, carbsG: Math.round((2300 - 640 - 630) / 4), weekdayOverrides: null });
    expect(await db.trainingProgram.get('me')).toMatchObject({ currentCycle: 1, trainingDays: [1, 3, 5], carbDays: false });

    await undoGoalPlan(id, '2026-11-14', db);
    expect(await db.cycles.get(1)).toMatchObject({ phase: 'gain', goal: cycle1.goal });
    expect((await db.cycles.get(1))?.cardioMin).toBeUndefined();
    expect(await db.profile.get('me')).toMatchObject({ goal: 'gain' });
    const prog = await db.trainingProgram.get('me');
    expect(prog?.trainingDays).toBeUndefined();
    expect(prog?.carbDays).toBeUndefined();
    expect(planForDate(await db.targetPlans.toArray(), '2026-11-14')).toMatchObject({ calories: 2800, fatG: 80 });
  });

  it('only the carb-days switch ticked: same numbers, gym days get the extra carbs', async () => {
    const db = await setup();
    const id = await addPlanChange(pc(), db);
    await applyGoalPlan(id, { kcal: null, proteinG: null, fatG: null, carbDays: true, cardioMin: null, days: null, swaps: [] }, '2026-11-14', null, db);
    const plan = planForDate(await db.targetPlans.toArray(), '2026-11-14')!;
    expect(plan).toMatchObject({ calories: 2800, proteinG: 140, fatG: 80, carbsG: 350 });
    expect(plan.weekdayOverrides).not.toBeNull();
  });
});
