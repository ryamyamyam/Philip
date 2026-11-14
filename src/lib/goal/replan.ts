/**
 * Story 12: "Re-plan with Philip", on demand. Pure, tested.
 *
 * The button's state (hidden / disabled / see Philip's plan / ask) and the 7-day coaching note live
 * here so the three entry points (Workout › Plan, Progress › Goals, Ask Philip) agree.
 */
import type { PlanChange } from '../../db/types';

export const REPLAN_RULES = {
  /** A plan applied less than this many days ago gets Philip's "a week of data reads clearer" note (coaching default; never a block). */
  recentDays: 7,
} as const;

export type ReplanButton =
  | { state: 'hidden' }
  | { state: 'disabled'; reason: 'workoutOpen' }
  | { state: 'see'; manual: boolean }
  | { state: 'ask' };

export interface ReplanInput {
  /** A cycle is running and has sessions left (no setup, no briefing pending). */
  cycleActive: boolean;
  workoutOpen: boolean;
  /** A reached / off-track request, waiting or ready. */
  open: Pick<PlanChange, 'status'> | null;
  /** A manual request, waiting or ready. */
  openManual: Pick<PlanChange, 'status'> | null;
}

export function replanButton(i: ReplanInput): ReplanButton {
  if (!i.cycleActive) return { state: 'hidden' };
  if (i.workoutOpen) return { state: 'disabled', reason: 'workoutOpen' };
  if (i.open) return { state: 'see', manual: false };
  if (i.openManual) return { state: 'see', manual: true };
  return { state: 'ask' };
}

/** True when a plan was applied inside the last REPLAN_RULES.recentDays days (undone plans don't count). */
export function recentPlan(changes: readonly Pick<PlanChange, 'status' | 'appliedAt'>[], now: number): boolean {
  const from = now - REPLAN_RULES.recentDays * 24 * 3600_000;
  return changes.some((c) => c.status === 'applied' && c.appliedAt !== null && c.appliedAt > from);
}

/**
 * Has the owner answered this cycle's `kind`/`reason` event? An applied or dismissed "reached" plan
 * answers everything; otherwise the same kind and reason must have been answered. A manual plan is
 * neither: it never resolves a pending reached or off-track event.
 */
export function isResolved(mine: readonly Pick<PlanChange, 'status' | 'event' | 'reason'>[], kind: string, reason: string): boolean {
  return mine.some((c) => (c.status === 'applied' || c.status === 'dismissed') && (c.event === 'reached' || (c.event === kind && c.reason === reason)));
}
