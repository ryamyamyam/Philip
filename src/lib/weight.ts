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
  // OBS-3037F2: a plan refreshed after a weigh-in keeps the line it replaced, so the status stays honest.
  const keepsLine = isNum(snap.lineStartKg) && typeof snap.lineStartDate === 'string';
  const startKg = keepsLine ? (snap.lineStartKg as number) : (snap.weightKg as number);
  const startDate = keepsLine ? (snap.lineStartDate as YMD) : plan.effectiveFrom;
  const goal: Goal = typeof snap.goal === 'string' && (GOALS as readonly string[]).includes(snap.goal) ? (snap.goal as Goal) : (profile.goal ?? 'maintain');
  const requested = profile.weeklyRateKg != null ? Math.abs(profile.weeklyRateKg) : isNum(snap.weeklyRateKg) ? snap.weeklyRateKg : null;
  const { rateKg } = resolveRate(goal, startKg, requested);
  const sign = goal === 'lose' ? -1 : goal === 'gain' ? 1 : 0;
  const targetKg = isNum(snap.targetWeightKg) ? snap.targetWeightKg : profile.targetWeightKg;
  return { startDate, startKg, rateKg: sign * rateKg, targetKg: goal === 'maintain' ? null : targetKg ?? null };
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

export type WeightStatus = 'onTrack' | 'ahead' | 'behind' | 'off' | 'reached' | 'needMore';

export interface WeightProgress {
  status: WeightStatus;
  /** Latest actual minus the plan on that date (kg, signed). Null without a plan or an entry. */
  diffKg: number | null;
  /** Actual trend in kg/week (least-squares over the last 4 weeks), or null with too little data. */
  actualRateKg: number | null;
  /** Plan value for today (kg), or null without a plan. */
  expectedTodayKg: number | null;
}

/** Within this distance of the plan line counts as on track. Body weight moves ~0.5 kg day to day. */
export const ON_TRACK_KG = 0.5;
const TREND_DAYS = 28;

/** Least-squares slope in kg/week over entries in the last 4 weeks; needs 2+ entries spanning 7+ days. */
export function weeklyTrend(entries: readonly WeightEntry[], today: YMD): number | null {
  const from = addDays(today, -TREND_DAYS);
  const pts = entries.filter((e) => e.date >= from && e.date <= today).map((e) => ({ x: daysBetween(from, e.date), y: e.weightKg }));
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p.x);
  if (Math.max(...xs) - Math.min(...xs) < 7) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const num = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
  const den = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  return den === 0 ? null : Math.round((num / den) * 7 * 100) / 100;
}

/**
 * "Am I growing at the rate I want?" — compares the latest weigh-in with the plan line.
 * Ahead/behind are relative to the plan's direction (gaining faster than planned on a bulk = ahead).
 */
export function weightProgress(entries: readonly WeightEntry[], line: WeightPlanLine | null, today: YMD): WeightProgress {
  const latest = latestWeight(entries, today);
  const actualRateKg = weeklyTrend(entries, today);
  const expectedTodayKg = line ? expectedWeightOn(line, today) : null;
  if (!latest || !line) return { status: 'needMore', diffKg: null, actualRateKg, expectedTodayKg };
  const diffKg = round1(latest.weightKg - expectedWeightOn(line, latest.date));
  const dir = Math.sign(line.rateKg);
  if (line.targetKg != null && dir !== 0 && (latest.weightKg - line.targetKg) * dir >= 0) {
    return { status: 'reached', diffKg, actualRateKg, expectedTodayKg };
  }
  let status: WeightStatus;
  if (Math.abs(diffKg) <= ON_TRACK_KG) status = 'onTrack';
  else if (dir === 0) status = 'off';
  else status = diffKg * dir > 0 ? 'ahead' : 'behind';
  return { status, diffKg, actualRateKg, expectedTodayKg };
}
