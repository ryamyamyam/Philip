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
/** Story 12: the owner can train 3–5 days a week; the 4-lift rotation and the 16-session cycle stay. */
export const MIN_TRAINING_DAYS = 3;
export const MAX_TRAINING_DAYS = 5;
/** Philip's pick for each count (coaching defaults; 5 days always has one run of three). */
const PICK: Record<number, readonly IsoWeekday[]> = { 3: [1, 3, 5], 4: DEFAULT_TRAINING_DAYS, 5: [1, 2, 4, 5, 6] };
export const defaultDaysFor = (n: number): IsoWeekday[] => [...(PICK[n] ?? DEFAULT_TRAINING_DAYS)];

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

/** The owner's days if valid (3–5 distinct weekdays), else Philip's four-day pick. */
export function trainingDaysOrDefault(days: readonly IsoWeekday[] | undefined | null): IsoWeekday[] {
  const set = [...new Set(days ?? [])].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  return set.length >= MIN_TRAINING_DAYS && set.length <= MAX_TRAINING_DAYS ? set : [...DEFAULT_TRAINING_DAYS];
}

const gapDays = (a: number, b: number) => ((b - a + 7) % 7) || 7;

/** How many places have three training days within two calendar days (squat and RDL would be two apart). */
export function closeTriples(days: readonly IsoWeekday[]): number {
  const d = [...new Set(days)].sort((a, b) => a - b);
  const n = d.length;
  if (n < MIN_TRAINING_DAYS) return 0;
  let count = 0;
  for (let i = 0; i < n; i++) if (gapDays(d[i] as number, d[(i + 1) % n] as number) + gapDays(d[(i + 1) % n] as number, d[(i + 2) % n] as number) <= 2) count++;
  return count;
}

/**
 * Philip's weekdays for `n` days a week: fewest close triples first, then the most days kept from
 * `current`, then his own pick. Pure; searches all C(7, n) sets.
 */
export function bestDays(n: number, current: readonly IsoWeekday[]): IsoWeekday[] {
  const pick = defaultDaysFor(n);
  let best: IsoWeekday[] | null = null;
  let bestKey: [number, number, number] | null = null;
  for (let mask = 1; mask < 128; mask++) {
    const set: IsoWeekday[] = [];
    for (let d = 1; d <= 7; d++) if (mask & (1 << (d - 1))) set.push(d as IsoWeekday);
    if (set.length !== n) continue;
    const key: [number, number, number] = [closeTriples(set), -set.filter((x) => current.includes(x)).length, -set.filter((x) => pick.includes(x)).length];
    if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
      best = set;
      bestKey = key;
    }
  }
  return best ?? pick;
}

/**
 * True when squat (Day 1) and RDL (Day 3) can land only 2 calendar days apart, i.e. three training
 * days in a row. A cycle can start on any of the days, so every rotation is checked (both squat →
 * RDL and RDL → next squat). Story 12: any 3–5 days; five days always has one such run.
 */
export function squatRdlTooClose(days: readonly IsoWeekday[]): boolean {
  return closeTriples(days) > 0;
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
