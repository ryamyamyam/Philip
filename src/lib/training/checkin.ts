/**
 * Mid-workout check-ins and the end-of-day review (owner feedback, Nov 5). Pure.
 *
 * On any set the owner can flag how it went (out of breath, too heavy, too easy, pain) and type a
 * note. Philip proposes a change to the rest of today's orders (fixed coaching rules, or Gemini
 * reading the note when a key is set); nothing changes until the owner taps OK. After Finish,
 * Philip reviews the day and proposes changes for the rest of the cycle, again only on OK.
 */
import type { SessionExercise, WorkoutSession } from '../../db/types';
import { exerciseInfo, type ExerciseId } from './exercises';
import { loadFor, roundToStep, type BarSetup, type PlateUnit } from './plates';
import { isKeySet, roundTo, type LiftId } from './program';
import type { Prescribed } from './session';
import { liftOf } from './sessionLog';

export type CheckinFlag = 'breath' | 'heavy' | 'easy' | 'pain';
export const CHECKIN_FLAGS: readonly CheckinFlag[] = ['breath', 'heavy', 'easy', 'pain'];

/** A change to the rest of today's orders for one exercise. */
export interface TodayChange {
  /** Multiplies the load of every set not yet done (1 = unchanged). */
  loadFactor: number;
  /** Seconds added to the rest of every set not yet done. */
  restExtraSec: number;
  /** Sets removed from the end (only sets not yet done, at most all but one). */
  dropSets: number;
}

export const NO_CHANGE: TodayChange = { loadFactor: 1, restExtraSec: 0, dropSets: 0 };

export const isNoChange = (c: TodayChange): boolean => c.loadFactor === 1 && c.restExtraSec === 0 && c.dropSets === 0;

/** Philip's rule for a flag (used without a Gemini key, or when Gemini fails). */
export function ruleChange(flag: CheckinFlag, ex: SessionExercise): TodayChange {
  const remaining = remainingWork(ex).length;
  switch (flag) {
    case 'heavy':
      return { loadFactor: 0.9, restExtraSec: 0, dropSets: 0 };
    case 'breath':
      return { loadFactor: 1, restExtraSec: 60, dropSets: remaining >= 2 ? 1 : 0 };
    case 'easy':
      // Main lifts already have the + set for "easy"; accessories go up one small step.
      return ex.slot === 'main' ? NO_CHANGE : { loadFactor: 1.05, restExtraSec: 0, dropSets: 0 };
    case 'pain':
      return NO_CHANGE;
  }
}

/** Work sets (not warm-ups) not yet logged as done. */
export function remainingWork(ex: SessionExercise): Prescribed[] {
  return ex.prescription.filter((p) => p.kind !== 'warmup' && !ex.actual.find((a) => a.order === p.order)?.done);
}

/**
 * Applies a change to the sets not yet done. Loads are rounded to what can be loaded (barbell) or to
 * the owner's dumbbell step; orders with no weight yet stay without one. Done sets never change.
 */
export function applyTodayChange(ex: SessionExercise, change: TodayChange, bar: BarSetup, unit: PlateUnit): SessionExercise {
  const open = new Set(remainingWork(ex).map((p) => p.order));
  const barbell = !!exerciseInfo(ex.exerciseId as ExerciseId)?.barbell;
  const drop = Math.min(change.dropSets, Math.max(0, open.size - 1));
  const dropped = new Set([...open].sort((a, b) => b - a).slice(0, drop));
  const prescription = ex.prescription
    .filter((p) => !dropped.has(p.order))
    .map((p) => {
      if (!open.has(p.order)) return p;
      const kg =
        p.kg === null || change.loadFactor === 1
          ? p.kg
          : barbell
            ? loadFor(p.kg * change.loadFactor, bar).totalKg
            : Math.max(0, roundToStep(p.kg * change.loadFactor, unit));
      return { ...p, kg, restSec: p.restSec + change.restExtraSec };
    });
  return {
    ...ex,
    prescription,
    actual: ex.actual.filter((a) => !dropped.has(a.order)),
    originalPrescription: ex.originalPrescription ?? ex.prescription,
  };
}

/* ---------------- Gemini reads the note ---------------- */

