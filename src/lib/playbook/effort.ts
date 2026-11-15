/**
 * PB-8.4 step 4: load changes by reps-in-reserve math, never a flat percent (Story 16). Pure and tiny,
 * so the eager session engine can use it without the whole plausibility check.
 */
import { loadForEffort, PB_LOADS } from './rules';

/** PB-8.4 step 4: the load for the same reps at `rir + delta` (positive = lighter). Not capped by the e1RM cutoff. */
export function rirShift(kg: number, reps: number, rir: number, delta: number): number {
  const from = 1 + (reps + Math.max(0, rir)) / 30;
  const to = 1 + (reps + Math.max(0, rir + delta)) / 30;
  return (kg * from) / to;
}

/**
 * A set that fell short: re-derive from what was actually lifted. The set is taken as near failure
 * (RIR `shortSetRir`), so e1RM = kg × (1 + done ÷ 30), and the load for the target reps + RIR follows.
 */
export function shortSetLoad(kg: number, repsDone: number, targetReps: number, rir: number): number {
  const e1 = kg * (1 + (Math.max(1, repsDone) + PB_LOADS.shortSetRir) / 30);
  return loadForEffort(e1, targetReps, rir);
}

