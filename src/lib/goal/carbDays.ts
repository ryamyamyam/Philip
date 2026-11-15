/**
 * Macros by phase, and more carbs on training days than on rest days (Story 12 update; Story 16 PB-3.4).
 * Pure, tested.
 *
 * Story 16 (Philip's Playbook, D-039): the numbers come from `lib/playbook/rules.ts`.
 * - PB-3.1 protein bands by phase.
 * - PB-3.4 carb cycling: gym days carbs up and fat to the floor (max(0.6 g/kg, 20% of the day's kcal));
 *   rest days fat 0.9–1.1 g/kg and carbs down (the starting band: −25 to −35%). The gym-day numbers are
 *   SOLVED so the week's calories equal the flat plan for the actual count of gym and rest days; no fixed
 *   ±% on calories. Protein is the same every day. Evidence: practice (adherence and training quality; no
 *   proven body-composition edge over steady intake).
 */
import type { IsoWeekday, Macros, Sex, Weekday } from '../../db/types';
import { fatFloorG, PB_CARB_CYCLE, PB_FAT, PB_GUARD, PB_PROTEIN } from '../playbook/rules';
import type { Phase } from '../training/program';

export const CARB_DAY_RULES = {
  /** PB-3.4: rest-day carbs drop this share of the flat plan's carbs. */
  restCarbDown: PB_CARB_CYCLE.restCarbDown.def,
  /** Rest-day carbs never drop below this share of the flat carbs (safety for very low-carb plans). */
  restCarbFloor: 1 - PB_CARB_CYCLE.restCarbDown.max,
  /** Below this many grams moved a day, the split isn't worth it. */
  minShiftG: 10,
} as const;

/** Protein band (g/kg of reference weight) by phase (PB-3.1). */
export const PROTEIN_PER_KG: Readonly<Record<Phase, readonly [number, number]>> = {
  lose: [PB_PROTEIN.lose.min, PB_PROTEIN.lose.max],
  maintain: [PB_PROTEIN.maintain.min, PB_PROTEIN.maintain.max],
  gain: [PB_PROTEIN.gain.min, PB_PROTEIN.gain.max],
};

export interface CarbDays {
  overrides: Partial<Record<Weekday, Macros>>;
  train: Macros;
  rest: Macros;
}

/** ISO weekday (1 = Mon … 7 = Sun) → the date weekday used by target plans (0 = Sun). */
const toWeekday = (d: IsoWeekday): Weekday => (d % 7) as Weekday;

const kcalOf = (p: number, f: number, c: number) => p * 4 + f * 9 + c * 4;

/**
 * PB-3.4. Null when there are no rest or no training days, no carbs to move, or the shift is too small.
 * `weightKg` (the plan's reference weight) moves fat too (gym-day floor, rest-day 1.0 g/kg); without it
 * fat stays flat and only carbs move.
 */
export function carbDays(base: Macros, trainingDays: readonly IsoWeekday[], sex: Sex | null, weightKg: number | null = null): CarbDays | null {
  const g = new Set(trainingDays).size;
  const r = 7 - g;
  if (g < 1 || r < 1 || base.carbsG <= 0) return null;
  const floorKcal = PB_GUARD.calorieFloor[sex ?? 'female'];
  const P = base.proteinG;
  const weekKcal = base.calories * 7;
  // Rest day: fat to 1.0 g/kg (never under the floor), carbs down the starting band.
  const restFat = weightKg ? Math.round(Math.max(PB_FAT.restDayGPerKg.def * weightKg, fatFloorG(base.calories, weightKg))) : base.fatG;
  let restCarbs = Math.round(base.carbsG * (1 - CARB_DAY_RULES.restCarbDown));
  // Keep the rest day on or above the calorie floor.
  const minRestCarbs = Math.ceil((floorKcal - P * 4 - restFat * 9) / 4);
  restCarbs = Math.max(restCarbs, minRestCarbs, Math.round(base.carbsG * CARB_DAY_RULES.restCarbFloor));
  const restKcal = kcalOf(P, restFat, restCarbs);
  // Gym day: solve the calories so the week matches, then fat at the floor and carbs fill the rest.
  const gymKcal = (weekKcal - r * restKcal) / g;
  const gymFat = weightKg ? Math.round(fatFloorG(gymKcal, weightKg)) : base.fatG;
  const gymCarbs = Math.round((gymKcal - P * 4 - gymFat * 9) / 4);
  if (gymCarbs - base.carbsG < CARB_DAY_RULES.minShiftG || restCarbs >= base.carbsG) return null;
  const train: Macros = { calories: kcalOf(P, gymFat, gymCarbs), proteinG: P, fatG: gymFat, carbsG: gymCarbs };
  const rest: Macros = { calories: Math.round(restKcal), proteinG: P, fatG: restFat, carbsG: restCarbs };
  const overrides: Partial<Record<Weekday, Macros>> = {};
  for (let d = 1 as IsoWeekday; d <= 7; d = (d + 1) as IsoWeekday) overrides[toWeekday(d)] = trainingDays.includes(d) ? { ...train } : { ...rest };
  return { overrides, train, rest };
}

/** The plan's weekday overrides for these macros and days: carb days when on, else none. */
export function overridesFor(base: Macros, trainingDays: readonly IsoWeekday[], sex: Sex | null, on: boolean, weightKg: number | null = null): Partial<Record<Weekday, Macros>> | null {
  return on ? (carbDays(base, trainingDays, sex, weightKg)?.overrides ?? null) : null;
}
