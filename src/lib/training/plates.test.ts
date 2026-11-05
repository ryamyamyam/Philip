import { describe, expect, it } from 'vitest';
import { DEFAULT_BAR_SETUP, dualUnits, KG_PLATES, loadFor, roundToStep, toUnit } from './plates';

const lb = (kg: number) => Math.round(toUnit(kg, 'lb') * 10) / 10;

describe('loadFor (20 kg bar, lb plates)', () => {
  it('spec example: 85% of TM 90 = 76.5 kg → 45+10+5+2.5 per side = 76.7 kg', () => {
    const l = loadFor(76.5);
    expect(l.perSide).toEqual([45, 10, 5, 2.5]);
    expect(l.totalKg).toBeCloseTo(76.7, 1);
    expect(dualUnits(l.totalKg)).toEqual({ kg: 76.7, lb: 169 });
  });

  it('matches the spec table for squat TM 135', () => {
    expect(loadFor(87.75).perSide).toEqual([45, 25, 5]);
    expect(loadFor(101.25).perSide).toEqual([45, 45]);
    expect(loadFor(114.75).perSide).toEqual([45, 45, 10, 5]);
  });

  it('never goes below the empty bar', () => {
    const l = loadFor(10);
    expect(l.perSide).toEqual([]);
    expect(l.totalKg).toBe(20);
  });

  it('always lands within half the smallest pair of the target', () => {
    for (let kg = 25; kg <= 200; kg += 0.7) {
      const l = loadFor(kg);
      expect(Math.abs(lb(l.totalKg) - lb(kg))).toBeLessThanOrEqual(2.5 + 0.05);
    }
  });

  it('only uses the plates you have', () => {
    const l = loadFor(60, { barKg: 20, plateUnit: 'lb', plates: [45, 25] });
    for (const p of l.perSide) expect([45, 25]).toContain(p);
  });

  it('works with kg plates', () => {
    const l = loadFor(102.5, { barKg: 20, plateUnit: 'kg', plates: KG_PLATES });
    expect(l.totalKg).toBeCloseTo(102.5, 5);
    expect(l.perSide).toEqual([25, 15, 1.25]);
  });

  it('default setup is a 20 kg bar with lb plates', () => {
    expect(DEFAULT_BAR_SETUP.barKg).toBe(20);
    expect(DEFAULT_BAR_SETUP.plateUnit).toBe('lb');
  });
});

describe('roundToStep', () => {
  it('rounds to 2.5 kg or 5 lb', () => {
    expect(roundToStep(23.1, 'kg')).toBe(22.5);
    expect(Math.round(toUnit(roundToStep(23.1, 'lb'), 'lb'))).toBe(50);
  });
});
