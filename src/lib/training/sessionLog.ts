/**
 * Turning Philip's orders into a stored session, and reading the owner's log back (T-013). Pure.
 * Orders (`prescription`) are copied once at creation and never changed here; only `actual`,
 * notes, swaps and status move.
 */
import type { ActualSet, SessionExercise, WorkoutSession } from '../../db/types';
import { EXERCISES, MAIN_EXERCISE, type ExerciseId, type ExerciseInfo } from './exercises';
import { epley, EPLEY_MAX_REPS, isKeySet, LIFTS, type LiftId, type LoggedAccessorySet } from './program';
import type { PlannedExercise, PlannedSession, Prescribed } from './session';
import { applyOrder } from './order';
import { plannedCardio } from './cardio';

export const emptyActual = (p: Prescribed): ActualSet => ({
  order: p.order,
  kg: null,
  reps: null,
  done: false,
  pain: false,
  copiedFromOrder: false,
});

export function toSessionExercise(e: PlannedExercise): SessionExercise {
  return {
    slot: e.slot,
    exerciseId: e.exerciseId,
    swappedFrom: null,
    note: '',
    prescription: e.prescription,
    actual: e.prescription.map(emptyActual),
  };
}

export interface CreateOptions {
  /** The owner's remembered order for this day (Story 7). Main lift stays first. */
  order?: readonly string[] | null;
  /** Treadmill speed unit for the cardio log. */
  speedUnit?: 'mph' | 'kmh';
}

/** A new in-progress session from Philip's plan for the day, with the cardio finisher (Story 7). */
export function createSession(plan: PlannedSession, id: string, date: string, now: number, opts: CreateOptions = {}): WorkoutSession {
  return {
    id,
    date,
    cycle: plan.cycle,
    block: plan.block,
    week: plan.week,
    day: plan.day,
    status: 'in_progress',
    estMinutes: plan.estMinutes,
    startedAt: now,
    finishedAt: null,
    exercises: applyOrder(plan.exercises.map(toSessionExercise), opts.order),
    cardio: plannedCardio(plan.phase, opts.speedUnit),
  };
}

/** "As ordered": copies the order into the log. Not offered for + sets or orders with no weight yet (bodyweight moves excepted). */
export function canCopyOrder(p: Prescribed, bodyweight = false): boolean {
  return p.kind !== 'amrap' && (p.kg !== null || bodyweight || isBodyweightOrder(p));
}
const isBodyweightOrder = (p: Prescribed) => p.kind === 'accessory' && p.kg === null && p.repMin === p.repMax;

export function copyOrder(p: Prescribed, a: ActualSet): ActualSet {
  return { ...a, kg: p.kg, reps: p.targetReps ?? p.repMax, done: true, copiedFromOrder: true };
}

/**
 * A set counts as done only with actual reps, and a weight unless it's a bodyweight move.
 * Editing a copied set clears the "copied" flag (the log is now the owner's own numbers).
 */
export function canMarkDone(a: ActualSet, bodyweight: boolean): boolean {
  return a.reps !== null && a.reps > 0 && (bodyweight || (a.kg !== null && a.kg > 0));
}

/** The lift a main-lift exercise belongs to (block D variants included), or null for accessories. */
export function liftOf(exerciseId: string): LiftId | null {
  for (const lift of LIFTS) {
    const m = MAIN_EXERCISE[lift];
    if (m.normal === exerciseId || m.control === exerciseId) return lift;
  }
  return null;
}

/** The most recent logged sets for an exercise in earlier finished sessions (drives double progression). */
export function lastSetsFor(sessions: readonly WorkoutSession[], id: ExerciseId): LoggedAccessorySet[] | null {
  const done = sessions
    .filter((s) => s.status === 'done')
    .sort((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt));
  for (const s of done) {
    const ex = s.exercises.find((e) => e.exerciseId === id);
    if (ex && ex.actual.some((a) => a.done)) return ex.actual.map((a) => ({ kg: a.kg, reps: a.reps, done: a.done }));
  }
  return null;
}

