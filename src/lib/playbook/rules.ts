/**
 * Philip's Playbook as code (Story 16, D-039). The numbers the app decides with, one place, by PB ID.
 * Human-readable version: docs/philip/PLAYBOOK.md (not bundled). Pure constants and tiny helpers only.
 *
 * Every constant here is cited by its playbook ID. Other modules (lib/targets.ts, lib/goal/*,
 * lib/training/*) read from this file; `rules.test.ts` guards that the changed values don't reappear as
 * stray literals elsewhere.
 */
import type { Sex } from '../../db/types';

export type PbPhase = 'lose' | 'maintain' | 'gain';

/** PB-1: phase lines (body fat %). */
export const PB_PHASE = {
  /** PB-1.1: a cut is recommended at or above this BF %. */
  cutAtBf: { male: 18, female: 24 } as Readonly<Record<Sex, number>>,
  /** PB-1.2: Philip's own default below the cut line: bulk at or below this; maintain/recomp in between. */
  bulkAtOrBelowBf: { male: 12, female: 21 } as Readonly<Record<Sex, number>>,
  /** PB-1.3: training age under this (years) → recomp/maintain is a good default. */
  beginnerYears: 1,
  /** PB-1.4: the mini-cut suggested before a bulk at or above the cut line (weeks). */
  miniCutWeeks: [2, 6] as const,
} as const;

export const cutLine = (sex: Sex | null): number => PB_PHASE.cutAtBf[sex ?? 'male'];
export const bulkLine = (sex: Sex | null): number => PB_PHASE.bulkAtOrBelowBf[sex ?? 'male'];

/** PB-2.3: kcal per kg of body-weight change (rough average). daily kcal = rate % / 100 × kg × 7,700 ÷ 7. */
export const KCAL_PER_KG = 7700;

/** PB-2.3: daily kcal change for a weekly rate (% of body weight, signed). */
export const kcalForRatePct = (ratePct: number, weightKg: number): number => ((ratePct / 100) * weightKg * KCAL_PER_KG) / 7;

export interface PbRateRange {
  /** % of body weight per week (signed). */
  min: number;
  max: number;
  def: number;
}

export type TrainingAgeBand = 'lt1' | '1to3' | 'gt3';

/** PB-2.3: training age (years of consistent lifting) → band. Unknown → the middle band. */
export function trainingAgeBand(years: number | null | undefined): TrainingAgeBand {
  if (years === null || years === undefined || !Number.isFinite(years)) return '1to3';
  if (years < 1) return 'lt1';
  return years <= 3 ? '1to3' : 'gt3';
}

/** PB-2.3: weekly rate bands (% of body weight). */
export const PB_RATE = {
  cut: { min: -0.75, max: -0.5, def: -0.5 },
  /** Above `highBf` % body fat a cut may go up to −1 %/week. */
  cutHighBf: { min: -1.0, max: -0.5, def: -0.75 },
  /** Lean (below `lean[sex]` % BF): slower. */
  cutLean: { min: -0.5, max: -0.25, def: -0.35 },
  bulk: {
    lt1: { min: 0.25, max: 0.5, def: 0.35 },
    '1to3': { min: 0.2, max: 0.35, def: 0.3 },
    gt3: { min: 0.1, max: 0.2, def: 0.15 },
  } as Readonly<Record<TrainingAgeBand, PbRateRange>>,
  maintain: { min: -0.1, max: 0.1, def: 0 },
  highBf: 25,
  lean: { male: 12, female: 21 } as Readonly<Record<Sex, number>>,
} as const;

export interface RateContext {
  trainingYears?: number | null;
  bfPct?: number | null;
  sex?: Sex | null;
}

/** PB-2.3: the weekly-rate band for a phase, from training age (bulk) and body fat (cut). */
export function ratePctFor(phase: PbPhase, ctx: RateContext = {}): PbRateRange {
  if (phase === 'maintain') return PB_RATE.maintain;
  if (phase === 'gain') return PB_RATE.bulk[trainingAgeBand(ctx.trainingYears)];
  const bf = ctx.bfPct ?? null;
  if (bf !== null && bf > PB_RATE.highBf) return PB_RATE.cutHighBf;
  if (bf !== null && bf < PB_RATE.lean[ctx.sex ?? 'male']) return PB_RATE.cutLean;
  return PB_RATE.cut;
}

