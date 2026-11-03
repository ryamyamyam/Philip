import { describe, expect, it } from 'vitest';
import { dominantMacro, MACRO_CATEGORY, MEAL_CATEGORY } from './category';
import { eatenPercent, meterLevel } from './meter';

describe('T-009 dominantMacro', () => {
  it('picks the macro with the most calories, not the most grams', () => {
    // 30 g fat = 270 kcal beats 50 g carbs = 200 kcal
    expect(dominantMacro([{ proteinG: 10, fatG: 30, carbsG: 50 }])).toBe('fat');
  });
  it('sums across items', () => {
    expect(dominantMacro([{ proteinG: 40, fatG: 0, carbsG: 10 }, { proteinG: 0, fatG: 2, carbsG: 20 }])).toBe('protein');
  });
  it('returns null for empty or all-zero items', () => {
    expect(dominantMacro([])).toBeNull();
    expect(dominantMacro([{ proteinG: 0, fatG: 0, carbsG: 0 }])).toBeNull();
  });
  it('breaks ties protein → carbs → fat', () => {
    expect(dominantMacro([{ proteinG: 10, fatG: 0, carbsG: 10 }])).toBe('protein');
  });
  it('maps every macro and meal to a category', () => {
    expect(Object.values(MACRO_CATEGORY)).toHaveLength(3);
    expect(new Set(Object.values(MEAL_CATEGORY)).size).toBe(4);
  });
});

describe('T-009 meterLevel', () => {
  it('drains like a health bar for ceilings', () => {
    expect(meterLevel('drain', 0, 2000)).toEqual({ fraction: 1, level: 'full' });
    expect(meterLevel('drain', 1400, 2000).level).toBe('mid'); // 30% left
    expect(meterLevel('drain', 1900, 2000).level).toBe('low'); // 5% left
    expect(meterLevel('drain', 2100, 2000)).toEqual({ fraction: 1, level: 'over' });
  });
  it('follows the tone from remaining.ts when given', () => {
    expect(meterLevel('drain', 2000.4, 2000, 'success').level).toBe('low'); // rounds to 0 left, not over
    expect(meterLevel('fill', 149.6, 150, 'success')).toEqual({ fraction: 1, level: 'done' });
  });
  it('fills up for minimums', () => {
    expect(meterLevel('fill', 75, 150)).toEqual({ fraction: 0.5, level: 'up' });
    expect(meterLevel('fill', 200, 150)).toEqual({ fraction: 1, level: 'done' });
  });
  it('handles a zero target', () => {
    expect(meterLevel('fill', 10, 0).fraction).toBe(0);
    expect(eatenPercent(10, 0)).toBe(0);
    expect(eatenPercent(1660, 2000)).toBe(83);
  });
});
