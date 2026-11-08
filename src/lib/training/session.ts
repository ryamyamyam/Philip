/**
 * Builds one day's session — Philip's orders — and keeps it inside 45 minutes (Story 5 §4.6, T-012).
 * Pure. The result is frozen onto the stored session; later rule changes never rewrite it.
 */
import { exerciseFor, exerciseInfo, MAIN_EXERCISE, menuSlot, type ExerciseId, type Slot } from './exercises';
import { startingKg, startRule } from './startLoad';
import { DEFAULT_BAR_SETUP, KG_PER_LB, loadFor, roundToStep, type BarSetup, type PlateUnit } from './plates';
import {
  accessoryRules,
  blockForCycle,
  DAY_LIFT,
  DELOAD_WEEK,
  nextAccessoryKg,
  nextTargetReps,
  tmIncrement,
  warmupSets,
  workSets,
  type Block,
  type Day,
  type LiftId,
  type LoggedAccessorySet,
  type MainKind,
  type Phase,
  type Week,
} from './program';

export type SessionSlot = 'main' | Slot;

export interface Prescribed {
  order: number;
  kind: MainKind | 'accessory';
  /** Load in kg (what's on the bar for barbell lifts; added load for bodyweight moves). null = Philip has no number yet. */
  kg: number | null;
  /** Share of the TM, for main-lift sets. */
  pct: number | null;
  repMin: number;
  repMax: number;
  /** Reps, or seconds for timed holds. */
  timed: boolean;
  perSide: boolean;
  rir: number;
  restSec: number;
  /** Philip's single rep (or seconds) target inside repMin–repMax (Story 6 §6). Older sessions: absent. */
  targetReps?: number;
  /** The load is Philip's first-time estimate (no log for this exercise yet). */
  estimate?: boolean;
  /** The load is machine assistance (counterweight), not added weight. */
  assist?: boolean;
}

export interface PlannedExercise {
  slot: SessionSlot;
  exerciseId: ExerciseId;
  prescription: Prescribed[];
}

export type Trim = 'dropBulkRound' | 'restFloor' | 'slotBTwoSets';

export interface PlannedSession {
  cycle: number;
  block: Block;
  week: Week;
  day: Day;
  lift: LiftId;
  phase: Phase;
  exercises: PlannedExercise[];
  estMinutes: number;
  /** Trims applied to fit the 45-minute budget, in order. */
  trims: Trim[];
}

export interface SessionInput {
  cycle: number;
  week: Week;
  day: Day;
  /** Phase snapshotted when the cycle started. */
  phase: Phase;
  /** Current TMs (kg). */
  tms: Readonly<Record<LiftId, number>>;
  /** Owner's sticky swaps by slot key. */
  choices?: Readonly<Record<string, ExerciseId>>;
  /** Last logged sets for an accessory (any earlier session), or null. */
  lastSets?: (id: ExerciseId) => readonly LoggedAccessorySet[] | null;
  bar?: BarSetup;
  /** The unit the owner loads dumbbells and stacks in (drives accessory rounding and increments). */
  weightUnit?: PlateUnit;
  /** Extra rest (s) on every work set, accepted in a review (owner feedback, Nov 5). */
  restBonusSec?: number;
  /** Body weight (kg) for bodyweight-anchored starting estimates (Story 6 §6). */
  bodyWeightKg?: number | null;
}

export const SESSION_BUDGET_MIN = 45;

/* ---------------- Time model ---------------- */

export const TIME = {
  setupSec: 120,
  transitionSec: 60,
  switchSec: 15,
  mainShortSec: 45,
  mainLongSec: 60,
  accShortSec: 40,
  accLongSec: 50,
} as const;

function workSec(p: Prescribed): number {
  let sec: number;
  if (p.timed) sec = p.repMax;
  else if (p.kind === 'accessory') sec = p.repMax > 10 ? TIME.accLongSec : TIME.accShortSec;
  else sec = p.repMax > 5 ? TIME.mainLongSec : TIME.mainShortSec;
  return p.perSide ? sec * 2 : sec;
}

