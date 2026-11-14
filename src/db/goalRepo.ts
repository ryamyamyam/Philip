/**
 * Story 11: goal events, Philip's plans for them, Apply and Undo. Every write goes through here.
 *
 * Apply (one transaction):
 * - **Goal reached** (owner, 2026-11-13) or **Restart**: the current cycle ends early, last cycle's TM
 *   progression applies (a lift with no key set logged holds), and the next cycle starts on the next
 *   block with the new goal. Old logs stay as they are.
 * - **Off track**, no restart: the cycle continues; the goal, calories, cardio, days and swaps change
 *   now. A phase change in the profile still takes effect at the next cycle (Story 5 rule).
 * - Calories and protein are Philip's picks inside the engine's range, written as a new target plan
 *   (append-only). Fat sits on the calculator's floor; carbs fill the rest.
 *
 * Undo restores every value it changed: for 24 hours, and for a restart only while the new cycle has no
 * logged session. Target plans and TM history stay append-only: Undo appends a copy of the plan that
 * was in force, and TM rows written for a cycle that is undone are superseded when it starts again.
 */
import { db, type PhilipDB } from './db';
import type { CycleRecord, GoalPlanItems, GoalPlanUndo, PlanChange, TargetPlan, YMD } from './types';
import { planForDate } from '../lib/nutrition';
import { macrosFor } from '../lib/goal/proposal';
import { blockForCycle } from '../lib/training/program';
import { slotKey } from '../lib/training/exercises';
import { nextCycleIndex } from '../lib/training/progress';
import { progressionFor } from '../lib/training/nextCycle';

export { firedPrompts, markPromptFired } from './goalPrompts';

export const UNDO_WINDOW_MS = 24 * 3600_000;

export async function addPlanChange(pc: Omit<PlanChange, 'id'>, database: PhilipDB = db): Promise<number> {
  return (await database.planChanges.add(pc)) as number;
}

export async function updatePlanChange(id: number, changes: Partial<Omit<PlanChange, 'id'>>, database: PhilipDB = db): Promise<void> {
  await database.planChanges.update(id, changes);
}

export function allPlanChanges(database: PhilipDB = db): Promise<PlanChange[]> {
  return database.planChanges.orderBy('at').toArray();
}

