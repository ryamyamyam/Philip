/**
 * Training program engine (Story 5 §4, T-012). Pure: no React, no DB.
 * 4 days a week (squat, bench, Romanian deadlift, overhead press), 4-week cycles (3 build weeks +
 * deload), weights from a training max (TM = 90% of 1RM). Cycles rotate blocks A → B → C → D.
 * The numbers are Philip's coaching defaults; the evidence labels live in the spec and D-025.
 */

export type LiftId = 'squat' | 'bench' | 'rdl' | 'ohp';
export type Block = 'A' | 'B' | 'C' | 'D';
export type Phase = 'lose' | 'maintain' | 'gain';
export type Week = 1 | 2 | 3 | 4;
export type Day = 1 | 2 | 3 | 4;

export const LIFTS: readonly LiftId[] = ['squat', 'bench', 'rdl', 'ohp'];
export const DAY_LIFT: Readonly<Record<Day, LiftId>> = { 1: 'squat', 2: 'bench', 3: 'rdl', 4: 'ohp' };
export const UPPER: ReadonlySet<LiftId> = new Set(['bench', 'ohp']);
export const BLOCK_ORDER: readonly Block[] = ['A', 'B', 'C', 'D'];
export const DELOAD_WEEK: Week = 4;

/** TM as a share of the 1RM. */
export const TM_SHARE = 0.9;

/** Block for a 1-based cycle number: 1 = A, 2 = B, 3 = C, 4 = D, 5 = A … */
export function blockForCycle(cycle: number): Block {
  const i = (((Math.trunc(cycle) - 1) % 4) + 4) % 4;
  return BLOCK_ORDER[i] ?? 'A';
}

/** Epley estimate of the 1RM from a set; a single is its own 1RM. */
export function epley(kg: number, reps: number): number {
  if (reps <= 1) return kg;
  return kg * (1 + reps / 30);
}

/** Epley gets rough above 10 reps (setup shows a warning; Strength charts skip those sets). */
export const EPLEY_MAX_REPS = 10;

export const tmFromOneRm = (oneRmKg: number): number => roundTo(oneRmKg * TM_SHARE, 0.5);

export function roundTo(x: number, step: number): number {
  return Math.round(x / step) * step;
}

/* ---------------- Main lift ---------------- */

export type MainKind = 'warmup' | 'main' | 'amrap' | 'top' | 'backoff';

export interface MainSetSpec {
  kind: MainKind;
  /** Share of the TM (0–1). */
  pct: number;
  reps: number;
  /** Reps left in the tank (minimum). */
  rir: number;
  restSec: number;
}

const set = (kind: MainKind, pct: number, reps: number, rir: number, restSec: number): MainSetSpec => ({
  kind,
  pct,
  reps,
  rir,
  restSec,
});

/** The RDL never goes to singles or below 2 reps in the tank (§4.1 safety caps). */
const isRdl = (lift: LiftId) => lift === 'rdl';

/** Warm-ups before the work sets (weeks 1–3; the deload has none). */
export function warmupSets(block: Block, week: Week): MainSetSpec[] {
  if (week === DELOAD_WEEK) return [];
  const steps: [number, number][] =
    block === 'C' ? [[0.4, 5], [0.55, 3], [0.7, 2]] : [[0.4, 5], [0.5, 5], [0.6, 3]];
  return steps.map(([pct, reps]) => set('warmup', pct, reps, 5, 60));
}

/** Work sets for the day's main lift. */
export function workSets(block: Block, week: Week, lift: LiftId): MainSetSpec[] {
  if (week === DELOAD_WEEK) return [0.4, 0.5, 0.6].map((p) => set('main', p, 5, 4, 90));
  const rdl = isRdl(lift);
  const plusRir = rdl ? 2 : 1;
  const w = week - 1;
  switch (block) {
    case 'A': {
      const waves: [number, number][][] = [
        [[0.65, 5], [0.75, 5], [0.85, 5]],
        [[0.7, 3], [0.8, 3], [0.9, 3]],
        rdl ? [[0.75, 5], [0.825, 3], [0.875, 3]] : [[0.75, 5], [0.85, 3], [0.95, 1]],
      ];
      const wave = waves[w] ?? [];
      return wave.map(([pct, reps], i) =>
        i === wave.length - 1 ? set('amrap', pct, reps, plusRir, 180) : set('main', pct, reps, 3, 180),
      );
    }
    case 'B': {
      const [pct, reps] = ([[0.65, 8], [0.7, 7], [0.75, 6]] as const)[w] ?? [0.65, 8];
      return Array.from({ length: 4 }, () => set('main', pct, reps, 2, 150));
    }
    case 'C': {
      const tops: [number, number][] = rdl ? [[0.8, 5], [0.85, 4], [0.875, 3]] : [[0.8, 5], [0.875, 3], [0.925, 2]];
      const backs: [number, number][] = [[0.7, 5], [0.75, 4], [0.8, 3]];
      const [tp, tr] = tops[w] ?? [0.8, 5];
      const [bp, br] = backs[w] ?? [0.7, 5];
      return [set('top', tp, tr, 2, 180), ...Array.from({ length: 3 }, () => set('backoff', bp, br, 2, 150))];
    }
    case 'D': {
      const [pct, reps] = ([[0.6, 5], [0.65, 4], [0.7, 3]] as const)[w] ?? [0.6, 5];
      return Array.from({ length: 4 }, () => set('main', pct, reps, 2, 150));
    }
  }
}

