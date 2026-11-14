/**
 * Story 12: the goal date (deadline). Pure, tested.
 *
 * A goal is an end weight and a date. The date sets the pace (% of body weight a week), the pace sets
 * the calories through the targets calculator, and the safety rules behind it stay as they were.
 * Philip suggests the date: the weeks the change needs at the phase's default pace (coaching default,
 * never shorter than the 4-week cycle, never longer than 26 weeks). A goal can run longer than one
 * cycle: the next cycle carries it on until the date.
 */
import type { CycleGoalSnapshot, GoalChoice, YMD } from '../../db/types';
import { addDays, daysBetween } from '../date';
import { CYCLE_WEEKS, RATE_PCT } from '../training/cycleGoal';
import type { Phase } from '../training/program';

export const DEADLINE_RULES = {
  /** Soonest and latest goal date, in days from today (coaching defaults). */
  minDays: 14,
  maxDays: 182,
  /** Philip's suggestion is never shorter or longer than this many weeks. */
  suggestMinWeeks: CYCLE_WEEKS,
  suggestMaxWeeks: 26,
} as const;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Planned length of a goal in weeks (older goals: the 4-week cycle). */
export const goalWeeks = (g: { weeks?: number | undefined }): number => g.weeks ?? CYCLE_WEEKS;

/** Weeks from today to the goal date (two decimals). */
export const weeksUntil = (today: YMD, deadline: YMD): number => r2(daysBetween(today, deadline) / 7);

/** Keeps a picked date inside the allowed window. */
export function clampDeadline(today: YMD, deadline: YMD): YMD {
  const lo = addDays(today, DEADLINE_RULES.minDays);
  const hi = addDays(today, DEADLINE_RULES.maxDays);
  return deadline < lo ? lo : deadline > hi ? hi : deadline;
}

/** The date Philip suggests for moving from `startKg` to `endKg` in `phase`. Maintain, or a goal pointing the wrong way: 4 weeks. */
export function suggestDeadline(phase: Phase, startKg: number, endKg: number, today: YMD): { weeks: number; date: YMD } {
  const rate = Math.abs(RATE_PCT[phase].def);
  const pct = (Math.abs(endKg - startKg) / startKg) * 100;
  const wrongWay = (phase === 'gain' && endKg < startKg) || (phase === 'lose' && endKg > startKg);
  let weeks: number = CYCLE_WEEKS;
  if (phase !== 'maintain' && !wrongWay && rate > 0 && startKg > 0) {
    weeks = Math.min(DEADLINE_RULES.suggestMaxWeeks, Math.max(DEADLINE_RULES.suggestMinWeeks, Math.ceil(pct / rate)));
  }
  return { weeks, date: addDays(today, weeks * 7) };
}

/** The same goal with a date: the weeks and the weekly pace follow from it. */
export function withDeadline<T extends GoalChoice>(c: T, today: YMD, deadline: YMD): T {
  const date = clampDeadline(today, deadline);
  const weeks = Math.max(0.5, weeksUntil(today, date));
  const weeklyRatePct = r2(((c.endWeightKg - c.startWeightKg) / c.startWeightKg / weeks) * 100);
  return { ...c, weeks, deadline: date, weeklyRatePct };
}

/**
 * A goal still running when its cycle ends: same end weight, same date. Null when the goal has no
 * date, the date has passed, the goal was reached, or the phase changed (then Philip picks afresh).
 */
export function continuation(
  last: { phase: Phase; goal: Pick<CycleGoalSnapshot, 'endWeightKg' | 'bfLinePct' | 'deadline' | 'source'> },
  nowKg: number,
  bfPct: number | null,
  phase: Phase,
  today: YMD,
): (Omit<GoalChoice, 'source'> & { source: 'philip' | 'user'; weeks: number; deadline: YMD }) | null {
  const d = last.goal.deadline;
  if (!d || last.phase !== phase || phase === 'maintain' || d < addDays(today, 7)) return null;
  const e = last.goal.endWeightKg;
  if ((phase === 'gain' && nowKg >= e) || (phase === 'lose' && nowKg <= e)) return null;
  const weeks = Math.max(0.5, weeksUntil(today, d));
  return {
    phase,
    startWeightKg: Math.round(nowKg * 10) / 10,
    startBfPct: bfPct,
    endWeightKg: e,
    weeklyRatePct: r2(((e - nowKg) / nowKg / weeks) * 100),
    bfLinePct: last.goal.bfLinePct,
    source: last.goal.source === 'philip' ? 'philip' : 'user',
    weeks,
    deadline: d,
  };
}