export class GoalApplyError extends Error {
  constructor(public readonly code: 'missing' | 'workoutOpen' | 'stale') {
    super(code);
    this.name = 'GoalApplyError';
  }
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Applies the plan with the levers the owner kept on. Returns the new cycle index when it restarted. */
export async function applyGoalPlan(id: number, items: GoalPlanItems, today: YMD, note: string | null, database: PhilipDB = db): Promise<number | null> {
  const tables = [database.planChanges, database.cycles, database.trainingProgram, database.tmHistory, database.workoutSessions, database.profile, database.targetPlans, database.slotChoices, database.coachNotes];
  return database.transaction('rw', tables, async () => {
    const pc = await database.planChanges.get(id);
    const program = await database.trainingProgram.get('me');
    const profile = await database.profile.get('me');
    if (!pc || !program || !profile) throw new GoalApplyError('missing');
    if (pc.status === 'applied') throw new GoalApplyError('stale');
    const sessions = await database.workoutSessions.toArray();
    if (sessions.some((s) => s.status === 'in_progress')) throw new GoalApplyError('workoutOpen');
    const cycles = await database.cycles.toArray();
    const current = cycles.find((c) => c.index === program.currentCycle);
    if (!current || current.index !== pc.cycle) throw new GoalApplyError('stale');
    const now = Date.now();
    const c = pc.choice;
    const plans = await database.targetPlans.toArray();
    const before = planForDate(plans, today);

    const undo: GoalPlanUndo = {
      restart: null,
      cycleBefore: null,
      profile: { goal: profile.goal, targetWeightKg: profile.targetWeightKg, weeklyRateKg: profile.weeklyRateKg, targetBodyFatPct: profile.targetBodyFatPct },
      targetPlanBefore: before ? stripPlan(before) : null,
      trainingDays: program.trainingDays ? [...program.trainingDays] : null,
      swaps: [],
      noteIds: [],
    };

    // Calories and protein → a new plan (append-only), effective today.
    let targetPlanId: number | null = null;
    if (items.kcal !== null || items.proteinG !== null) {
      const kcal = items.kcal ?? before?.calories ?? null;
      const protein = items.proteinG ?? before?.proteinG ?? null;
      if (kcal !== null && protein !== null) {
        const m = macrosFor(kcal, protein, c.startWeightKg, profile.heightCm);
        targetPlanId = (await database.targetPlans.add({
          effectiveFrom: today,
          ...m,
          method: 'calculated',
          inputsSnapshot: {
            source: 'goalPlan',
            planChangeId: id,
            goal: c.phase,
            weightKg: c.startWeightKg,
            targetWeightKg: c.phase === 'maintain' ? null : c.endWeightKg,
            weeklyRateKg: Math.round((Math.abs(c.endWeightKg - c.startWeightKg) / 4) * 100) / 100,
          },
          weekdayOverrides: null,
          createdAt: now,
        })) as number;
      }
    }
    const goal = { startWeightKg: c.startWeightKg, startBfPct: c.startBfPct, endWeightKg: c.endWeightKg, weeklyRatePct: c.weeklyRatePct, bfLinePct: c.bfLinePct, source: c.source === 'philip' ? ('philip' as const) : ('user' as const), targetPlanId };

    let block = blockForCycle(current.index);
    let newIndex: number | null = null;
    if (pc.restart) {
      newIndex = nextCycleIndex(cycles, sessions);
      block = blockForCycle(newIndex);
      const { rows, snapshot } = progressionFor(await database.tmHistory.toArray(), sessions, current, newIndex);
      const tmIds: number[] = [];
      for (const r of rows) tmIds.push((await database.tmHistory.add({ lift: r.lift, tmKg: r.tmKg, effectiveCycle: newIndex, reason: r.reason, createdAt: now })) as number);
      await database.cycles.put({
        ...current,
        endedEarly: { at: now, reason: pc.event === 'reached' ? 'goal-reached' : 'restart' },
        ...(pc.event === 'reached' ? { reachedAt: today } : {}),
      });
      const next: CycleRecord = { index: newIndex, block, startedAt: now, phase: c.phase, tms: snapshot, goal, ...(items.cardioMin !== null ? { cardioMin: items.cardioMin } : {}) };
      await database.cycles.put(next);
      undo.restart = { oldCycle: current.index, newCycle: newIndex, tmIds };
    } else {
      // Off track, same cycle: the goal stays; Philip's levers aim at it.
      undo.cycleBefore = { index: current.index, goal: { ...current.goal }, cardioMin: current.cardioMin ?? null };
      await database.cycles.put({ ...current, ...(items.cardioMin !== null ? { cardioMin: items.cardioMin } : {}) });
    }

    for (const s of items.swaps) {
      const key = slotKey(s.day, s.slot, block);
      undo.swaps.push({ slotKey: key, from: (await database.slotChoices.get(key))?.exerciseId ?? null });
      await database.slotChoices.put({ slotKey: key, exerciseId: s.exerciseId, chosenAt: now });
    }
    await database.trainingProgram.put({
      ...program,
      ...(newIndex !== null ? { currentCycle: newIndex } : {}),
      ...(items.days ? { trainingDays: [...items.days] } : {}),
      updatedAt: now,
    });
    if (pc.restart) await database.profile.put({
      ...profile,
      goal: c.phase,
      targetWeightKg: c.phase === 'maintain' ? profile.targetWeightKg : r1(c.endWeightKg),
      weeklyRateKg: Math.round(((c.endWeightKg - c.startWeightKg) / 4) * 100) / 100,
      ...(c.source === 'user' && c.bfLinePct !== null ? { targetBodyFatPct: c.bfLinePct } : {}),
    });
    const notes = [note, ...(pc.proposal?.remember ?? [])].filter((x): x is string => !!x);
    const have = new Set((await database.coachNotes.toArray()).map((n) => n.text.toLowerCase().trim()));
    for (const text of notes) {
      if (have.has(text.toLowerCase().trim())) continue;
      undo.noteIds.push((await database.coachNotes.add({ text, source: 'ask', sessionId: null, createdAt: now })) as number);
    }
    await database.planChanges.put({ ...pc, status: 'applied', accepted: items, undo, appliedAt: now });
    return newIndex;
  });
}

function stripPlan(p: TargetPlan): Omit<TargetPlan, 'id' | 'createdAt'> {
  const { id: _id, createdAt: _c, ...rest } = p;
  return rest;
}

/** Why Undo is (not) available right now. */
export function canUndo(pc: PlanChange, sessions: readonly { cycle: number }[], now: number): 'ok' | 'expired' | 'trained' | 'notApplied' {
  if (pc.status !== 'applied' || !pc.undo || pc.appliedAt === null) return 'notApplied';
  if (now - pc.appliedAt > UNDO_WINDOW_MS) return 'expired';
  if (pc.undo.restart && sessions.some((s) => s.cycle === pc.undo?.restart?.newCycle)) return 'trained';
  return 'ok';
}

export async function undoGoalPlan(id: number, today: YMD, database: PhilipDB = db): Promise<void> {
  const tables = [database.planChanges, database.cycles, database.trainingProgram, database.workoutSessions, database.profile, database.targetPlans, database.slotChoices, database.coachNotes];
  await database.transaction('rw', tables, async () => {
    const pc = await database.planChanges.get(id);
    const sessions = await database.workoutSessions.toArray();
    if (!pc || canUndo(pc, sessions, Date.now()) !== 'ok' || !pc.undo) throw new GoalApplyError('stale');
    const u = pc.undo;
    const now = Date.now();
    const program = await database.trainingProgram.get('me');
    const profile = await database.profile.get('me');
    if (u.restart) {
      await database.cycles.delete(u.restart.newCycle);
      const old = await database.cycles.get(u.restart.oldCycle);
      if (old) {
        const { endedEarly: _e, reachedAt: _r, ...rest } = old;
        await database.cycles.put(rest);
      }
    } else if (u.cycleBefore) {
      const cur = await database.cycles.get(u.cycleBefore.index);
      if (cur) {
        const { cardioMin: _c, ...rest } = cur;
        await database.cycles.put({ ...rest, goal: u.cycleBefore.goal, ...(u.cycleBefore.cardioMin !== null ? { cardioMin: u.cycleBefore.cardioMin } : {}) });
      }
    }
    for (const s of u.swaps) {
      if (s.from === null) await database.slotChoices.delete(s.slotKey);
      else await database.slotChoices.put({ slotKey: s.slotKey, exerciseId: s.from, chosenAt: now });
    }
    if (program) {
      const { trainingDays: _d, ...rest } = program;
      await database.trainingProgram.put({
        ...rest,
        ...(u.trainingDays ? { trainingDays: [...u.trainingDays] } : {}),
        ...(u.restart ? { currentCycle: u.restart.oldCycle } : {}),
        updatedAt: now,
      });
    }
    if (profile) await database.profile.put({ ...profile, ...u.profile });
    if (u.targetPlanBefore && pc.accepted && (pc.accepted.kcal !== null || pc.accepted.proteinG !== null)) {
      await database.targetPlans.add({ ...u.targetPlanBefore, effectiveFrom: today, createdAt: now });
    }
    if (u.noteIds.length) await database.coachNotes.bulkDelete(u.noteIds);
    await database.planChanges.put({ ...pc, status: 'undone' });
  });
}
