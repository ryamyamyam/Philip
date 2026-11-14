/**
 * Philip's exercise library and menu (Story 5 §4.3 + Appendix A, T-012). Static data, not stored.
 * Names and technique cues live in `en.ts` (`exercise.<id>`, `cue.<id>`); why-lines per slot
 * (`why.D<day>-<slot>`).
 */
import type { Block, Day, LiftId } from './program';

export type Slot = 'A1' | 'A2' | 'B';

export interface ExerciseInfo {
  /** Done one leg or arm at a time: reps are per side and the set takes twice as long. */
  perSide?: boolean;
  /** Held for time (seconds) instead of reps. */
  timed?: boolean;
  /** Bodyweight movement: orders give reps; load is optional and added on top. */
  bodyweight?: boolean;
  /** A barbell lift loaded with plates (gets the plate line). */
  barbell?: boolean;
  /** Two dumbbells, one per hand (Story 7, OBS-C94181): the weight is per hand and reads "2 × 12.5 kg". */
  pair?: boolean;
}

const ps = { perSide: true } as const;
const bw = { bodyweight: true } as const;
const bb = { barbell: true } as const;
const timed = { timed: true } as const;
const db2 = { pair: true } as const;

export const EXERCISES = {
  // Main lifts and their block-D variants
  'squat': bb, 'bench': bb, 'rdl': bb, 'ohp': bb,
  'pause-squat': bb, 'pause-bench': bb, 'pause-rdl': bb, 'tempo-ohp': bb,
  // Day 1
  'bulgarian-split-squat': { ...ps, ...db2 }, 'hack-squat': {}, 'single-leg-leg-press': ps, 'leg-press': {}, 'pendulum-squat': {},
  'ffe-reverse-lunge': { ...ps, ...db2 }, 'walking-lunge': { ...ps, ...db2 }, 'goblet-squat': {}, 'heel-raised-db-squat': {}, 'belt-squat': {},
  'lying-leg-curl': {}, 'seated-leg-curl': {}, 'swiss-ball-leg-curl': bw, 'single-leg-seated-curl': ps,
  'nordic-curl': bw, 'glute-ham-raise': bw, 'single-leg-leg-curl': ps, 'slider-leg-curl': bw,
  'hanging-knee-raise': bw, 'captains-chair-raise': bw, 'reverse-crunch': bw, 'cable-crunch': {}, 'machine-crunch': {},
  'decline-crunch': bw, 'ab-wheel': bw, 'ball-rollout': bw, 'body-saw': bw, 'pallof-press': ps,
  'dead-bug': { ...bw, ...ps }, 'side-plank': { ...bw, ...ps, ...timed },
  // Day 2
  'cs-db-row': db2, 'seal-row': bb, 'cs-tbar-row': {}, 'seated-cable-row': {}, 'machine-row': {}, 'wide-cable-row': {},
  'barbell-row': bb, 'pendlay-row': bb, 'tbar-row': {}, 'single-arm-db-row': ps, 'single-arm-cable-row': ps, 'meadows-row': ps,
  'incline-db-press': db2, 'incline-bb-press': bb, 'incline-machine-press': {}, 'machine-chest-press': {}, 'db-bench-press': db2,
  'weighted-push-up': bw, 'dips': bw, 'close-grip-bench': bb, 'db-fly': db2, 'cable-fly': {}, 'pec-deck': {},
  'face-pull': {}, 'cable-rear-delt-fly': {}, 'band-face-pull': bw, 'rear-delt-fly': db2, 'reverse-pec-deck': {},
  'band-pull-apart': bw, 'prone-y-raise': db2, 'triceps-pushdown': {}, 'overhead-cable-extension': {}, 'db-kickback': ps,
  // Day 3
  'hip-thrust': bb, 'bb-glute-bridge': bb, 'machine-glute-bridge': {}, 'back-extension': bw, 'reverse-hyper': {},
  'good-morning': bb, 'ssb-good-morning': bb, 'cable-pull-through': {}, 'kb-swing': {},
  'reverse-lunge': { ...ps, ...db2 }, 'split-squat': { ...ps, ...db2 }, 'step-up': { ...ps, ...db2 }, 'single-leg-rdl': { ...ps, ...db2 }, 'b-stance-rdl': ps, 'cable-sl-rdl': ps,
  'db-reverse-lunge': { ...ps, ...db2 }, 'deficit-reverse-lunge': { ...ps, ...db2 }, 'lateral-lunge': ps,
  'standing-calf-raise': {}, 'leg-press-calf-raise': {}, 'smith-calf-raise': {}, 'seated-calf-raise': {},
  'single-leg-db-calf-raise': ps, 'weighted-plank': { ...bw, ...timed }, 'rkc-plank': { ...bw, ...timed },
  'long-lever-plank': { ...bw, ...timed }, 'tempo-calf-raise': {}, 'single-leg-calf-raise': ps, 'donkey-calf-raise': {},
  // Day 4
  'pull-up': bw, 'assisted-pull-up': {}, 'lat-pulldown': {}, 'single-arm-pulldown': ps, 'machine-pulldown': {},
  'chin-up': bw, 'neutral-pull-up': bw, 'close-grip-pulldown': {}, 'neutral-pulldown': {}, 'single-arm-cable-pulldown': ps,
  'machine-high-row': {}, 'db-lateral-raise': db2, 'cable-lateral-raise': ps, 'machine-lateral-raise': {}, 'cable-y-raise': {},
  'lean-away-lateral-raise': ps, 'btb-cable-lateral-raise': ps, 'seated-db-lateral-raise': db2,
  'db-curl': db2, 'cable-curl': {}, 'ez-curl': {}, 'preacher-curl': {}, 'hammer-curl': db2, 'rope-hammer-curl': {},
  'cross-body-hammer-curl': db2, 'incline-db-curl': db2, 'bayesian-curl': ps, 'spider-curl': db2,
} as const satisfies Record<string, ExerciseInfo>;

