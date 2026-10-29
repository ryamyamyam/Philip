import type { Macros } from '../db/types';

/**
 * Daily nutrition adherence score (0–100). Methodology (also shown in the UI):
 *  - Calories 40%: full credit within ±10% of target, linear taper to 0 at ±35%.
 *    Symmetric, so eating under target is never rewarded.
 *  - Protein 35%: full credit at ≥90% of target, linear taper to 0 at 50%. No penalty above target.
 *  - Fat 12.5%, Carbs 12.5%: full credit within ±20%, linear taper to 0 at ±50%.
 *  - Days with calories under 50% of target are "incomplete" (likely not fully logged) and not scored.
 */
export const ADHERENCE = {
  weights: { calories: 0.4, protein: 0.35, fat: 0.125, carbs: 0.125 },
  calories: { full: 0.1, zero: 0.35 },
  protein: { full: 0.9, zero: 0.5 },
  fatCarbs: { full: 0.2, zero: 0.5 },
  incompleteBelow: 0.5,
} as const;

/** Tolerance so boundary values (exactly ±10%) aren't lost to floating-point error. */
const EPS = 1e-9;

export interface AdherenceComponents {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export type AdherenceResult =
  | { status: 'scored'; score: number; components: AdherenceComponents }
  | { status: 'incomplete' }
  | { status: 'noTarget' };

/** A deliberate 0 g target (e.g. very-low-carb plan): full credit for ≤5 g, tapering to 0 at 25 g. */
function zeroTargetCredit(actual: number): number {
  if (actual <= 5) return 1;
  if (actual >= 25) return 0;
  return 1 - (actual - 5) / 20;
}

/** 1 within ±full deviation, 0 beyond ±zero, linear between. */
export function bandCredit(actual: number, target: number, full: number, zero: number): number {
  if (!(target > 0)) return zeroTargetCredit(actual);
  const dev = Math.abs(actual / target - 1);
  if (dev <= full + EPS) return 1;
  if (dev >= zero) return 0;
  return 1 - (dev - full) / (zero - full);
}

/** 1 at or above `full` ratio, 0 at or below `zero`, linear between. */
export function floorCredit(actual: number, target: number, full: number, zero: number): number {
  if (!(target > 0)) return 1; // no minimum to reach
  const r = actual / target;
  if (r >= full - EPS) return 1;
  if (r <= zero) return 0;
  return (r - zero) / (full - zero);
}

export function adherenceScore(actual: Macros, target: Macros | null): AdherenceResult {
  if (!target || !(target.calories > 0)) return { status: 'noTarget' };
  if (actual.calories < target.calories * ADHERENCE.incompleteBelow) return { status: 'incomplete' };
  const c: AdherenceComponents = {
    calories: bandCredit(actual.calories, target.calories, ADHERENCE.calories.full, ADHERENCE.calories.zero),
    protein: floorCredit(actual.proteinG, target.proteinG, ADHERENCE.protein.full, ADHERENCE.protein.zero),
    fat: bandCredit(actual.fatG, target.fatG, ADHERENCE.fatCarbs.full, ADHERENCE.fatCarbs.zero),
    carbs: bandCredit(actual.carbsG, target.carbsG, ADHERENCE.fatCarbs.full, ADHERENCE.fatCarbs.zero),
  };
  const w = ADHERENCE.weights;
  const score = Math.round(100 * (c.calories * w.calories + c.protein * w.protein + c.fat * w.fat + c.carbs * w.carbs));
  return { status: 'scored', score, components: c };
}
