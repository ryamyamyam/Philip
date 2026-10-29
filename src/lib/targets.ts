/**
 * Nutrition target calculator. Every output is an ESTIMATE.
 *
 * Method (see docs/ARCHITECTURE.md → "Target calculation"):
 *  1. Resting energy: Mifflin–St Jeor (1990)
 *       men:   10·kg + 6.25·cm − 5·age + 5
 *       women: 10·kg + 6.25·cm − 5·age − 161
 *  2. Maintenance ≈ resting energy × activity factor (1.2 … 1.9).
 *  3. Goal adjustment = weekly rate × ~7,700 kcal/kg ÷ 7. The 7,700 kcal/kg figure is a rough
 *     energy-equivalence approximation; real weight change is not linear and varies by person.
 *  4. Safety: loss rate capped at 1% of body weight/week, gain at 0.5%/week; calories never go
 *     below an absolute floor (1,500 men / 1,200 women) — if the math lands below it, the target is
 *     raised to the floor and flagged for professional review.
 *  5. Protein from g/kg (1.6–2.2 for people who train), fat ≥ 25% of calories, carbs = remainder.
 */
import type { ActivityLevel, Goal, Sex } from '../db/types';

export const KCAL_PER_KG = 7700;

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
};

export const SAFETY = {
  maxLossPctPerWeek: 0.01,
  maxGainPctPerWeek: 0.005,
  defaultLossPctPerWeek: 0.005,
  defaultGainPctPerWeek: 0.0025,
  calorieFloor: { male: 1500, female: 1200 } as Record<Sex, number>,
  calorieCeiling: 6000,
  minFatPct: 0.25,
  minFatGPerKg: 0.5,
  lowBmi: 18.5,
  minAge: 18,
  maxAge: 100,
} as const;

export interface CalcInputs {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  trainingDaysPerWeek: number;
  goal: Goal;
  targetWeightKg: number | null;
  /** Requested magnitude of change per week (kg, positive). Null = sensible default. */
  weeklyRateKg: number | null;
}

export type CalcWarning =
  | { code: 'rateCapped'; rateKg: number }
  | { code: 'floor'; floor: number }
  | { code: 'lowBmi' }
  | { code: 'targetDirection' }
  | { code: 'macroOverflow' }
  | { code: 'ceiling'; ceiling: number }
  /** A floor/ceiling pushed the target the opposite way from the goal. */
  | { code: 'goalNotMet' }
  /** Calories below resting energy, or a deficit larger than ~30% of maintenance. */
  | { code: 'aggressiveDeficit' };

export interface CalcResult {
  bmr: number;
  tdee: number;
  /** Signed daily kcal adjustment applied to maintenance. */
  adjustment: number;
  /** Signed weekly change implied by the final calories (kg/week). Rough. */
  projectedRateKg: number;
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  /** Protein per kg of the weight used for the calculation (reference weight when BMI > 30). */
  proteinPerKg: number;
  usesReferenceWeight: boolean;
  fatPct: number;
  weeksToTarget: number | null;
  warnings: CalcWarning[];
  /** True when a safety rule changed the result or the inputs look risky. */
  needsReview: boolean;
}

export type CalcInputError = 'age' | 'height' | 'weight' | 'trainingDays' | 'targetWeight' | 'rate';

export function validateInputs(i: CalcInputs): CalcInputError[] {
  const errs: CalcInputError[] = [];
  if (!Number.isFinite(i.ageYears) || i.ageYears < SAFETY.minAge || i.ageYears > SAFETY.maxAge) errs.push('age');
  if (!Number.isFinite(i.heightCm) || i.heightCm < 120 || i.heightCm > 230) errs.push('height');
  if (!Number.isFinite(i.weightKg) || i.weightKg < 35 || i.weightKg > 300) errs.push('weight');
  if (!Number.isInteger(i.trainingDaysPerWeek) || i.trainingDaysPerWeek < 0 || i.trainingDaysPerWeek > 7) errs.push('trainingDays');
  if (i.targetWeightKg != null && (!Number.isFinite(i.targetWeightKg) || i.targetWeightKg < 35 || i.targetWeightKg > 300))
    errs.push('targetWeight');
  if (i.weeklyRateKg != null && (!Number.isFinite(i.weeklyRateKg) || i.weeklyRateKg < 0 || i.weeklyRateKg > 5)) errs.push('rate');
  // A zero rate with a lose/gain goal is contradictory; ask instead of silently substituting.
  if (i.weeklyRateKg === 0 && i.goal !== 'maintain') errs.push('rate');
  return errs;
}

export function mifflinStJeor(sex: Sex, weightKg: number, heightCm: number, ageYears: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === 'male' ? 5 : -161);
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/**
 * Weight used for protein/fat g/kg. Above BMI 30, total body weight overstates needs, so only
 * 25% of the weight above the BMI-30 weight counts. Continuous at BMI 30 (no sudden drop).
 */
export function referenceWeightKg(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  const w30 = 30 * m * m;
  if (weightKg <= w30) return weightKg;
  return w30 + 0.25 * (weightKg - w30);
}

/** Protein g/kg by goal and training. Within 1.6–2.2 g/kg for people who train. */
export function proteinPerKgFor(goal: Goal, trainingDaysPerWeek: number): number {
  const trains = trainingDaysPerWeek >= 1;
  if (!trains) return goal === 'maintain' ? 1.2 : 1.6;
  if (goal === 'lose') return trainingDaysPerWeek >= 4 ? 2.2 : 2.0;
  return goal === 'gain' ? 1.8 : 1.6;
}