export type ExerciseId = keyof typeof EXERCISES;

export const EXERCISE_IDS = Object.keys(EXERCISES) as ExerciseId[];

export function exerciseInfo(id: ExerciseId): ExerciseInfo {
  return EXERCISES[id];
}

/**
 * OBS-41CEBE: what "kg" means for an exercise, for Philip's prompts. Loads are only comparable within
 * one exercise: 12.5 kg per hand on dumbbells, 40 kg on a machine stack and 50 kg on a barbell are
 * different things.
 */
export function loadKind(id: string): string {
  const info = (EXERCISES as Record<string, ExerciseInfo>)[id] ?? {};
  if (info.barbell) return 'barbell, kg = whole bar';
  if (info.pair) return 'two dumbbells, kg per hand';
  if (info.timed) return 'held for time';
  if (info.bodyweight) return 'bodyweight, kg = added load';
  return 'machine, cable or one weight, kg as set on it';
}

/** The rule every coaching prompt carries (OBS-41CEBE). */
export const LOAD_RULE =
  'Loads are only comparable within the same exercise. A swapped exercise (different machine, cable, dumbbells or barbell) has its own history and its own starting weight: never carry a weight across exercises or judge one exercise\'s load by another\'s. Dumbbell weights are per hand; machine numbers depend on the machine.';

/** Main lift per day and its block-D (paused or tempo) variant. */
export const MAIN_EXERCISE: Record<LiftId, { normal: ExerciseId; control: ExerciseId }> = {
  squat: { normal: 'squat', control: 'pause-squat' },
  bench: { normal: 'bench', control: 'pause-bench' },
  rdl: { normal: 'rdl', control: 'pause-rdl' },
  ohp: { normal: 'ohp', control: 'tempo-ohp' },
};

export interface MenuSlot {
  day: Day;
  slot: Slot;
  block: Block;
  pick: ExerciseId;
  swaps: readonly [ExerciseId, ExerciseId];
  /** Reps (or seconds, for timed holds), per side where the exercise is one-sided. */
  repMin: number;
  repMax: number;
}

type Row = [Slot, Block, ExerciseId, ExerciseId, ExerciseId, number, number];
const rows = (day: Day, list: Row[]): MenuSlot[] =>
  list.map(([slot, block, pick, s1, s2, repMin, repMax]) => ({ day, slot, block, pick, swaps: [s1, s2], repMin, repMax }));

