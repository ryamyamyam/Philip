import { describe, expect, it } from 'vitest';
import { adherenceScore, bandCredit, floorCredit } from './adherence';

const target = { calories: 2000, proteinG: 150, fatG: 70, carbsG: 200 };

describe('adherence', () => {
  it('perfect day scores 100', () => {
    const r = adherenceScore(target, target);
    expect(r).toMatchObject({ status: 'scored', score: 100 });
  });
  it('calories within ±10% get full credit; symmetric taper', () => {
    expect(bandCredit(2200, 2000, 0.1, 0.35)).toBe(1);
    expect(bandCredit(1800, 2000, 0.1, 0.35)).toBe(1);
    expect(bandCredit(1500, 2000, 0.1, 0.35)).toBeCloseTo(0.4);
    expect(bandCredit(2500, 2000, 0.1, 0.35)).toBeCloseTo(0.4);
    expect(bandCredit(3000, 2000, 0.1, 0.35)).toBe(0);
  });
  it('does not reward undereating', () => {
    const under = adherenceScore({ ...target, calories: 1300 }, target);
    const on = adherenceScore(target, target);
    expect(under.status === 'scored' && on.status === 'scored' && under.score < on.score).toBe(true);
  });
  it('does not penalize extra protein', () => {
    expect(floorCredit(300, 150, 0.9, 0.5)).toBe(1);
    expect(floorCredit(135, 150, 0.9, 0.5)).toBe(1);
    expect(floorCredit(75, 150, 0.9, 0.5)).toBe(0);
  });
  it('marks very low-logged days as incomplete', () => {
    expect(adherenceScore({ calories: 500, proteinG: 40, fatG: 20, carbsG: 50 }, target).status).toBe('incomplete');
  });
  it('handles missing target', () => {
    expect(adherenceScore(target, null).status).toBe('noTarget');
  });
});

describe('adherence edge cases', () => {
  it('a deliberate 0 g target is achievable', () => {
    const tg = { calories: 2000, proteinG: 150, fatG: 150, carbsG: 0 };
    const r = adherenceScore({ calories: 2000, proteinG: 150, fatG: 150, carbsG: 3 }, tg);
    expect(r).toMatchObject({ status: 'scored', score: 100 });
  });
  it('fat/carb boundaries and protein taper midpoint', () => {
    expect(bandCredit(84, 70, 0.2, 0.5)).toBe(1);
    expect(bandCredit(56, 70, 0.2, 0.5)).toBe(1);
    expect(floorCredit(105, 150, 0.9, 0.5)).toBeCloseTo(0.5);
  });
  it('exactly 50% of calorie target counts as complete', () => {
    expect(adherenceScore({ calories: 1000, proteinG: 0, fatG: 0, carbsG: 0 }, target).status).toBe('scored');
  });
});
