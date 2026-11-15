/**
 * Cycle goal briefing (Story 5 §4.8, T-012). Pure. Before every cycle Philip proposes a phase and an
 * end-of-cycle goal; the owner takes it or sets his own. Ranges are Philip's coaching defaults
 * (lean-bulk guidance for trained lifters: about 0.25–0.5% of body weight a week).
 */
import type { ActivityLevel, Sex } from '../../db/types';
import { ageOn } from '../date';
import { BODY_FAT_TARGET, type CalcInputs } from '../targets';
import { bulkLine, cutLine, KCAL_PER_KG, PB_PHASE, ratePctFor, trainingAgeBand, type RateContext } from '../playbook/rules';
import type { Phase } from './program';
import { roundTo } from './program';

export interface RateRange {
  /** % of body weight per week (signed). */
  min: number;
  max: number;
  def: number;
}

/**
 * Story 16 (PB-2.3): weekly-rate bands by phase at an unknown training age and body fat. Use
 * `ratesFor(ctx)` when the lifter's training age, BF % and sex are known.
 */
export const RATE_PCT: Readonly<Record<Phase, RateRange>> = {
  gain: ratePctFor('gain'),
  maintain: ratePctFor('maintain'),
  lose: ratePctFor('lose'),
};

/** PB-2.3: the bands for this lifter. */
export function ratesFor(ctx: RateContext = {}): Readonly<Record<Phase, RateRange>> {
  return { gain: ratePctFor('gain', ctx), maintain: ratePctFor('maintain', ctx), lose: ratePctFor('lose', ctx) };
}

/** PB-1.1: at or above this BF% (men), Philip recommends a cut. Women: `cutLine('female')`. */
export const CUT_AT_BF = PB_PHASE.cutAtBf.male;

/** Who the phase rules are for (PB-1.1–1.3). */
export interface PhaseContext {
  sex?: 'male' | 'female' | null;
  trainingYears?: number | null;
}
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

/**
 * PB-1.2: Philip's own bulk default is at or under this BF% (men; women `bulkLine('female')`). Between it
 * and the cut line he picks maintain/recomp. Coaching rule of thumb, not a hard rule from one study.
 */
export const LEAN_BULK_MAX_BF = PB_PHASE.bulkAtOrBelowBf.male;

/** Why Philip picked a phase (shown under his pick). */
export type PhaseWhy = 'bfCeiling' | 'bfTarget' | 'highBf' | 'aboveTarget' | 'notLean' | 'leanEnough' | 'noData' | 'same' | 'beginner';

/**
 * Story 16 (Philip's Playbook PB-1.1–1.3; replaces OBS-FF441B's "never maintain"):
 * - BF ≥ the cut line (18% men / 24% women) → cut.
 * - A cut that reached the long-term BF target → lean bulk.
 * - Mid-bulk or mid-cut → keep going.
 * - After a maintain phase, or with no phase yet: BF more than 1 point over the long-term target → cut;
 *   under 1 year of lifting → maintain/recomp (PB-1.3); BF at or under the bulk line → bulk; between the
 *   lines → maintain/recomp (`notLean`); BF unknown → bulk (the first-cycle default).
 * Below the cut line the lifter may pick any phase without a flag (PB-1.2).
 */
export function coachPhase(bfPct: number | null, longTermBfPct: number | null, lastPhase: Phase | null, ctx: PhaseContext = {}): { phase: Phase; why: PhaseWhy } {
  if (bfPct !== null && bfPct >= cutLine(ctx.sex ?? null)) return { phase: 'lose', why: 'highBf' };
  if (lastPhase === 'lose' && bfPct !== null && longTermBfPct !== null && bfPct <= longTermBfPct) return { phase: 'gain', why: 'bfTarget' };
  if (lastPhase === 'gain' || lastPhase === 'lose') return { phase: lastPhase, why: 'same' };
  if (bfPct === null) return { phase: 'gain', why: 'noData' };
  if (longTermBfPct !== null && bfPct > longTermBfPct + 1) return { phase: 'lose', why: 'aboveTarget' };
  if (ctx.trainingYears != null && trainingAgeBand(ctx.trainingYears) === 'lt1') return { phase: 'maintain', why: 'beginner' };
  if (bfPct > bulkLine(ctx.sex ?? null)) return { phase: 'maintain', why: 'notLean' };
  return { phase: 'gain', why: 'leanEnough' };
}

/** Philip's phase pick; see coachPhase. */
export function recommendPhase(bfPct: number | null, longTermBfPct: number | null, lastPhase: Phase | null, ctx: PhaseContext = {}): Phase {
  return coachPhase(bfPct, longTermBfPct, lastPhase, ctx).phase;
}

