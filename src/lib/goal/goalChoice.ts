/**
 * Story 14 (OBS-0327E3): step 2 of the goal sheet ("Keep this goal", "Philip's pick", "Set my own").
 * Pure, tested. Kept out of replan.ts, which Home loads, so the first screen's size budget stays put.
 */
import type { GoalChoice, PlanChange } from '../../db/types';

/**
 * Story 14 (OBS-0327E3): is the open request (waiting, failed or ready) for the goal on screen now? When
 * the owner picks another goal or date, the open one stops counting: asking again replaces it, and its
 * "waiting" state no longer holds the choices back.
 */
export function sameRequest(
  open: Pick<PlanChange, 'choice' | 'restart'> | null,
  choice: Pick<GoalChoice, 'phase' | 'endWeightKg' | 'bfLinePct' | 'deadline'> | null,
  restart: boolean,
): boolean {
  if (!open || !choice) return false;
  const a = open.choice;
  return open.restart === restart && a.phase === choice.phase && a.endWeightKg === choice.endWeightKg && (a.bfLinePct ?? null) === (choice.bfLinePct ?? null) && (a.deadline ?? null) === (choice.deadline ?? null);
}

export type AskBlock = 'needWeight' | 'invalid' | 'workoutOpen' | null;

/** Why "Ask Philip for the plan" is disabled, so the sheet can say it (null = it can be tapped). */
export function askBlock(i: { mode: 'repeat' | 'keep' | 'philip' | 'own'; hasChoice: boolean; blocked: boolean; workoutOpen: boolean; restart: boolean }): AskBlock {
  if (i.workoutOpen && i.restart) return 'workoutOpen';
  if (!i.hasChoice) return i.mode === 'own' ? 'needWeight' : 'invalid';
  if (i.blocked) return 'invalid';
  return null;
}
