/**
 * Story 16 §3.6: strength on track (PB-8.1–8.3, 8.5). Pure, tested.
 *
 * - PB-8.1 e1RM = kg × (1 + (reps + RIR) ÷ 30), only sets with reps + RIR ≤ 12; dumbbells per hand (the
 *   app stores per hand). RIR = the ordered RIR, less any reps beyond the order; a set short of the order
 *   counts as near failure. Each session's e1RM = its best qualifying set.
 * - PB-8.2 each Big-4 lift's planned line comes from the cycle plan: the TM increase per 4-week cycle,
 *   spread week by week to the goal deadline; flat on a cut. One combined strength date: when all Big 4
 *   are projected (trend of the recent sessions, at least 3) to reach their targets.
 *   Progress against the plan is measured set by set: each session's point is the planned e1RM on its
 *   date × (achieved e1RM ÷ the e1RM its order asked for). A wave's light weeks, a deload or a new block's
 *   conservative RIR labels then sit on the line as planned instead of faking a stall; lifting lighter
 *   (or fewer reps) than ordered lands below it and moves the date.
 * - PB-8.3 last week and this week as weight × reps × sets.
 * - PB-8.5 lighter than planned: how far the combined date moves (or "barely").
 */
import type { CycleRecord, SessionExercise, WorkoutSession, YMD } from '../../db/types';
import { addDays, daysBetween, toYmd } from '../date';
import { e1rmEpley, PB_LOADS, PB_WAVE } from '../playbook/rules';
import { setRir } from '../playbook/loadContext';
import { MAIN_EXERCISE } from '../training/exercises';
import { LIFTS, tmIncrement, type LiftId, type Phase } from '../training/program';
import type { Prescribed } from '../training/session';

export interface E1rmSession {
  date: YMD;
  sessionId: string;
  e1rm: number;
}

const mainIds = (lift: LiftId): string[] => [MAIN_EXERCISE[lift].normal, MAIN_EXERCISE[lift].control];

/**
 * Best qualifying e1RM of one exercise in one session (work sets only), or null. `keyOnly`: the Big 4
 * count only their key sets (the + set or top set), so volume and deload days, whose ordered RIR is a
 * conservative label, don't drag the trend down.
 */
export function sessionE1rm(s: WorkoutSession, exerciseIds: readonly string[], keyOnly = false): number | null {
  let best = 0;
  for (const e of s.exercises) {
    if (!exerciseIds.includes(e.exerciseId) || e.skipped) continue;
    for (const a of e.actual) {
      const p = e.prescription.find((x) => x.order === a.order);
      if (!p || p.kind === 'warmup' || p.timed || !a.done || a.kg === null || a.reps === null || a.kg <= 0) continue;
      if (keyOnly && p.kind !== 'amrap' && p.kind !== 'top') continue;
      const v = e1rmEpley(a.kg, a.reps, setRir(p, a.reps));
      if (v !== null) best = Math.max(best, v);
    }
  }
  return best > 0 ? Math.round(best * 10) / 10 : null;
}

