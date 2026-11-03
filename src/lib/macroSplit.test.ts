import { describe, expect, it } from 'vitest';
import { manualTargetWarnings } from './targets';
import { caloriesFromGrams, gramsFromPercents, macroPercents, percentTotal } from './macroSplit';

describe('macroPercents (OBS-E49D0F)', () => {
  it('splits macro energy and always totals 100', () => {
    // 160 P = 640, 70 F = 630, 230 C = 920 → 2190 kcal
    const p = macroPercents({ proteinG: 160, fatG: 70, carbsG: 230 })!;
    expect(p).toEqual({ protein: 29, fat: 29, carbs: 42 });
    expect(percentTotal(p)).toBe(100);
  });
  it('uses largest remainder so thirds still add to 100', () => {
    const p = macroPercents({ proteinG: 25, fatG: 100 / 9, carbsG: 25 })!;
    expect(percentTotal(p)).toBe(100);
    expect(Object.values(p).sort()).toEqual([33, 33, 34]);
  });
  it('is null with no energy', () => {
    expect(macroPercents({ proteinG: 0, fatG: 0, carbsG: 0 })).toBeNull();
  });
});

describe('gramsFromPercents', () => {
  it('converts a calorie target with 4/9/4', () => {
    expect(gramsFromPercents(2000, { protein: 30, fat: 25, carbs: 45 })).toEqual({ proteinG: 150, fatG: 56, carbsG: 225 });
  });
  it('round-trips: grams from a ratio give back the same ratio', () => {
    const g = gramsFromPercents(2400, { protein: 35, fat: 25, carbs: 40 });
    expect(macroPercents(g)).toEqual({ protein: 35, fat: 25, carbs: 40 });
  });
  it('stays consistent with the calorie target (no manualEnergy warning)', () => {
    for (const [cal, p] of [
      [1600, { protein: 40, fat: 30, carbs: 30 }],
      [2200, { protein: 25, fat: 35, carbs: 40 }],
      [3200, { protein: 20, fat: 20, carbs: 60 }],
    ] as const) {
      const g = gramsFromPercents(cal, p);
      expect(Math.abs(caloriesFromGrams(g) - cal)).toBeLessThanOrEqual(10);
      expect(manualTargetWarnings({ calories: cal, ...g }).map((w) => w.code)).not.toContain('manualEnergy');
    }
  });
  it('never returns negative grams', () => {
    expect(gramsFromPercents(2000, { protein: -10, fat: 50, carbs: 60 }).proteinG).toBe(0);
  });
});

describe('caloriesFromGrams', () => {
  it('is Atwater 4/9/4, rounded', () => {
    expect(caloriesFromGrams({ proteinG: 160, fatG: 70, carbsG: 230 })).toBe(2190);
    expect(caloriesFromGrams({ proteinG: 10.4, fatG: 0, carbsG: 0 })).toBe(42);
  });
});
