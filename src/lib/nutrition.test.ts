import { describe, expect, it } from 'vitest';
import type { FoodEntry, TargetPlan } from '../db/types';
import { groupByMeal, planForDate, progress, scaleToGrams, sumMacros, targetForDate } from './nutrition';
import { parseDecimal, validateNumber, LIMITS } from './numbers';

const entry = (o: Partial<FoodEntry>): FoodEntry => ({
  id: Math.random().toString(),
  date: '2026-10-28',
  meal: 'lunch',
  name: 'x',
  grams: null,
  calories: 0,
  proteinG: 0,
  fatG: 0,
  carbsG: 0,
  source: 'manual',
  savedFoodId: null,
  estimate: null,
  createdAt: 0,
  updatedAt: 0,
  ...o,
});

const plan = (o: Partial<TargetPlan>): TargetPlan => ({
  effectiveFrom: '2026-01-01',
  calories: 2000,
  proteinG: 150,
  fatG: 60,
  carbsG: 200,
  method: 'manual',
  inputsSnapshot: null,
  createdAt: 1,
  ...o,
});

describe('sumMacros', () => {
  it('sums and removes float noise', () => {
    const s = sumMacros([entry({ calories: 100.1, proteinG: 0.1 }), entry({ calories: 200.2, proteinG: 0.2 })]);
    expect(s).toEqual({ calories: 300.3, proteinG: 0.3, fatG: 0, carbsG: 0 });
  });
  it('returns zeros for empty days', () => {
    expect(sumMacros([])).toEqual({ calories: 0, proteinG: 0, fatG: 0, carbsG: 0 });
  });
});

describe('groupByMeal', () => {
  it('groups in creation order and includes empty meals', () => {
    const g = groupByMeal([entry({ meal: 'dinner', createdAt: 2, name: 'b' }), entry({ meal: 'dinner', createdAt: 1, name: 'a' })]);
    expect(g.dinner.map((e) => e.name)).toEqual(['a', 'b']);
    expect(g.breakfast).toEqual([]);
  });
});

describe('target plan resolution', () => {
  const plans = [
    plan({ id: 1, effectiveFrom: '2026-01-01', calories: 2000, createdAt: 1 }),
    plan({ id: 2, effectiveFrom: '2026-06-01', calories: 2200, createdAt: 2 }),
    plan({ id: 3, effectiveFrom: '2026-06-01', calories: 2300, createdAt: 3 }),
  ];
  it('uses latest plan effective on or before the date', () => {
    expect(planForDate(plans, '2025-12-31')).toBeNull();
    expect(planForDate(plans, '2026-01-01')?.id).toBe(1);
    expect(planForDate(plans, '2026-05-31')?.id).toBe(1);
    expect(planForDate(plans, '2026-06-01')?.id).toBe(3); // same day: newest wins
    expect(planForDate(plans, '2027-01-01')?.id).toBe(3);
  });
  it('applies weekday overrides', () => {
    const p = [plan({ weekdayOverrides: { 3: { calories: 2600, proteinG: 160, fatG: 70, carbsG: 280 } } })];
    expect(targetForDate(p, '2026-10-28')?.calories).toBe(2600); // Wednesday
    expect(targetForDate(p, '2026-10-29')?.calories).toBe(2000);
  });
});

describe('helpers', () => {
  it('progress clamps', () => {
    expect(progress(50, 100)).toBe(0.5);
    expect(progress(150, 100)).toBe(1);
    expect(progress(-5, 100)).toBe(0);
    expect(progress(5, 0)).toBe(0);
  });
  it('scales nutrition to grams', () => {
    expect(scaleToGrams({ calories: 200, proteinG: 10, fatG: 5, carbsG: 30 }, 100, 150)).toEqual({ calories: 300, proteinG: 15, fatG: 7.5, carbsG: 45 });
    expect(scaleToGrams({ calories: 200, proteinG: 10, fatG: 5, carbsG: 30 }, null, 150)).toBeNull();
  });
});

describe('number parsing and validation', () => {
  it('parses decimals including comma decimals', () => {
    expect(parseDecimal('12.5')).toBe(12.5);
    expect(parseDecimal('12,5')).toBe(12.5);
    expect(parseDecimal('.5')).toBe(0.5);
    expect(parseDecimal('1,200')).toBe(1200);
    expect(parseDecimal('')).toBeNull();
    expect(Number.isNaN(parseDecimal('abc'))).toBe(true);
    expect(Number.isNaN(parseDecimal('-3'))).toBe(true);
    expect(Number.isNaN(parseDecimal('1.2.3'))).toBe(true);
  });
  it('validates ranges and required fields', () => {
    expect(validateNumber('', LIMITS.calories).error).toBe('required');
    expect(validateNumber('', LIMITS.grams).error).toBeNull();
    expect(validateNumber('20000', LIMITS.calories).error).toBe('tooHigh');
    expect(validateNumber('x', LIMITS.macro).error).toBe('invalid');
    expect(validateNumber('25.5', LIMITS.macro)).toEqual({ value: 25.5, error: null });
  });
});