/** Appendix A: Philip's pick and two approved swaps for every day × slot × block (rep ranges per §4.3). */
export const MENU: readonly MenuSlot[] = [
  ...rows(1, [
    ['A1', 'A', 'bulgarian-split-squat', 'hack-squat', 'single-leg-leg-press', 8, 10],
    ['A1', 'B', 'leg-press', 'hack-squat', 'pendulum-squat', 12, 15],
    ['A1', 'C', 'ffe-reverse-lunge', 'bulgarian-split-squat', 'walking-lunge', 6, 8],
    ['A1', 'D', 'goblet-squat', 'heel-raised-db-squat', 'belt-squat', 10, 12],
    ['A2', 'A', 'lying-leg-curl', 'seated-leg-curl', 'swiss-ball-leg-curl', 10, 12],
    ['A2', 'B', 'seated-leg-curl', 'lying-leg-curl', 'single-leg-seated-curl', 12, 15],
    ['A2', 'C', 'nordic-curl', 'glute-ham-raise', 'lying-leg-curl', 4, 6],
    ['A2', 'D', 'single-leg-leg-curl', 'swiss-ball-leg-curl', 'slider-leg-curl', 10, 12],
    ['B', 'A', 'hanging-knee-raise', 'captains-chair-raise', 'reverse-crunch', 10, 15],
    ['B', 'B', 'cable-crunch', 'machine-crunch', 'decline-crunch', 12, 15],
    ['B', 'C', 'ab-wheel', 'ball-rollout', 'body-saw', 8, 12],
    ['B', 'D', 'pallof-press', 'dead-bug', 'side-plank', 10, 10],
  ]),
  ...rows(2, [
    ['A1', 'A', 'cs-db-row', 'seal-row', 'cs-tbar-row', 8, 12],
    ['A1', 'B', 'seated-cable-row', 'machine-row', 'wide-cable-row', 12, 15],
    ['A1', 'C', 'barbell-row', 'pendlay-row', 'tbar-row', 6, 8],
    ['A1', 'D', 'single-arm-db-row', 'single-arm-cable-row', 'meadows-row', 10, 12],
    ['A2', 'A', 'incline-db-press', 'incline-bb-press', 'incline-machine-press', 8, 12],
    ['A2', 'B', 'machine-chest-press', 'db-bench-press', 'weighted-push-up', 12, 15],
    ['A2', 'C', 'dips', 'close-grip-bench', 'weighted-push-up', 6, 8],
    ['A2', 'D', 'db-fly', 'cable-fly', 'pec-deck', 10, 12],
    ['B', 'A', 'face-pull', 'cable-rear-delt-fly', 'band-face-pull', 15, 20],
    ['B', 'B', 'rear-delt-fly', 'reverse-pec-deck', 'cable-rear-delt-fly', 15, 20],
    ['B', 'C', 'band-pull-apart', 'face-pull', 'prone-y-raise', 15, 20],
    ['B', 'D', 'triceps-pushdown', 'overhead-cable-extension', 'db-kickback', 10, 12],
  ]),
  ...rows(3, [
    ['A1', 'A', 'hip-thrust', 'bb-glute-bridge', 'machine-glute-bridge', 8, 12],
    ['A1', 'B', 'back-extension', 'reverse-hyper', 'glute-ham-raise', 10, 15],
    ['A1', 'C', 'good-morning', 'ssb-good-morning', 'back-extension', 6, 8],
    ['A1', 'D', 'cable-pull-through', 'kb-swing', 'reverse-hyper', 12, 15],
    ['A2', 'A', 'walking-lunge', 'reverse-lunge', 'split-squat', 10, 10],
    ['A2', 'B', 'step-up', 'bulgarian-split-squat', 'walking-lunge', 12, 12],
    ['A2', 'C', 'single-leg-rdl', 'b-stance-rdl', 'cable-sl-rdl', 6, 8],
    ['A2', 'D', 'db-reverse-lunge', 'deficit-reverse-lunge', 'lateral-lunge', 10, 10],
    ['B', 'A', 'standing-calf-raise', 'leg-press-calf-raise', 'smith-calf-raise', 10, 15],
    ['B', 'B', 'seated-calf-raise', 'leg-press-calf-raise', 'single-leg-db-calf-raise', 15, 20],
    ['B', 'C', 'weighted-plank', 'rkc-plank', 'long-lever-plank', 30, 45],
    ['B', 'D', 'tempo-calf-raise', 'single-leg-calf-raise', 'donkey-calf-raise', 10, 12],
  ]),
  ...rows(4, [
    ['A1', 'A', 'pull-up', 'assisted-pull-up', 'lat-pulldown', 6, 10],
    ['A1', 'B', 'lat-pulldown', 'single-arm-pulldown', 'machine-pulldown', 12, 15],
    ['A1', 'C', 'chin-up', 'neutral-pull-up', 'close-grip-pulldown', 5, 8],
    ['A1', 'D', 'neutral-pulldown', 'single-arm-cable-pulldown', 'machine-high-row', 10, 12],
    ['A2', 'A', 'db-lateral-raise', 'cable-lateral-raise', 'machine-lateral-raise', 12, 20],
    ['A2', 'B', 'cable-lateral-raise', 'machine-lateral-raise', 'db-lateral-raise', 15, 20],
    ['A2', 'C', 'db-lateral-raise', 'machine-lateral-raise', 'cable-y-raise', 10, 12],
    ['A2', 'D', 'lean-away-lateral-raise', 'btb-cable-lateral-raise', 'seated-db-lateral-raise', 12, 15],
    ['B', 'A', 'db-curl', 'cable-curl', 'ez-curl', 10, 15],
    ['B', 'B', 'ez-curl', 'cable-curl', 'preacher-curl', 12, 15],
    ['B', 'C', 'hammer-curl', 'rope-hammer-curl', 'cross-body-hammer-curl', 6, 8],
    ['B', 'D', 'incline-db-curl', 'bayesian-curl', 'spider-curl', 10, 12],
  ]),
];

export const slotKey = (day: Day, slot: Slot, block: Block): string => `D${day}-${slot}-${block}`;

export function menuSlot(day: Day, slot: Slot, block: Block): MenuSlot {
  const m = MENU.find((s) => s.day === day && s.slot === slot && s.block === block);
  if (!m) throw new Error(`No menu slot ${slotKey(day, slot, block)}`);
  return m;
}

/** The exercise for a slot: the owner's sticky swap if it's one of the approved ones, otherwise Philip's pick. */
export function exerciseFor(
  day: Day,
  slot: Slot,
  block: Block,
  choices: Readonly<Record<string, ExerciseId>> = {},
): ExerciseId {
  const m = menuSlot(day, slot, block);
  const chosen = choices[slotKey(day, slot, block)];
  return chosen && (chosen === m.pick || m.swaps.includes(chosen)) ? chosen : m.pick;
}
