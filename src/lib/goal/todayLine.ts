/**
 * Story 17 (N-2, N-3, D-040): "where should I be TODAY?" Pure, tested.
 *
 * For each of weight, body fat and the Big 4, the expected value for today, what he actually has, and a
 * status, plus the series the two Home charts draw. Numbers only from real entries; nothing is guessed.
 *
 * - Weight: straight line from the goal's start weight on its start date to the target on the goal date
 *   (clamped to the window). Actual = the 7-day average (PB-6.1), never one weigh-in.
 * - Body fat: the same straight line from the start BF to the goal's BF line (owner's choice), shown in
 *   whole points because home readings carry a few points of error; the status band absorbs that.
 * - Big 4: the Story 16 planned e1RM line (PB-8.2) as WEEKLY steps (the %TM wave moves the plan per
 *   week). His points are Story 16's: each session's planned e1RM × (achieved ÷ ordered e1RM, PB-8.1),
 *   so a light wave week or a deload sits on the line as planned, and the numbers match the combined
 *   strength date. Status uses the same band as the exercise card (PB_LOADS.onTrackBand).
 */
import type { CycleRecord, WeightEntry, WorkoutSession, YMD } from '../../db/types';
import { addDays, daysBetween, toYmd } from '../date';
import { PB_LOADS, PB_TODAY_LINE } from '../playbook/rules';
import { combinedStrengthDate, linesFor, planSeries, type PlannedLine } from '../strength/e1rm';
import { startingWeight } from '../training/cycleGoal';
import { LIFTS, type LiftId, type Phase } from '../training/program';

export type LineStatus = 'onTrack' | 'ahead' | 'aheadFast' | 'behind' | 'above' | 'holding' | 'dropping' | 'weighBf' | 'noData';

export interface GoalSpan {
  start: YMD;
  end: YMD;
  startKg: number;
  endKg: number;
  startBf: number | null;
  bfLine: number | null;
  phase: Phase;
}

type CycleLike = Pick<CycleRecord, 'index' | 'startedAt' | 'phase' | 'goal' | 'tms'>;

/**
 * The goal's window. Update goals (Story 15) re-sets the goal inside a running cycle with its own weeks
 * and deadline, so the start is the deadline minus those weeks (never before the cycle started); older
 * goals start with the cycle and last 4 weeks.
 */
export function goalSpan(cycle: CycleLike): GoalSpan {
  const cycleStart = toYmd(new Date(cycle.startedAt));
  const g = cycle.goal;
  const end = g.deadline ?? addDays(cycleStart, 28);
  let start = cycleStart;
  if (g.deadline && g.weeks && g.weeks > 0) {
    const s = addDays(g.deadline, -Math.round(g.weeks * 7));
    if (s > start) start = s;
  }
  return { start, end: end > start ? end : addDays(start, 1), startKg: g.startWeightKg, endKg: g.endWeightKg, startBf: g.startBfPct, bfLine: g.bfLinePct, phase: cycle.phase };
}

