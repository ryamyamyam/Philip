/**
 * PFC ratio ⇄ grams for target editing (OBS-E49D0F). Pure, no React.
 *
 * Plans store calories + grams (TargetPlan), so grams stay the saved source of truth. A ratio is a
 * way of *entering* grams: percentages of the calorie target, converted with Atwater 4/9/4.
 */
import type { Macros } from '../db/types';
import { atwaterKcal } from './nutrition';

export type MacroKey = 'protein' | 'fat' | 'carbs';
export const MACRO_KEYS: readonly MacroKey[] = ['protein', 'fat', 'carbs'];
export const KCAL_PER_G: Readonly<Record<MacroKey, number>> = { protein: 4, fat: 9, carbs: 4 };

export type MacroPercents = Record<MacroKey, number>;

/**
 * Share of macro energy from each macro, as whole percents that add up to exactly 100
 * (largest-remainder rounding). Null when the macros carry no energy.
 */
export function macroPercents(m: Pick<Macros, 'proteinG' | 'fatG' | 'carbsG'>): MacroPercents | null {
  const total = atwaterKcal(m);
  if (!(total > 0)) return null;
  const raw: MacroPercents = {
    protein: ((m.proteinG * 4) / total) * 100,
    fat: ((m.fatG * 9) / total) * 100,
    carbs: ((m.carbsG * 4) / total) * 100,
  };
  const out: MacroPercents = { protein: Math.floor(raw.protein), fat: Math.floor(raw.fat), carbs: Math.floor(raw.carbs) };
  let left = 100 - out.protein - out.fat - out.carbs;
  const byRemainder = [...MACRO_KEYS].sort((a, b) => raw[b] - Math.floor(raw[b]) - (raw[a] - Math.floor(raw[a])));
  for (const k of byRemainder) {
    if (left <= 0) break;
    out[k] += 1;
    left -= 1;
  }
  return out;
}

export function percentTotal(p: MacroPercents): number {
  return p.protein + p.fat + p.carbs;
}

/** Whole grams for a calorie target split by percent. Percents should total 100 (not enforced here). */
export function gramsFromPercents(calories: number, p: MacroPercents): Pick<Macros, 'proteinG' | 'fatG' | 'carbsG'> {
  const g = (k: MacroKey) => Math.max(0, Math.round((calories * p[k]) / 100 / KCAL_PER_G[k]));
  return { proteinG: g('protein'), fatG: g('fat'), carbsG: g('carbs') };
}

/** Calories implied by grams, rounded to whole kcal ("Match calories to macros"). */
export function caloriesFromGrams(m: Pick<Macros, 'proteinG' | 'fatG' | 'carbsG'>): number {
  return Math.round(atwaterKcal(m));
}