/** Resolves the weekly rate magnitude (kg) with defaults and caps. */
export function resolveRate(goal: Goal, weightKg: number, requested: number | null): { rateKg: number; capped: boolean } {
  if (goal === 'maintain') return { rateKg: 0, capped: false };
  const maxPct = goal === 'lose' ? SAFETY.maxLossPctPerWeek : SAFETY.maxGainPctPerWeek;
  const defPct = goal === 'lose' ? SAFETY.defaultLossPctPerWeek : SAFETY.defaultGainPctPerWeek;
  const max = weightKg * maxPct;
  const want = requested == null ? weightKg * defPct : requested;
  if (want > max) return { rateKg: round2(max), capped: true };
  return { rateKg: round2(want), capped: false };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Warnings that mean the result should be reviewed by a qualified professional before use. */
export const REVIEW_CODES: ReadonlySet<CalcWarning['code']> = new Set(['floor', 'ceiling', 'lowBmi', 'macroOverflow', 'goalNotMet', 'aggressiveDeficit']);

export function calculateTargets(i: CalcInputs): CalcResult {
  const errors = validateInputs(i);
  if (errors.length) throw new Error(`Invalid inputs: ${errors.join(', ')}`);

  const warnings: CalcWarning[] = [];
  const bmr = mifflinStJeor(i.sex, i.weightKg, i.heightCm, i.ageYears);
  const tdee = bmr * ACTIVITY_FACTORS[i.activityLevel];

  // Goal sanity checks
  const currentBmi = bmi(i.weightKg, i.heightCm);
  const targetBmi = i.targetWeightKg != null ? bmi(i.targetWeightKg, i.heightCm) : null;
  if ((i.goal === 'lose' && currentBmi < SAFETY.lowBmi) || (targetBmi != null && targetBmi < SAFETY.lowBmi)) {
    warnings.push({ code: 'lowBmi' });
  }
  if (i.targetWeightKg != null) {
    if ((i.goal === 'lose' && i.targetWeightKg >= i.weightKg) || (i.goal === 'gain' && i.targetWeightKg <= i.weightKg)) {
      warnings.push({ code: 'targetDirection' });
    }
  }

  const { rateKg, capped } = resolveRate(i.goal, i.weightKg, i.weeklyRateKg);
  if (capped) warnings.push({ code: 'rateCapped', rateKg });
  const sign = i.goal === 'lose' ? -1 : i.goal === 'gain' ? 1 : 0;
  const adjustment = (sign * rateKg * KCAL_PER_KG) / 7;

  let calories = roundTo(tdee + adjustment, 10);
  const floor = SAFETY.calorieFloor[i.sex];
  if (calories < floor) {
    calories = floor;
    warnings.push({ code: 'floor', floor });
  }
  if (calories > SAFETY.calorieCeiling) {
    calories = SAFETY.calorieCeiling;
    warnings.push({ code: 'ceiling', ceiling: SAFETY.calorieCeiling });
  }

  // Macros
  const refKg = referenceWeightKg(i.weightKg, i.heightCm);
  const proteinPerKg = proteinPerKgFor(i.goal, i.trainingDaysPerWeek);
  const proteinG = Math.round(refKg * proteinPerKg);
  const fatG = Math.round(Math.max((calories * SAFETY.minFatPct) / 9, refKg * SAFETY.minFatGPerKg));
  let carbsG = Math.round((calories - proteinG * 4 - fatG * 9) / 4);
  if (carbsG < 0) {
    carbsG = 0;
    warnings.push({ code: 'macroOverflow' });
  }

  if (i.goal === 'lose' && (calories < bmr || tdee - calories > tdee * 0.3)) warnings.push({ code: 'aggressiveDeficit' });

  const projectedRateKg = round2(((calories - tdee) * 7) / KCAL_PER_KG);
  if ((i.goal === 'lose' && projectedRateKg >= 0) || (i.goal === 'gain' && projectedRateKg <= 0)) warnings.push({ code: 'goalNotMet' });
  let weeksToTarget: number | null = null;
  if (i.targetWeightKg != null && projectedRateKg !== 0) {
    const delta = i.targetWeightKg - i.weightKg;
    if (Math.sign(delta) === Math.sign(projectedRateKg)) weeksToTarget = Math.ceil(Math.abs(delta / projectedRateKg));
  }

  const needsReview = warnings.some((w) => REVIEW_CODES.has(w.code));

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    adjustment: Math.round(adjustment),
    projectedRateKg,
    calories,
    proteinG,
    fatG,
    carbsG,
    proteinPerKg: round2(proteinG / refKg),
    usesReferenceWeight: refKg < i.weightKg,
    fatPct: Math.round(((fatG * 9) / calories) * 100),
    weeksToTarget,
    warnings,
    needsReview,
  };
}

/** Checks for manual targets. Returns warning codes; does not block saving. */
export function manualTargetWarnings(m: { calories: number; proteinG: number; fatG: number; carbsG: number }): (
  | { code: 'manualLow' }
  | { code: 'manualEnergy'; kcal: number }
)[] {
  const out: ({ code: 'manualLow' } | { code: 'manualEnergy'; kcal: number })[] = [];
  if (m.calories < SAFETY.calorieFloor.female) out.push({ code: 'manualLow' });
  const implied = m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9;
  if (Math.abs(implied - m.calories) > Math.max(100, m.calories * 0.1)) out.push({ code: 'manualEnergy', kcal: Math.round(implied) });
  return out;
}