/** The set whose reps decide progression: the last `+` set, or the top set (none in B, D or deload). */
export const isKeySet = (kind: MainKind | 'accessory'): boolean => kind === 'amrap' || kind === 'top';

/* ---------------- TM progression (§4.4, §4.5) ---------------- */

export const TM_INCREMENT_KG: Readonly<Record<Phase, { upper: number; lower: number }>> = {
  lose: { upper: 0, lower: 2.5 },
  maintain: { upper: 2.5, lower: 5 },
  gain: { upper: 2.5, lower: 5 },
};

export const tmIncrement = (lift: LiftId, phase: Phase): number =>
  UPPER.has(lift) ? TM_INCREMENT_KG[phase].upper : TM_INCREMENT_KG[phase].lower;

export type TmReason = 'setup' | 'cycle' | 'miss' | 'pain' | 'retest' | 'adjust';
export type CycleOutcome = 'hit' | 'miss' | 'pain' | 'none';

export interface LoggedMainSet {
  kind: MainKind;
  targetReps: number;
  actualReps: number | null;
  done: boolean;
  pain: boolean;
}

/**
 * One lift's result for a cycle, from all its logged main sets:
 * pain anywhere → pain; any key set under target → miss; at least one key set logged → hit; else none.
 */
export function cycleOutcome(sets: readonly LoggedMainSet[]): CycleOutcome {
  if (sets.some((s) => s.pain)) return 'pain';
  const keys = sets.filter((s) => isKeySet(s.kind) && s.done && s.actualReps !== null);
  if (keys.some((s) => (s.actualReps ?? 0) < s.targetReps)) return 'miss';
  return keys.length > 0 ? 'hit' : 'none';
}

/**
 * Next cycle's TM: hit → + phase increment; miss → hold, or 90% if the previous cycle also missed;
 * pain or no key set logged → hold.
 */
export function nextTm(
  tmKg: number,
  lift: LiftId,
  phase: Phase,
  outcome: CycleOutcome,
  missedLastCycle: boolean,
): { tmKg: number; reason: TmReason } {
  switch (outcome) {
    case 'hit':
      return { tmKg: tmKg + tmIncrement(lift, phase), reason: 'cycle' };
    case 'miss':
      return missedLastCycle ? { tmKg: roundTo(tmKg * 0.9, 0.5), reason: 'miss' } : { tmKg, reason: 'miss' };
    case 'pain':
      return { tmKg, reason: 'pain' };
    case 'none':
      return { tmKg, reason: 'cycle' };
  }
}

/* ---------------- Accessories (§4.3, §4.5) ---------------- */

export interface AccessoryRules {
  sets: number;
  rir: number;
  restSec: number;
}

/** Sets, reps in reserve and rest per block (deload: 2 easy sets). Phase changes are applied in the session builder. */
export function accessoryRules(block: Block, week: Week): AccessoryRules {
  if (week === DELOAD_WEEK) return { sets: 2, rir: 3, restSec: 60 };
  const rest: Record<Block, number> = { A: 90, B: 75, C: 90, D: 75 };
  return { sets: 3, rir: block === 'C' ? 2 : 1, restSec: rest[block] };
}

export interface LoggedAccessorySet {
  kg: number | null;
  reps: number | null;
  done: boolean;
}

/**
 * Double progression: when every prescribed set reached the top of the range, add the smallest
 * increment; otherwise keep the weight and chase reps. No history → null (Philip asks for a weight
 * that leaves 2 reps at the top of the range).
 */
export function nextAccessoryKg(
  last: readonly LoggedAccessorySet[] | null,
  prescribedSets: number,
  repMax: number,
  incrementKg: number,
): { kg: number | null; change: 'first' | 'add' | 'hold' } {
  const logged = (last ?? []).filter((s) => s.done && s.kg !== null && s.reps !== null);
  if (logged.length === 0) return { kg: null, change: 'first' };
  const kg = Math.max(...logged.map((s) => s.kg ?? 0));
  const allTop = logged.length >= prescribedSets && logged.every((s) => (s.reps ?? 0) >= repMax);
  return allTop ? { kg: kg + incrementKg, change: 'add' } : { kg, change: 'hold' };
}
