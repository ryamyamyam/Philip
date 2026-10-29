import { describe, expect, it } from 'vitest';
import {
  calculateTargets,
  manualTargetWarnings,
  mifflinStJeor,
  proteinPerKgFor,
  referenceWeightKg,
  resolveRate,
  validateInputs,
  type CalcInputs,
} from './targets';

const base: CalcInputs = {
  sex: 'male',
  ageYears: 30,
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'moderate',
  trainingDaysPerWeek: 4,
  goal: 'lose',
  targetWeightKg: 75,
  weeklyRateKg: null,
};

describe('Mifflin–St Jeor', () => {
  it('matches the published equations', () => {
    expect(mifflinStJeor('male', 80, 180, 30)).toBe(1780);
    expect(mifflinStJeor('female', 60, 165, 25)).toBeCloseTo(1345.25);
  });
});

describe('calculateTargets', () => {
  it('computes a standard fat-loss target', () => {
    const r = calculateTargets(base);
    expect(r.bmr).toBe(1780);
    expect(r.tdee).toBe(2759);
    expect(r.adjustment).toBe(-440); // 0.4 kg/wk × 7700 / 7
    expect(r.calories).toBe(2320);
    expect(r.proteinG).toBe(176); // 2.2 g/kg, trains 4×/wk
    expect(r.fatG).toBe(64); // 25% of kcal
    expect(r.carbsG).toBe(260);
    expect(r.proteinG * 4 + r.fatG * 9 + r.carbsG * 4).toBeCloseTo(r.calories, -1);
    expect(r.warnings).toEqual([]);
    expect(r.needsReview).toBe(false);
    expect(r.weeksToTarget).toBe(13);
  });

  it('maintenance has no adjustment', () => {
    const r = calculateTargets({ ...base, goal: 'maintain', targetWeightKg: null });
    expect(r.adjustment).toBe(0);
    expect(r.calories).toBe(2760);
    expect(r.weeksToTarget).toBeNull();
  });

  it('caps loss at 1% of body weight per week', () => {
    const r = calculateTargets({ ...base, weeklyRateKg: 1.5 });
    expect(r.warnings).toContainEqual({ code: 'rateCapped', rateKg: 0.8 });
    expect(r.adjustment).toBe(-880);
  });

  it('caps gain at 0.5% of body weight per week', () => {
    expect(resolveRate('gain', 80, 1)).toEqual({ rateKg: 0.4, capped: true });
    expect(resolveRate('gain', 80, null)).toEqual({ rateKg: 0.2, capped: false });
  });

  it('never goes below the calorie floor and flags review', () => {
    const r = calculateTargets({
      ...base,
      sex: 'female',
      ageYears: 25,
      heightCm: 165,
      weightKg: 60,
      activityLevel: 'sedentary',
      targetWeightKg: 55,
      weeklyRateKg: 1,
    });
    expect(r.calories).toBe(1200);
    expect(r.warnings.some((w) => w.code === 'floor')).toBe(true);
    expect(r.needsReview).toBe(true);
  });

  it('warns on low BMI loss goals', () => {
    const r = calculateTargets({ ...base, weightKg: 58, targetWeightKg: 55 });
    expect(r.warnings).toContainEqual({ code: 'lowBmi' });
    expect(r.needsReview).toBe(true);
  });

  it('warns when target weight contradicts goal', () => {
    expect(calculateTargets({ ...base, targetWeightKg: 85 }).warnings).toContainEqual({ code: 'targetDirection' });
    expect(calculateTargets({ ...base, goal: 'gain', targetWeightKg: 70 }).warnings).toContainEqual({ code: 'targetDirection' });
  });

  it('fat is at least 25% of calories', () => {
    for (const goal of ['lose', 'maintain', 'gain'] as const) {
      const r = calculateTargets({ ...base, goal, targetWeightKg: null });
      expect((r.fatG * 9) / r.calories).toBeGreaterThanOrEqual(0.245);
    }
  });

  it('counts only 25% of weight above BMI 30 for protein', () => {
    // 180 cm: BMI-30 weight 97.2 kg; 130 kg → 97.2 + 0.25 × 32.8 = 105.4 kg
    expect(referenceWeightKg(130, 180)).toBeCloseTo(105.4);
    const r = calculateTargets({ ...base, weightKg: 130, targetWeightKg: 110 });
    expect(r.proteinG).toBe(Math.round(105.4 * 2.2));
  });

  it('protein stays within 1.6–2.2 g/kg for people who train', () => {
    for (const goal of ['lose', 'maintain', 'gain'] as const)
      for (const d of [1, 3, 4, 7]) {
        const p = proteinPerKgFor(goal, d);
        expect(p).toBeGreaterThanOrEqual(1.6);
        expect(p).toBeLessThanOrEqual(2.2);
      }
  });

  it('rejects invalid inputs, including minors', () => {
    expect(validateInputs({ ...base, ageYears: 16 })).toContain('age');
    expect(validateInputs({ ...base, heightCm: 20 })).toContain('height');
    expect(validateInputs({ ...base, weightKg: NaN })).toContain('weight');
    expect(validateInputs({ ...base, trainingDaysPerWeek: 9 })).toContain('trainingDays');
    expect(() => calculateTargets({ ...base, ageYears: 16 })).toThrow();
  });
});

