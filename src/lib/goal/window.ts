/**
 * Story 11 §5.1: what happened over a goal's window, from the owner's own logs. Pure, tested.
 * Philip (Gemini) reads this; the engine uses it for the calorie range.
 *
 * Measured maintenance = average intake on logged days − the energy in the weight change
 * (7,700 kcal per kg, the same constant as lib/targets.ts). It is only trusted with at least half the
 * days logged and 10+ days in the window; it assumes logged days are typical, which is why the
 * calorie range still keeps the formula in it.
 */
import type { WorkoutSession, YMD } from '../../db/types';
import { addDays, daysBetween } from '../date';
import { KCAL_PER_KG } from '../targets';
import { DAY_LIFT, epley, EPLEY_MAX_REPS, isKeySet, LIFTS, type LiftId } from '../training/program';
import { rollingWeight, type WeighIn } from '../training/cycleGoal';

export const WINDOW_RULES = { minCoverage: 0.5, minDays: 10 } as const;

export interface FoodDay {
  date: YMD;
  calories: number;
  proteinG: number;
}

export interface WindowInput {
  start: YMD;
  today: YMD;
  startKg: number;
  weights: readonly WeighIn[];
  food: readonly FoodDay[];
  /** Calorie / protein target in force on a date, or null. */
  targetOn: (date: YMD) => { calories: number; proteinG: number } | null;
  sessions: readonly WorkoutSession[];
  cycle: number;
}

export interface LiftTrend {
  lift: LiftId;
  first: number;
  last: number;
}

export interface GoalWindow {
  days: number;
  foodDays: number;
  coverage: number;
  avgKcal: number | null;
  avgProteinG: number | null;
  avgTargetKcal: number | null;
  avgTargetProteinG: number | null;
  startKg: number;
  nowKg: number | null;
  kgPerWeek: number | null;
  /** Null when the intake log can't be trusted (see file comment). */
  maintenanceKcal: number | null;
  reliable: boolean;
  sessionsDone: number;
  sessionsSkipped: number;
  /** About 4 a week over the window. */
  sessionsPlanned: number;
  lifts: LiftTrend[];
}

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function goalWindow(i: WindowInput): GoalWindow {
  const days = Math.max(1, daysBetween(i.start, i.today) + 1);
  const inWin = (d: YMD) => d >= i.start && d <= i.today;
  const byDay = new Map<YMD, FoodDay>();
  for (const f of i.food) {
    if (!inWin(f.date)) continue;
    const d = byDay.get(f.date) ?? { date: f.date, calories: 0, proteinG: 0 };
    d.calories += f.calories;
    d.proteinG += f.proteinG;
    byDay.set(f.date, d);
  }
  // A day with under 300 kcal logged is a forgotten day, not a fast.
  const logged = [...byDay.values()].filter((d) => d.calories >= 300);
  const targets = logged.map((d) => i.targetOn(d.date)).filter((x): x is { calories: number; proteinG: number } => x !== null);
  const nowKg = rollingWeight(i.weights, i.today) ?? latest(i.weights, i.today);
  const kgPerWeek = nowKg !== null && days >= 7 ? ((nowKg - i.startKg) / days) * 7 : null;
  const avgKcal = avg(logged.map((d) => d.calories));
  const coverage = logged.length / days;
  const reliable = coverage >= WINDOW_RULES.minCoverage && days >= WINDOW_RULES.minDays && avgKcal !== null && nowKg !== null;
  const maintenanceKcal = reliable && avgKcal !== null && nowKg !== null ? Math.round((avgKcal - ((nowKg - i.startKg) * KCAL_PER_KG) / days) / 10) * 10 : null;
  const mine = i.sessions.filter((s) => s.cycle === i.cycle);
  return {
    days,
    foodDays: logged.length,
    coverage: Math.round(coverage * 100) / 100,
    avgKcal: avgKcal === null ? null : Math.round(avgKcal),
    avgProteinG: avg(logged.map((d) => d.proteinG)) === null ? null : Math.round(avg(logged.map((d) => d.proteinG)) ?? 0),
    avgTargetKcal: avg(targets.map((x) => x.calories)) === null ? null : Math.round(avg(targets.map((x) => x.calories)) ?? 0),
    avgTargetProteinG: avg(targets.map((x) => x.proteinG)) === null ? null : Math.round(avg(targets.map((x) => x.proteinG)) ?? 0),
    startKg: i.startKg,
    nowKg: nowKg === null ? null : Math.round(nowKg * 10) / 10,
    kgPerWeek: kgPerWeek === null ? null : Math.round(kgPerWeek * 100) / 100,
    maintenanceKcal,
    reliable,
    sessionsDone: mine.filter((s) => s.status === 'done').length,
    sessionsSkipped: mine.filter((s) => s.status === 'skipped').length,
    sessionsPlanned: Math.min(16, Math.round((days / 7) * 4)),
    lifts: liftTrends(mine),
  };
}

function latest(ws: readonly WeighIn[], today: YMD): number | null {
  const from = addDays(today, -13);
  const recent = ws.filter((w) => w.date >= from && w.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  return recent.at(-1)?.weightKg ?? null;
}

/** First and last e1RM of each main lift in the window (key sets, 10 reps or fewer). */
function liftTrends(sessions: readonly WorkoutSession[]): LiftTrend[] {
  const pts: Record<LiftId, number[]> = { squat: [], bench: [], rdl: [], ohp: [] };
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    if (s.status !== 'done') continue;
    const main = s.exercises.find((e) => e.slot === 'main');
    if (!main) continue;
    let best = 0;
    for (const a of main.actual) {
      const p = main.prescription.find((x) => x.order === a.order);
      if (!p || !isKeySet(p.kind) || !a.done || a.kg === null || a.reps === null || a.reps < 1 || a.reps > EPLEY_MAX_REPS) continue;
      best = Math.max(best, epley(a.kg, a.reps));
    }
    if (best > 0) pts[DAY_LIFT[s.day]].push(Math.round(best * 10) / 10);
  }
  return LIFTS.filter((l) => pts[l].length > 0).map((l) => ({ lift: l, first: pts[l][0] ?? 0, last: pts[l].at(-1) ?? 0 }));
}

/** The window as plain lines for Philip's prompt. */
export function windowText(w: GoalWindow): string {
  const lines = [
    `Window: ${w.days} days. Weight ${w.startKg} kg -> ${w.nowKg ?? 'unknown'} kg${w.kgPerWeek !== null ? ` (${w.kgPerWeek > 0 ? '+' : ''}${w.kgPerWeek} kg/week)` : ''}.`,
    `Food: ${w.foodDays}/${w.days} days logged (${Math.round(w.coverage * 100)}%). Average ${w.avgKcal ?? '-'} kcal and ${w.avgProteinG ?? '-'} g protein a logged day vs target ${w.avgTargetKcal ?? '-'} kcal and ${w.avgTargetProteinG ?? '-'} g.`,
    w.maintenanceKcal !== null
      ? `Measured maintenance from intake vs weight change: about ${w.maintenanceKcal} kcal/day.`
      : 'Measured maintenance: not reliable (too few days logged); say so and lean on the formula.',
    `Workouts: ${w.sessionsDone} done, ${w.sessionsSkipped} skipped, about ${w.sessionsPlanned} planned in the window.`,
    ...w.lifts.map((l) => `${l.lift}: e1RM ${l.first} -> ${l.last} kg.`),
  ];
  return lines.join('\n');
}