/** PB-3.1: protein g/kg body weight (cut above `lbmAboveBf`: g/kg of lean mass). */
export const PB_PROTEIN = {
  gain: { min: 1.6, max: 2.0, def: 1.8 },
  maintain: { min: 1.6, max: 2.0, def: 1.6 },
  lose: { min: 2.0, max: 2.4, def: 2.2 },
  /** Cut above this BF %: protein per kg of lean mass instead. */
  lbmAboveBf: 25,
  loseLbm: { min: 2.3, max: 2.7, def: 2.5 },
} as const;

/** PB-3.2 / PB-3.4: fat. */
export const PB_FAT = {
  /** Floor: never below the higher of this g/kg and `floorPct` of calories. */
  floorGPerKg: 0.6,
  floorPct: 0.2,
  /** Standard band (g/kg); the flat plan sits at `defaultPct` of calories inside it. */
  standardGPerKg: [0.7, 1.0] as const,
  defaultPct: 0.25,
  /** PB-3.4 rest days: fat g/kg. */
  restDayGPerKg: { min: 0.9, max: 1.1, def: 1.0 },
} as const;

/** PB-3.2: the fat floor (g) for these calories and this weight. */
export const fatFloorG = (kcal: number, weightKg: number): number => Math.max(PB_FAT.floorGPerKg * weightKg, (PB_FAT.floorPct * kcal) / 9);

/** PB-3.4: carb cycling starting band (shares of the flat plan's carbs). */
export const PB_CARB_CYCLE = {
  /** Rest days: carbs down this share. */
  restCarbDown: { min: 0.25, max: 0.35, def: 0.3 },
  /** Gym days: carbs up (the solver's result is checked against this band only for display). */
  gymCarbUp: { min: 0.2, max: 0.3 },
  /** Share of the gym day's carbs around training. */
  aroundTraining: [0.3, 0.4] as const,
  /** On by default for a cut, or for 1+ years of lifting on this many days a week or more. */
  onFromDays: 4,
} as const;

/** PB-3.4: is carb cycling Philip's default here? (The owner's switch still wins.) */
export function carbCyclingDefault(phase: PbPhase, trainingYears: number | null | undefined, days: number): boolean {
  if (phase === 'lose') return true;
  return trainingAgeBand(trainingYears) !== 'lt1' && days >= PB_CARB_CYCLE.onFromDays;
}

/** PB-7: guardrails. */
export const PB_GUARD = {
  /** PB-7.1 */
  calorieFloor: { male: 1500, female: 1200 } as Readonly<Record<Sex, number>>,
  /** PB-7.2: (intake − exercise kcal) ÷ lean mass, kcal/kg. */
  energyAvailabilityMin: 30,
  /** PB-7.2: exercise energy per lifting session used for the check (rough estimate, practice). */
  sessionKcal: 300,
  /** PB-7.3: max loss % of body weight a week (and above BMI 35). */
  maxLossPct: 1.0,
  maxLossPctHighBmi: 1.25,
  highBmi: 35,
  /** Max gain a week: the top of the fastest bulk band (PB-2.3). */
  maxGainPct: 0.5,
  /** PB-7.4 */
  lowBmi: 18.5,
  minTargetBf: { male: 5, female: 12 } as Readonly<Record<Sex, number>>,
} as const;

/** PB-4.4 / PB-4.5: progression increments (kg). */
export const PB_INCREMENTS = {
  upperIsolation: [1.25, 2.5] as const,
  upperCompound: 2.5,
  lowerCompound: [2.5, 5] as const,
} as const;

/** PB-4.4: the Big 4 run a 4-week %TM wave; week 4 deloads. */
export const PB_WAVE = { weeks: 4, deloadWeek: 4, tmShare: 0.9 } as const;