/** Estimated seconds for a session: setup, transitions, every set's work and rest; A1/A2 run as a superset. */
export function estimateSeconds(exercises: readonly PlannedExercise[]): number {
  let total = TIME.setupSec;
  const main = exercises.find((e) => e.slot === 'main');
  const a1 = exercises.find((e) => e.slot === 'A1');
  const a2 = exercises.find((e) => e.slot === 'A2');
  const b = exercises.find((e) => e.slot === 'B');
  const blocks = [main, a1 ?? a2, b].filter(Boolean).length;
  total += blocks * TIME.transitionSec;
  for (const p of main?.prescription ?? []) total += workSec(p) + p.restSec;
  const s1 = a1?.prescription ?? [];
  const s2 = a2?.prescription ?? [];
  for (let i = 0; i < Math.max(s1.length, s2.length); i++) {
    const x = s1[i];
    const y = s2[i];
    if (x && y) total += workSec(x) + workSec(y) + TIME.switchSec + Math.max(x.restSec, y.restSec);
    else if (x) total += workSec(x) + x.restSec;
    else if (y) total += workSec(y) + y.restSec;
  }
  for (const p of b?.prescription ?? []) total += workSec(p) + p.restSec;
  return total;
}

export const estimateMinutes = (exercises: readonly PlannedExercise[]): number =>
  Math.ceil(estimateSeconds(exercises) / 60);

/* ---------------- Builder ---------------- */

const MAIN_REST_FLOOR = 150;
const ACC_REST_FLOOR = 60;

function incrementKg(unit: PlateUnit): number {
  return unit === 'kg' ? 2.5 : 5 * KG_PER_LB;
}

function mainExercise(input: SessionInput, block: Block, lift: LiftId, bar: BarSetup): PlannedExercise {
  const tm = input.tms[lift];
  const sets = [...warmupSets(block, input.week), ...workSets(block, input.week, lift)];
  const id = block === 'D' && input.week !== DELOAD_WEEK ? MAIN_EXERCISE[lift].control : MAIN_EXERCISE[lift].normal;
  return {
    slot: 'main',
    exerciseId: id,
    prescription: sets.map((s, i) => ({
      order: i,
      kind: s.kind,
      kg: loadFor(tm * s.pct, bar).totalKg,
      pct: s.pct,
      repMin: s.reps,
      repMax: s.reps,
      timed: false,
      perSide: false,
      rir: s.rir,
      restSec: s.restSec,
    })),
  };
}

function accessory(input: SessionInput, block: Block, slot: Slot, unit: PlateUnit): PlannedExercise {
  const id = exerciseFor(input.day, slot, block, input.choices);
  const m = menuSlot(input.day, slot, block);
  const info = exerciseInfo(id);
  const rules = accessoryRules(block, input.week);
  let sets = rules.sets;
  if (input.week !== DELOAD_WEEK) {
    if (input.phase === 'lose' && slot === 'B') sets = 2;
    if (input.phase === 'gain' && slot !== 'B') sets += 1;
  }
  const last = input.lastSets?.(id) ?? null;
  const next = nextAccessoryKg(last, rules.sets, m.repMax, incrementKg(unit));
  let kg = next.kg === null ? null : input.week === DELOAD_WEEK ? next.kg : roundToStep(next.kg, unit);
  // Story 6 §6: no log for this exercise yet → Philip's starting estimate instead of "Your pick".
  let estimate = false;
  if (kg === null) {
    kg = startingKg(id, { tms: input.tms, bodyWeightKg: input.bodyWeightKg ?? null, unit });
    estimate = kg !== null;
  }
  const assist = startRule(id).kind === 'assist';
  const targetReps = nextTargetReps(last, m.repMin, m.repMax, next.change);
  return {
    slot,
    exerciseId: id,
    prescription: Array.from({ length: sets }, (_, i) => ({
      order: i,
      kind: 'accessory' as const,
      kg,
      pct: null,
      repMin: m.repMin,
      repMax: m.repMax,
      timed: !!info.timed,
      perSide: !!info.perSide,
      rir: rules.rir,
      restSec: rules.restSec,
      targetReps,
      ...(estimate ? { estimate: true } : {}),
      ...(assist ? { assist: true } : {}),
    })),
  };
}

