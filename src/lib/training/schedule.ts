/**
 * Projected training calendar (Story 6 §3.1–3.2, T-019). Pure.
 * Planned dates are never stored: they're recomputed from today every time, so a missed day pushes
 * the rest (and the goal day) forward, and training on an off day pulls them back. No guilt marks.
 */
import type { IsoWeekday, WorkoutSession, YMD } from '../../db/types';
import { addDays, weekdayOf } from '../date';
import { DAY_LIFT, type Day, type LiftId, type Week } from './program';

/** Philip's pick: squat and RDL 3 days apart, bench and OHP 3 days apart, weekend free (coaching default). */
export const DEFAULT_TRAINING_DAYS: readonly IsoWeekday[] = [1, 2, 4, 5];
export const TRAINING_DAYS_PER_WEEK = 4;

export interface PlannedDay {
  date: YMD;
  week: Week;
  day: Day;
  lift: LiftId;
  isGoalDay: boolean;
}

export const isoWeekday = (date: YMD): IsoWeekday => {
  const wd = weekdayOf(date); // 0 = Sun
  return (wd === 0 ? 7 : wd) as IsoWeekday;
};

/** The owner's days if valid (exactly 4 distinct weekdays), else Philip's pick. */
export function trainingDaysOrDefault(days: readonly IsoWeekday[] | undefined | null): IsoWeekday[] {
  const set = [...new Set(days ?? [])].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  return set.length === TRAINING_DAYS_PER_WEEK ? set : [...DEFAULT_TRAINING_DAYS];
}

/**
 * True when squat (Day 1) and RDL (Day 3) can land only 2 calendar days apart, i.e. three training
 * days in a row. With exactly 4 distinct weekdays they can never be back to back, but a cycle can
 * start on any of the 4 days, so every rotation is checked (both squat → RDL and RDL → next squat).
 */
export function squatRdlTooClose(days: readonly IsoWeekday[]): boolean {
  const d = [...new Set(days)].sort((a, b) => a - b);
  if (d.length !== TRAINING_DAYS_PER_WEEK) return false;
  const gap = (a: number, b: number) => ((b - a + 7) % 7) || 7;
  return d.some((x, i) => gap(x, d[(i + 2) % 4] as number) <= 2);
}

/** Remaining (week, day) refs of a cycle in sequence order; an in-progress one stays in its place. */
function remainingRefs(sessions: readonly WorkoutSession[], cycle: number): { week: Week; day: Day }[] {
  const closed = new Set(sessions.filter((s) => s.cycle === cycle && s.status !== 'in_progress').map((s) => `${s.week}-${s.day}`));
  const out: { week: Week; day: Day }[] = [];
  for (const week of [1, 2, 3, 4] as const) for (const day of [1, 2, 3, 4] as const) if (!closed.has(`${week}-${day}`)) out.push({ week, day });
  return out;
}

export interface PlanInput {
  today: YMD;
  trainingDays?: readonly IsoWeekday[] | null;
  sessions: readonly WorkoutSession[];
  /** Current cycle index; null or < 1 when no cycle is running. */
  cycle: number | null;
}

/**
 * Planned dates for the rest of the current cycle. The first one is today when today is a training
 * day with nothing done yet, or when a session is in progress today; otherwise the next training day.
 * The last one is the cycle's goal day.
 */
export function planDates({ today, trainingDays, sessions, cycle }: PlanInput): PlannedDay[] {
  if (cycle === null || cycle < 1) return [];
  const refs = remainingRefs(sessions, cycle);
  if (refs.length === 0) return [];
  const days = new Set(trainingDaysOrDefault(trainingDays));
  const todays = sessions.filter((s) => s.date === today);
  const doneToday = todays.some((s) => s.status === 'done');
  const openToday = todays.some((s) => s.status === 'in_progress');

  let date: YMD;
  if (openToday || (!doneToday && days.has(isoWeekday(today)))) date = today;
  else {
    date = addDays(today, 1);
    while (!days.has(isoWeekday(date))) date = addDays(date, 1);
  }
  const out: PlannedDay[] = [];
  refs.forEach((r, i) => {
    if (i > 0) {
      date = addDays(date, 1);
      while (!days.has(isoWeekday(date))) date = addDays(date, 1);
    }
    out.push({ date, week: r.week, day: r.day, lift: DAY_LIFT[r.day], isGoalDay: i === refs.length - 1 });
  });
  return out;
}

/** The cycle's goal day (date of the last remaining session), or null when no cycle is running. */
export const goalDay = (input: PlanInput): YMD | null => planDates(input).at(-1)?.date ?? null;
