/**
 * Cycle goal briefing (Story 5 §4.8, T-012). Pure. Before every cycle Philip proposes a phase and an
 * end-of-cycle goal; the owner takes it or sets his own. Ranges are Philip's coaching defaults
 * (lean-bulk guidance for trained lifters: about 0.25–0.5% of body weight a week).
 */
import type { ActivityLevel, Sex } from '../../db/types';
import { ageOn } from '../date';
import { BODY_FAT_TARGET, type CalcInputs } from '../targets';
import type { Phase } from './program';
import { roundTo } from './program';

export interface RateRange {
  /** % of body weight per week (signed). */
  min: number;
  max: number;
  def: number;
}

export const RATE_PCT: Readonly<Record<Phase, RateRange>> = {
  gain: { min: 0.25, max: 0.5, def: 0.3 },
  maintain: { min: -0.1, max: 0.1, def: 0 },
  lose: { min: -1.0, max: -0.5, def: -0.6 },
};

/** At or above this BF%, Philip recommends a cut. */
export const CUT_AT_BF = 20;
export const CYCLE_WEEKS = 4;
/** Weigh-ins in the last 7 days for the briefing to use their average (owner: voluntary, about twice a week). */
export const MIN_WEIGH_INS = 2;

export interface WeighIn {
  date: string;
  weightKg: number;
}