/** Id of the latest finished session where this exercise was logged (Story 7: next-time overrides key on it). */
export function lastSessionIdFor(sessions: readonly WorkoutSession[], id: string): string | null {
  const done = sessions
    .filter((s) => s.status === 'done')
    .sort((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt));
  for (const s of done) {
    const ex = s.exercises.find((e) => e.exerciseId === id);
    if (ex && ex.actual.some((a) => a.done)) return s.id;
  }
  return null;
}

export interface SessionSummary {
  setsDone: number;
  setsTotal: number;
  minutes: number;
  /** Best e1RM from the main lift's + set or top set today, if logged (≤10 reps). */
  e1rmKg: number | null;
  /** Today's e1RM beats every earlier one for this lift. */
  pr: boolean;
  /** The key set came in under its prescribed reps. */
  missed: boolean;
  pain: boolean;
}

function keyE1rm(ex: SessionExercise): { e1rm: number | null; missed: boolean } {
  let best: number | null = null;
  let missed = false;
  for (const a of ex.actual) {
    const p = ex.prescription.find((x) => x.order === a.order);
    if (!p || !isKeySet(p.kind) || !a.done || a.kg === null || a.reps === null) continue;
    if (a.reps < p.repMin) missed = true;
    if (a.reps >= 1 && a.reps <= EPLEY_MAX_REPS) best = Math.max(best ?? 0, epley(a.kg, a.reps));
  }
  return { e1rm: best === null ? null : Math.round(best * 10) / 10, missed };
}

export function summarize(session: WorkoutSession, earlier: readonly WorkoutSession[], now: number): SessionSummary {
  let setsDone = 0;
  let setsTotal = 0;
  for (const ex of session.exercises) {
    setsTotal += ex.prescription.filter((p) => p.kind !== 'warmup').length;
    setsDone += ex.actual.filter((a) => a.done && ex.prescription.find((p) => p.order === a.order)?.kind !== 'warmup').length;
  }
  const main = session.exercises.find((e) => e.slot === 'main');
  const lift = main ? liftOf(main.exerciseId) : null;
  const { e1rm, missed } = main ? keyE1rm(main) : { e1rm: null, missed: false };
  let prev = 0;
  if (lift) {
    for (const s of earlier) {
      if (s.id === session.id || s.status !== 'done') continue;
      const m = s.exercises.find((e) => e.slot === 'main' && liftOf(e.exerciseId) === lift);
      const v = m ? keyE1rm(m).e1rm : null;
      if (v !== null) prev = Math.max(prev, v);
    }
  }
  return {
    setsDone,
    setsTotal,
    minutes: Math.max(1, Math.round(((session.finishedAt ?? now) - session.startedAt) / 60000)),
    e1rmKg: e1rm,
    pr: e1rm !== null && prev > 0 && e1rm > prev,
    missed,
    pain: session.exercises.some((e) => e.actual.some((a) => a.pain)),
  };
}

/** Static info for a stored exercise id ({} for an id this build doesn't know). */
export function infoFor(id: string): ExerciseInfo {
  return (EXERCISES as Record<string, ExerciseInfo>)[id] ?? {};
}

export const isBodyweight = (id: string): boolean => !!infoFor(id).bodyweight;

/**
 * Swaps one accessory in a live session for a freshly planned one (Story 6 §7). Allowed until the
 * exercise's first set is ticked; returns null otherwise (or for the main lift). The new exercise
 * brings its own orders (estimate or progression); `swappedFrom` keeps the original, and the note stays.
 */
export function swapInSession(session: WorkoutSession, index: number, fresh: PlannedExercise): WorkoutSession | null {
  const ex = session.exercises[index];
  if (!ex || ex.slot === 'main' || fresh.slot !== ex.slot) return null;
  if (ex.actual.some((a) => a.done)) return null;
  if (fresh.exerciseId === ex.exerciseId) return session;
  const original = ex.swappedFrom ?? ex.exerciseId;
  return {
    ...session,
    exercises: session.exercises.map((e, i) =>
      i === index ? { ...toSessionExercise(fresh), swappedFrom: fresh.exerciseId === original ? null : original, note: e.note } : e,
    ),
  };
}
