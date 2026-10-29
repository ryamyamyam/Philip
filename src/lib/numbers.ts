/**
 * Parses user-typed decimals. Accepts "12.5", "12,5", " 12 ", ".5".
 * Returns null for empty input and NaN for invalid input.
 */
export function parseDecimal(input: string): number | null {
  const s = input.trim().replace(/\s/g, '');
  if (s === '') return null;
  let normalized = s;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) normalized = s.replace(/,/g, ''); // thousands: 1,200
  else if (/^\d*,\d+$/.test(s)) normalized = s.replace(',', '.'); // decimal comma: 12,5
  if (!/^\d*\.?\d+$|^\d+\.$/.test(normalized)) return NaN;
  return Number(normalized);
}

export interface FieldRule {
  min: number;
  max: number;
  required: boolean;
}

export type FieldError = 'required' | 'invalid' | 'tooLow' | 'tooHigh';

export function validateNumber(input: string, rule: FieldRule): { value: number | null; error: FieldError | null } {
  const v = parseDecimal(input);
  if (v === null) return { value: null, error: rule.required ? 'required' : null };
  if (Number.isNaN(v)) return { value: null, error: 'invalid' };
  if (v < rule.min) return { value: v, error: 'tooLow' };
  if (v > rule.max) return { value: v, error: 'tooHigh' };
  return { value: v, error: null };
}

export const LIMITS = {
  grams: { min: 0, max: 5000, required: false },
  calories: { min: 0, max: 10000, required: true },
  macro: { min: 0, max: 1000, required: true },
} as const satisfies Record<string, FieldRule>;

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
