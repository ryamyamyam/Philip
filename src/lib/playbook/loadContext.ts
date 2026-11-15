/**
 * Story 16: what the PB-8.4 check needs, built from the app's own data. Pure.
 */
import { exerciseInfo, type ExerciseId } from '../training/exercises';
import { fromUnit, incrementKg, loadFor, roundToStep, type BarSetup, type PlateUnit } from '../training/plates';
import { TM_SHARE, type LiftId } from '../training/program';
import type { Prescribed } from '../training/session';
import type { WorkoutSession } from '../../db/types';
import { checkLoad, fixTextLoads, type ExerciseTraits, type HistorySet, type LoadProfile, type LoadReason, type LoadVerdict } from './loads';
import { ACCESSORY_RATIOS, PB_LOADS } from './rules';

/** Big-4 1RMs from the TMs (TM ÷ 0.9); a missing TM stays null (the check falls back to body weight). */
export function loadProfileFrom(tms: Readonly<Partial<Record<LiftId, number | null>>>, bodyWeightKg: number | null): LoadProfile {
  const one = (l: LiftId) => {
    const tm = tms[l];
    return tm !== null && tm !== undefined && tm > 0 ? tm / TM_SHARE : null;
  };
  return { bodyWeightKg, oneRm: { squat: one('squat'), bench: one('bench'), rdl: one('rdl'), ohp: one('ohp') } };
}

/** Rounding and the smallest step for one exercise (barbell: what the plates allow; else dumbbell/stack steps). */
export function roundingFor(id: string, unit: PlateUnit, bar: BarSetup): { round: (kg: number) => number; step: number } {
  const info = exerciseInfo(id as ExerciseId) ?? {};
  if (info.barbell) {
    const smallest = Math.min(...bar.plates.filter((p) => p > 0));
    return { round: (kg) => loadFor(kg, bar).totalKg, step: 2 * fromUnit(Number.isFinite(smallest) ? smallest : 2.5, bar.plateUnit) };
  }
  return { round: (kg) => Math.max(0, roundToStep(kg, unit)), step: incrementKg(unit) };
}

export const traitsOf = (id: string): ExerciseTraits => ({ pair: !!(exerciseInfo(id as ExerciseId) ?? {}).pair });

/** PB-8.4 anchor history: this exercise's logged sets over the last `sessions` finished sessions, with the ordered RIR. */
export function historyFor(sessions: readonly WorkoutSession[], id: string, max = PB_LOADS.trendSessions): HistorySet[] {
  const done = sessions
    .filter((s) => s.status === 'done')
    .sort((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt));
  const out: HistorySet[] = [];
  let n = 0;
  for (const s of done) {
    const ex = s.exercises.find((e) => e.exerciseId === id);
    if (!ex || !ex.actual.some((a) => a.done)) continue;
    for (const a of ex.actual) {
      const p = ex.prescription.find((x) => x.order === a.order);
      if (p?.kind === 'warmup') continue;
      out.push({ kg: a.kg, reps: a.reps, done: a.done, ...(p ? { rir: setRir(p, a.reps) } : {}) });
    }
    if (++n >= max) break;
  }
  return out;
}

/**
 * The RIR a logged set most likely had: the ordered RIR, less any reps beyond the order; a set short of
 * the order is taken as near failure (PB-8.1 needs reps + RIR, and the owner logs only reps).
 */
export function setRir(p: Pick<Prescribed, 'rir' | 'targetReps' | 'repMin' | 'kind'>, reps: number | null): number {
  if (reps === null) return p.rir;
  const target = p.targetReps ?? p.repMin;
  if (p.kind === 'amrap') return Math.max(0, p.rir - Math.max(0, reps - target));
  if (reps < target) return PB_LOADS.shortSetRir;
  return Math.max(0, p.rir - (reps - target));
}

/** A ready-made PB-8.4 check for one lifter (report proposals, Update goals, chat). */
export function makeLoadCheck(profile: LoadProfile, sessions: readonly WorkoutSession[], unit: PlateUnit, bar: BarSetup) {
  return (id: string, kg: number, reps: number, rir: number): LoadVerdict => {
    const { round, step } = roundingFor(id, unit, bar);
    return checkLoad(id, kg, reps, rir, profile, historyFor(sessions, id), round, step, traitsOf(id));
  };
}

/** Replaces implausible loads named in Philip's words (Story 16 §3.3). */
export function makeTextFixer(profile: LoadProfile, sessions: readonly WorkoutSession[], unit: PlateUnit, bar: BarSetup, name: (id: string) => string, correctedWord: string) {
  const names = Object.keys(ACCESSORY_RATIOS).map((id) => ({ id, name: name(id), reps: 10, rir: 2, traits: traitsOf(id) }));
  return (text: string): string => {
    const { round, step } = roundingFor('db-curl', unit, bar);
    return fixTextLoads(text, names, profile, (id) => historyFor(sessions, id), round, step, correctedWord).text;
  };
}

/**
 * The session builder's PB-8.4 hook (`SessionInput.loadCheck`): the profile from the TMs and body weight,
 * the anchor from this exercise's recent logs. Returns the corrected load, or null when it's plausible.
 */
export function sessionLoadCheck(
  tms: Readonly<Partial<Record<LiftId, number | null>>>,
  bodyWeightKg: number | null,
  sessions: readonly WorkoutSession[],
  unit: PlateUnit,
  bar: BarSetup,
): (id: ExerciseId, kg: number, reps: number, rir: number) => { kg: number; reason: LoadReason } | null {
  const profile = loadProfileFrom(tms, bodyWeightKg);
  return (id, kg, reps, rir) => {
    const { round, step } = roundingFor(id, unit, bar);
    const v = checkLoad(id, kg, reps, rir, profile, historyFor(sessions, id), round, step, traitsOf(id));
    return v.status === 'corrected' && v.kg !== null && v.reason ? { kg: v.kg, reason: v.reason } : null;
  };
}
