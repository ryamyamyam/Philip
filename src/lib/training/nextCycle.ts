/**
 * TM progression when a cycle starts (Story 5 §4.5), shared by the cycle briefing and Story 11's
 * "goal reached → new cycle". Pure. Applied once, when the next cycle starts; a short cycle (ended
 * early because the goal was reached) uses the same rule: a lift whose key set wasn't logged holds.
 */
import type { CycleRecord, TmRecord, WorkoutSession } from '../../db/types';
import { LIFTS, nextTm, type LiftId, type TmReason } from './program';
import { cycleOutcomes, tmsForCycle } from './progress';

export interface Progression {
  rows: { lift: LiftId; tmKg: number; reason: TmReason }[];
  snapshot: Record<LiftId, number>;
}

export function progressionFor(tmHistory: readonly TmRecord[], sessions: readonly WorkoutSession[], last: Pick<CycleRecord, 'index' | 'phase'> | null, index: number): Progression {
  const before = tmsForCycle(tmHistory, index - 1);
  const snapshot = Object.fromEntries(LIFTS.map((l) => [l, before[l] ?? 0])) as Record<LiftId, number>;
  const rows: Progression['rows'] = [];
  if (!last) return { rows, snapshot };
  const now = cycleOutcomes(sessions, last.index);
  const prev = cycleOutcomes(sessions, last.index - 1);
  for (const lift of LIFTS) {
    const tm = before[lift];
    if (tm === null) continue;
    const next = nextTm(tm, lift, last.phase, now[lift], prev[lift] === 'miss');
    rows.push({ lift, tmKg: next.tmKg, reason: next.reason });
    snapshot[lift] = next.tmKg;
  }
  return { rows, snapshot };
}
