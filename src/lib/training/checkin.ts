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
import { fromUnit, incrementKg, loadFor, roundToStep, type BarSetup, type PlateUnit } from './plates';
import { isKeySet, type Day, type LiftId } from './program';
import type { Slot } from './exercises';
import type { Prescribed } from './session';
import { liftOf } from './sessionLog';
import { rirShift, shortSetLoad } from '../playbook/effort';
import { PB_LOADS } from '../playbook/rules';

export type CheckinFlag = 'breath' | 'heavy' | 'easy' | 'pain';
export const CHECKIN_FLAGS: readonly CheckinFlag[] = ['breath', 'heavy', 'easy', 'pain'];

/** A change to the rest of today's orders for one exercise. */
export interface TodayChange {
  /**
   * Multiplies the load of every set not yet done (1 = unchanged). Story 16: Philip's own options never
   * use it (no flat percent, PB-8.4); kept so older stored changes still read.
   */
  loadFactor: number;
  /** Story 16 (PB-8.4): the load for each open set at its RIR + this (positive = lighter). */
  rirDelta?: number;
  /** Story 16 (PB-8.4): re-derive the open sets from this logged set (taken as near failure). */
  fromSet?: { kg: number; reps: number };
  /** Seconds added to the rest of every set not yet done. */
  restExtraSec: number;
  /** Sets removed from the end (only sets not yet done, at most all but one). */
  dropSets: number;
  /** OBS-097D6D: new rep target for the sets not yet done (kept inside the range). Absent = unchanged. */
  targetReps?: number;
}

/** Which way a change moves the load: −1 lighter, 1 heavier, 0 unchanged. */
export function loadDirection(c: TodayChange): -1 | 0 | 1 {
  if (c.fromSet || (c.rirDelta ?? 0) > 0 || c.loadFactor < 1) return -1;
  if ((c.rirDelta ?? 0) < 0 || c.loadFactor > 1) return 1;
  return 0;
}

export const NO_CHANGE: TodayChange = { loadFactor: 1, restExtraSec: 0, dropSets: 0 };

export const isNoChange = (c: TodayChange): boolean =>
  c.loadFactor === 1 && !c.rirDelta && !c.fromSet && c.restExtraSec === 0 && c.dropSets === 0 && c.targetReps === undefined;

/** Philip's rule for a flag (used without a Gemini key, or when Gemini fails). */
export function ruleChange(flag: CheckinFlag, ex: SessionExercise): TodayChange {
  const remaining = remainingWork(ex).length;
  switch (flag) {
    case 'heavy':
      // PB-8.4: too heavy = the load for +2 RIR.
      return { loadFactor: 1, rirDelta: PB_LOADS.pushbackRir, restExtraSec: 0, dropSets: 0 };
    case 'breath':
      return { loadFactor: 1, restExtraSec: 60, dropSets: remaining >= 2 ? 1 : 0 };
    case 'easy':
      // Main lifts already have the + set for "easy"; accessories: the load for −2 RIR (PB-8.4).
      return ex.slot === 'main' ? NO_CHANGE : { loadFactor: 1, rirDelta: -PB_LOADS.pushbackRir, restExtraSec: 0, dropSets: 0 };
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
      const want = p.kg === null ? null : wantedKg(p, change);
      let kg =
        p.kg === null || want === null || Math.abs(want - p.kg) < 1e-9
          ? p.kg
          : barbell
            ? loadFor(want, bar).totalKg
            : Math.max(0, roundToStep(want, unit));
      // A load change always moves at least one loadable step in its direction (rounding can't swallow it).
      if (p.kg !== null && want !== null && kg === p.kg && Math.abs(want - p.kg) > 1e-9) {
        const dir = want > p.kg ? 1 : -1;
        kg = barbell ? loadFor(p.kg + dir * stepFor(bar), bar).totalKg : Math.max(0, roundToStep(p.kg + dir * incrementKg(unit), unit));
      }
      const restSec = Math.max(MIN_REST_SEC, p.restSec + change.restExtraSec);
      const targetReps =
        change.targetReps === undefined || p.repMin === p.repMax ? p.targetReps : Math.min(p.repMax, Math.max(p.repMin, Math.round(change.targetReps)));
      return { ...p, kg, restSec, ...(targetReps !== undefined ? { targetReps } : {}) };
    });
  return {
    ...ex,
    prescription,
    actual: ex.actual.filter((a) => !dropped.has(a.order)),
    originalPrescription: ex.originalPrescription ?? ex.prescription,
  };
}

