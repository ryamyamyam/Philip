/**
 * Story 12: Confirm on "Your time" (Settings › Training). One transaction: his weekdays and minutes on
 * the program, the cycle's cardio minutes, and (only when it moves) a new target plan, append-only like
 * every plan. Undo (a toast, for the moment he's looking at it) restores the program and cardio and
 * appends a copy of the plan that was in force.
 */
import { db, type PhilipDB } from './db';
import { GoalApplyError } from './goalRepo';
import type { IsoWeekday, TargetPlan, TrainingAvailability, YMD } from './types';
import type { AvailabilityPlan } from '../lib/training/availability';
import { planForDate } from '../lib/nutrition';

export interface AvailabilityUndo {
  trainingDays: IsoWeekday[] | null;
  availability: TrainingAvailability | null;
  carbDays: boolean | null;
  cycle: { index: number; cardioMin: number | null } | null;
  targetPlanBefore: Omit<TargetPlan, 'id' | 'createdAt'> | null;
  addedPlan: boolean;
}

export async function applyAvailability(plan: AvailabilityPlan, today: YMD, phase: string, database: PhilipDB = db): Promise<AvailabilityUndo> {
  return database.transaction('rw', [database.trainingProgram, database.cycles, database.targetPlans, database.workoutSessions], async () => {
    const program = await database.trainingProgram.get('me');
    if (!program) throw new GoalApplyError('missing');
    const sessions = await database.workoutSessions.toArray();
    if (sessions.some((s) => s.status === 'in_progress')) throw new GoalApplyError('workoutOpen');
    const now = Date.now();
    const plans = await database.targetPlans.toArray();
    const before = planForDate(plans, today);
    const undo: AvailabilityUndo = {
      trainingDays: program.trainingDays ? [...program.trainingDays] : null,
      availability: program.availability ? { ...program.availability } : null,
      carbDays: program.carbDays ?? null,
      cycle: null,
      targetPlanBefore: before ? (({ id: _i, createdAt: _c, ...rest }) => rest)(before) : null,
      addedPlan: false,
    };
    await database.trainingProgram.put({
      ...program,
      trainingDays: [...plan.days],
      availability: { strengthMin: plan.strengthMin, cardioMin: plan.cardioCap },
      carbDays: plan.carbDaysOn,
      updatedAt: now,
    });
    const cycle = program.currentCycle > 0 ? await database.cycles.get(program.currentCycle) : undefined;
    if (cycle && plan.cardioChanged) {
      undo.cycle = { index: cycle.index, cardioMin: cycle.cardioMin ?? null };
      await database.cycles.put({ ...cycle, cardioMin: plan.cardioPlanned });
    }
    if (plan.writePlan && plan.food) {
      await database.targetPlans.add({
        effectiveFrom: today,
        ...plan.food,
        method: 'calculated',
        inputsSnapshot: { source: 'availability', goal: phase, trainingDays: plan.days.length, carbDays: plan.carbDaysOn },
        weekdayOverrides: plan.carb?.overrides ?? null,
        createdAt: now,
      });
      undo.addedPlan = true;
    }
    return undo;
  });
}

export async function undoAvailability(u: AvailabilityUndo, today: YMD, database: PhilipDB = db): Promise<void> {
  await database.transaction('rw', [database.trainingProgram, database.cycles, database.targetPlans], async () => {
    const program = await database.trainingProgram.get('me');
    const now = Date.now();
    if (program) {
      const { trainingDays: _d, availability: _a, carbDays: _c, ...rest } = program;
      await database.trainingProgram.put({
        ...rest,
        ...(u.trainingDays ? { trainingDays: u.trainingDays } : {}),
        ...(u.availability ? { availability: u.availability } : {}),
        ...(u.carbDays !== null ? { carbDays: u.carbDays } : {}),
        updatedAt: now,
      });
    }
    if (u.cycle) {
      const c = await database.cycles.get(u.cycle.index);
      if (c) {
        const { cardioMin: _c, ...rest } = c;
        await database.cycles.put({ ...rest, ...(u.cycle.cardioMin !== null ? { cardioMin: u.cycle.cardioMin } : {}) });
      }
    }
    if (u.addedPlan && u.targetPlanBefore) await database.targetPlans.add({ ...u.targetPlanBefore, effectiveFrom: today, createdAt: now });
  });
}
