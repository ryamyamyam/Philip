/**
 * "What's left today" logic for the Today card (UX-3 / OBS-F047E3).
 *
 *  - Cutting (lose) and maintaining: calories, fat and carbs are ceilings.
 *      at or under target → "X left" (success); over → "X over" (danger).
 *  - Bulking (gain): calories, fat and carbs are minimums.
 *      short → "X to go" (warning); reached → "X over" (success).
 *  - Protein is always a minimum, in every phase.
 */
import type { Goal, Macros, Profile, TargetPlan } from '../db/types';

export type Phase = 'cut' | 'maintain' | 'bulk';
export type RemainingStatus = 'left' | 'over' | 'toGo' | 'reached';
export type Tone = 'success' | 'danger' | 'warning';

export interface Remaining {
  status: RemainingStatus;
  /** Always ≥ 0 and rounded to a whole number (kcal or g). */
  amount: number;
  tone: Tone;
}

export type MacroKey = keyof Macros;

const GOALS: readonly Goal[] = ['lose', 'maintain', 'gain'];

export function phaseFromGoal(goal: Goal | null | undefined): Phase {
  return goal === 'lose' ? 'cut' : goal === 'gain' ? 'bulk' : 'maintain';
}

/** Phase from the active plan's calculator inputs, falling back to the profile goal, then maintain. */
export function phaseFor(plan: Pick<TargetPlan, 'inputsSnapshot'> | null, profile: Pick<Profile, 'goal'> | null | undefined): Phase {
  const snap = plan?.inputsSnapshot?.goal;
  if (typeof snap === 'string' && (GOALS as readonly string[]).includes(snap)) return phaseFromGoal(snap as Goal);
  return phaseFromGoal(profile?.goal ?? null);
}

/** Ceiling rule: stay at or under the target. */
export function ceilingRule(consumed: number, target: number): Remaining {
  const diff = Math.round(target - consumed);
  return diff >= 0 ? { status: 'left', amount: diff || 0, tone: 'success' } : { status: 'over', amount: -diff, tone: 'danger' };
}

/** Minimum rule: reach the target. Going past it is fine. */
export function minimumRule(consumed: number, target: number): Remaining {
  const diff = Math.round(target - consumed);
  return diff > 0 ? { status: 'toGo', amount: diff, tone: 'warning' } : { status: 'reached', amount: Math.max(0, -diff), tone: 'success' };
}

export function remainingFor(key: MacroKey, phase: Phase, consumed: number, target: number): Remaining {
  if (key === 'proteinG' || phase === 'bulk') return minimumRule(consumed, target);
  return ceilingRule(consumed, target);
}

export function remainingAll(phase: Phase, consumed: Macros, target: Macros): Record<MacroKey, Remaining> {
  return {
    calories: remainingFor('calories', phase, consumed.calories, target.calories),
    proteinG: remainingFor('proteinG', phase, consumed.proteinG, target.proteinG),
    fatG: remainingFor('fatG', phase, consumed.fatG, target.fatG),
    carbsG: remainingFor('carbsG', phase, consumed.carbsG, target.carbsG),
  };
}