/** Philip's orders for one day, trimmed to fit 45 minutes (§4.6 trim order). */
export function buildSession(input: SessionInput): PlannedSession {
  const block = blockForCycle(input.cycle);
  const lift = DAY_LIFT[input.day];
  const bar = input.bar ?? DEFAULT_BAR_SETUP;
  const unit = input.weightUnit ?? bar.plateUnit;
  let exercises: PlannedExercise[] = [
    mainExercise(input, block, lift, bar),
    accessory(input, block, 'A1', unit),
    accessory(input, block, 'A2', unit),
    accessory(input, block, 'B', unit),
  ];
  const bonus = input.restBonusSec ?? 0;
  if (bonus > 0) {
    exercises = exercises.map((e) => ({
      ...e,
      prescription: e.prescription.map((p) => (p.kind === 'warmup' ? p : { ...p, restSec: p.restSec + bonus })),
    }));
  }
  const trims: Trim[] = [];
  const over = () => estimateMinutes(exercises) > SESSION_BUDGET_MIN;
  const baseSets = accessoryRules(block, input.week).sets;

  if (over() && input.phase === 'gain' && input.week !== DELOAD_WEEK) {
    exercises = exercises.map((e) =>
      e.slot === 'A1' || e.slot === 'A2' ? { ...e, prescription: e.prescription.slice(0, baseSets) } : e,
    );
    trims.push('dropBulkRound');
  }
  if (over()) {
    exercises = exercises.map((e) => ({
      ...e,
      prescription: e.prescription.map((p) => ({
        ...p,
        restSec:
          p.kind === 'accessory'
            ? Math.min(p.restSec, ACC_REST_FLOOR)
            : p.kind === 'warmup'
              ? p.restSec
              : Math.min(p.restSec, MAIN_REST_FLOOR),
      })),
    }));
    trims.push('restFloor');
  }
  if (over()) {
    exercises = exercises.map((e) => (e.slot === 'B' ? { ...e, prescription: e.prescription.slice(0, 2) } : e));
    trims.push('slotBTwoSets');
  }
  return {
    cycle: input.cycle,
    block,
    week: input.week,
    day: input.day,
    lift,
    phase: input.phase,
    exercises,
    estMinutes: estimateMinutes(exercises),
    trims,
  };
}

/* ---------------- 4-week outlook for one lift (owner feedback, Nov 5) ---------------- */

export interface OutlookSet {
  kg: number;
  reps: number;
  plus: boolean;
}

export interface LiftOutlook {
  weeks: { week: Week; sets: OutlookSet[] }[];
  /** Next cycle's week 1, if every key set is hit (TM + the phase increment). */
  next: { block: Block; tmKg: number; sets: OutlookSet[] };
}

const outlookSets = (block: Block, week: Week, lift: LiftId, tm: number, bar: BarSetup): OutlookSet[] =>
  workSets(block, week, lift).map((s) => ({ kg: loadFor(tm * s.pct, bar).totalKg, reps: s.reps, plus: s.kind === 'amrap' }));

/** The main lift's work sets for all 4 weeks of this cycle, plus next cycle's first week. */
export function liftOutlook(lift: LiftId, tmKg: number, cycle: number, phase: Phase, bar: BarSetup = DEFAULT_BAR_SETUP): LiftOutlook {
  const block = blockForCycle(cycle);
  const nextBlock = blockForCycle(cycle + 1);
  const nextTm = tmKg + tmIncrement(lift, phase);
  return {
    weeks: ([1, 2, 3, 4] as const).map((week) => ({ week, sets: outlookSets(block, week, lift, tmKg, bar) })),
    next: { block: nextBlock, tmKg: nextTm, sets: outlookSets(nextBlock, 1, lift, nextTm, bar) },
  };
}