describe('manual target warnings', () => {
  it('flags very low calories and inconsistent macros', () => {
    expect(manualTargetWarnings({ calories: 1000, proteinG: 100, fatG: 30, carbsG: 50 }).map((w) => w.code)).toContain('manualLow');
    expect(manualTargetWarnings({ calories: 2500, proteinG: 100, fatG: 30, carbsG: 50 }).map((w) => w.code)).toContain('manualEnergy');
    expect(manualTargetWarnings({ calories: 2000, proteinG: 150, fatG: 67, carbsG: 199 })).toEqual([]);
  });
});

describe('review fixes', () => {
  it('reference weight is continuous at BMI 30', () => {
    const w30 = 30 * 1.8 * 1.8; // 97.2 kg at 180 cm
    expect(referenceWeightKg(w30 - 0.1, 180)).toBeCloseTo(w30 - 0.1);
    expect(referenceWeightKg(w30 + 0.4, 180)).toBeCloseTo(w30 + 0.1);
    const lo = calculateTargets({ ...base, weightKg: 97.1 }).proteinG;
    const hi = calculateTargets({ ...base, weightKg: 97.6 }).proteinG;
    expect(Math.abs(hi - lo)).toBeLessThanOrEqual(2);
  });

  it('g/kg is reported against the weight actually used', () => {
    const r = calculateTargets({ ...base, weightKg: 140, targetWeightKg: 120 });
    expect(r.usesReferenceWeight).toBe(true);
    expect(r.proteinPerKg).toBeCloseTo(2.2, 1);
  });

  it('flags when the floor reverses a loss goal', () => {
    const r = calculateTargets({ ...base, sex: 'female', weightKg: 45, heightCm: 150, ageYears: 60, activityLevel: 'sedentary', targetWeightKg: null });
    expect(r.calories).toBe(1200);
    expect(r.projectedRateKg).toBeGreaterThan(0);
    expect(r.warnings.map((w) => w.code)).toContain('goalNotMet');
    expect(r.needsReview).toBe(true);
  });

  it('flags when the ceiling reverses a gain goal', () => {
    const r = calculateTargets({ ...base, weightKg: 250, heightCm: 210, ageYears: 20, activityLevel: 'veryActive', goal: 'gain', targetWeightKg: null });
    expect(r.calories).toBe(6000);
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['ceiling', 'goalNotMet']));
  });

  it('flags deficits below resting energy or >30% of maintenance', () => {
    const r = calculateTargets({ ...base, weightKg: 200, heightCm: 175, activityLevel: 'sedentary', weeklyRateKg: 2, targetWeightKg: 150 });
    expect(r.warnings.map((w) => w.code)).toContain('aggressiveDeficit');
  });

  it('rejects a zero rate for lose/gain instead of substituting a default', () => {
    expect(validateInputs({ ...base, weeklyRateKg: 0 })).toContain('rate');
    expect(validateInputs({ ...base, goal: 'maintain', weeklyRateKg: 0 })).not.toContain('rate');
  });

  it('warns on any target weight with low BMI', () => {
    expect(calculateTargets({ ...base, goal: 'gain', weightKg: 60, targetWeightKg: 55 }).warnings.map((w) => w.code)).toContain('lowBmi');
  });

  it('uses the 0.5 g/kg fat minimum when 25% would be lower', () => {
    // Floor-limited small person: 25% of 1200 kcal = 33 g; 0.5 g/kg of 90 kg = 45 g
    const r = calculateTargets({ ...base, sex: 'female', weightKg: 90, heightCm: 185, ageYears: 80, activityLevel: 'sedentary', weeklyRateKg: 0.9, targetWeightKg: 80 });
    expect(r.fatG).toBeGreaterThanOrEqual(45);
  });

  it('accepts age boundaries 18 and 100 only', () => {
    expect(validateInputs({ ...base, ageYears: 18 })).not.toContain('age');
    expect(validateInputs({ ...base, ageYears: 100 })).not.toContain('age');
    expect(validateInputs({ ...base, ageYears: 101 })).toContain('age');
  });
});