/** Default weekly rate, nudged by what happened last cycle (bulk only), kept inside the phase range. */
export function defaultRatePct(phase: Phase, last: LastCycle | null, rates: Readonly<Record<Phase, RateRange>> = RATE_PCT): number {
  const r = rates[phase];
  let rate = r.def;
  if (last && last.phase === phase && phase === 'gain') {
    rate = last.plannedRatePct;
    if (last.actualRatePct > last.plannedRatePct && last.bfDelta !== null && last.bfDelta > 1) rate -= 0.1;
    else if (last.actualRatePct <= 0.05) rate += 0.1;
  }
  // OBS-FF441B: a cut learns from last cycle too. Losing 0.2%+ a week slower than planned → a bit faster;
  // faster than the range allows → a bit slower.
  if (last && last.phase === phase && phase === 'lose') {
    rate = last.plannedRatePct;
    if (last.actualRatePct > last.plannedRatePct + 0.2) rate -= 0.1;
    else if (last.actualRatePct < r.min) rate += 0.1;
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
  rates: Readonly<Record<Phase, RateRange>> = RATE_PCT,
): CycleGoal {
  const rate = defaultRatePct(phase, last, rates);
  const end = roundTo(weightKg * (1 + (rate / 100) * weeks), 0.5);
  const bfLine = bfPct === null ? null : phase === 'gain' ? bfPct + 1 : phase === 'lose' ? bfPct - 1 : bfPct;
  return { startWeightKg: weightKg, startBfPct: bfPct, endWeightKg: end, weeklyRatePct: rate, bfLinePct: bfLine, source: 'philip' };
}

export type GoalIssue =
  | { code: 'rateOutOfRange'; level: 'warning'; ratePct: number; range: RateRange }
  | { code: 'bfBelowFloor'; level: 'error'; min: number }
  | { code: 'bfLow'; level: 'warning'; warnBelow: number }
  | { code: 'directionMismatch'; level: 'warning' }
  /** PB-1.4: a bulk at or above the cut line. A warning, never a block: a mini-cut first is suggested. */
  | { code: 'miniCut'; level: 'warning'; cutAt: number; weeks: readonly [number, number] };

/** Checks a goal the owner typed. Errors block it; warnings are shown in plain text. */
export function checkUserGoal(
  weightKg: number,
  phase: Phase,
  endWeightKg: number,
  bfTargetPct: number | null,
  /** Story 12: planned length (the goal date). Default: the 4-week cycle. */
  weeks: number = CYCLE_WEEKS,
  /** Story 16: the lifter's rate bands (PB-2.3) and current BF/sex for the mini-cut flag (PB-1.4). */
  opts: { rates?: Readonly<Record<Phase, RateRange>>; bfPct?: number | null; sex?: 'male' | 'female' | null } = {},
): { ratePct: number; issues: GoalIssue[] } {
  const ratePct = Math.round((((endWeightKg - weightKg) / weightKg / weeks) * 100) * 100) / 100;
  const issues: GoalIssue[] = [];
  const range = (opts.rates ?? RATE_PCT)[phase];
  if (phase === 'gain' && opts.bfPct != null && opts.bfPct >= cutLine(opts.sex ?? null)) {
    issues.push({ code: 'miniCut', level: 'warning', cutAt: cutLine(opts.sex ?? null), weeks: PB_PHASE.miniCutWeeks });
  }
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
  return Math.round((kgPerWeek * KCAL_PER_KG) / 7 / 10) * 10;
}

/* ---------------- Briefing → calorie targets (T-014) ---------------- */

export interface ProfileForCalc {
  sex: Sex | null;
  birthDate: string | null;
  heightCm: number | null;
  activityLevel: ActivityLevel | null;
  trainingDaysPerWeek: number | null;
  bodyFatPct: number | null;
  /** Story 16 (PB-2.3). */
  trainingYears?: number | null;
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
    trainingYears: p.trainingYears ?? null,
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

/** Story 16: the numbers the phase-pick lines quote (PB-1.1, PB-1.2), for this lifter's sex. */
export const phaseWhyVars = (sex: 'male' | 'female' | null): { cutAt: number; lean: number } => ({ cutAt: cutLine(sex), lean: bulkLine(sex) });

/** Story 16: the rate and phase context for a profile (training age, BF, sex). */
export function lifterContext(p: { sex?: 'male' | 'female' | null; bodyFatPct?: number | null; trainingYears?: number | null } | null | undefined): RateContext & PhaseContext {
  return { sex: p?.sex ?? null, bfPct: p?.bodyFatPct ?? null, trainingYears: p?.trainingYears ?? null };
}
