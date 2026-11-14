/**
 * Story 11: where the owner stands on this cycle's goal, for the watcher (pop-up) and Home's line.
 * Small and eager on purpose: the sheet itself is lazy.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { META } from '../db/repo';
import type { CycleRecord, PlanChange } from '../db/types';
import { goalEvent, isNewEvent, type FiredPrompt, type GoalEvent } from '../lib/goal/goalCheck';
import { todayYmd } from '../lib/date';
import { useCycles, useMeta, useProfile, useTrainingProgram, useWeightEntries, useWorkoutSessions } from './useData';

export interface GoalState {
  cycle: CycleRecord | null;
  /** A new event to pop up (not shown before). */
  fresh: GoalEvent | null;
  /** The event shown for this cycle that hasn't been answered yet (applied or dismissed). */
  pending: FiredPrompt | null;
  /** This cycle's plan request, when one is waiting or ready. */
  open: PlanChange | null;
  workoutOpen: boolean;
}

export function useGoalState(): GoalState | null {
  const profile = useProfile();
  const weights = useWeightEntries();
  const cycles = useCycles();
  const program = useTrainingProgram();
  const sessions = useWorkoutSessions();
  const fired = useMeta<FiredPrompt[]>(META.goalPrompts);
  const changes = useLiveQuery(() => db.planChanges.orderBy('at').toArray(), []);
  if (!profile || !weights || !cycles || program === undefined || !sessions || fired === undefined || !changes) return null;
  const cycle = program && program.currentCycle > 0 ? (cycles.find((c) => c.index === program.currentCycle) ?? null) : null;
  const workoutOpen = sessions.some((s) => s.status === 'in_progress');
  if (!cycle) return { cycle: null, fresh: null, pending: null, open: null, workoutOpen };
  const today = todayYmd();
  const bf = profile.bodyFatPct !== null && profile.bodyFatDate ? { pct: profile.bodyFatPct, date: profile.bodyFatDate } : null;
  const list = Array.isArray(fired) ? fired : [];
  const e = goalEvent(cycle, weights, bf, today);
  const mine = changes.filter((c) => c.cycle === cycle.index);
  const resolved = (kind: string, reason: string) =>
    mine.some((c) => (c.status === 'applied' || c.status === 'dismissed') && (c.event === 'reached' || (c.event === kind && c.reason === reason)));
  const fresh = e && isNewEvent(e, list) && !resolved(e.kind, e.reason) ? e : null;
  const pending = [...list].reverse().find((f) => f.cycle === cycle.index && !resolved(f.kind, f.reason)) ?? null;
  const open = [...mine].reverse().find((c) => c.status === 'waiting' || c.status === 'ready') ?? null;
  return { cycle, fresh, pending, open, workoutOpen };
}
