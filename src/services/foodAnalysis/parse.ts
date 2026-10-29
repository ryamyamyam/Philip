import { round1 } from '../../lib/nutrition';
import { AnalysisError, type AnalysisItem, type AnalysisResult, type Confidence } from './types';

const MAX_ITEMS = 20;
const LIMITS = { grams: 5000, calories: 10000, macro: 1000 };

/**
 * Pulls the first JSON object out of arbitrary model/clipboard text.
 * Handles ```json fences and leading/trailing prose.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fence?.[1], trimmed, balancedObject(trimmed)].filter((c): c is string => Boolean(c));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* try next */
    }
  }
  throw new AnalysisError('invalidResponse', 'No JSON object found');
}

function balancedObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Accepts numbers or numeric strings ("120", "120 g"). Returns null when not usable. */
function num(v: unknown, max: number): number | null {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const m = v.replace(',', '.').match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    n = Number(m[0]);
  } else return null;
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return n;
}

function pick(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (k in o) return o[k];
  return undefined;
}

function confidence(v: unknown): Confidence {
  const s = typeof v === 'string' ? v.toLowerCase().trim() : '';
  if (s === 'high' || s === 'medium' || s === 'low') return s;
  if (typeof v === 'number') return v >= 0.75 ? 'high' : v >= 0.45 ? 'medium' : 'low';
  return 'low';
}

/**
 * Validates and normalizes a parsed analysis. Rejects anything that doesn't contain
 * plausible numbers for every item. Totals are recomputed from items.
 */
export function validateAnalysis(raw: unknown): AnalysisResult {
  if (!isObj(raw)) throw new AnalysisError('invalidResponse', 'Response is not an object');
  const rawItems = pick(raw, 'items', 'foods', 'food_items');
  if (!Array.isArray(rawItems)) throw new AnalysisError('invalidResponse', 'Missing items array');
  if (rawItems.length > MAX_ITEMS) throw new AnalysisError('invalidResponse', 'Too many items');

  const items: AnalysisItem[] = rawItems.map((it, i) => {
    if (!isObj(it)) throw new AnalysisError('invalidResponse', `Item ${i + 1} is not an object`);
    const name = typeof it.name === 'string' ? it.name.trim().slice(0, 120) : '';
    const calories = num(pick(it, 'calories', 'kcal', 'energy_kcal'), LIMITS.calories);
    const proteinG = num(pick(it, 'protein_g', 'protein', 'proteinG'), LIMITS.macro);
    const fatG = num(pick(it, 'fat_g', 'fat', 'fatG'), LIMITS.macro);
    const carbsG = num(pick(it, 'carbs_g', 'carbs', 'carbohydrates_g', 'carbohydrates', 'carbsG'), LIMITS.macro);
    const grams = num(pick(it, 'grams', 'weight_g', 'estimated_grams'), LIMITS.grams);
    if (!name || calories == null || proteinG == null || fatG == null || carbsG == null) {
      throw new AnalysisError('invalidResponse', `Item ${i + 1} is missing required values`);
    }
    return {
      name,
      description: typeof it.description === 'string' ? it.description.trim().slice(0, 500) : '',
      grams: grams == null ? null : Math.round(grams),
      calories: Math.round(calories),
      proteinG: round1(proteinG),
      fatG: round1(fatG),
      carbsG: round1(carbsG),
      confidence: confidence(it.confidence),
    };
  });

  const totals = items.reduce(
    (a, b) => ({
      calories: a.calories + b.calories,
      proteinG: round1(a.proteinG + b.proteinG),
      fatG: round1(a.fatG + b.fatG),
      carbsG: round1(a.carbsG + b.carbsG),
    }),
    { calories: 0, proteinG: 0, fatG: 0, carbsG: 0 },
  );

  let totalsMismatch = false;
  const rawTotal = pick(raw, 'total', 'totals');
  if (isObj(rawTotal)) {
    const kcal = num(pick(rawTotal, 'calories', 'kcal'), 100000);
    if (kcal != null && Math.abs(kcal - totals.calories) > Math.max(25, totals.calories * 0.05)) totalsMismatch = true;
  }

  const rawNotes = pick(raw, 'uncertainties', 'notes', 'uncertainty');
  const notes = (Array.isArray(rawNotes) ? rawNotes : typeof rawNotes === 'string' ? [rawNotes] : [])
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    .map((n) => n.trim().slice(0, 300))
    .slice(0, 10);

  return { items, totals, notes, totalsMismatch };
}

/** Convenience for pasted text (Claude handoff). */
export function parseAnalysisText(text: string): AnalysisResult {
  return validateAnalysis(extractJson(text));
}
