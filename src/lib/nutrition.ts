import type { FoodEntry, Macros, Meal, TargetPlan, YMD } from '../db/types';
import { MEALS } from '../db/types';
import { weekdayOf } from './date';

export const ZERO: Macros = { calories: 0, proteinG: 0, fatG: 0, carbsG: 0 };

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    calories: a.calories + b.calories,
    proteinG: a.proteinG + b.proteinG,
    fatG: a.fatG + b.fatG,
    carbsG: a.carbsG + b.carbsG,
  };
}

export function sumMacros(items: readonly Macros[]): Macros {
  return roundMacros(items.reduce<Macros>(addMacros, ZERO));
}

/** Rounds to 1 decimal to remove floating-point noise (0.1 + 0.2). */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function roundMacros(m: Macros): Macros {
  return { calories: round1(m.calories), proteinG: round1(m.proteinG), fatG: round1(m.fatG), carbsG: round1(m.carbsG) };
}

export function groupByMeal(entries: readonly FoodEntry[]): Record<Meal, FoodEntry[]> {
  const out = Object.fromEntries(MEALS.map((m) => [m, [] as FoodEntry[]])) as unknown as Record<Meal, FoodEntry[]>;
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  for (const e of sorted) out[e.meal].push(e);
  return out;
}

/**
 * Plan in effect on a date: the latest plan whose effectiveFrom <= date.
 * Ties on effectiveFrom are broken by the most recently created plan.
 */
export function planForDate(plans: readonly TargetPlan[], date: YMD): TargetPlan | null {
  let best: TargetPlan | null = null;
  for (const p of plans) {
    if (p.effectiveFrom > date) continue;
    if (
      !best ||
      p.effectiveFrom > best.effectiveFrom ||
      (p.effectiveFrom === best.effectiveFrom && (p.createdAt > best.createdAt || (p.createdAt === best.createdAt && (p.id ?? 0) > (best.id ?? 0))))
    ) {
      best = p;
    }
  }
  return best;
}

/** Macro target for a date, honoring weekly-planning overrides. */
export function targetForDate(plans: readonly TargetPlan[], date: YMD): Macros | null {
  const plan = planForDate(plans, date);
  if (!plan) return null;
  const override = plan.weekdayOverrides?.[weekdayOf(date)];
  const src = override ?? plan;
  return { calories: src.calories, proteinG: src.proteinG, fatG: src.fatG, carbsG: src.carbsG };
}

/** Energy implied by macros (Atwater 4/4/9). Used only for consistency hints. */
export function atwaterKcal(m: Pick<Macros, 'proteinG' | 'fatG' | 'carbsG'>): number {
  return m.proteinG * 4 + m.carbsG * 4 + m.fatG * 9;
}

/** Fraction 0..1 for progress displays, clamped. */
export function progress(consumed: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.max(0, Math.min(1, consumed / target));
}

/** Scales a food's nutrition to a new weight. Returns null if base weight is unknown. */
export function scaleToGrams(m: Macros, baseGrams: number | null, grams: number): Macros | null {
  if (!baseGrams || baseGrams <= 0) return null;
  const f = grams / baseGrams;
  return roundMacros({ calories: m.calories * f, proteinG: m.proteinG * f, fatG: m.fatG * f, carbsG: m.carbsG * f });
}
