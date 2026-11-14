/**
 * Story 12: the owner's time. Days a week (3–5), minutes of lifting a session (cardio and stretching
 * excluded) and minutes of cardio a session. Confirming re-plans, but only where it helps (pure, tested):
 *
 * - **Days**: his weekdays follow the count (fewest squat/RDL clashes, most days kept).
 * - **Lifting minutes**: the session builder's budget (it trims sets and rest to fit; it never adds).
 * - **Cardio**: never above the minutes he gives; on a cut, room he opens is used (up to the range).
 * - **Nutrition**: the targets calculator's own answer for the new days (only protein per kg moves with
 *   training days on a cut, 2.2 → 2.0 g/kg under four days); the change is applied to the plan in force,
 *   inside the 1.6–2.2 g/kg band, and nothing else moves. Calories are not credited for extra minutes
 *   (the calculator's activity level covers training; no evidence in the app to do better).
 */
import type { IsoWeekday, Sex } from '../../db/types';
import { carbDays, type CarbDays } from '../goal/carbDays';
import { macrosFor, PROPOSAL_RULES } from '../goal/proposal';
import { referenceWeightKg, type CalcResult } from '../targets';
import { bestDays, closeTriples, MAX_TRAINING_DAYS, MIN_TRAINING_DAYS } from './schedule';
import type { Phase } from './program';

export const AVAILABILITY_RULES = {
  days: { min: MIN_TRAINING_DAYS, max: MAX_TRAINING_DAYS },
  strengthMin: { min: 30, max: 90, step: 5 },
  cardioMin: { min: 10, max: 45, step: 5 },
} as const;

export interface AvailabilityWish {
  daysPerWeek: number;
  strengthMin: number;
  cardioMin: number;
  /** Story 12 update: more carbs on training days, fewer on rest days (same week). Default on. */
  carbDays?: boolean;
}

export interface Macros4 {
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export interface AvailabilityCurrent {
  days: readonly IsoWeekday[];
  strengthMin: number;
  /** The cardio minutes planned for this cycle now (the phase default when Philip set none). */
  cardioPlanned: number;
  phase: Phase;
  /** The target plan in force, or null. */
  plan: Macros4 | null;
  weightKg: number | null;
  heightCm: number | null;
  /** Carb days are on now. */
  carbDays?: boolean;
  sex?: Sex | null;
}

export interface AvailabilityPlan {
  days: IsoWeekday[];
  daysChanged: boolean;
  /** Squat and RDL can land two days apart on these weekdays (five days always can). */
  closeDays: boolean;
  strengthMin: number;
  strengthChanged: boolean;
  /** Cardio minutes planned for each session. */
  cardioPlanned: number;
  cardioChanged: boolean;
  /** The cardio ceiling he gave. */
  cardioCap: number;
  nutrition: Macros4 | null;
  nutritionChanged: boolean;
  carbDaysOn: boolean;
  /** The split that will be written (training / rest days), when carb days are on and there is a plan. */
  carb: CarbDays | null;
  /** A new target plan will be written: food moved, the carb-day switch moved, or the days moved with carb days on. */
  writePlan: boolean;
  /** The steady macros the new plan carries (weekday overrides come from `carb`). */
  food: Macros4 | null;
  /** Anything to apply at all. */
  changed: boolean;
}

const snap = (n: number, r: { min: number; max: number; step: number }) => Math.min(r.max, Math.max(r.min, Math.round(n / r.step) * r.step));

export function clampWish(w: AvailabilityWish): AvailabilityWish {
  return {
    carbDays: w.carbDays !== false,
    daysPerWeek: Math.min(AVAILABILITY_RULES.days.max, Math.max(AVAILABILITY_RULES.days.min, Math.round(w.daysPerWeek))),
    strengthMin: snap(w.strengthMin, AVAILABILITY_RULES.strengthMin),
    cardioMin: snap(w.cardioMin, AVAILABILITY_RULES.cardioMin),
  };
}

/**
 * Cardio per session. His minutes are a ceiling: above it, the plan comes down to it. On a cut, more
 * walking helps the deficit, so room he opens is used up to the phase's range. On a bulk or at
 * maintenance more walking isn't an improvement, so the plan stays where it is.
 */
export function cardioFor(phase: Phase, cap: number, current: number): number {
  if (current > cap) return cap;
  if (phase !== 'lose') return current;
  return Math.max(current, Math.min(PROPOSAL_RULES.cardioMin.lose[1], cap));
}

/**
 * What confirming would change. `calcFor(days)` is the targets calculator for the current goal with that
 * many training days a week (null when body stats are missing: nutrition then stays).
 */
export function planAvailability(wish: AvailabilityWish, cur: AvailabilityCurrent, calcFor: (days: number) => CalcResult | null): AvailabilityPlan {
  const w = clampWish(wish);
  const sameCount = w.daysPerWeek === cur.days.length;
  const days = sameCount ? [...cur.days].sort((a, b) => a - b) : bestDays(w.daysPerWeek, cur.days);
  const daysChanged = days.join() !== [...cur.days].sort((a, b) => a - b).join();
  const cardioPlanned = cardioFor(cur.phase, w.cardioMin, cur.cardioPlanned);

  let nutrition: Macros4 | null = null;
  let nutritionChanged = false;
  if (cur.plan && cur.weightKg !== null && !sameCount) {
    const before = calcFor(cur.days.length);
    const after = calcFor(w.daysPerWeek);
    // Only a real move in the calculator's answer changes food (his plan is never re-clamped for nothing).
    if (before && after && (before.proteinG !== after.proteinG || before.calories !== after.calories)) {
      const ref = cur.heightCm ? referenceWeightKg(cur.weightKg, cur.heightCm) : cur.weightKg;
      const [pMin, pMax] = PROPOSAL_RULES.proteinPerKg[cur.phase];
      const protein = Math.min(Math.round(ref * pMax), Math.max(Math.round(ref * pMin), cur.plan.proteinG + (after.proteinG - before.proteinG)));
      const kcal = Math.round((cur.plan.calories + (after.calories - before.calories)) / 10) * 10;
      const next = macrosFor(kcal, protein, cur.weightKg, cur.heightCm);
      if (next.calories !== cur.plan.calories || next.proteinG !== cur.plan.proteinG) {
        nutrition = next;
        nutritionChanged = true;
      }
    }
  }
  const strengthChanged = w.strengthMin !== cur.strengthMin;
  const cardioChanged = cardioPlanned !== cur.cardioPlanned;
  const on = w.carbDays !== false;
  const wasOn = cur.carbDays !== false;
  const food = nutrition ?? cur.plan;
  const carb = on && food ? carbDays(food, days, cur.sex ?? null) : null;
  const writePlan = !!food && (nutritionChanged || on !== wasOn || (on && daysChanged));
  return {
    days,
    daysChanged,
    closeDays: closeTriples(days) > 0,
    strengthMin: w.strengthMin,
    strengthChanged,
    cardioPlanned,
    cardioChanged,
    cardioCap: w.cardioMin,
    nutrition,
    nutritionChanged,
    carbDaysOn: on,
    carb,
    writePlan,
    food: writePlan ? food : null,
    changed: daysChanged || strengthChanged || cardioChanged || nutritionChanged || on !== wasOn,
  };
}
