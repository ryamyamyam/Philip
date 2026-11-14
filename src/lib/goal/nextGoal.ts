/**
 * Story 11 §4: the next goal's three options. Pure, tested.
 *
 * - **Repeat** (preselected, owner 2026-11-13): the last goal's change over the same planned length
 *   (a cycle, 4 weeks) from where he is now, with the same BF line ("+2 kg more, hold 15%").
 * - **Philip's pick**: the Story 5 default for the recommended phase, always bulk or cut (OBS-FF441B).
 *   A bulk at its BF ceiling gets a short cut; a cut at the long-term BF target gets a lean bulk.
 * - **Set my own**: checked by `checkUserGoal` (and the targets.ts safety rules behind it).
 */
import type { CycleGoalSnapshot, GoalChoice } from '../../db/types';
import { checkUserGoal, coachPhase, CUT_AT_BF, CYCLE_WEEKS, philipGoal, type GoalIssue, type LastCycle, type PhaseWhy } from '../training/cycleGoal';
import type { Phase } from '../training/program';

export interface PrevGoal {
  phase: Phase;
  goal: Pick<CycleGoalSnapshot, 'startWeightKg' | 'endWeightKg' | 'bfLinePct' | 'weeklyRatePct' | 'startBfPct'> & { weeks?: number };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function repeatGoal(prev: PrevGoal, nowKg: number, bfPct: number | null, weeks: number = prev.goal.weeks ?? CYCLE_WEEKS): GoalChoice & { issues: GoalIssue[] } {
  const delta = prev.goal.endWeightKg - prev.goal.startWeightKg;
  const end = r1(nowKg + delta);
  const { ratePct, issues } = checkUserGoal(nowKg, prev.phase, end, prev.goal.bfLinePct, weeks);
  return {
    phase: prev.phase,
    startWeightKg: r1(nowKg),
    startBfPct: bfPct,
    endWeightKg: end,
    weeklyRatePct: ratePct,
    bfLinePct: prev.goal.bfLinePct,
    source: 'repeat',
    weeks,
    issues,
  };
}

export type { PhaseWhy };

/**
 * The phase Philip recommends next, and why. OBS-FF441B: always a direction (bulk or cut); a bulk that
 * reached its BF ceiling gets a short cut, not a 0% maintain cycle.
 */
export function recommendNextPhase(prev: PrevGoal, bfPct: number | null, longTermBfPct: number | null): { phase: Phase; why: PhaseWhy } {
  if (bfPct !== null && bfPct >= CUT_AT_BF && prev.phase !== 'lose') return { phase: 'lose', why: 'highBf' };
  if (prev.phase === 'gain' && bfPct !== null && prev.goal.bfLinePct !== null && bfPct >= prev.goal.bfLinePct) return { phase: 'lose', why: 'bfCeiling' };
  return coachPhase(bfPct, longTermBfPct, prev.phase);
}

export function philipNextGoal(prev: PrevGoal, nowKg: number, bfPct: number | null, phase: Phase, daysTaken: number, weeks: number = CYCLE_WEEKS): GoalChoice {
  const taken = Math.max(1, daysTaken / 7);
  const actualRatePct = ((nowKg - prev.goal.startWeightKg) / prev.goal.startWeightKg / taken) * 100;
  const bfDelta = bfPct !== null && prev.goal.startBfPct !== null ? bfPct - prev.goal.startBfPct : null;
  const last: LastCycle = { phase: prev.phase, plannedRatePct: prev.goal.weeklyRatePct, actualRatePct, bfDelta };
  const g = philipGoal(r1(nowKg), bfPct, phase, last, weeks);
  return { phase, startWeightKg: g.startWeightKg, startBfPct: g.startBfPct, endWeightKg: g.endWeightKg, weeklyRatePct: g.weeklyRatePct, bfLinePct: g.bfLinePct, source: 'philip', weeks };
}

export function ownGoal(nowKg: number, bfPct: number | null, phase: Phase, endKg: number, bfLine: number | null, weeks: number = CYCLE_WEEKS): (GoalChoice & { issues: GoalIssue[] }) {
  const { ratePct, issues } = checkUserGoal(nowKg, phase, endKg, bfLine, weeks);
  return { phase, startWeightKg: r1(nowKg), startBfPct: bfPct, endWeightKg: r1(endKg), weeklyRatePct: ratePct, bfLinePct: bfLine, source: 'user', weeks, issues };
}

/** Planned length of a goal (= a cycle). */
export const GOAL_WEEKS = CYCLE_WEEKS;
