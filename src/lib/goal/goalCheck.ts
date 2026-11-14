/**
 * Story 11 §3: has the owner reached this cycle's goal, or drifted off it? Pure, tested.
 *
 * - Weight uses the 7-day average (2+ weigh-ins, `rollingWeight`), never one weigh-in: water and
 *   food swing a day's scale reading by 1–2 kg.
 * - Body fat counts only when entered since the cycle started and in the last 14 days (BF readings
 *   from home devices carry a few points of error, so an old one says little).
 * - Bulk: reaching the weight is the success. Crossing the BF ceiling is never a success: it is an
 *   off-track event. Cut: the weight or the BF target. Maintain: judged at the cycle's end by the
 *   normal briefing, so nothing here.
 * - Each event fires once per cycle (and per off-track reason); `firedBefore` filters that.
 *
 * Thresholds are Philip's coaching defaults (a hypothesis, not evidence), kept in GOAL_RULES.
 */
import type { CycleRecord, WeightEntry, YMD } from '../../db/types';
import { addDays, daysBetween, toYmd } from '../date';
import { rollingWeight } from '../training/cycleGoal';

export const GOAL_RULES = {
  /** Days a BF reading stays usable. */
  bfFreshDays: 14,
  /** Off track: earliest day of the cycle a pace can be judged. */
  paceFromDay: 14,
  /** Stalled: from this day, moving less than `stalledShare` of the planned pace. */
  stalledFromDay: 21,
  stalledShare: 0.25,
  /** Too fast: more than this × the planned pace (same direction). */
  tooFastFactor: 1.5,
  /** Maintain drifting: more than this %/week either way. */
  maintainDriftPct: 0.25,
} as const;

export type GoalReason = 'weight' | 'bf' | 'stalled' | 'tooFast' | 'bfCeiling';

export interface GoalEvent {
  kind: 'reached' | 'offtrack';
  reason: GoalReason;
  cycle: number;
  /** 7-day average weight (kg), when there is one. */
  avgKg: number | null;
  /** Usable BF reading, when there is one. */
  bfPct: number | null;
  /** Actual pace, % of body weight per week (signed), when it can be judged. */
  ratePct: number | null;
  daysIn: number;
}

export interface BodyFat {
  pct: number;
  date: YMD;
}

export interface FiredPrompt {
  cycle: number;
  kind: 'reached' | 'offtrack';
  reason: GoalReason;
}

type CycleLike = Pick<CycleRecord, 'index' | 'phase' | 'startedAt' | 'goal'> & Partial<Pick<CycleRecord, 'endedEarly'>>;

export function goalEvent(cycle: CycleLike, weights: readonly WeightEntry[], bf: BodyFat | null, today: YMD): GoalEvent | null {
  if (cycle.endedEarly) return null;
  const start = toYmd(new Date(cycle.startedAt));
  const daysIn = daysBetween(start, today);
  if (daysIn < 0) return null;
  const avgKg = rollingWeight(weights, today);
  const freshBf = bf && bf.date >= start && bf.date >= addDays(today, -(GOAL_RULES.bfFreshDays - 1)) && bf.date <= today ? bf.pct : null;
  const g = cycle.goal;
  const base = { cycle: cycle.index, avgKg, bfPct: freshBf, daysIn };
  const weeks = daysIn / 7;
  const ratePct = avgKg !== null && daysIn >= 7 ? Math.round((((avgKg - g.startWeightKg) / g.startWeightKg / weeks) * 100) * 100) / 100 : null;

  if (cycle.phase === 'gain') {
    if (avgKg !== null && g.endWeightKg > g.startWeightKg && avgKg >= g.endWeightKg - 1e-9) return { ...base, kind: 'reached', reason: 'weight', ratePct };
    if (freshBf !== null && g.bfLinePct !== null && freshBf > g.bfLinePct + 1e-9) return { ...base, kind: 'offtrack', reason: 'bfCeiling', ratePct };
  } else if (cycle.phase === 'lose') {
    if (avgKg !== null && g.endWeightKg < g.startWeightKg && avgKg <= g.endWeightKg + 1e-9) return { ...base, kind: 'reached', reason: 'weight', ratePct };
    if (freshBf !== null && g.bfLinePct !== null && freshBf <= g.bfLinePct + 1e-9) return { ...base, kind: 'reached', reason: 'bf', ratePct };
  }

  if (ratePct === null || daysIn < GOAL_RULES.paceFromDay) return null;
  const planned = g.weeklyRatePct;
  if (cycle.phase === 'maintain') {
    return Math.abs(ratePct) > GOAL_RULES.maintainDriftPct ? { ...base, kind: 'offtrack', reason: 'tooFast', ratePct } : null;
  }
  const sign = cycle.phase === 'gain' ? 1 : -1;
  const along = ratePct * sign;
  const plannedAlong = Math.abs(planned);
  if (plannedAlong > 0 && along > plannedAlong * GOAL_RULES.tooFastFactor) return { ...base, kind: 'offtrack', reason: 'tooFast', ratePct };
  if (daysIn >= GOAL_RULES.stalledFromDay && along < plannedAlong * GOAL_RULES.stalledShare) return { ...base, kind: 'offtrack', reason: 'stalled', ratePct };
  return null;
}

/** Fires once per cycle for "reached", once per cycle and reason for "off track". */
export function isNewEvent(e: GoalEvent, fired: readonly FiredPrompt[]): boolean {
  return !fired.some((f) => f.cycle === e.cycle && f.kind === e.kind && (e.kind === 'reached' || f.reason === e.reason));
}

/**
 * Home's ETA ("on pace for 3 Dec"): the day the weight trend reaches the goal, or null when the trend
 * points the wrong way, is flat or there's no average yet. Capped at 26 weeks out.
 */
export function goalEta(cycle: CycleLike, weights: readonly WeightEntry[], today: YMD): YMD | null {
  if (cycle.phase === 'maintain') return null;
  const now = rollingWeight(weights, today);
  if (now === null) return null;
  const start = toYmd(new Date(cycle.startedAt));
  const days = daysBetween(start, today);
  if (days < 7) return null;
  const perDay = (now - cycle.goal.startWeightKg) / days;
  const left = cycle.goal.endWeightKg - now;
  if (Math.abs(left) < 1e-9) return today;
  if (perDay === 0 || Math.sign(perDay) !== Math.sign(left)) return null;
  const n = Math.ceil(left / perDay);
  return n > 182 ? null : addDays(today, n);
}

/** Days since the last weigh-in, or null with none. */
export function daysSinceWeighIn(weights: readonly WeightEntry[], today: YMD): number | null {
  const last = weights.reduce<string | null>((m, w) => (w.date <= today && (m === null || w.date > m) ? w.date : m), null);
  return last === null ? null : daysBetween(last, today);
}
