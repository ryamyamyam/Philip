/**
 * Story 11: where the owner stands on this cycle's goal, for the watcher (pop-up) and Home's line.
 * Small and eager on purpose: the sheet itself is lazy.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { META } from '../db/repo';
import type { CycleRecord, PlanChange } from '../db/types';
import { goalEvent, isNewEvent, type FiredPrompt, type GoalEvent } from '../lib/goal/goalCheck';
import { isResolved, recentPlan } from '../lib/goal/replan';
import { todayYmd } from '../lib/date';
import { useCycles, useMeta, useProfile, useTrainingProgram, useWeightEntries, useWorkoutSessions } from './useData';

export interface GoalState {
  cycle: CycleRecord | null;
  /** A new event to pop up (not shown before). */
  fresh: GoalEvent | null;
  /** The event shown for this cycle that hasn't been answered yet (applied or dismissed). */
  pending: FiredPrompt | null;
  /** This cycle's reached / off-track plan request, when one is waiting or ready. Never a manual one (no Home reminder). */
  open: PlanChange | null;
  /** Story 12: this cycle's manual (Re-plan with Philip) request, when one is waiting or ready. */
  openManual: PlanChange | null;
  /** Story 12: a plan was applied in the last 7 days (the sheet adds Philip's note). */
  recentPlan: boolean;
  /** Story 12: every session of the cycle is closed (the briefing is next). */
  cycleDone: boolean;
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
  if (!cycle) return { cycle: null, fresh: null, pending: null, open: null, openManual: null, recentPlan: false, cycleDone: false, workoutOpen };
  const today = todayYmd();
  const bf = profile.bodyFatPct !== null && profile.bodyFatDate ? { pct: profile.bodyFatPct, date: profile.bodyFatDate } : null;
  const list = Array.isArray(fired) ? fired : [];
  const e = goalEvent(cycle, weights, bf, today);
  const mine = changes.filter((c) => c.cycle === cycle.index);
  const resolved = (kind: string, reason: string) => isResolved(mine, kind, reason);
  const fresh = e && isNewEvent(e, list) && !resolved(e.kind, e.reason) ? e : null;
  const pending = [...list].reverse().find((f) => f.cycle === cycle.index && !resolved(f.kind, f.reason)) ?? null;
  const waiting = (c: PlanChange) => c.status === 'waiting' || c.status === 'ready';
  const open = [...mine].reverse().find((c) => c.event !== 'manual' && waiting(c)) ?? null;
  const openManual = [...mine].reverse().find((c) => c.event === 'manual' && waiting(c)) ?? null;
  const closed = new Set(sessions.filter((s) => s.cycle === cycle.index && s.status !== 'in_progress').map((s) => `${s.week}-${s.day}`));
  return { cycle, fresh, pending, open, openManual, recentPlan: recentPlan(changes, Date.now()), cycleDone: closed.size >= 16, workoutOpen };
}