/** PB-8: loads, e1RM and plausibility. */
export const PB_LOADS = {
  /** PB-8.1: sets count for e1RM only when reps + RIR is at most this. */
  e1rmMaxRepsPlusRir: 12,
  /** PB-8.4 step 4: "too heavy" = the load for +2 RIR; "too easy" = −2 RIR. */
  pushbackRir: 2,
  /** RIR a set is assumed to have had when the lifter fell short of the order. */
  shortSetRir: 0,
  /**
   * PB-8.4: the ratio table below is the share of the anchor lift's TM an accessory starts at, aimed at
   * 2–3 RIR around 10 reps. As an e1RM: start × (1 + startEffort ÷ 30).
   */
  startEffort: 12.5,
  /** Outer sanity band around the ratio-table e1RM. An own e1RM above `high` is ignored (likely a logging error). */
  ratioBand: { low: 0.5, high: 1.75 },
  /** Inside the band: a shown load within this share of the anchored load passes. */
  tolerance: 0.15,
  /** PB-8.4 step 3: per-hand cap as a share of body weight, by kind of dumbbell lift. */
  bwCapPerHand: { lowerUnilateral: 0.4, upperCompound: 0.5, isolation: 0.3 },
  /** PB-8.2: the combined strength date needs this many sessions per Big-4 lift. */
  minSessionsForDate: 3,
  /** PB-8.2: the trend uses up to this many recent sessions. */
  trendSessions: 6,
  /** PB-8.5: a change smaller than this (days) "barely moves it". */
  barelyDays: 3,
  /** Exercise card status: within this share of the plan = on track. */
  onTrackBand: 0.03,
} as const;

/** PB-8.1: Epley with RIR. Null when the set doesn't qualify (reps + RIR above the cutoff, or no reps). */
export function e1rmEpley(kg: number, reps: number, rir = 0): number | null {
  if (!(kg > 0) || !(reps >= 1)) return null;
  const effort = reps + Math.max(0, rir);
  if (effort > PB_LOADS.e1rmMaxRepsPlusRir) return null;
  return kg * (1 + effort / 30);
}

/** PB-8.4 step 2: the load for these reps + RIR from an e1RM (inverse Epley). */
export const loadForEffort = (e1rm: number, reps: number, rir: number): number => e1rm / (1 + (reps + Math.max(0, rir)) / 30);

/**
 * PB-8.4: starting ratios (share of the anchor lift's TM, per hand for dumbbells, per stack for cables
 * and machines). Philip's coaching defaults (practice), deliberately conservative. `bw` = body weight.
 */