/** The smallest jump on a bar: two of the smallest plates. */
const stepFor = (bar: BarSetup): number => 2 * fromUnit(Math.min(...bar.plates.filter((x) => x > 0)), bar.plateUnit);

/** The load a change asks for on one open set (before rounding). */
function wantedKg(p: Prescribed, c: TodayChange): number | null {
  if (p.kg === null) return null;
  const reps = c.targetReps ?? p.targetReps ?? p.repMin;
  let kg = p.kg;
  if (c.fromSet) kg = shortSetLoad(c.fromSet.kg, c.fromSet.reps, reps, p.rir);
  if (c.rirDelta) kg = rirShift(kg, reps, p.rir, c.rirDelta);
  if (c.loadFactor !== 1) kg *= c.loadFactor;
  return kg;
}

/** Rest never goes below this after a "shorter rest" pick. */
export const MIN_REST_SEC = 30;

/**
 * OBS-097D6D: one choice Philip offers the moment a flag is tapped. `group` keeps picks exclusive
 * (one load change, one rep change, one rest change); `scope: 'session'` also adds the rest to every
 * exercise still to come today.
 */
export interface CheckinOption {
  id: string;
  group: 'load' | 'reps' | 'rest' | 'sets' | 'later' | 'ai';
  scope: 'exercise' | 'session';
  change: TodayChange;
}

const only = (c: Partial<TodayChange>): TodayChange => ({ ...NO_CHANGE, ...c });

/** Reps the lifter fell short of the order on this set (0 when on target or not logged). */
export function repsShort(ex: SessionExercise, order: number): number {
  const p = ex.prescription.find((x) => x.order === order);
  const a = ex.actual.find((x) => x.order === order);
  if (!p || !a || p.timed || a.reps === null || p.kind === 'warmup' || p.kind === 'amrap') return 0;
  return Math.max(0, (p.targetReps ?? p.repMin) - a.reps);
}


/**
 * Philip's options for a flag, best first (Philip's pick is the first one). Pure: the numbers come
 * from the session, the labels from the caller. Pain has no options (the exercise stops).
 */
