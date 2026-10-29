import type { FoodEntry, Macros, TargetPlan, YMD } from '../db/types';
import { adherenceScore, type AdherenceResult } from './adherence';
import { addDays, dateRange } from './date';
import { sumMacros, targetForDate, ZERO } from './nutrition';

export interface DaySummary {
  date: YMD;
  logged: boolean;
  entryCount: number;
  totals: Macros;
  target: Macros | null;
  adherence: AdherenceResult;
}

/** Daily summaries computed from individual entries (never stored). Uses the plan active on each date. */
export function summarizeDays(entries: readonly FoodEntry[], plans: readonly TargetPlan[], start: YMD, end: YMD): DaySummary[] {
  const byDate = new Map<YMD, FoodEntry[]>();
  for (const e of entries) {
    if (e.date < start || e.date > end) continue;
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }
  return dateRange(start, end).map((date) => {
    const list = byDate.get(date) ?? [];
    const totals = list.length ? sumMacros(list) : ZERO;
    const target = targetForDate(plans, date);
    return {
      date,
      logged: list.length > 0,
      entryCount: list.length,
      totals,
      target,
      adherence: list.length ? adherenceScore(totals, target) : { status: 'incomplete' },
    };
  });
}

export interface Averages {
  days: number;
  loggedDays: number;
  avg: Macros | null;
  /** Average target over the same logged days (only days that had a target). */
  avgTarget: Macros | null;
  avgAdherence: number | null;
}

const mean = (xs: Macros[]): Macros | null =>
  xs.length
    ? {
        calories: xs.reduce((a, b) => a + b.calories, 0) / xs.length,
        proteinG: xs.reduce((a, b) => a + b.proteinG, 0) / xs.length,
        fatG: xs.reduce((a, b) => a + b.fatG, 0) / xs.length,
        carbsG: xs.reduce((a, b) => a + b.carbsG, 0) / xs.length,
      }
    : null;

/** Averages over logged days only, so unlogged days don't drag numbers toward zero. */
export function averages(days: readonly DaySummary[]): Averages {
  const logged = days.filter((d) => d.logged);
  const scored = logged.flatMap((d) => (d.adherence.status === 'scored' ? [d.adherence.score] : []));
  return {
    days: days.length,
    loggedDays: logged.length,
    avg: mean(logged.map((d) => d.totals)),
    avgTarget: mean(logged.flatMap((d) => (d.target ? [d.target] : []))),
    avgAdherence: scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null,
  };
}

export const MIN_DAYS_FOR_TRENDS = 7;

export interface WeekSummary {
  start: YMD;
  days: DaySummary[];
  planned: Macros | null;
  actual: Macros;
  loggedDays: number;
  dailyAvg: Macros | null;
  avgAdherence: number | null;
}

/** Weekly plan vs actual. Planned = sum of each day's target; actual = sum of logged intake. */
export function summarizeWeek(entries: readonly FoodEntry[], plans: readonly TargetPlan[], weekStart: YMD): WeekSummary {
  const days = summarizeDays(entries, plans, weekStart, addDays(weekStart, 6));
  const withTargets = days.filter((d) => d.target);
  const planned =
    withTargets.length === 7
      ? withTargets.reduce<Macros>(
          (a, d) => ({
            calories: a.calories + d.target!.calories,
            proteinG: a.proteinG + d.target!.proteinG,
            fatG: a.fatG + d.target!.fatG,
            carbsG: a.carbsG + d.target!.carbsG,
          }),
          ZERO,
        )
      : null;
  const avg = averages(days);
  return {
    start: weekStart,
    days,
    planned,
    actual: sumMacros(days.map((d) => d.totals)),
    loggedDays: avg.loggedDays,
    dailyAvg: avg.avg,
    avgAdherence: avg.avgAdherence,
  };
}