/** Straight line from (start, a) to (end, b), clamped to the window. */
export function linearAt(start: YMD, end: YMD, a: number, b: number, date: YMD): number {
  const total = daysBetween(start, end);
  if (total <= 0) return b;
  const t = Math.min(1, Math.max(0, daysBetween(start, date) / total));
  return a + (b - a) * t;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r25 = (n: number) => Math.round(n / 2.5) * 2.5;

export interface WeightRow {
  expected: number;
  actual: number | null;
  /** 'average' = 7-day average; 'latest' = the latest weigh-in within 14 days; 'profile' = his stored weight. */
  source: 'average' | 'latest' | 'profile' | null;
  status: LineStatus;
}

export function weightRow(span: GoalSpan, weights: readonly WeightEntry[], today: YMD, profileKg: number | null): WeightRow {
  const expected = r1(linearAt(span.start, span.end, span.startKg, span.endKg, today));
  const now = startingWeight(weights, today, profileKg);
  if (!now) return { expected, actual: null, source: null, status: 'noData' };
  const actual = r1(now.kg);
  const diff = actual - expected;
  const band = PB_TODAY_LINE.weightKg;
  let status: LineStatus = 'onTrack';
  if (Math.abs(diff) > band) {
    const up = span.endKg >= span.startKg;
    if (span.phase === 'maintain') status = diff > 0 ? 'above' : 'behind';
    else if ((diff > 0) === up) status = span.phase === 'gain' ? 'aheadFast' : 'ahead';
    else status = 'behind';
  }
  return { expected, actual, source: now.source, status };
}

export interface BfRow {
  /** Whole points; null when the goal has no BF line. */
  expected: number | null;
  actual: number | null;
  date: YMD | null;
  stale: boolean;
  status: LineStatus;
}

export function bfRow(span: GoalSpan, bf: { pct: number | null; date: YMD | null }, today: YMD): BfRow {
  const line = span.bfLine;
  const start = span.startBf ?? line;
  const expected = line !== null && start !== null ? Math.round(linearAt(span.start, span.end, start, line, today)) : null;
  const actual = bf.pct;
  if (actual === null) return { expected, actual: null, date: null, stale: false, status: 'noData' };
  const stale = bf.date === null || daysBetween(bf.date, today) > PB_TODAY_LINE.bfStaleDays;
  if (expected === null || line === null || start === null) return { expected, actual, date: bf.date, stale, status: stale ? 'weighBf' : 'noData' };
  if (stale) return { expected, actual, date: bf.date, stale, status: 'weighBf' };
  const diff = actual - linearAt(span.start, span.end, start, line, today);
  let status: LineStatus = 'onTrack';
  if (Math.abs(diff) > PB_TODAY_LINE.bfPts) {
    // On a bulk the line is a ceiling: above it is the only flag; under it is fine, never praised.
    if (span.phase === 'gain') status = diff > 0 ? 'above' : 'onTrack';
    else status = diff > 0 ? 'behind' : 'ahead';
  }
  return { expected, actual, date: bf.date, stale, status };
}

/** The planned e1RM at `date` as weekly steps (the wave moves the plan once a week). */
export function steppedPlanAt(line: PlannedLine, date: YMD): number {
  const weeks = Math.floor(Math.max(0, daysBetween(line.startDate, date)) / 7);
  const cap = Math.floor(Math.max(0, daysBetween(line.startDate, line.targetDate)) / 7);
  return line.start + line.perWeek * Math.min(weeks, cap);
}

export interface LiftRow {
  lift: LiftId;
  expected: number | null;
  actual: number | null;
  actualDate: YMD | null;
  status: LineStatus;
  /** The plan as steps: [date, e1RM] at each week boundary across the window. */
  plan: [YMD, number][];
  /** Each session's best qualifying e1RM in the window. */
  points: [YMD, number][];
}

export function liftRows(cycle: CycleLike, cycles: readonly CycleLike[], sessions: readonly WorkoutSession[], today: YMD, from: YMD, to: YMD): LiftRow[] {
  const lines = linesFor(cycle);
  return LIFTS.map((lift) => {
    const line = lines[lift];
    const series = planSeries(sessions, lift, cycles).filter((p) => p.date <= today);
    const last = series[series.length - 1] ?? null;
    const points = series.filter((p) => p.date >= from && p.date <= to).map((p) => [p.date, p.e1rm] as [YMD, number]);
    if (!line) return { lift, expected: null, actual: last?.e1rm ?? null, actualDate: last?.date ?? null, status: 'noData', plan: [], points };
    const plan: [YMD, number][] = [];
    for (let d = line.startDate; d <= to; d = addDays(d, 7)) if (addDays(d, 7) > from) plan.push([d < from ? from : d, steppedPlanAt(line, d)]);
    plan.push([to, steppedPlanAt(line, to)]);
    const expected = r25(steppedPlanAt(line, today));
    if (!last) return { lift, expected, actual: null, actualDate: null, status: 'noData', plan, points };
    const planned = steppedPlanAt(line, today);
    const r = planned > 0 ? last.e1rm / planned - 1 : 0;
    const band = PB_LOADS.onTrackBand;
    let status: LineStatus;
    if (line.perWeek <= 0) status = r <= -band ? 'dropping' : 'holding';
    else status = r >= band ? 'ahead' : r <= -band ? 'behind' : 'onTrack';
    return { lift, expected, actual: r25(last.e1rm), actualDate: last.date, status, plan, points };
  });
}

export interface WeightSeries {
  dots: [YMD, number][];
  /** 7-day average on each weigh-in day (needs 2+ weigh-ins in the 7 days). */
  avg: [YMD, number][];
}

export function weightSeries(weights: readonly WeightEntry[], from: YMD, to: YMD): WeightSeries {
  const inWin = [...weights].filter((w) => w.date >= addDays(from, -6) && w.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  const dots = inWin.filter((w) => w.date >= from).map((w) => [w.date, w.weightKg] as [YMD, number]);
  const avg: [YMD, number][] = [];
  for (const [d] of dots) {
    const wk = inWin.filter((w) => w.date > addDays(d, -7) && w.date <= d);
    if (wk.length >= 2) avg.push([d, r1(wk.reduce((s, w) => s + w.weightKg, 0) / wk.length)]);
  }
  return { dots, avg };
}

/** The chart window: the whole goal, or the last 4 weeks (still inside the goal, with today at the right edge). */
export function chartWindow(span: GoalSpan, today: YMD, mode: 'goal' | '4wk'): { from: YMD; to: YMD } {
  if (mode === 'goal') return { from: span.start, to: span.end };
  const to = today < span.end ? today : span.end;
  const from = addDays(to, -28);
  return { from: from < span.start ? span.start : from, to: to > from ? to : addDays(from, 1) };
}

/** The combined strength date for the card (Story 16), or null. */
export function strengthDateFor(cycle: CycleLike, cycles: readonly CycleLike[], sessions: readonly WorkoutSession[], today: YMD): YMD | null {
  const r = combinedStrengthDate(sessions, cycles, cycle, today);
  return r.kind === 'date' || r.kind === 'reached' ? r.date : null;
}
