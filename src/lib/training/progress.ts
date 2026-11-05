/**
 * Where the owner is in the program, from stored records (T-012). Pure.
 * Days are a sequence, not weekdays: "today" is the next day of the current cycle that isn't done
 * or skipped. Missing a calendar day never skips or resets anything.
 */
import type { TmRecord, WorkoutSession } from '../../db/types';
import { epley, EPLEY_MAX_REPS, isKeySet, LIFTS, type Day, type LiftId, type Week } from './program';

/** TM per lift for a cycle: the latest record (by createdAt) with effectiveCycle ≤ cycle. Missing lift → null. */
export function tmsForCycle(records: readonly TmRecord[], cycle: number): Record<LiftId, number | null> {
  const out: Record<LiftId, number | null> = { squat: null, bench: null, rdl: null, ohp: null };
  const best: Partial<Record<LiftId, TmRecord>> = {};
  for (const r of records) {
    if (r.effectiveCycle > cycle) continue;
    const cur = best[r.lift];
    if (!cur || r.createdAt > cur.createdAt || (r.createdAt === cur.createdAt && (r.id ?? 0) > (cur.id ?? 0))) best[r.lift] = r;
  }
  for (const l of LIFTS) out[l] = best[l]?.tmKg ?? null;
  return out;
}

export interface SessionRef {
  week: Week;
  day: Day;
}

/**
 * Number for the next cycle: one past every cycle seen in records or logs, so a program reset never
 * reuses a number that old session logs already carry.
 */
export function nextCycleIndex(cycles: readonly { index: number }[], sessions: readonly WorkoutSession[]): number {
  return Math.max(0, ...cycles.map((c) => c.index), ...sessions.map((s) => s.cycle)) + 1;
}

/** Next (week, day) to train in a cycle, or null when all 16 sessions are done or skipped. */
export function nextSessionRef(sessions: readonly WorkoutSession[], cycle: number): SessionRef | null {
  const closed = new Set(
    sessions.filter((s) => s.cycle === cycle && s.status !== 'in_progress').map((s) => `${s.week}-${s.day}`),
  );
  for (const week of [1, 2, 3, 4] as const) {
    for (const day of [1, 2, 3, 4] as const) if (!closed.has(`${week}-${day}`)) return { week, day };
  }
  return null;
}

/** The unfinished session to resume, if any (latest started). */
export function inProgress(sessions: readonly WorkoutSession[]): WorkoutSession | null {
  return sessions.filter((s) => s.status === 'in_progress').sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
}

export interface E1rmPoint {
  date: string;
  lift: LiftId;
  e1rmKg: number;
}

/** e1RM points from logged + sets and top sets of 10 reps or fewer (feeds PRs and Strength charts). */
export function e1rmPoints(sessions: readonly WorkoutSession[], liftOf: (exerciseId: string) => LiftId | null): E1rmPoint[] {
  const pts: E1rmPoint[] = [];
  for (const s of sessions) {
    if (s.status !== 'done') continue;
    for (const ex of s.exercises) {
      if (ex.slot !== 'main') continue;
      const lift = liftOf(ex.exerciseId);
      if (!lift) continue;
      let best = 0;
      for (const a of ex.actual) {
        const order = ex.prescription.find((p) => p.order === a.order);
        if (!order || !isKeySet(order.kind) || !a.done || a.kg === null || a.reps === null) continue;
        if (a.reps < 1 || a.reps > EPLEY_MAX_REPS) continue;
        best = Math.max(best, epley(a.kg, a.reps));
      }
      if (best > 0) pts.push({ date: s.date, lift, e1rmKg: Math.round(best * 10) / 10 });
    }
  }
  return pts.sort((a, b) => a.date.localeCompare(b.date));
}
