/**
 * Local (no-AI) parsing of typed food text for the add flow (OBS-BC1840 / OBS-A2F21F).
 * Used when there's no Gemini key or Gemini fails: never block logging behind AI.
 *
 *   "2 eggs, 150 g rice, 1 tbsp olive oil"
 *     → [{name:"eggs", count:2}, {name:"rice", grams:150}, {name:"olive oil", grams:15}]
 *
 * Household units are converted with rough water-density approximations
 * (tbsp 15 g, tsp 5 g, cup 240 g) and the user can correct the grams on the review list.
 */
import type { Macros } from '../db/types';
import type { QuickFood } from './recents';
import { round1 } from './nutrition';

export interface ParsedFoodLine {
  name: string;
  grams: number | null;
  /** Bare leading count ("2 eggs"), when no weight was given. */
  count: number | null;
  /** The line as typed. */
  raw: string;
}

const UNIT_GRAMS: Record<string, number> = {
  g: 1, gr: 1, gram: 1, grams: 1, ml: 1,
  kg: 1000, l: 1000,
  tbsp: 15, tablespoon: 15, tablespoons: 15,
  tsp: 5, teaspoon: 5, teaspoons: 5,
  cup: 240, cups: 240,
};

const num = (s: string) => Number(s.replace(',', '.'));
const MAX_ITEMS = 20;

/** Splits on commas, semicolons, new lines, "+", "&" and " and ". Decimal commas ("1,5 kg") are kept. */
export function splitFoodText(text: string): string[] {
  return text
    .split(/\n|;|\+|&|,(?!\d)|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
}

export function parseFoodLine(line: string): ParsedFoodLine {
  let s = line.trim().replace(/\s+/g, ' ');
  let grams: number | null = null;
  let count: number | null = null;
  const unitRe = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${Object.keys(UNIT_GRAMS).join('|')})\\b\\.?`, 'i');
  const m = s.match(unitRe);
  if (m) {
    const factor = UNIT_GRAMS[m[2]!.toLowerCase()] ?? 1;
    // "2 x 1 tbsp" style counts multiply the unit amount.
    const before = s.slice(0, m.index).match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*$/i);
    const mult = before ? num(before[1]!) : 1;
    grams = Math.round(num(m[1]!) * factor * mult);
    s = (s.slice(0, before ? m.index! - before[0].length : m.index) + ' ' + s.slice(m.index! + m[0].length)).trim();
  } else {
    const c = s.match(/^(\d+(?:[.,]\d+)?)\s*[x×]?\s+(.+)$/i) ?? s.match(/^(.+?)\s+[x×]\s*(\d+(?:[.,]\d+)?)$/i);
    if (c) {
      const leading = /^\d/.test(c[1]!);
      count = num(leading ? c[1]! : c[2]!);
      s = (leading ? c[2]! : c[1]!).trim();
    }
  }
  const name = s.replace(/^(of|x)\s+/i, '').replace(/\s+/g, ' ').trim();
  return { raw: line.trim(), name: name || line.trim(), grams: grams != null && grams > 0 ? grams : null, count: count != null && count > 0 ? count : null };
}

export const parseFoodText = (text: string): ParsedFoodLine[] => splitFoodText(text).map(parseFoodLine);

const fold = (s: string) =>
  s.toLocaleLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const singular = (w: string) => (w.length > 3 && w.endsWith('es') ? w.slice(0, -2) : w.length > 2 && w.endsWith('s') ? w.slice(0, -1) : w);
const tokens = (s: string) => fold(s).split(' ').filter(Boolean).map(singular);

/**
 * Best match by name among My Foods and recent foods (candidates in priority order).
 * Exact (folded, singularized) match first, then a candidate whose words are all in the query
 * or vice versa. Returns null when nothing is close enough.
 */
export function matchFood(name: string, candidates: readonly QuickFood[]): QuickFood | null {
  const q = tokens(name);
  if (!q.length) return null;
  const key = q.join(' ');
  const exact = candidates.find((c) => tokens(c.name).join(' ') === key);
  if (exact) return exact;
  const qs = new Set(q);
  return (
    candidates.find((c) => {
      const ct = tokens(c.name);
      if (!ct.length) return false;
      const cs = new Set(ct);
      return ct.every((w) => qs.has(w)) || q.every((w) => cs.has(w));
    }) ?? null
  );
}

export interface LocalFoodRow {
  name: string;
  grams: number | null;
  /** Null when no known food matched: the user fills these in. */
  macros: Macros | null;
  matched: QuickFood | null;
}

/** Turns one parsed line into a review row, prefilling macros from a matched food when possible. */
export function localRow(line: ParsedFoodLine, candidates: readonly QuickFood[]): LocalFoodRow {
  const match = matchFood(line.name, candidates);
  // No match: keep a typed count in the name ("2 eggs") so nothing the user wrote is lost.
  if (!match) return { name: line.count != null ? `${line.count} ${line.name}` : line.name, grams: line.grams, macros: null, matched: null };
  const base: Macros = { calories: match.calories, proteinG: match.proteinG, fatG: match.fatG, carbsG: match.carbsG };
  let k = 1;
  let grams = match.grams;
  if (line.grams != null && match.grams && match.grams > 0) {
    k = line.grams / match.grams;
    grams = line.grams;
  } else if (line.grams != null) {
    // Matched food has no weight, so the typed weight can't scale it. Keep the typed weight, one portion.
    grams = line.grams;
  } else if (line.count != null) {
    k = line.count;
    grams = match.grams != null ? Math.round(match.grams * k) : null;
  }
  return {
    name: match.name,
    grams,
    macros: {
      calories: Math.round(base.calories * k),
      proteinG: round1(base.proteinG * k),
      fatG: round1(base.fatG * k),
      carbsG: round1(base.carbsG * k),
    },
    matched: match,
  };
}

export const localRows = (text: string, candidates: readonly QuickFood[]): LocalFoodRow[] =>
  parseFoodText(text).map((l) => localRow(l, candidates));
