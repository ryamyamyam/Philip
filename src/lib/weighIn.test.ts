import { describe, expect, it } from 'vitest';
import type { Profile, TargetPlan, WeightEntry } from '../db/types';
import { calculateTargets, type CalcInputs } from './targets';
import { MIN_KCAL_CHANGE, refreshPlan, reviewWeighIn } from './weighIn';
import { weightPlanLine, weightProgress } from './weight';

const inputs: CalcInputs = {
  sex: 'male',
  ageYears: 28,
  heightCm: 180,
  weightKg: 90,
  activityLevel: 'moderate',
  trainingDaysPerWeek: 4,
  goal: 'lose',
  targetWeightKg: 80,
  weeklyRateKg: 0.5,
  bodyFatPct: null,
};
const res = calculateTargets(inputs);
const plan: TargetPlan = {
  id: 1,
  effectiveFrom: '2026-10-01',
  calories: res.calories,
  proteinG: res.proteinG,
  fatG: res.fatG,
  carbsG: res.carbsG,
  method: 'calculated',
  inputsSnapshot: { ...inputs, bmr: res.bmr, tdee: res.tdee },
  createdAt: 1,
};
const profile: Pick<Profile, 'birthDate' | 'weeklyRateKg' | 'targetWeightKg' | 'goal' | 'weightKg' | 'bodyFatPct'> = {
  birthDate: '1998-01-01',
  weeklyRateKg: -0.5,
  targetWeightKg: 80,
  goal: 'lose',
  weightKg: 84,
  bodyFatPct: null,
};
const w = (date: string, kg: number): WeightEntry => ({ date, weightKg: kg, createdAt: 1, updatedAt: 1 });
const TODAY = '2026-11-12';

describe('OBS-3037F2: Philip reacts to a weigh-in', () => {
  it('offers new targets when the weight moved enough, from the 7-day average', () => {
    const entries = [w('2026-11-08', 84.4), w('2026-11-10', 84), w('2026-11-12', 83.6)];
    const r = reviewWeighIn([plan], profile, entries, TODAY);
    expect(r.noPlan).toBe(false);
    expect(r.refresh).not.toBeNull();
    expect(r.refresh!.weightSource).toBe('average');
    expect(r.refresh!.weightKg).toBe(84);
    expect(r.refresh!.to.calories).toBeLessThan(plan.calories);
    expect(Math.abs(r.refresh!.to.calories - plan.calories)).toBeGreaterThanOrEqual(MIN_KCAL_CHANGE);
    // Same inputs as the active plan except weight and age.
    expect(r.refresh!.inputs).toMatchObject({ ...inputs, weightKg: 84, ageYears: 28 });
  });

  it('says the targets still fit when the change is small', () => {
    const r = reviewWeighIn([plan], profile, [w('2026-11-12', 89.8)], TODAY);
    expect(r.refresh).toBeNull();
    expect(r.needsReview).toBe(false);
  });

  it('manual plans and no plan are never recalculated', () => {
    const manual: TargetPlan = { ...plan, method: 'manual', inputsSnapshot: null };
    expect(reviewWeighIn([manual], profile, [w('2026-11-12', 84)], TODAY)).toMatchObject({ noPlan: true, refresh: null });
    expect(reviewWeighIn([], profile, [w('2026-11-12', 84)], TODAY)).toMatchObject({ noPlan: true, refresh: null });
  });

  it('a refreshed plan keeps the original plan line, so ahead/behind does not reset', () => {
    const entries = [w('2026-11-08', 84.4), w('2026-11-10', 84), w('2026-11-12', 83.6)];
    const before = weightProgress(entries, weightPlanLine([plan], profile, TODAY), TODAY);
    const r = reviewWeighIn([plan], profile, entries, TODAY);
    const next: TargetPlan = { ...refreshPlan(r.refresh!, TODAY), id: 2, createdAt: 2 };
    expect(next.inputsSnapshot).toMatchObject({ source: 'weighIn', lineStartKg: 90, lineStartDate: '2026-10-01', weightKg: 84 });
    const lineAfter = weightPlanLine([plan, next], profile, TODAY);
    expect(lineAfter).toMatchObject({ startKg: 90, startDate: '2026-10-01' });
    expect(weightProgress(entries, lineAfter, TODAY).status).toBe(before.status);
    // Asking again right after applying: nothing more to change.
    expect(reviewWeighIn([plan, next], profile, entries, TODAY).refresh).toBeNull();
  });

  it('malformed snapshots are ignored instead of producing NaN targets', () => {
    const bad: TargetPlan = { ...plan, inputsSnapshot: { weightKg: 90 } };
    const r = reviewWeighIn([bad], profile, [w('2026-11-12', 84)], TODAY);
    expect(r.refresh).toBeNull();
    expect(r.noPlan).toBe(false);
  });
});
