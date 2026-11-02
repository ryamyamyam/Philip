/**
 * Weight log helpers for the Progress tab (OBS-F047E3).
 *
 * Expected line: starts at the plan's starting weight on its effectiveFrom date and moves by the
 * weekly rate (the same capped rate the calculator used), stopping at the goal weight.
 * Like the calculator, this is a rough linear projection, not a prediction.
 */
import type { Goal, Profile, TargetPlan, WeightEntry, YMD } from '../db/types';
import { addDays, daysBetween } from './date';
import { resolveRate } from './targets';

export interface WeightPlanLine {
  startDate: YMD;
  startKg: number;
  /** Signed kg/week: negative = loss. */
  rateKg: number;
  targetKg: number | null;
}

const GOALS: readonly Goal[] = ['lose', 'maintain', 'gain'];
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * The expected-weight line for the plan active on `today`: the newest calculated plan with a
 * starting weight in its inputs. Manual plans have no starting weight, so they produce no line.
 */
export function weightPlanLine(plans: readonly TargetPlan[], profile: Pick<Profile, 'weeklyRateKg' | 'targetWeightKg' | 'goal'>, today: YMD): WeightPlanLine | null {
  const plan = [...plans]
    .filter((p) => p.method === 'calculated' && p.effectiveFrom <= today && isNum(p.inputsSnapshot?.weightKg))
    .sort((a, b) => (a.effectiveFrom === b.effectiveFrom ? b.createdAt - a.createdAt : a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  if (!plan || !plan.inputsSnapshot) return null;
  const snap = plan.inputsSnapshot;
  const startKg = snap.weightKg as number;
  const goal: Goal = typeof snap.goal === 'string' && (GOALS as readonly string[]).includes(snap.goal) ? (snap.goal as Goal) : (profile.goal ?? 'maintain');
  const requested = profile.weeklyRateKg != null ? Math.abs(profile.weeklyRateKg) : isNum(snap.weeklyRateKg) ? snap.weeklyRateKg : null;
  const { rateKg } = resolveRate(goal, startKg, requested);
  const sign = goal === 'lose' ? -1 : goal === 'gain' ? 1 : 0;
  const targetKg = isNum(snap.targetWeightKg) ? snap.targetWeightKg : profile.targetWeightKg;
  return { startDate: plan.effectiveFrom, startKg, rateKg: sign * rateKg, targetKg: goal === 'maintain' ? null : targetKg ?? null };
}

/** Expected weight on a date. Flat before the start; never moves past the goal weight. */
export function expectedWeightOn(line: WeightPlanLine, date: YMD): number {
  const days = Math.max(0, daysBetween(line.startDate, date));
  const raw = line.startKg + (line.rateKg * days) / 7;
  if (line.targetKg == null || line.rateKg === 0) return round1(raw);
  return round1(line.rateKg < 0 ? Math.max(raw, line.targetKg) : Math.min(raw, line.targetKg));
}

/** Estimated date the goal weight is reached on the expected line, or null if it never is. */
export function goalDate(line: WeightPlanLine): YMD | null {
  if (line.targetKg == null || line.rateKg === 0) return null;
  const delta = line.targetKg - line.startKg;
  if (delta === 0 || Math.sign(delta) !== Math.sign(line.rateKg)) return null;
  return addDays(line.startDate, Math.ceil((Math.abs(delta / line.rateKg) * 7)));
}

/** Most recent entry on or before a date. */
export function latestWeight(entries: readonly WeightEntry[], onOrBefore?: YMD): WeightEntry | null {
  let best: WeightEntry | null = null;
  for (const e of entries) if ((!onOrBefore || e.date <= onOrBefore) && (!best || e.date > best.date)) best = e;
  return best;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Accepted body-weight range for the log (kg), same as the calculator's input check. */
export const WEIGHT_LOG_RANGE = { min: 35, max: 300 } as const;
