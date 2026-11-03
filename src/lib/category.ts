/**
 * Category colors for chips and action buttons (D-022, docs/DESIGN_SYSTEM.md).
 * Presentation only: nothing here is stored. Each key maps to a `--cat-*` token pair.
 */
import type { Macros, Meal } from '../db/types';

export type CategoryKey = 'sky' | 'sand' | 'slate' | 'violet' | 'coral' | 'leaf' | 'rose' | 'teal';
export type MacroCategory = 'protein' | 'fat' | 'carbs';

export const MACRO_CATEGORY: Record<MacroCategory, CategoryKey> = { protein: 'coral', fat: 'sand', carbs: 'sky' };
export const MEAL_CATEGORY: Record<Meal, CategoryKey> = { breakfast: 'sand', lunch: 'leaf', dinner: 'violet', snack: 'rose' };

const KCAL_PER_G: Record<MacroCategory, number> = { protein: 4, fat: 9, carbs: 4 };

/**
 * The macro that supplies the most calories across the items (protein 4, fat 9, carbs 4 kcal/g).
 * Ties keep the order protein → carbs → fat. Null when the items carry no macros at all.
 */
export function dominantMacro(items: readonly Pick<Macros, 'proteinG' | 'fatG' | 'carbsG'>[]): MacroCategory | null {
  const kcal: Record<MacroCategory, number> = { protein: 0, fat: 0, carbs: 0 };
  for (const i of items) {
    kcal.protein += Math.max(0, i.proteinG) * KCAL_PER_G.protein;
    kcal.fat += Math.max(0, i.fatG) * KCAL_PER_G.fat;
    kcal.carbs += Math.max(0, i.carbsG) * KCAL_PER_G.carbs;
  }
  let best: MacroCategory | null = null;
  for (const k of ['protein', 'carbs', 'fat'] as const) {
    if (kcal[k] > 0 && (best === null || kcal[k] > kcal[best])) best = k;
  }
  return best;
}
