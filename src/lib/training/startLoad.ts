/**
 * Philip's starting weight for an accessory he has no log for yet (Story 6 §6, T-019). Pure.
 *
 * start = anchor × ratio, rounded DOWN to the loading step. Anchors are a Big 4 TM or body weight.
 * Dumbbell ratios are per hand; cable and machine ratios are per stack. These ratios are Philip's
 * coaching defaults (a hypothesis, not evidence), deliberately conservative: aimed at 2–3 reps in
 * reserve at the target reps. Machine stacks differ between gyms, so those numbers are rough; the
 * first logged session takes over (double progression).
 */
import { EXERCISE_IDS, MAIN_EXERCISE, type ExerciseId } from './exercises';
import { KG_PER_LB, type PlateUnit } from './plates';
import type { LiftId } from './program';
import { ACCESSORY_RATIOS } from '../playbook/rules';

export type Anchor = LiftId | 'bw';

export type StartRule =
  | { kind: 'load'; anchor: Anchor; ratio: number }
  /** Assisted machine: the number is the assistance (counterweight). */
  | { kind: 'assist'; anchor: 'bw'; ratio: number }
  /** Bodyweight reps (load optional, added on top). */
  | { kind: 'bodyweight' }
  /** Held for time, no load. */
  | { kind: 'timed' }
  | { kind: 'band' }
  /** Main lifts: orders come from the TM, never from here. */
  | { kind: 'main' };

const L = (anchor: Anchor, ratio: number): StartRule => ({ kind: 'load', anchor, ratio });
const BW: StartRule = { kind: 'bodyweight' };
const HOLD: StartRule = { kind: 'timed' };
const BAND: StartRule = { kind: 'band' };

/**
 * Story 16 (PB-8.4): the load ratios live in the playbook (`lib/playbook/rules.ts` › ACCESSORY_RATIOS);
 * here only the exercises that have no load ratio (bodyweight, timed, band, assisted).
 */
const OTHER_RULES = {
  'swiss-ball-leg-curl': BW,
  'nordic-curl': BW,
  'glute-ham-raise': BW,
  'slider-leg-curl': BW,
  'hanging-knee-raise': BW,
  'captains-chair-raise': BW,
  'reverse-crunch': BW,
  'decline-crunch': BW,
  'ab-wheel': BW,
  'ball-rollout': BW,
  'body-saw': BW,
  'dead-bug': BW,
  'side-plank': HOLD,
  'weighted-push-up': BW,
  'dips': BW,
  'band-face-pull': BAND,
  'band-pull-apart': BAND,
  'rkc-plank': HOLD,
  'long-lever-plank': HOLD,
  'pull-up': BW,
  'chin-up': BW,
  'neutral-pull-up': BW,
} as const satisfies Partial<Record<ExerciseId, StartRule>>;

const ACCESSORY_RULES: Partial<Record<ExerciseId, StartRule>> = {
  ...OTHER_RULES,
  ...Object.fromEntries(
    Object.entries(ACCESSORY_RATIOS).map(([id, [anchor, ratio]]) => [id, id === 'assisted-pull-up' ? { kind: 'assist', anchor: 'bw', ratio } : L(anchor, ratio)]),
  ),
};

const MAIN_IDS = new Set<ExerciseId>(Object.values(MAIN_EXERCISE).flatMap((m) => [m.normal, m.control]));

/** Every exercise's rule. Throws for an exercise with no rule (a unit test checks the whole library). */
export function startRule(id: ExerciseId): StartRule {
  if (MAIN_IDS.has(id)) return { kind: 'main' };
  const r = ACCESSORY_RULES[id];
  if (!r) throw new Error(`No starting-weight rule for ${id}`);
  return r;
}

export const UNCOVERED_EXERCISES = (): ExerciseId[] =>
  EXERCISE_IDS.filter((id) => !MAIN_IDS.has(id) && !(id in ACCESSORY_RULES));

/**
 * Fallback TM from body weight when an anchor lift has no TM yet (calibration pending). Conservative,
 * used only to seed accessory estimates; never stored as a TM and never shown as one.
 */
export const BW_TM_FALLBACK: Readonly<Record<LiftId, number>> = { squat: 1.0, bench: 0.75, rdl: 1.0, ohp: 0.45 };

export interface StartInput {
  tms: Readonly<Record<LiftId, number | null>>;
  bodyWeightKg: number | null;
  unit: PlateUnit;
}

const stepKg = (unit: PlateUnit): number => (unit === 'kg' ? 2.5 : 5 * KG_PER_LB);

/** Rounds down to the loading step, never below one step. */
export function floorToStep(kg: number, unit: PlateUnit): number {
  const step = stepKg(unit);
  const n = Math.max(1, Math.floor(kg / step + 1e-9));
  return Math.round(n * step * 1000) / 1000;
}

function anchorKg(anchor: Anchor, input: StartInput): number | null {
  const bw = input.bodyWeightKg !== null && input.bodyWeightKg > 0 ? input.bodyWeightKg : null;
  if (anchor === 'bw') return bw;
  const tm = input.tms[anchor];
  if (tm !== null && tm > 0) return tm;
  return bw !== null ? bw * BW_TM_FALLBACK[anchor] : null;
}

/** Philip's starting load in kg for an exercise with no log, or null when there's nothing to anchor on. */
export function startingKg(id: ExerciseId, input: StartInput): number | null {
  const r = startRule(id);
  if (r.kind !== 'load' && r.kind !== 'assist') return null;
  const a = anchorKg(r.anchor, input);
  return a === null ? null : floorToStep(a * r.ratio, input.unit);
}

/** Target reps (or seconds) for the first time an exercise appears: the middle of the range, rounded down. */
export const firstTargetReps = (repMin: number, repMax: number): number => Math.floor((repMin + repMax) / 2);