export function checkinOptions(flag: CheckinFlag, ex: SessionExercise, order: number, laterExercises: number, unitStepKg: number): CheckinOption[] {
  const open = remainingWork(ex);
  const first = open[0];
  const out: CheckinOption[] = [];
  const hasLoad = !!first && first.kg !== null && first.kg > 0 && !first.assist;
  const ranged = !!first && first.repMin < first.repMax;
  const target = first ? (first.targetReps ?? first.repMin) : 0;
  const short = repsShort(ex, order);
  const later = laterExercises > 0;
  switch (flag) {
    case 'heavy': {
      if (hasLoad) {
        // Story 16 (PB-8.4): a set that fell 2+ short re-derives the load from what he lifted; otherwise
        // the load for +2 RIR, with +1 RIR as the smaller step. No flat percent.
        const did = ex.actual.find((a) => a.order === order);
        if (short >= 2 && did && did.kg !== null && did.reps !== null && did.reps > 0) {
          out.push({ id: 'drop', group: 'load', scope: 'exercise', change: only({ fromSet: { kg: did.kg, reps: did.reps } }) });
          out.push({ id: 'dropSmall', group: 'load', scope: 'exercise', change: only({ rirDelta: PB_LOADS.pushbackRir }) });
        } else {
          out.push({ id: 'drop', group: 'load', scope: 'exercise', change: only({ rirDelta: PB_LOADS.pushbackRir }) });
          out.push({ id: 'dropSmall', group: 'load', scope: 'exercise', change: only({ rirDelta: 1 }) });
        }
      }
      if (ranged && short <= 1 && target > first!.repMin) out.push({ id: 'repsDown', group: 'reps', scope: 'exercise', change: only({ targetReps: Math.max(first!.repMin, target - 1) }) });
      if (open.length > 0) out.push({ id: 'rest60', group: 'rest', scope: 'exercise', change: only({ restExtraSec: 60 }) });
      if (later) out.push({ id: 'later30', group: 'later', scope: 'session', change: only({ restExtraSec: 30 }) });
      break;
    }
    case 'breath': {
      if (open.length > 0) {
        out.push({ id: 'rest60', group: 'rest', scope: 'exercise', change: only({ restExtraSec: 60 }) });
        out.push({ id: 'rest90', group: 'rest', scope: 'exercise', change: only({ restExtraSec: 90 }) });
      }
      if (open.length >= 2) out.push({ id: 'oneLess', group: 'sets', scope: 'exercise', change: only({ dropSets: 1 }) });
      if (later) out.push({ id: 'later30', group: 'later', scope: 'session', change: only({ restExtraSec: 30 }) });
      break;
    }
    case 'easy': {
      if (hasLoad && ex.slot !== 'main') {
        // PB-8.4: the load for −2 RIR (at least one step up when rounding would swallow it).
        const f = first!;
        const up = rirShift(f.kg!, f.targetReps ?? f.repMin, f.rir, -PB_LOADS.pushbackRir);
        if (up > f.kg! || unitStepKg > 0) out.push({ id: 'up', group: 'load', scope: 'exercise', change: only({ rirDelta: -PB_LOADS.pushbackRir }) });
      }
      if (ranged && target < first!.repMax) out.push({ id: 'repsUp', group: 'reps', scope: 'exercise', change: only({ targetReps: Math.min(first!.repMax, target + 2) }) });
      if (first && first.restSec - 30 >= MIN_REST_SEC) out.push({ id: 'restLess', group: 'rest', scope: 'exercise', change: only({ restExtraSec: -30 }) });
      break;
    }
    case 'pain':
      break;
  }
  return out;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/** Merges the picked options for one exercise (one per group; session options are applied separately). */
export function mergeOptions(picked: readonly CheckinOption[]): { exercise: TodayChange; laterRestSec: number } {
  let exercise: TodayChange = { ...NO_CHANGE };
  let laterRestSec = 0;
  for (const o of picked) {
    if (o.scope === 'session') {
      laterRestSec += o.change.restExtraSec;
      exercise = { ...exercise, restExtraSec: exercise.restExtraSec + o.change.restExtraSec };
      continue;
    }
    const rir = (exercise.rirDelta ?? 0) + (o.change.rirDelta ?? 0);
    const fromSet = o.change.fromSet ?? exercise.fromSet;
    exercise = {
      loadFactor: round3(exercise.loadFactor * o.change.loadFactor),
      ...(rir ? { rirDelta: rir } : {}),
      ...(fromSet ? { fromSet } : {}),
      restExtraSec: exercise.restExtraSec + o.change.restExtraSec,
      dropSets: exercise.dropSets + o.change.dropSets,
      ...(o.change.targetReps !== undefined ? { targetReps: o.change.targetReps } : exercise.targetReps !== undefined ? { targetReps: exercise.targetReps } : {}),
    };
  }
  return { exercise, laterRestSec };
}

/** Adds rest to every set not yet done on the exercises after `index` in today's order. */
export function addLaterRest(exercises: readonly SessionExercise[], index: number, sec: number, bar: BarSetup, unit: PlateUnit): SessionExercise[] {
  if (sec === 0) return [...exercises];
  return exercises.map((e, i) => (i > index && !e.skipped && remainingWork(e).length > 0 ? applyTodayChange(e, only({ restExtraSec: sec }), bar, unit) : e));
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
  /** Story 9: this exercise's earlier logs and Philip's notes (optional; older callers omit it). */
  history?: string;
}

/** Prompt for Gemini: answer only with bounded JSON; never medical advice. */
export function checkinPrompt(c: CoachContext): string {
  return [
    'You are Philip, a confident, charming strength coach who persuades rather than scolds. The lifter is mid-workout and just told you how a set went. Your message makes the fix sound like the smart move. No sexual content.',
    'Decide a small, safe change to the REST OF TODAY for this exercise only. Prefer the smallest change that solves it.',
    'Think in reps in reserve (RIR), never a flat percent (PB-8.4). If a set fell 2 or more reps short of the order, make the sets left lighter (rirChange 2 to 4) instead of only accepting fewer reps. The app turns RIR into the exact weight and checks it.',
    'Never diagnose. If they mention pain, sharp pain, dizziness or chest pain, set stop to true.',
    'Reply ONLY with JSON: {"rirChange": number (-2 to 4: how many more reps in reserve the sets left should have; positive = lighter, negative = heavier, 0 = same weight), "restExtraSec": number (0 to 120), "dropSets": number (0 to 2), "stop": boolean, "message": string (max 160 chars, plain words, no emoji)}.',
    `Exercise: ${c.exercise} (${c.slot}). Set ${c.setNumber}. Ordered: ${c.ordered}. Logged: ${c.logged}.`,
    `Flag: ${c.flag ?? 'none'}. Their words: "${c.note.slice(0, 400)}".`,
    `Sets still to do: ${c.remaining}. Phase: ${c.phase}.`,
    ...(c.history ? [c.history] : []),
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
  const rir = num(o.rirChange, -PB_LOADS.pushbackRir, 4);
  const rest = num(o.restExtraSec, 0, 120);
  const drop = num(o.dropSets, 0, 2);
  if (rir === null || rest === null || drop === null) return null;
  const message = typeof o.message === 'string' ? o.message.replace(EMOJI, '').trim().slice(0, 200) : '';
  return {
    change: { loadFactor: 1, ...(Math.round(rir) !== 0 ? { rirDelta: Math.round(rir) } : {}), restExtraSec: Math.round(rest / 15) * 15, dropSets: Math.round(drop) },
    stop: o.stop === true,
    message,
  };
}

/* ---------------- End-of-day review ---------------- */

export type ReviewItem =
  | { kind: 'tm'; lift: LiftId; factor: number; why: 'flag' | 'miss' }
  | { kind: 'rest'; extraSec: number }
  | { kind: 'note'; note: 'strong' | 'accessoryHold' | 'pain' }
  /** Story 16 §3.4: a note asked for a lighter/heavier next order (pushback flow, PB-8.4). */
  | { kind: 'next'; exerciseId: string; fromKg: number; kg: number; why: 'pain' | 'heavy' | 'light'; corrected: boolean }
  /** Story 16 §3.4: a swap from the approved menu (machine taken or missing, or pain). */
  | { kind: 'swap'; exerciseId: string; day: Day; slot: Slot; to: string; why: 'machine' | 'pain' }
  /** Story 16 §3.4: a note Philip read and acknowledges (no rule fired). */
  | { kind: 'noteAck'; exerciseId: string; text: string }
  /** Story 16 §3.4 / PB-7.4: a pain note: stop that exercise, see a professional if sharp, radiating or a joint. */
  | { kind: 'safety'; exerciseId: string; text: string };

/** Story 16: what the day review needs to turn notes into proposals (pure callbacks from the caller). */
export interface ReviewContext {
  /** The pushback flow for an exercise's next order (PB-8.4); null = no load to move. */
  pushback?: (exerciseId: string, direction: 'heavy' | 'light') => { fromKg: number; kg: number; corrected: boolean } | null;
  /** The first approved swap for an exercise's slot today, or null. */
  swapFor?: (exerciseId: string) => { day: Day; slot: Slot; to: string } | null;
}

/**
 * What Philip proposes for the rest of the cycle after today. Changes apply only on OK. Story 16: the
 * notes' items come from `lib/playbook/notes.ts#reviewDay` (kept out of this eager module).
 */
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

// Story 16: these live in program.ts so the data layer (repo.ts) doesn't pull the whole check-in engine
// into the first screen's bundle.
export { adjustedTm, MAX_REST_BONUS_SEC } from './program';
