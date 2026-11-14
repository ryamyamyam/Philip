/**
 * OBS-3037F2: Philip's reaction to a weigh-in. Pure: given the plans, profile and weight log, says
 * where the owner stands against the plan line and whether today's weight changes the daily targets.
 *
 * - The weight used is the 7-day average (3+ weigh-ins), else the latest weigh-in (same rule as a
 *   cycle briefing, `startingWeight`), so one salty day doesn't move the targets.
 * - Targets are recalculated with the active calculated plan's own inputs, only the weight (and age)
 *   change. Manual plans are never recalculated.
 * - A suggestion is only offered when it moves calories by ≥ MIN_KCAL_CHANGE or protein by
 *   ≥ MIN_PROTEIN_CHANGE, and never when the calculator says it needs review (safety rules unchanged).
 * - The refreshed plan keeps the original plan line (`lineStartKg`/`lineStartDate`), so updating the
 *   targets does not reset "ahead/behind" to on track.
 */
import type { Goal, Profile, TargetPlan, WeightEntry, YMD } from '../db/types';
import { ageOn } from './date';
import { planForDate } from './nutrition';
import { calculateTargets, validateInputs, type CalcInputs, type CalcResult } from './targets';
import { startingWeight } from './training/cycleGoal';
import { weightPlanLine, weightProgress, type WeightProgress } from './weight';

export const MIN_KCAL_CHANGE = 50;
export const MIN_PROTEIN_CHANGE = 5;

export interface TargetRefresh {
  from: { calories: number; proteinG: number; fatG: number; carbsG: number };
  to: CalcResult;
  inputs: CalcInputs;
  /** Weight used for the new targets (kg) and where it came from. */
  weightKg: number;
  weightSource: 'average' | 'latest' | 'profile';
  /** Plan line kept from the previous plan (see file comment). */
  line: { lineStartKg: number; lineStartDate: YMD } | null;
}

export interface WeighInReview {
  progress: WeightProgress;
  goal: Goal;
  /** No calculated plan: Philip can only point to Targets. */
  noPlan: boolean;
  /** Present when today's weight changes the targets enough to matter and passes the safety rules. */
  refresh: TargetRefresh | null;
  /** The recalculated targets were flagged for review (kept out of the one-tap update). */
  needsReview: boolean;
}

const GOALS: readonly Goal[] = ['lose', 'maintain', 'gain'];
const ACTIVITY: readonly CalcInputs['activityLevel'][] = ['sedentary', 'light', 'moderate', 'active', 'veryActive'];
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function reviewWeighIn(
  plans: readonly TargetPlan[],
  profile: Pick<Profile, 'birthDate' | 'weeklyRateKg' | 'targetWeightKg' | 'goal' | 'weightKg' | 'bodyFatPct'>,
  entries: readonly WeightEntry[],
  today: YMD,
): WeighInReview {
  const line = weightPlanLine(plans, profile, today);
  const progress = weightProgress(entries, line, today);
  const active = planForDate(plans, today);
  const snap = active?.method === 'calculated' ? active.inputsSnapshot : null;
  const goal: Goal = typeof snap?.goal === 'string' && (GOALS as readonly string[]).includes(snap.goal) ? (snap.goal as Goal) : (profile.goal ?? 'maintain');
  const base = { progress, goal, refresh: null, needsReview: false };
  if (!active || !snap) return { ...base, noPlan: true };

  const w = startingWeight(entries, today, profile.weightKg);
  if (snap.sex !== 'male' && snap.sex !== 'female') return { ...base, noPlan: false };
  if (!ACTIVITY.includes(snap.activityLevel as CalcInputs['activityLevel'])) return { ...base, noPlan: false };
  if (!w) return { ...base, noPlan: false };
  const inputs: CalcInputs = {
    sex: snap.sex as CalcInputs['sex'],
    ageYears: profile.birthDate ? ageOn(profile.birthDate, today) : (snap.ageYears as number),
    heightCm: snap.heightCm as number,
    weightKg: Math.round(w.kg * 10) / 10,
    activityLevel: snap.activityLevel as CalcInputs['activityLevel'],
    trainingDaysPerWeek: snap.trainingDaysPerWeek as number,
    goal,
    targetWeightKg: isNum(snap.targetWeightKg) ? snap.targetWeightKg : null,
    weeklyRateKg: isNum(snap.weeklyRateKg) ? snap.weeklyRateKg : null,
    bodyFatPct: isNum(snap.bodyFatPct) ? snap.bodyFatPct : (profile.bodyFatPct ?? null),
  };
  // A goal weight already passed (e.g. lost past the target) makes the calculator refuse: no suggestion.
  if (validateInputs(inputs).length) return { ...base, noPlan: false };
  let res: CalcResult;
  try {
    res = calculateTargets(inputs);
  } catch {
    return { ...base, noPlan: false };
  }
  const from = { calories: active.calories, proteinG: active.proteinG, fatG: active.fatG, carbsG: active.carbsG };
  const moved = Math.abs(res.calories - from.calories) >= MIN_KCAL_CHANGE || Math.abs(res.proteinG - from.proteinG) >= MIN_PROTEIN_CHANGE;
  if (!moved) return { ...base, noPlan: false };
  if (res.needsReview) return { ...base, noPlan: false, needsReview: true };
  return {
    ...base,
    noPlan: false,
    refresh: {
      from,
      to: res,
      inputs,
      weightKg: inputs.weightKg,
      weightSource: w.source,
      line: line ? { lineStartKg: line.startKg, lineStartDate: line.startDate } : null,
    },
  };
}

/** The target plan a refresh writes (append-only, effective today). */
export function refreshPlan(r: TargetRefresh, today: YMD): Omit<TargetPlan, 'id' | 'createdAt'> {
  return {
    effectiveFrom: today,
    calories: r.to.calories,
    proteinG: r.to.proteinG,
    fatG: r.to.fatG,
    carbsG: r.to.carbsG,
    method: 'calculated',
    inputsSnapshot: {
      ...r.inputs,
      bmr: r.to.bmr,
      tdee: r.to.tdee,
      adjustment: r.to.adjustment,
      warnings: r.to.warnings.map((w) => w.code),
      needsReview: r.to.needsReview,
      source: 'weighIn',
      ...(r.line ?? {}),
    },
    weekdayOverrides: null,
  };
}
