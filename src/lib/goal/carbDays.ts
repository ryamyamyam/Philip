/**
 * Story 12 update (owner, 2026-11-13): macros by phase, and more carbs on training days than on rest days.
 * Pure, tested.
 *
 * Evidence, as labelled in the app's notes:
 * - Supported: protein 1.6–2.2 g/kg for people who lift; on a cut, the higher end protects lean mass
 *   (Helms et al. 2014 suggest 2.3–3.1 g/kg of lean mass when lean and dieting; Iraki et al. 2019 give
 *   1.6–2.2 g/kg for a lean bulk). So the cut's protein band starts higher: cut 1.8–2.2, bulk and
 *   maintain 1.6–2.0 (a surplus spares protein; the extra energy goes to carbs, which fuel training).
 * - Supported: fat 15–30% of calories in both reviews. The app keeps its own floor (25% of calories and
 *   0.5 g/kg, `SAFETY` in lib/targets.ts, unchanged), so fat sits on that floor in every phase and carbs
 *   take the rest: high on a bulk, squeezed on a cut. That is where the phase ratios come from.
 * - Plausible, not proven for body composition: matching carbs to the day's work ("fuel for the work
 *   required", Impey et al. 2018) comes mostly from endurance research. With calories and protein
 *   matched, carb cycling hasn't beaten steady intake for fat loss or muscle. It's here for training
 *   quality and because it is easy to follow: the week's calories, protein and fat stay exactly the same;
 *   only carbs move from rest days to training days.
 */
import type { IsoWeekday, Macros, Sex, Weekday } from '../../db/types';
import { SAFETY } from '../targets';
import type { Phase } from '../training/program';

export const CARB_DAY_RULES = {
  /** Training days get this share of the day's calories as extra carbs (coaching default). */
  shiftPct: 0.1,
  /** Rest-day carbs never drop below this share of the steady carbs. */
  restCarbFloor: 0.5,
} as const;

/** Protein band (g/kg of reference weight) by phase. */
export const PROTEIN_PER_KG: Readonly<Record<Phase, readonly [number, number]>> = {
  lose: [1.8, 2.2],
  maintain: [1.6, 2.0],
  gain: [1.6, 2.0],
};

export interface CarbDays {
  overrides: Partial<Record<Weekday, Macros>>;
  train: Macros;
  rest: Macros;
}

/** ISO weekday (1 = Mon … 7 = Sun) → the date weekday used by target plans (0 = Sun). */
const toWeekday = (d: IsoWeekday): Weekday => (d % 7) as Weekday;

/**
 * Training days +carbs, rest days −carbs; same week of calories, protein and fat. Null when there are
 * no rest days, no carbs to move, or the rest days would go under the calorie floor or the carb floor.
 */
export function carbDays(base: Macros, trainingDays: readonly IsoWeekday[], sex: Sex | null): CarbDays | null {
  const t = new Set(trainingDays).size;
  const r = 7 - t;
  if (t < 1 || r < 1 || base.carbsG <= 0) return null;
  const floorKcal = SAFETY.calorieFloor[sex ?? 'female'];
  // Extra carbs (g) on each training day, limited so rest days keep half their carbs and the calorie floor.
  let up = Math.round((base.calories * CARB_DAY_RULES.shiftPct) / 4);
  const maxByCarbs = Math.floor(((base.carbsG * (1 - CARB_DAY_RULES.restCarbFloor)) * r) / t);
  const maxByKcal = Math.floor((((base.calories - floorKcal) / 4) * r) / t);
  up = Math.min(up, maxByCarbs, maxByKcal);
  if (up < 10) return null;
  // Rest days give the same grams back in total (rounded so the week matches within a few grams).
  const down = Math.round((up * t) / r);
  const train: Macros = { calories: base.calories + up * 4, proteinG: base.proteinG, fatG: base.fatG, carbsG: base.carbsG + up };
  const rest: Macros = { calories: base.calories - down * 4, proteinG: base.proteinG, fatG: base.fatG, carbsG: base.carbsG - down };
  const overrides: Partial<Record<Weekday, Macros>> = {};
  for (let d = 1 as IsoWeekday; d <= 7; d = (d + 1) as IsoWeekday) overrides[toWeekday(d)] = trainingDays.includes(d) ? { ...train } : { ...rest };
  return { overrides, train, rest };
}

/** The plan's weekday overrides for these macros and days: carb days when on, else none. */
export function overridesFor(base: Macros, trainingDays: readonly IsoWeekday[], sex: Sex | null, on: boolean): Partial<Record<Weekday, Macros>> | null {
  return on ? (carbDays(base, trainingDays, sex)?.overrides ?? null) : null;
}