/** Per-session e1RMs for an exercise (or a Big-4 lift and its block-D variant), oldest first. */
export function e1rmSeries(sessions: readonly WorkoutSession[], exerciseIds: readonly string[], keyOnly = false): E1rmSession[] {
  return sessions
    .filter((s) => s.status === 'done')
    .map((s) => ({ date: s.date, sessionId: s.id, e1rm: sessionE1rm(s, exerciseIds, keyOnly) }))
    .filter((p): p is E1rmSession => p.e1rm !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
}

export const liftSeries = (sessions: readonly WorkoutSession[], lift: LiftId) => e1rmSeries(sessions, mainIds(lift), true);

export interface Trend {
  /** kg per day. */
  slope: number;
  /** The fitted e1RM on the last session's date. */
  current: number;
  lastDate: YMD;
  n: number;
}

/** Least-squares trend over the last `max` sessions (PB-8.2: several sessions, so one light day doesn't swing it). */
export function trend(points: readonly E1rmSession[], max: number = PB_LOADS.trendSessions): Trend | null {
  const pts = points.slice(-max);
  if (pts.length < 2) return null;
  const first = pts[0]!.date;
  const xs = pts.map((p) => daysBetween(first, p.date));
  const ys = pts.map((p) => p.e1rm);
  const n = pts.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slope = sxx > 0 ? xs.reduce((a, x, i) => a + (x - mx) * ((ys[i] ?? 0) - my), 0) / sxx : 0;
  const lastX = xs[n - 1] ?? 0;
  return { slope, current: my + slope * (lastX - mx), lastDate: pts[n - 1]!.date, n };
}

export interface PlannedLine {
  lift: LiftId;
  start: number;
  startDate: YMD;
  target: number;
  targetDate: YMD;
  /** kg of e1RM per week (0 on a cut). */
  perWeek: number;
}

/**
 * PB-8.2: the planned e1RM line for a Big-4 lift from the cycle plan: the cycle's TM ÷ 0.9 at its start,
 * plus the phase's TM increase per 4-week cycle (as e1RM), spread weekly to the deadline. Flat on a cut.
 */
export function plannedLine(lift: LiftId, cycle: Pick<CycleRecord, 'tms' | 'startedAt' | 'phase' | 'goal'>, startDate: YMD, fallbackDeadline: YMD): PlannedLine | null {
  const tm = cycle.tms[lift];
  if (!tm || tm <= 0) return null;
  const start = tm / PB_WAVE.tmShare;
  const perWeek = cycle.phase === 'lose' ? 0 : tmIncrement(lift, cycle.phase as Phase) / PB_WAVE.tmShare / PB_WAVE.weeks;
  const targetDate = cycle.goal.deadline ?? fallbackDeadline;
  const weeks = Math.max(0, daysBetween(startDate, targetDate) / 7);
  return { lift, start, startDate, target: start + perWeek * weeks, targetDate, perWeek };
}

/** The planned e1RM on a date (held at the target after the deadline). */
export function plannedAt(line: PlannedLine, date: YMD): number {
  const w = Math.min(Math.max(0, daysBetween(line.startDate, date) / 7), Math.max(0, daysBetween(line.startDate, line.targetDate) / 7));
  return line.start + line.perWeek * w;
}

export type StrengthStatus = 'ahead' | 'onTrack' | 'behind';

export function statusOf(now: number, planned: number): StrengthStatus {
  if (planned <= 0) return 'onTrack';
  const r = now / planned - 1;
  if (r >= PB_LOADS.onTrackBand) return 'ahead';
  if (r <= -PB_LOADS.onTrackBand) return 'behind';
  return 'onTrack';
}

export interface SetRatio {
  /** The achieved e1RM (PB-8.1), per hand for dumbbells. */
  actual: number;
  /** The e1RM the order asked for (its weight at target reps + ordered RIR). */
  ordered: number;
  ratio: number;
}

/**
 * How one exercise went against its order: the key set (+ set or top set) when it was done, else the done
 * work set whose order asked the most. Null when nothing qualifies.
 */
export function setRatio(e: SessionExercise): SetRatio | null {
  const done = e.actual
    .map((a) => ({ a, p: e.prescription.find((x) => x.order === a.order) }))
    .filter((x): x is { a: (typeof e.actual)[number]; p: Prescribed } => !!x.p && x.p.kind !== 'warmup' && !x.p.timed && x.a.done && x.a.kg !== null && x.a.kg > 0 && x.a.reps !== null && x.p.kg !== null && x.p.kg > 0);
  const scored = done
    .map(({ a, p }) => ({ key: p.kind === 'amrap' || p.kind === 'top', ordered: orderE1rm(p), actual: e1rmEpley(a.kg as number, a.reps as number, setRir(p, a.reps)) }))
    .filter((x): x is { key: boolean; ordered: number; actual: number } => x.ordered !== null && x.actual !== null);
  if (!scored.length) return null;
  const pick = scored.find((x) => x.key) ?? scored.reduce((m, x) => (x.ordered > m.ordered ? x : m));
  return { actual: pick.actual, ordered: pick.ordered, ratio: pick.actual / pick.ordered };
}

export interface PlanPoint extends E1rmSession {
  /** Achieved ÷ ordered e1RM of the session's key (or hardest) set. */
  ratio: number;
}

/** PB-8.2: a lift's sessions as points on (or off) its plan, oldest first. */
export function planSeries(sessions: readonly WorkoutSession[], lift: LiftId, cycles: readonly CycleLike[]): PlanPoint[] {
  const ids = mainIds(lift);
  const out: PlanPoint[] = [];
  for (const s of sessions) {
    if (s.status !== 'done') continue;
    const e = s.exercises.find((x) => ids.includes(x.exerciseId) && !x.skipped);
    const c = cycles.find((x) => x.index === s.cycle);
    if (!e || !c) continue;
    const r = setRatio(e);
    const line = linesFor(c)[lift];
    if (!r || !line) continue;
    out.push({ date: s.date, sessionId: s.id, ratio: r.ratio, e1rm: Math.round(plannedAt(line, s.date) * r.ratio * 10) / 10 });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
}

export interface LiftProjection {
  /** The average achieved ÷ ordered over the recent sessions (1 = exactly on plan). */
  ratio: number;
  n: number;
  /** Projected e1RM on `onDate` (the planned line × the ratio). */
  now: number;
  onDate: YMD;
}

/** PB-8.2: where a lift is heading: the planned line scaled by how the last several sessions went. */
export function projection(points: readonly PlanPoint[], line: PlannedLine, onDate: YMD): LiftProjection | null {
  const recent = points.slice(-PB_LOADS.trendSessions);
  if (recent.length < PB_LOADS.minSessionsForDate) return null;
  const ratio = recent.reduce((a, p) => a + p.ratio, 0) / recent.length;
  return { ratio, n: recent.length, now: plannedAt(line, onDate) * ratio, onDate };
}

export type StrengthDate =
  | { kind: 'date'; date: YMD; perLift: Record<LiftId, YMD | null> }
  | { kind: 'reached'; date: YMD }
  | { kind: 'notEnough'; missing: LiftId[] }
  | { kind: 'off'; lifts: LiftId[] };

type CycleLike = Pick<CycleRecord, 'index' | 'tms' | 'startedAt' | 'phase' | 'goal'>;

/**
 * PB-8.2: the date all Big 4 reach the current cycle's targets, each projected from its recent sessions
 * (at least 3): the planned line × his recent achieved-vs-ordered ratio, continued past the deadline at the
 * planned pace. On a cut (flat line) holding the ratio at or above the band means "on target"; under it
 * the date is off. `today` = the date the projection is made for.
 */
export function combinedStrengthDate(sessions: readonly WorkoutSession[], cycles: readonly CycleLike[], current: CycleLike, today?: YMD): StrengthDate {
  const lines = linesFor(current);
  const missing: LiftId[] = [];
  const off: LiftId[] = [];
  const perLift = {} as Record<LiftId, YMD | null>;
  let latest: YMD | null = null;
  let reachedAll = true;
  for (const lift of LIFTS) {
    const line = lines[lift];
    const pts = planSeries(sessions, lift, cycles);
    const last = pts[pts.length - 1];
    const on: YMD | undefined = today ?? last?.date ?? line?.startDate;
    const pr = line && on ? projection(pts, line, on) : null;
    if (!line || !pr || !on) {
      missing.push(lift);
      perLift[lift] = null;
      continue;
    }
    let d: YMD;
    if (line.perWeek <= 0) {
      // A cut holds strength: on target while the recent sessions hold the plan.
      if (pr.ratio >= 1 - PB_LOADS.onTrackBand) d = on;
      else {
        off.push(lift);
        perLift[lift] = null;
        reachedAll = false;
        continue;
      }
    } else {
      const weeks = (line.target / pr.ratio - line.start) / line.perWeek;
      d = addDays(line.startDate, Math.max(0, Math.ceil(weeks * 7 - 1e-6)));
      if (d > on) reachedAll = false;
      if (d < on) d = on;
    }
    perLift[lift] = d;
    if (!latest || d > latest) latest = d;
  }
  if (missing.length) return { kind: 'notEnough', missing };
  if (off.length) return { kind: 'off', lifts: off };
  if (reachedAll && latest) return { kind: 'reached', date: latest };
  return { kind: 'date', date: latest as YMD, perLift };
}

/* ---------------- PB-8.3: weight × reps × sets ---------------- */

export interface WeekLine {
  kg: number | null;
  reps: number;
  sets: number;
}

/** The top working weight of a set list, its reps (the most common at that weight) and how many sets used it. */
function topLine(sets: readonly { kg: number | null; reps: number | null }[]): WeekLine | null {
  const work = sets.filter((s) => s.reps !== null && s.reps > 0);
  if (!work.length) return null;
  const top = Math.max(...work.map((s) => s.kg ?? 0));
  const at = work.filter((s) => (s.kg ?? 0) === top);
  const counts = new Map<number, number>();
  for (const s of at) counts.set(s.reps ?? 0, (counts.get(s.reps ?? 0) ?? 0) + 1);
  const reps = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
  return { kg: top > 0 ? top : null, reps, sets: at.length };
}

/** Last time: the latest finished session (before `beforeDate`) where this exercise was logged. */
export function lastWeekLine(sessions: readonly WorkoutSession[], exerciseId: string, beforeDate: YMD, excludeId?: string): WeekLine | null {
  const done = sessions
    .filter((s) => s.status === 'done' && s.date <= beforeDate && s.id !== excludeId)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  for (const s of done) {
    const e = s.exercises.find((x) => x.exerciseId === exerciseId && !x.skipped);
    if (!e) continue;
    const sets = e.actual.filter((a) => a.done && e.prescription.find((p) => p.order === a.order)?.kind !== 'warmup');
    const line = topLine(sets);
    if (line) return line;
  }
  return null;
}

/** This week: today's orders as weight × target reps × sets at the top working weight. */
export function thisWeekLine(prescription: readonly Prescribed[]): WeekLine | null {
  const work = prescription.filter((p) => p.kind !== 'warmup' && !p.timed);
  return topLine(work.map((p) => ({ kg: p.kg, reps: p.targetReps ?? p.repMin })));
}

/** The e1RM an order asks for (its weight at target reps + ordered RIR), or null. */
export function orderE1rm(p: Pick<Prescribed, 'kg' | 'targetReps' | 'repMin' | 'rir'>): number | null {
  if (p.kg === null || p.kg <= 0) return null;
  return e1rmEpley(p.kg, p.targetReps ?? p.repMin, p.rir);
}

/* ---------------- PB-8.5: lighter than planned ---------------- */

/** Did he lift lighter than ordered today (a done work set under its order's weight, or short of its reps)? */
export function lighterThanPlanned(s: WorkoutSession): boolean {
  return s.exercises.some((e) =>
    e.actual.some((a) => {
      const p = e.prescription.find((x) => x.order === a.order);
      if (!p || p.kind === 'warmup' || !a.done || p.kg === null || a.kg === null) return false;
      return a.kg < p.kg - 1e-6 || (a.reps !== null && a.reps < (p.targetReps ?? p.repMin));
    }),
  );
}

export type DateShift = { kind: 'moved'; days: number; from: YMD; to: YMD } | { kind: 'barely'; to: YMD } | { kind: 'off'; from: YMD } | { kind: 'unknown' };

/** PB-8.5: the combined date with and without today's session; "barely" under PB_LOADS.barelyDays. */
export function strengthDateShift(sessions: readonly WorkoutSession[], today: WorkoutSession, cycles: readonly CycleLike[], current: CycleLike): DateShift {
  const others = sessions.filter((s) => s.id !== today.id);
  const before = combinedStrengthDate(others, cycles, current, today.date);
  const after = combinedStrengthDate([...others, today], cycles, current, today.date);
  if (before.kind === 'date' && after.kind === 'off') return { kind: 'off', from: before.date };
  if (after.kind !== 'date' || before.kind !== 'date') return { kind: 'unknown' };
  const days = daysBetween(before.date, after.date);
  if (Math.abs(days) < PB_LOADS.barelyDays) return { kind: 'barely', to: after.date };
  return { kind: 'moved', days, from: before.date, to: after.date };
}

/** The four planned lines for a cycle (start = the cycle's start; no deadline → the cycle's 4 weeks). */
export function linesFor(cycle: Pick<CycleRecord, 'tms' | 'startedAt' | 'phase' | 'goal'>): Record<LiftId, PlannedLine | null> {
  const start = toYmd(new Date(cycle.startedAt));
  const end = addDays(start, PB_WAVE.weeks * 7);
  return Object.fromEntries(LIFTS.map((l) => [l, plannedLine(l, cycle, start, end)])) as Record<LiftId, PlannedLine | null>;
}
