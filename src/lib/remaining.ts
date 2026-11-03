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

/** Share of a target eaten, clamped to 0–1, for progress bars. */
export function progressFraction(consumed: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.max(0, Math.min(1, consumed / target));
}

/**
 * "Daily goal hit" (Story 3: celebrate reaching the day's goal, calmly).
 * Protein reached, and calories in the goal zone for the phase:
 *  - cut / maintain: at least 90% of the target and not over it;
 *  - bulk: target reached.
 */
export function dayGoalHit(phase: Phase, consumed: Macros, target: Macros): boolean {
  if (!(target.calories > 0)) return false;
  const r = remainingAll(phase, consumed, target);
  if (r.proteinG.status !== 'reached') return false;
  if (phase === 'bulk') return r.calories.status === 'reached';
  return r.calories.status === 'left' && consumed.calories >= target.calories * 0.9;
}