export const ACCESSORY_RATIOS = {
  // Day 1: quads, hamstrings, core
  'bulgarian-split-squat': ['squat', 0.12],
  'hack-squat': ['squat', 0.5],
  'single-leg-leg-press': ['squat', 0.5],
  'leg-press': ['squat', 1.2],
  'pendulum-squat': ['squat', 0.5],
  'ffe-reverse-lunge': ['squat', 0.12],
  'walking-lunge': ['squat', 0.12],
  'goblet-squat': ['squat', 0.18],
  'heel-raised-db-squat': ['squat', 0.12],
  'belt-squat': ['squat', 0.6],
  'lying-leg-curl': ['rdl', 0.25],
  'seated-leg-curl': ['rdl', 0.25],
  'single-leg-seated-curl': ['rdl', 0.125],
  'single-leg-leg-curl': ['rdl', 0.125],
  'cable-crunch': ['bw', 0.4],
  'machine-crunch': ['bw', 0.4],
  'pallof-press': ['bw', 0.12],
  // Day 2: rows, chest, rear delts, triceps
  'cs-db-row': ['bench', 0.25],
  'seal-row': ['bench', 0.5],
  'cs-tbar-row': ['bench', 0.5],
  'seated-cable-row': ['bench', 0.6],
  'machine-row': ['bench', 0.6],
  'wide-cable-row': ['bench', 0.5],
  'barbell-row': ['bench', 0.6],
  'pendlay-row': ['bench', 0.6],
  'tbar-row': ['bench', 0.5],
  'single-arm-db-row': ['bench', 0.3],
  'single-arm-cable-row': ['bench', 0.3],
  'meadows-row': ['bench', 0.3],
  'incline-db-press': ['bench', 0.28],
  'incline-bb-press': ['bench', 0.65],
  'incline-machine-press': ['bench', 0.6],
  'machine-chest-press': ['bench', 0.6],
  'db-bench-press': ['bench', 0.3],
  'close-grip-bench': ['bench', 0.65],
  'db-fly': ['bench', 0.12],
  'cable-fly': ['bench', 0.1],
  'pec-deck': ['bench', 0.4],
  'face-pull': ['bench', 0.25],
  'cable-rear-delt-fly': ['bench', 0.08],
  'rear-delt-fly': ['bench', 0.07],
  'reverse-pec-deck': ['bench', 0.3],
  'prone-y-raise': ['bench', 0.03],
  'triceps-pushdown': ['bench', 0.3],
  'overhead-cable-extension': ['bench', 0.25],
  'db-kickback': ['bench', 0.08],
  // Day 3: glutes, low back, single leg, calves, core
  'hip-thrust': ['rdl', 0.8],
  'bb-glute-bridge': ['rdl', 0.8],
  'machine-glute-bridge': ['rdl', 0.8],
  'back-extension': ['rdl', 0.1],
  'reverse-hyper': ['rdl', 0.25],
  'good-morning': ['rdl', 0.4],
  'ssb-good-morning': ['rdl', 0.4],
  'cable-pull-through': ['rdl', 0.25],
  'kb-swing': ['rdl', 0.2],
  'reverse-lunge': ['squat', 0.12],
  'split-squat': ['squat', 0.12],
  'step-up': ['squat', 0.12],
  'single-leg-rdl': ['rdl', 0.15],
  'b-stance-rdl': ['rdl', 0.2],
  'cable-sl-rdl': ['rdl', 0.15],
  'db-reverse-lunge': ['squat', 0.12],
  'deficit-reverse-lunge': ['squat', 0.1],
  'lateral-lunge': ['squat', 0.1],
  'standing-calf-raise': ['squat', 0.6],
  'leg-press-calf-raise': ['squat', 0.8],
  'smith-calf-raise': ['squat', 0.6],
  'seated-calf-raise': ['squat', 0.35],
  'single-leg-db-calf-raise': ['squat', 0.12],
  'weighted-plank': ['bw', 0.15],
  'tempo-calf-raise': ['squat', 0.5],
  'single-leg-calf-raise': ['squat', 0.12],
  'donkey-calf-raise': ['squat', 0.6],
  // Day 4: vertical pull, side delts, biceps
  'assisted-pull-up': ['bw', 0.3],
  'lat-pulldown': ['bw', 0.6],
  'single-arm-pulldown': ['bw', 0.3],
  'machine-pulldown': ['bw', 0.6],
  'close-grip-pulldown': ['bw', 0.65],
  'neutral-pulldown': ['bw', 0.6],
  'single-arm-cable-pulldown': ['bw', 0.3],
  'machine-high-row': ['bw', 0.6],
  'db-lateral-raise': ['ohp', 0.18],
  'cable-lateral-raise': ['ohp', 0.1],
  'machine-lateral-raise': ['ohp', 0.4],
  'cable-y-raise': ['ohp', 0.08],
  'lean-away-lateral-raise': ['ohp', 0.1],
  'btb-cable-lateral-raise': ['ohp', 0.08],
  'seated-db-lateral-raise': ['ohp', 0.16],
  'db-curl': ['ohp', 0.25],
  'cable-curl': ['ohp', 0.5],
  'ez-curl': ['ohp', 0.6],
  'preacher-curl': ['ohp', 0.5],
  'hammer-curl': ['ohp', 0.28],
  'rope-hammer-curl': ['ohp', 0.5],
  'cross-body-hammer-curl': ['ohp', 0.28],
  'incline-db-curl': ['ohp', 0.2],
  'bayesian-curl': ['ohp', 0.2],
  'spider-curl': ['ohp', 0.2],
} as const satisfies Record<string, readonly ['squat' | 'bench' | 'rdl' | 'ohp' | 'bw', number]>;

