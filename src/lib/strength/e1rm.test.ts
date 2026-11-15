/** Story 16 §3.6 (AC 10, AC 12 unit): e1RM math, the planned line, the combined strength date. */
import { describe, expect, it } from 'vitest';
import type { CycleRecord, WorkoutSession } from '../../db/types';
import { addDays } from '../date';
import { e1rmEpley } from '../playbook/rules';
import { buildSession } from '../training/session';
import { createSession } from '../training/sessionLog';
import {
  combinedStrengthDate,
  lastWeekLine,
  lighterThanPlanned,
  linesFor,
  liftSeries,
  plannedAt,
  sessionE1rm,
  statusOf,
  strengthDateShift,
  thisWeekLine,
  trend,
} from './e1rm';
void addDays;

const TMS = { squat: 135, bench: 90, rdl: 103.5, ohp: 45 };
const START = '2026-11-02';
const cycle = (phase: CycleRecord['phase'], deadline?: string): CycleRecord => ({
  index: 1,
  block: 'A',
  startedAt: new Date(2026, 10, 2).getTime(),
  phase,
  tms: TMS,
  goal: { startWeightKg: 73, startBfPct: 15, endWeightKg: 75, weeklyRatePct: 0.3, bfLinePct: 16, source: 'philip', targetPlanId: null, ...(deadline ? { deadline } : {}) },
});

/** A finished session of `day` where every work set is done as ordered, the main lift's loads × `scale`. */
function done(id: string, date: string, day: 1 | 2 | 3 | 4, scale = 1, week: 1 | 2 | 3 = 1): WorkoutSession {
  const s = createSession(buildSession({ cycle: 1, week, day, phase: 'gain', tms: TMS, weightUnit: 'kg', bodyWeightKg: 73 }), id, date, 1000);
  return {
    ...s,
    status: 'done',
    finishedAt: 2000,
    exercises: s.exercises.map((e) => ({
      ...e,
      actual: e.actual.map((a) => {
        const p = e.prescription.find((x) => x.order === a.order)!;
        const kg = p.kg === null ? null : e.slot === 'main' ? p.kg * scale : p.kg;
        return { ...a, kg, reps: p.targetReps ?? p.repMin, done: true };
      }),
    })),
  };
}

describe('PB-8.1 e1RM', () => {
  it('Epley with RIR; sets over reps + RIR 12 don’t count; dumbbells per hand', () => {
    expect(e1rmEpley(100, 5, 2)).toBeCloseTo(100 * (1 + 7 / 30));
    expect(e1rmEpley(100, 10, 3)).toBeNull();
    expect(e1rmEpley(100, 12, 0)).toBeCloseTo(140);
    // A dumbbell order is stored per hand, so its e1RM is per hand too.
    const s = done('d', '2026-11-03', 2);
    const db = s.exercises.find((e) => e.exerciseId === 'incline-db-press')!;
    const p = db.prescription[0]!;
    expect(sessionE1rm(s, ['incline-db-press'])).toBeCloseTo(p.kg! * (1 + ((p.targetReps ?? p.repMin) + p.rir) / 30), 0);
  });
  it('per-session best, oldest first; the trend needs several sessions', () => {
    const series = liftSeries([done('a', '2026-11-03', 1), done('b', '2026-11-10', 1, 1.02), done('c', '2026-11-17', 1, 1.04)], 'squat');
    expect(series.map((p) => p.sessionId)).toEqual(['a', 'b', 'c']);
    expect(trend(series.slice(0, 1))).toBeNull();
    expect(trend(series)!.slope).toBeGreaterThan(0);
  });
});

