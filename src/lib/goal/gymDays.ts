/**
 * Story 17 (OBS-F17324, D-040): nutrition follows the days he actually trains. Pure, tested.
 *
 * Carb-day plans (PB-3.4) store gym-day and rest-day macros by weekday, written when the plan was made.
 * Moving a workout (Settings › Training days, or a one-week move on the calendar) or training on a rest
 * day left those weekday numbers behind. Here the week's gym days are worked out from the schedule and
 * the logs every time:
 *   gym dates = planned training dates this week (this week's move first, else the usual weekdays)
 *             ∪ dates with a done or in-progress workout.
 * Rest-day macros don't depend on how many gym days there are (fat 0.9–1.1 g/kg, carbs × 0.7), so they
 * are taken from the plan as stored. Gym-day calories are re-solved for the actual count so the week's
 * calories still equal the flat plan (PB-3.4): gym kcal = (7 × flat − rest days × rest kcal) ÷ gym days,
 * protein and fat as stored, carbs fill the rest.
 *
 * Plans without carb days (manual weekly plans included) are never touched. Weeks before the current one
 * keep the weekday numbers stored on their plan, so a later change of training days never rewrites
 * history; this week and later follow the schedule.
 */
import type { IsoWeekday, Macros, TargetPlan, WeekDays, WorkoutSession, YMD } from '../../db/types';
import { addDays, startOfWeek } from '../date';
import { isTrainingDate } from '../training/schedule';

export interface GymContext {
  /** Today. Weeks before this week keep the plan's stored weekday numbers (history is never re-solved). */
  today: YMD;
  trainingDays?: readonly IsoWeekday[] | null;
  weekDays?: WeekDays | null;
  sessions: readonly Pick<WorkoutSession, 'date' | 'status'>[];
}

/** The 7 dates (Monday first) of the week containing `date`. */
export function weekOf(date: YMD): YMD[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** OBS-F17324: this week's gym dates (planned after any move, plus any day with a workout logged or running). */
export function gymDatesInWeek(date: YMD, ctx: GymContext): Set<YMD> {
  const logged = new Set(ctx.sessions.filter((s) => s.status === 'done' || s.status === 'in_progress').map((s) => s.date));
  return new Set(weekOf(date).filter((d) => logged.has(d) || isTrainingDate(d, ctx.trainingDays, ctx.weekDays)));
}

const pick = (m: Macros): Macros => ({ calories: m.calories, proteinG: m.proteinG, fatG: m.fatG, carbsG: m.carbsG });
const same = (a: Macros, b: Macros) => a.calories === b.calories && a.proteinG === b.proteinG && a.fatG === b.fatG && a.carbsG === b.carbsG;

/** A carb-day plan's gym and rest macros (gym = the one with more carbs). Null for any other plan. */
export function carbSplitOf(plan: TargetPlan): { train: Macros; rest: Macros } | null {
  if (plan.inputsSnapshot?.carbDays !== true || !plan.weekdayOverrides) return null;
  const vals = Object.values(plan.weekdayOverrides).filter((m): m is Macros => !!m);
  if (vals.length !== 7) return null;
  const distinct: Macros[] = [];
  for (const v of vals) if (!distinct.some((d) => same(d, v))) distinct.push(pick(v));
  if (distinct.length !== 2) return null;
  const [a, b] = distinct as [Macros, Macros];
  return a.carbsG >= b.carbsG ? { train: a, rest: b } : { train: b, rest: a };
}

/**
 * OBS-F17324: the macros for `date` under a carb-day plan, from the week's actual gym dates. Null when the
 * plan isn't a carb-day plan (the caller then uses the plan as stored).
 * No gym day, or every day a gym day, means there's nothing to move: the flat plan.
 */
export function carbDayTarget(plan: TargetPlan, date: YMD, ctx: GymContext): Macros | null {
  if (startOfWeek(date) < startOfWeek(ctx.today)) return null;
  const split = carbSplitOf(plan);
  if (!split) return null;
  const gym = gymDatesInWeek(date, ctx);
  const g = gym.size;
  const r = 7 - g;
  if (g === 0 || r === 0) return pick(plan);
  if (!gym.has(date)) return { ...split.rest };
  // Same number of gym days as the plan was solved for: its gym-day numbers as stored.
  const storedGym = Object.values(plan.weekdayOverrides ?? {}).filter((m) => !!m && same(pick(m), split.train)).length;
  if (storedGym === g) return { ...split.train };
  const gymKcal = (plan.calories * 7 - r * split.rest.calories) / g;
  const P = split.train.proteinG;
  const F = split.train.fatG;
  const C = Math.max(0, Math.round((gymKcal - P * 4 - F * 9) / 4));
  return { calories: P * 4 + F * 9 + C * 4, proteinG: P, fatG: F, carbsG: C };
}

/** Is `date` a gym day this week (for labels such as "Gym day" / "Rest day")? */
export const isGymDate = (date: YMD, ctx: GymContext): boolean => gymDatesInWeek(date, ctx).has(date);

