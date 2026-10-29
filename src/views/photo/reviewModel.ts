import type { EstimateItem, FoodEstimate, Macros, Meal, YMD } from '../../db/types';
import type { NewFoodEntry } from '../../db/repo';
import type { AnalysisItem } from '../../services/foodAnalysis';
import { LIMITS, parseDecimal, validateNumber, type FieldError } from '../../lib/numbers';
import { round1 } from '../../lib/nutrition';

/** Editable form state for one AI-estimated item. Strings hold raw user input. */
export interface ReviewItem {
  key: string;
  name: string;
  grams: string;
  calories: string;
  proteinG: string;
  fatG: string;
  carbsG: string;
  confidence: EstimateItem['confidence'] | null;
  description: string;
  original: EstimateItem | null;
  /** When set, editing grams rescales the macros proportionally. Cleared once a macro is edited by hand. */
  scaleBase: ({ grams: number } & Macros) | null;
}

let seq = 0;
const nextKey = () => `item-${Date.now().toString(36)}-${seq++}`;

export function fromAnalysis(items: AnalysisItem[]): ReviewItem[] {
  return items.map((it) => ({
    key: nextKey(),
    name: it.name,
    grams: it.grams == null ? '' : String(it.grams),
    calories: String(it.calories),
    proteinG: String(it.proteinG),
    fatG: String(it.fatG),
    carbsG: String(it.carbsG),
    confidence: it.confidence,
    description: it.description,
    original: { ...it },
    scaleBase: it.grams && it.grams > 0 ? { grams: it.grams, calories: it.calories, proteinG: it.proteinG, fatG: it.fatG, carbsG: it.carbsG } : null,
  }));
}

export function blankItem(): ReviewItem {
  return { key: nextKey(), name: '', grams: '', calories: '', proteinG: '', fatG: '', carbsG: '', confidence: null, description: '', original: null, scaleBase: null };
}

/** Live totals; invalid or empty fields count as 0 so totals update as the user types. */
export function reviewTotals(items: ReviewItem[]): Macros {
  const n = (s: string) => {
    const v = parseDecimal(s);
    return v == null || Number.isNaN(v) || v < 0 ? 0 : v;
  };
  return items.reduce<Macros>(
    (a, it) => ({
      calories: round1(a.calories + n(it.calories)),
      proteinG: round1(a.proteinG + n(it.proteinG)),
      fatG: round1(a.fatG + n(it.fatG)),
      carbsG: round1(a.carbsG + n(it.carbsG)),
    }),
    { calories: 0, proteinG: 0, fatG: 0, carbsG: 0 },
  );
}

export type ItemErrors = Partial<Record<'name' | 'grams' | 'calories' | 'proteinG' | 'fatG' | 'carbsG', FieldError | 'nameRequired'>>;

export function validateItems(items: ReviewItem[]): { errors: Record<string, ItemErrors>; ok: boolean } {
  const errors: Record<string, ItemErrors> = {};
  let ok = items.length > 0;
  for (const it of items) {
    const e: ItemErrors = {};
    if (!it.name.trim()) e.name = 'nameRequired';
    const g = validateNumber(it.grams, LIMITS.grams);
    if (g.error) e.grams = g.error;
    for (const k of ['calories', 'proteinG', 'fatG', 'carbsG'] as const) {
      const r = validateNumber(it[k], k === 'calories' ? LIMITS.calories : LIMITS.macro);
      if (r.error) e[k] = r.error;
    }
    if (Object.keys(e).length) {
      errors[it.key] = e;
      ok = false;
    }
  }
  return { errors, ok };
}

/** Converts confirmed review items to entries. Call only after validateItems() passes. */
export function toEntries(
  items: ReviewItem[],
  ctx: { date: YMD; meal: Meal; provider: FoodEstimate['provider']; model: string; analyzedAt: number },
): NewFoodEntry[] {
  const allOriginals = items.map((i) => i.original).filter((o): o is EstimateItem => o !== null);
  return items.map((it) => {
    const v = (s: string) => parseDecimal(s) ?? 0;
    const grams = parseDecimal(it.grams);
    return {
      date: ctx.date,
      meal: ctx.meal,
      name: it.name.trim(),
      grams: grams == null || Number.isNaN(grams) ? null : grams,
      calories: v(it.calories),
      proteinG: v(it.proteinG),
      fatG: v(it.fatG),
      carbsG: v(it.carbsG),
      source: 'photo',
      savedFoodId: null,
      estimate: {
        provider: ctx.provider,
        model: ctx.model,
        items: allOriginals,
        originalValues: it.original
          ? {
              name: it.original.name,
              grams: it.original.grams,
              calories: it.original.calories,
              proteinG: it.original.proteinG,
              fatG: it.original.fatG,
              carbsG: it.original.carbsG,
            }
          : { name: '', grams: null, calories: 0, proteinG: 0, fatG: 0, carbsG: 0 },
        analyzedAt: ctx.analyzedAt,
      },
    };
  });
}

type EditableKey = 'name' | 'grams' | 'calories' | 'proteinG' | 'fatG' | 'carbsG';

/** Applies one field edit, rescaling macros from grams when the item is still weight-linked. */
export function editItem(item: ReviewItem, key: EditableKey, value: string): ReviewItem {
  if (key === 'grams') {
    const g = parseDecimal(value);
    const base = item.scaleBase;
    if (base && g != null && !Number.isNaN(g) && g > 0) {
      const k = g / base.grams;
      return {
        ...item,
        grams: value,
        calories: String(Math.round(base.calories * k)),
        proteinG: String(round1(base.proteinG * k)),
        fatG: String(round1(base.fatG * k)),
        carbsG: String(round1(base.carbsG * k)),
      };
    }
    return { ...item, grams: value };
  }
  if (key === 'name') return { ...item, name: value };
  return { ...item, [key]: value, scaleBase: null };
}
