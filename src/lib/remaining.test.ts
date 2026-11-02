import { describe, expect, it } from 'vitest';
import { ceilingRule, minimumRule, phaseFor, phaseFromGoal, remainingAll, remainingFor } from './remaining';

const target = { calories: 2400, proteinG: 150, fatG: 70, carbsG: 280 };

describe('UX-3 remaining / over / to go', () => {
  it('maps goals to phases (lose → cut, gain → bulk, otherwise maintain)', () => {
    expect(phaseFromGoal('lose')).toBe('cut');
    expect(phaseFromGoal('gain')).toBe('bulk');
    expect(phaseFromGoal('maintain')).toBe('maintain');
    expect(phaseFromGoal(null)).toBe('maintain');
  });

  it('prefers the active plan’s goal over the profile goal', () => {
    expect(phaseFor({ inputsSnapshot: { goal: 'gain' } }, { goal: 'lose' })).toBe('bulk');
    expect(phaseFor({ inputsSnapshot: null }, { goal: 'lose' })).toBe('cut');
    expect(phaseFor({ inputsSnapshot: { goal: 'nonsense' } }, null)).toBe('maintain');
    expect(phaseFor(null, undefined)).toBe('maintain');
  });

  it('cutting: calories left (green) at or under target, over (red) above it', () => {
    expect(remainingFor('calories', 'cut', 2018, 2400)).toEqual({ status: 'left', amount: 382, tone: 'success' });
    expect(remainingFor('calories', 'cut', 2400, 2400)).toEqual({ status: 'left', amount: 0, tone: 'success' });
    expect(remainingFor('calories', 'cut', 2550.4, 2400)).toEqual({ status: 'over', amount: 150, tone: 'danger' });
  });

  it('maintaining uses the same ceiling rule as cutting', () => {
    expect(remainingFor('fatG', 'maintain', 80, 70)).toEqual({ status: 'over', amount: 10, tone: 'danger' });
    expect(remainingFor('carbsG', 'maintain', 200, 280)).toEqual({ status: 'left', amount: 80, tone: 'success' });
  });

  it('bulking: to go (amber) while short, reached (green) once at or past target', () => {
    expect(remainingFor('calories', 'bulk', 2000, 2400)).toEqual({ status: 'toGo', amount: 400, tone: 'warning' });
    expect(remainingFor('calories', 'bulk', 2400, 2400)).toEqual({ status: 'reached', amount: 0, tone: 'success' });
    expect(remainingFor('carbsG', 'bulk', 300, 280)).toEqual({ status: 'reached', amount: 20, tone: 'success' });
  });

  it('protein is always a minimum, in every phase', () => {
    for (const phase of ['cut', 'maintain', 'bulk'] as const) {
      expect(remainingFor('proteinG', phase, 110, 150)).toEqual({ status: 'toGo', amount: 40, tone: 'warning' });
      expect(remainingFor('proteinG', phase, 160, 150)).toEqual({ status: 'reached', amount: 10, tone: 'success' });
    }
  });

  it('rules are symmetric helpers and remainingAll covers all four values', () => {
    expect(ceilingRule(0, 0).status).toBe('left');
    expect(minimumRule(0, 0).status).toBe('reached');
    const r = remainingAll('cut', { calories: 1000, proteinG: 50, fatG: 80, carbsG: 100 }, target);
    expect(r.calories.status).toBe('left');
    expect(r.proteinG.status).toBe('toGo');
    expect(r.fatG.status).toBe('over');
    expect(r.carbsG.amount).toBe(180);
  });
});