export interface CoachContext {
  exercise: string;
  slot: string;
  setNumber: number;
  ordered: string;
  logged: string;
  flag: CheckinFlag | null;
  note: string;
  remaining: string;
  phase: string;
}

/** Prompt for Gemini: answer only with bounded JSON; never medical advice. */
export function checkinPrompt(c: CoachContext): string {
  return [
    'You are Philip, a strict but caring strength coach. The lifter is mid-workout and just told you how a set went.',
    'Decide a small, safe change to the REST OF TODAY for this exercise only. Prefer the smallest change that solves it.',
    'Never diagnose. If they mention pain, sharp pain, dizziness or chest pain, set stop to true.',
    'Reply ONLY with JSON: {"loadPct": number (-25 to 10, percent change in weight), "restExtraSec": number (0 to 120), "dropSets": number (0 to 2), "stop": boolean, "message": string (max 160 chars, plain words, no emoji)}.',
    `Exercise: ${c.exercise} (${c.slot}). Set ${c.setNumber}. Ordered: ${c.ordered}. Logged: ${c.logged}.`,
    `Flag: ${c.flag ?? 'none'}. Their words: "${c.note.slice(0, 400)}".`,
    `Sets still to do: ${c.remaining}. Phase: ${c.phase}.`,
  ].join('\n');
}

export interface CoachReply {
  change: TodayChange;
  stop: boolean;
  message: string;
}

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu;

/** Validates and clamps Gemini's reply; null when it isn't usable. */
export function parseCoachReply(raw: unknown): CoachReply | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null);
  const loadPct = num(o.loadPct, -25, 10);
  const rest = num(o.restExtraSec, 0, 120);
  const drop = num(o.dropSets, 0, 2);
  if (loadPct === null || rest === null || drop === null) return null;
  const message = typeof o.message === 'string' ? o.message.replace(EMOJI, '').trim().slice(0, 200) : '';
  return {
    change: { loadFactor: Math.round((1 + loadPct / 100) * 1000) / 1000, restExtraSec: Math.round(rest / 15) * 15, dropSets: Math.round(drop) },
    stop: o.stop === true,
    message,
  };
}

/* ---------------- End-of-day review ---------------- */

export type ReviewItem =
  | { kind: 'tm'; lift: LiftId; factor: number; why: 'flag' | 'miss' }
  | { kind: 'rest'; extraSec: number }
  | { kind: 'note'; note: 'strong' | 'accessoryHold' | 'pain' };

/** What Philip proposes for the rest of the cycle after today. Changes apply only on OK. */
export function reviewSession(session: WorkoutSession): ReviewItem[] {
  const items: ReviewItem[] = [];
  const main = session.exercises.find((e) => e.slot === 'main');
  const lift = main ? liftOf(main.exerciseId) : null;
  const flags = (e: SessionExercise | undefined) => (e ? e.actual.map((a) => a.flag).filter(Boolean) : []);
  if (main && lift) {
    const f = flags(main);
    const missed = main.actual.some((a) => {
      const p = main.prescription.find((x) => x.order === a.order);
      return p && isKeySet(p.kind) && a.done && a.reps !== null && a.reps < p.repMin;
    });
    if (f.includes('heavy') || f.includes('breath')) items.push({ kind: 'tm', lift, factor: 0.95, why: 'flag' });
    else if (missed) items.push({ kind: 'tm', lift, factor: 0.95, why: 'miss' });
    else if (f.includes('easy')) items.push({ kind: 'note', note: 'strong' });
  }
  if (session.exercises.some((e) => flags(e).includes('breath'))) items.push({ kind: 'rest', extraSec: 30 });
  if (session.exercises.some((e) => e.slot !== 'main' && flags(e).includes('heavy'))) items.push({ kind: 'note', note: 'accessoryHold' });
  if (session.exercises.some((e) => e.actual.some((a) => a.pain))) items.push({ kind: 'note', note: 'pain' });
  return items;
}

/** New TM after a review cut, rounded to 0.5 kg. */
export const adjustedTm = (tmKg: number, factor: number): number => roundTo(tmKg * factor, 0.5);

/** Extra rest for the rest of a cycle is capped so sessions still fit (the 45-min trims still run). */
export const MAX_REST_BONUS_SEC = 90;