describe('PB-8.2 planned line and the combined strength date', () => {
  it('the line comes from the cycle plan: TM increase spread weekly to the deadline; flat on a cut', () => {
    const bulk = linesFor(cycle('gain', '2026-12-28')).squat!;
    expect(bulk.start).toBeCloseTo(150);
    // squat TM +5 kg per 4-week cycle on a bulk → +5 ÷ 0.9 ÷ 4 kg of e1RM a week; 8 weeks to the deadline.
    expect(bulk.perWeek).toBeCloseTo(5 / 0.9 / 4);
    expect(bulk.target).toBeCloseTo(150 + (5 / 0.9 / 4) * 8, 1);
    expect(plannedAt(bulk, addDays(START, 14))).toBeCloseTo(150 + (5 / 0.9 / 4) * 2);
    const cut = linesFor(cycle('lose', '2026-12-28')).squat!;
    expect(cut.perWeek).toBe(0);
    expect(cut.target).toBeCloseTo(150);
  });
  it('needs ≥ 3 sessions per Big-4 lift; on plan → the deadline; ahead → earlier; behind → later', () => {
    const c = cycle('gain', '2026-12-28');
    const sessionsAt = (scale: number) => [1, 2, 3, 4].flatMap((d) => [done(`${d}a`, '2026-11-03', d as 1, scale), done(`${d}b`, '2026-11-10', d as 1, scale, 2), done(`${d}c`, '2026-11-17', d as 1, scale, 3)]);
    const two = [1, 2, 3, 4].flatMap((d) => [done(`${d}a`, '2026-11-03', d as 1), done(`${d}b`, '2026-11-10', d as 1, 1, 2)]);
    expect(combinedStrengthDate(two, [c], c)).toMatchObject({ kind: 'notEnough' });
    const onPlan = combinedStrengthDate(sessionsAt(1), [c], c, '2026-11-17');
    expect(onPlan).toMatchObject({ kind: 'date', date: '2026-12-28' });
    const ahead = combinedStrengthDate(sessionsAt(1.03), [c], c, '2026-11-17');
    const behind = combinedStrengthDate(sessionsAt(0.97), [c], c, '2026-11-17');
    expect(ahead.kind === 'date' && ahead.date < '2026-12-28').toBe(true);
    expect(behind.kind === 'date' && behind.date > '2026-12-28').toBe(true);
    // A cut holds: on plan → on target; well under it → off.
    const cut = cycle('lose', '2026-12-28');
    expect(combinedStrengthDate(sessionsAt(1), [cut], cut, '2026-11-17').kind).toBe('reached');
    expect(combinedStrengthDate(sessionsAt(0.9), [cut], cut, '2026-11-17').kind).toBe('off');
  });
  it('status: within 3% of the plan is on track', () => {
    expect(statusOf(100, 101)).toBe('onTrack');
    expect(statusOf(96, 100)).toBe('behind');
    expect(statusOf(104, 100)).toBe('ahead');
  });
});

describe('PB-8.3 last week and this week', () => {
  it('weight × reps × sets for the top working weight', () => {
    const s = done('a', '2026-11-03', 2);
    const last = lastWeekLine([s], 'incline-db-press', '2026-11-10');
    const p = s.exercises.find((e) => e.exerciseId === 'incline-db-press')!.prescription;
    expect(last).toEqual({ kg: p[0]!.kg, reps: p[0]!.targetReps, sets: p.filter((x) => x.kind !== 'warmup').length });
    expect(thisWeekLine(p)).toEqual(last);
  });
});

describe('PB-8.5 lighter than planned (AC 12, unit)', () => {
  it('a lighter day moves the combined date later (or barely); the body-weight goal date is not involved', () => {
    const c = cycle('gain', '2026-12-28');
    const base = [1, 2, 3, 4].flatMap((d) => [done(`${d}a`, '2026-11-03', d as 1), done(`${d}b`, '2026-11-10', d as 1, 1, 2), done(`${d}c`, '2026-11-17', d as 1, 1, 3)]);
    expect(combinedStrengthDate(base, [c], c, '2026-11-17')).toMatchObject({ kind: 'date', date: '2026-12-28' });
    const light = done('light', '2026-11-24', 1, 0.85);
    expect(lighterThanPlanned(light)).toBe(true);
    expect(lighterThanPlanned(done('ok', '2026-11-24', 1))).toBe(false);
    const shift = strengthDateShift(base, light, [c], c);
    expect(shift).toMatchObject({ kind: 'moved', from: '2026-12-28' });
    if (shift.kind === 'moved') expect(shift.days).toBeGreaterThan(0);
    // A hair lighter barely moves it.
    expect(strengthDateShift(base, done('hair', '2026-11-24', 1, 0.995), [c], c).kind).toBe('barely');
    // The body-weight goal date isn't an input here at all: it follows calories (PB-8.5).
  });
});