/** Average of the weigh-ins in the 7 days up to `today` (inclusive), or null with fewer than MIN_WEIGH_INS. */
export function rollingWeight(entries: readonly WeighIn[], today: string): number | null {
  const start = addDays(today, -6);
  const recent = entries.filter((e) => e.date >= start && e.date <= today);
  if (recent.length < MIN_WEIGH_INS) return null;
  return recent.reduce((s, e) => s + e.weightKg, 0) / recent.length;
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export interface LastCycle {
  phase: Phase;
  plannedRatePct: number;
  /** Actual change, % of body weight per week. */
  actualRatePct: number;
  /** Change in BF% points over the cycle (null if not measured twice). */
  bfDelta: number | null;
}

/** BF ≥ 20% → cut; reached the long-term target → maintain; otherwise keep the last phase (first cycle: bulk). */
export function recommendPhase(bfPct: number | null, longTermBfPct: number | null, lastPhase: Phase | null): Phase {
  if (bfPct !== null && bfPct >= CUT_AT_BF) return 'lose';
  if (bfPct !== null && longTermBfPct !== null && lastPhase === 'lose' && bfPct <= longTermBfPct) return 'maintain';
  return lastPhase ?? 'gain';
}

/** Default weekly rate, nudged by what happened last cycle (bulk only), kept inside the phase range. */
export function defaultRatePct(phase: Phase, last: LastCycle | null): number {
  const r = RATE_PCT[phase];
  let rate = r.def;
  if (last && last.phase === phase && phase === 'gain') {
    rate = last.plannedRatePct;
    if (last.actualRatePct > last.plannedRatePct && last.bfDelta !== null && last.bfDelta > 1) rate -= 0.1;
    else if (last.actualRatePct <= 0.05) rate += 0.1;
  }
  return Math.min(r.max, Math.max(r.min, Math.round(rate * 100) / 100));
}

export interface CycleGoal {
  startWeightKg: number;
  startBfPct: number | null;
  endWeightKg: number;
  weeklyRatePct: number;
  /** Bulk: ceiling. Cut: target. Maintain: hold. null when BF% isn't measured. */
  bfLinePct: number | null;
  source: 'philip' | 'user';
  /** Story 12: planned length (weeks) and goal date, when the goal has one. */
  weeks?: number;
  deadline?: string;
}

/** Philip's default goal for the next 4 weeks. Example: 73 kg, 15%, bulk → 74.0 kg, BF ceiling 16%. */
export function philipGoal(
  weightKg: number,
  bfPct: number | null,
  phase: Phase,
  last: LastCycle | null = null,
  weeks: number = CYCLE_WEEKS,
): CycleGoal {
  const rate = defaultRatePct(phase, last);
  const end = roundTo(weightKg * (1 + (rate / 100) * weeks), 0.5);
  const bfLine = bfPct === null ? null : phase === 'gain' ? bfPct + 1 : phase === 'lose' ? bfPct - 1 : bfPct;
  return { startWeightKg: weightKg, startBfPct: bfPct, endWeightKg: end, weeklyRatePct: rate, bfLinePct: bfLine, source: 'philip' };
}

export type GoalIssue =
  | { code: 'rateOutOfRange'; level: 'warning'; ratePct: number; range: RateRange }
  | { code: 'bfBelowFloor'; level: 'error'; min: number }
  | { code: 'bfLow'; level: 'warning'; warnBelow: number }
  | { code: 'directionMismatch'; level: 'warning' };

/** Checks a goal the owner typed. Errors block it; warnings are shown in plain text. */
export function checkUserGoal(
  weightKg: number,
  phase: Phase,
  endWeightKg: number,
  bfTargetPct: number | null,
  /** Story 12: planned length (the goal date). Default: the 4-week cycle. */
  weeks: number = CYCLE_WEEKS,
): { ratePct: number; issues: GoalIssue[] } {
  const ratePct = Math.round((((endWeightKg - weightKg) / weightKg / weeks) * 100) * 100) / 100;
  const issues: GoalIssue[] = [];
  const range = RATE_PCT[phase];
  if ((phase === 'gain' && ratePct < 0) || (phase === 'lose' && ratePct > 0)) {
    issues.push({ code: 'directionMismatch', level: 'warning' });
  } else if (ratePct < range.min - 1e-9 || ratePct > range.max + 1e-9) {
    issues.push({ code: 'rateOutOfRange', level: 'warning', ratePct, range });
  }
  if (bfTargetPct !== null) {
    if (bfTargetPct < BODY_FAT_TARGET.min) issues.push({ code: 'bfBelowFloor', level: 'error', min: BODY_FAT_TARGET.min });
    else if (bfTargetPct < BODY_FAT_TARGET.warnBelow) issues.push({ code: 'bfLow', level: 'warning', warnBelow: BODY_FAT_TARGET.warnBelow });
  }
  return { ratePct, issues };
}

/** Rough daily calorie change for a weekly rate (the targets calculator computes the real plan). */
export function kcalPerDayFor(weightKg: number, ratePct: number): number {
  const kgPerWeek = (weightKg * ratePct) / 100;
  return Math.round((kgPerWeek * 7700) / 7 / 10) * 10;
}

/* ---------------- Briefing → calorie targets (T-014) ---------------- */

export interface ProfileForCalc {
  sex: Sex | null;
  birthDate: string | null;
  heightCm: number | null;
  activityLevel: ActivityLevel | null;
  trainingDaysPerWeek: number | null;
  bodyFatPct: number | null;
}

/**
 * Calculator inputs for a confirmed cycle goal, or null when body stats are missing (then calories
 * stay as they are and the briefing says so). The rate is the goal's weekly change; the existing
 * calculator and its safety rules decide the actual numbers.
 */
export function calcInputsForGoal(
  p: ProfileForCalc,
  phase: Phase,
  goal: Pick<CycleGoal, 'startWeightKg' | 'endWeightKg'> & { weeks?: number },
  today: string,
  /** Story 12: training days a week (his weekdays, 3–5). Default: Story 5's four. */
  trainingDays?: number,
): CalcInputs | null {
  if (!p.sex || !p.birthDate || !p.heightCm || !p.activityLevel) return null;
  const rateKg = Math.abs(goal.endWeightKg - goal.startWeightKg) / (goal.weeks ?? CYCLE_WEEKS);
  return {
    sex: p.sex,
    ageYears: ageOn(p.birthDate, today),
    heightCm: p.heightCm,
    weightKg: goal.startWeightKg,
    activityLevel: p.activityLevel,
    // Story 5: four training days a week; Story 12: the owner's availability (3–5) when set.
    trainingDaysPerWeek: trainingDays ?? Math.max(4, p.trainingDaysPerWeek ?? 0),
    goal: phase,
    targetWeightKg: phase === 'maintain' ? null : goal.endWeightKg,
    weeklyRateKg: phase === 'maintain' ? null : Math.round(rateKg * 100) / 100,
    bodyFatPct: p.bodyFatPct,
  };
}

export type StartWeightSource = 'average' | 'latest' | 'profile';

/**
 * The weight a cycle goal starts from (owner feedback, Nov 2026: don't block on weigh-ins).
 * Best: the 7-day average (3+ weigh-ins). Else the latest weigh-in from the last 14 days. Else the
 * body weight saved in Targets. Null only when there's no weight anywhere.
 */
export function startingWeight(
  entries: readonly WeighIn[],
  today: string,
  profileWeightKg: number | null,
): { kg: number; source: StartWeightSource } | null {
  const avg = rollingWeight(entries, today);
  if (avg !== null) return { kg: avg, source: 'average' };
  const from = addDays(today, -13);
  const recent = entries.filter((e) => e.date >= from && e.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const latest = recent[recent.length - 1];
  if (latest) return { kg: latest.weightKg, source: 'latest' };
  if (profileWeightKg !== null && profileWeightKg > 0) return { kg: profileWeightKg, source: 'profile' };
  return null;
}
