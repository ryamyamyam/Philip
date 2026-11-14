/**
 * Where the owner is in the program, from stored records (T-012). Pure.
 * Days are a sequence, not weekdays: "today" is the next day of the current cycle that isn't done
 * or skipped. Missing a calendar day never skips or resets anything.
 */
import type { IsoWeekday, TmRecord, WorkoutSession, YMD } from '../../db/types';
import { daysBetween, startOfWeek, toYmd } from '../date';
import { planDates } from './schedule';
import {
  cycleOutcome,
  DAY_LIFT,
  epley,
  EPLEY_MAX_REPS,
  isKeySet,
  LIFTS,
  type CycleOutcome,
  type Day,
  type LiftId,
  type LoggedMainSet,
  type Week,
  TM_SHARE,
} from './program';

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

/* ---------------- Strength chart dots (OBS-1F8106) ---------------- */

export interface PrPoint {
  date: YMD;
  lift: LiftId;
  oneRmKg: number;
}

/**
 * Red dots: the 1RMs the owner entered — at setup, a first-session calibration or Settings › Re-test.
 * Only the TM is stored (90% of the 1RM, rounded to 0.5 kg), so the 1RM is TM ÷ 0.9 (within ~0.3 kg).
 */
export function enteredPrPoints(records: readonly TmRecord[]): PrPoint[] {
  return records
    .filter((r) => r.reason === 'setup' || r.reason === 'retest')
    .map((r) => ({ date: toYmd(new Date(r.createdAt)), lift: r.lift, oneRmKg: Math.round((r.tmKg / TM_SHARE) * 10) / 10 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface WeeklyE1rm extends E1rmPoint {
  /** Monday of the week. */
  week: YMD;
}

/**
 * Blue dots: per lift, the best estimated 1RM of each Monday–Sunday week from the main-lift sets logged
 * that week (e1rmPoints: Epley, kg × (1 + reps ÷ 30), top and + sets of 10 reps or fewer). Dated at the
 * session that set it.
 */
export function weeklyE1rm(points: readonly E1rmPoint[]): WeeklyE1rm[] {
  const best = new Map<string, WeeklyE1rm>();
  for (const p of points) {
    const week = startOfWeek(p.date);
    const key = `${p.lift}|${week}`;
    const cur = best.get(key);
    if (!cur || p.e1rmKg > cur.e1rmKg) best.set(key, { ...p, week });
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** x position (0–1) of a date between the first and last date shown; a single date sits in the middle. */
export function datePosition(date: YMD, first: YMD, last: YMD): number {
  const span = daysBetween(first, last);
  return span <= 0 ? 0.5 : daysBetween(first, date) / span;
}

/* ---------------- Home card (T-011) ---------------- */

export type WorkoutCardState =
  | { kind: 'setup' }
  | { kind: 'briefing'; cycle: number }
  | { kind: 'resume'; session: WorkoutSession }
  /** Story 6 §2: today's workout is done; nothing else starts today. */
  | { kind: 'doneToday'; session: WorkoutSession; next: SessionRef | null; nextDate: YMD | null; cycleDone: boolean }
  | { kind: 'next'; cycle: number; week: Week; day: Day }
  | { kind: 'cycleDone'; cycle: number };

/**
 * What the Workout card on Home (and the calendar's today box) shows, from stored records.
 * Order: setup → briefing → resume → doneToday → cycleDone → next. One workout a day: a `done`
 * session dated today (sessions keep their start date) blocks starting another; a skipped one doesn't.
 */
export function workoutCardState(
  program: { currentCycle: number; trainingDays?: readonly IsoWeekday[] } | null,
  sessions: readonly WorkoutSession[],
  today: YMD,
): WorkoutCardState {
  if (!program) return { kind: 'setup' };
  if (program.currentCycle < 1) return { kind: 'briefing', cycle: 1 };
  const open = inProgress(sessions);
  if (open) return { kind: 'resume', session: open };
  const next = nextSessionRef(sessions, program.currentCycle);
  const doneToday = sessions
    .filter((s) => s.date === today && s.status === 'done')
    .sort((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt))[0];
  if (doneToday) {
    const planned = planDates({ today, trainingDays: program.trainingDays, sessions, cycle: program.currentCycle });
    return { kind: 'doneToday', session: doneToday, next, nextDate: planned[0]?.date ?? null, cycleDone: next === null };
  }
  if (!next) return { kind: 'cycleDone', cycle: program.currentCycle };
  return { kind: 'next', cycle: program.currentCycle, week: next.week, day: next.day };
}

/* ---------------- Cycle results (TM progression at the next cycle) ---------------- */

/** Each lift's outcome in a cycle, from the main-lift sets of its sessions (§4.5). */
export function cycleOutcomes(sessions: readonly WorkoutSession[], cycle: number): Record<LiftId, CycleOutcome> {
  const sets: Record<LiftId, LoggedMainSet[]> = { squat: [], bench: [], rdl: [], ohp: [] };
  for (const s of sessions) {
    if (s.cycle !== cycle || s.status !== 'done') continue;
    for (const ex of s.exercises) {
      if (ex.slot !== 'main') continue;
      const lift = DAY_LIFT[s.day];
      for (const a of ex.actual) {
        const p = ex.prescription.find((x) => x.order === a.order);
        if (!p || p.kind === 'accessory') continue;
        sets[lift].push({ kind: p.kind, targetReps: p.repMin, actualReps: a.reps, done: a.done, pain: a.pain });
      }
    }
  }
  return {
    squat: cycleOutcome(sets.squat),
    bench: cycleOutcome(sets.bench),
    rdl: cycleOutcome(sets.rdl),
    ohp: cycleOutcome(sets.ohp),
  };
}
