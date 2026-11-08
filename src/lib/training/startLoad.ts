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

/** Group ratios from the Story 6 §6 table, one row per exercise. Tune here. */
const ACCESSORY_RULES = {
  // Day 1: quads, hamstrings, core
  'bulgarian-split-squat': L('squat', 0.12),
  'hack-squat': L('squat', 0.5),
  'single-leg-leg-press': L('squat', 0.5),
  'leg-press': L('squat', 1.2),
  'pendulum-squat': L('squat', 0.5),
  'ffe-reverse-lunge': L('squat', 0.12),
  'walking-lunge': L('squat', 0.12),
  'goblet-squat': L('squat', 0.18),
  'heel-raised-db-squat': L('squat', 0.12),
  'belt-squat': L('squat', 0.6),
  'lying-leg-curl': L('rdl', 0.25),
  'seated-leg-curl': L('rdl', 0.25),
  'swiss-ball-leg-curl': BW,
  'single-leg-seated-curl': L('rdl', 0.125),
  'nordic-curl': BW,
  'glute-ham-raise': BW,
  'single-leg-leg-curl': L('rdl', 0.125),
  'slider-leg-curl': BW,
  'hanging-knee-raise': BW,
  'captains-chair-raise': BW,
  'reverse-crunch': BW,
  'cable-crunch': L('bw', 0.4),
  'machine-crunch': L('bw', 0.4),
  'decline-crunch': BW,
  'ab-wheel': BW,
  'ball-rollout': BW,
  'body-saw': BW,
  'pallof-press': L('bw', 0.12),
  'dead-bug': BW,
  'side-plank': HOLD,
  // Day 2: rows, chest, rear delts, triceps
  'cs-db-row': L('bench', 0.25),
  'seal-row': L('bench', 0.5),
  'cs-tbar-row': L('bench', 0.5),
  'seated-cable-row': L('bench', 0.6),
  'machine-row': L('bench', 0.6),
  'wide-cable-row': L('bench', 0.5),
  'barbell-row': L('bench', 0.6),
  'pendlay-row': L('bench', 0.6),
  'tbar-row': L('bench', 0.5),
  'single-arm-db-row': L('bench', 0.3),
  'single-arm-cable-row': L('bench', 0.3),
  'meadows-row': L('bench', 0.3),
  'incline-db-press': L('bench', 0.28),
  'incline-bb-press': L('bench', 0.65),
  'incline-machine-press': L('bench', 0.6),
  'machine-chest-press': L('bench', 0.6),
  'db-bench-press': L('bench', 0.3),
  'weighted-push-up': BW,
  'dips': BW,
  'close-grip-bench': L('bench', 0.65),
  'db-fly': L('bench', 0.12),
  'cable-fly': L('bench', 0.1),
  'pec-deck': L('bench', 0.4),
  'face-pull': L('bench', 0.25),
  'cable-rear-delt-fly': L('bench', 0.08),
  'band-face-pull': BAND,
  'rear-delt-fly': L('bench', 0.07),
  'reverse-pec-deck': L('bench', 0.3),
  'band-pull-apart': BAND,
  'prone-y-raise': L('bench', 0.03),
  'triceps-pushdown': L('bench', 0.3),
  'overhead-cable-extension': L('bench', 0.25),
  'db-kickback': L('bench', 0.08),
  // Day 3: glutes, low back, single leg, calves, core
  'hip-thrust': L('rdl', 0.8),
  'bb-glute-bridge': L('rdl', 0.8),
  'machine-glute-bridge': L('rdl', 0.8),
  'back-extension': L('rdl', 0.1),
  'reverse-hyper': L('rdl', 0.25),
  'good-morning': L('rdl', 0.4),
  'ssb-good-morning': L('rdl', 0.4),
  'cable-pull-through': L('rdl', 0.25),
  'kb-swing': L('rdl', 0.2),
  'reverse-lunge': L('squat', 0.12),
  'split-squat': L('squat', 0.12),
  'step-up': L('squat', 0.12),
  'single-leg-rdl': L('rdl', 0.15),
  'b-stance-rdl': L('rdl', 0.2),
  'cable-sl-rdl': L('rdl', 0.15),
  'db-reverse-lunge': L('squat', 0.12),
  'deficit-reverse-lunge': L('squat', 0.1),
  'lateral-lunge': L('squat', 0.1),
  'standing-calf-raise': L('squat', 0.6),
  'leg-press-calf-raise': L('squat', 0.8),
  'smith-calf-raise': L('squat', 0.6),
  'seated-calf-raise': L('squat', 0.35),
  'single-leg-db-calf-raise': L('squat', 0.12),
  'weighted-plank': L('bw', 0.15),
  'rkc-plank': HOLD,
  'long-lever-plank': HOLD,
  'tempo-calf-raise': L('squat', 0.5),
  'single-leg-calf-raise': L('squat', 0.12),
  'donkey-calf-raise': L('squat', 0.6),
  // Day 4: vertical pull, side delts, biceps
  'pull-up': BW,
  'assisted-pull-up': { kind: 'assist', anchor: 'bw', ratio: 0.3 },
  'lat-pulldown': L('bw', 0.6),
  'single-arm-pulldown': L('bw', 0.3),
  'machine-pulldown': L('bw', 0.6),
  'chin-up': BW,
  'neutral-pull-up': BW,
  'close-grip-pulldown': L('bw', 0.65),
  'neutral-pulldown': L('bw', 0.6),
  'single-arm-cable-pulldown': L('bw', 0.3),
  'machine-high-row': L('bw', 0.6),
  'db-lateral-raise': L('ohp', 0.18),
  'cable-lateral-raise': L('ohp', 0.1),
  'machine-lateral-raise': L('ohp', 0.4),
  'cable-y-raise': L('ohp', 0.08),
  'lean-away-lateral-raise': L('ohp', 0.1),
  'btb-cable-lateral-raise': L('ohp', 0.08),
  'seated-db-lateral-raise': L('ohp', 0.16),
  'db-curl': L('ohp', 0.25),
  'cable-curl': L('ohp', 0.5),
  'ez-curl': L('ohp', 0.6),
  'preacher-curl': L('ohp', 0.5),
  'hammer-curl': L('ohp', 0.28),
  'rope-hammer-curl': L('ohp', 0.5),
  'cross-body-hammer-curl': L('ohp', 0.28),
  'incline-db-curl': L('ohp', 0.2),
  'bayesian-curl': L('ohp', 0.2),
  'spider-curl': L('ohp', 0.2),
} as const satisfies Partial<Record<ExerciseId, StartRule>>;

const MAIN_IDS = new Set<ExerciseId>(Object.values(MAIN_EXERCISE).flatMap((m) => [m.normal, m.control]));

/** Every exercise's rule. Throws for an exercise with no rule (a unit test checks the whole library). */
export function startRule(id: ExerciseId): StartRule {
  if (MAIN_IDS.has(id)) return { kind: 'main' };
  const r = (ACCESSORY_RULES as Partial<Record<ExerciseId, StartRule>>)[id];
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
