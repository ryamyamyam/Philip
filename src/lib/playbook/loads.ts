/**
 * PB-8.4: the plausibility check every load Philip shows passes first (Story 16, D-039). Pure, tested.
 *
 * 1. Anchor: the exercise's own e1RM from logged sets; else the ratio table × the related Big-4 1RM (or
 *    body weight). An own e1RM far above the ratio table's outer band is ignored: it is far more likely a
 *    logging slip (a total typed as per hand, the wrong unit) than real strength, and trusting it is how
 *    85 lb per hand on walking lunges happened.
 * 2. Convert: load = e1RM ÷ (1 + (reps + RIR) ÷ 30) (inverse Epley).
 * 3. Per hand for dumbbells; a body-weight cap per hand for dumbbell lifts.
 * 4. Inside the band → keep it. Adjustments move by RIR math (too heavy = the load for +2 RIR), never by
 *    a flat percent.
 * 5. Outside the band → re-derive from step 1 and say the old number was wrong and why.
 * 6. The lifter can always push back or type his own number.
 */
import { ACCESSORY_RATIOS, e1rmEpley, loadForEffort, PB_LOADS, PB_WAVE } from './rules';
import { rirShift } from './effort';
export { rirShift, shortSetLoad } from './effort';

export type Big4 = 'squat' | 'bench' | 'rdl' | 'ohp';

/** What the check knows about the lifter. */
export interface LoadProfile {
  bodyWeightKg: number | null;
  /** Big-4 1RM estimates (kg), e.g. TM ÷ 0.9 or a logged e1RM. */
  oneRm: Partial<Record<Big4, number | null>>;
}

/** One logged set of this exercise (any earlier session). `rir` = what was ordered, when known. */
export interface HistorySet {
  kg: number | null;
  reps: number | null;
  done: boolean;
  rir?: number;
}

export interface ExerciseTraits {
  /** Two dumbbells, the weight is per hand. */
  pair?: boolean;
}

export interface Band {
  /** The load the anchor says fits these reps + RIR. */
  target: number;
  min: number;
  max: number;
  anchor: 'own' | 'ratio';
  /** The anchor's e1RM (per hand for dumbbells). */
  e1rm: number;
  /** Per-hand body-weight cap, when it applies. */
  capKg: number | null;
  /** An own e1RM existed but was ignored as implausible. */
  ownIgnored: boolean;
}

export type LoadReason = 'aboveBand' | 'belowBand' | 'overBodyWeight';

export interface LoadVerdict {
  status: 'ok' | 'corrected' | 'unchecked';
  /** The load to show (corrected when status is 'corrected'). */
  kg: number | null;
  fromKg: number | null;
  reason: LoadReason | null;
  pbId: 'PB-8.4';
  band: Band | null;
}

/** The Big-4 TM is this share of the 1RM (PB-4.4). */
const TM_SHARE = PB_WAVE.tmShare;
/** BW fallback 1RMs when a Big-4 lift has no TM yet (conservative; never stored). */
const BW_ONE_RM: Readonly<Record<Big4, number>> = { squat: 1.0 / TM_SHARE, bench: 0.75 / TM_SHARE, rdl: 1.0 / TM_SHARE, ohp: 0.45 / TM_SHARE };

const ratioOf = (id: string): readonly [Big4 | 'bw', number] | null => (ACCESSORY_RATIOS as Record<string, readonly [Big4 | 'bw', number]>)[id] ?? null;

/** Expected e1RM of an accessory from the ratio table (per hand for dumbbells), or null with nothing to anchor on. */
export function ratioE1rm(id: string, profile: LoadProfile): number | null {
  const r = ratioOf(id);
  if (!r) return null;
  const [anchor, ratio] = r;
  const bw = profile.bodyWeightKg !== null && profile.bodyWeightKg > 0 ? profile.bodyWeightKg : null;
  let tm: number | null;
  if (anchor === 'bw') tm = bw;
  else {
    const one = profile.oneRm[anchor] ?? null;
    tm = one !== null && one > 0 ? one * TM_SHARE : bw !== null ? bw * BW_ONE_RM[anchor] * TM_SHARE : null;
  }
  if (tm === null) return null;
  return tm * ratio * (1 + PB_LOADS.startEffort / 30);
}

/**
 * Best e1RM from this exercise's logged sets, or null. Qualifying sets (PB-8.1, reps + RIR ≤ 12) first;
 * when only high-rep sets exist they still anchor the check (rougher, but his own numbers beat a ratio).
 */
export function ownE1rm(history: readonly HistorySet[], defaultRir: number): number | null {
  let best = 0;
  let rough = 0;
  for (const s of history) {
    if (!s.done || s.kg === null || s.reps === null || s.kg <= 0 || s.reps < 1) continue;
    const rir = Math.max(0, s.rir ?? defaultRir);
    const e = e1rmEpley(s.kg, s.reps, rir);
    if (e !== null) best = Math.max(best, e);
    else rough = Math.max(rough, s.kg * (1 + (s.reps + rir) / 30));
  }
  return best > 0 ? best : rough > 0 ? rough : null;
}

function capFor(id: string, traits: ExerciseTraits, profile: LoadProfile): number | null {
  if (!traits.pair || profile.bodyWeightKg === null || profile.bodyWeightKg <= 0) return null;
  const r = ratioOf(id);
  if (!r) return null;
  const [anchor, ratio] = r;
  const c = PB_LOADS.bwCapPerHand;
  const share = anchor === 'squat' || anchor === 'rdl' ? c.lowerUnilateral : ratio >= 0.2 ? c.upperCompound : c.isolation;
  return profile.bodyWeightKg * share;
}

/** The plausible band for this exercise at these reps + RIR, or null when the exercise has no load rule. */
export function plausibleBand(id: string, reps: number, rir: number, profile: LoadProfile, history: readonly HistorySet[], traits: ExerciseTraits = {}): Band | null {
  const expected = ratioE1rm(id, profile);
  if (expected === null || !(reps >= 1)) return null;
  const outerHigh = expected * PB_LOADS.ratioBand.high;
  const own = ownE1rm(history, rir);
  const ownOk = own !== null && own <= outerHigh;
  const e1rm = ownOk ? own : expected;
  const capKg = capFor(id, traits, profile);
  let target = loadForEffort(e1rm, reps, rir);
  const outerMax = loadForEffort(outerHigh, reps, rir);
  if (capKg !== null) target = Math.min(target, capKg);
  const tol = PB_LOADS.tolerance;
  const max = Math.min(target * (1 + tol), outerMax, capKg ?? Infinity);
  const min = Math.min(target * (1 - tol), max);
  return { target, min, max, anchor: ownOk ? 'own' : 'ratio', e1rm, capKg, ownIgnored: own !== null && !ownOk };
}

/**
 * Checks one load. `round` rounds to what the gym can load (dumbbell/plate steps); `step` is that
 * smallest step in kg, used as slack so a rounded number on the band's edge still passes.
 */
export function checkLoad(
  id: string,
  kg: number | null,
  reps: number,
  rir: number,
  profile: LoadProfile,
  history: readonly HistorySet[],
  round: (kg: number) => number,
  step: number,
  traits: ExerciseTraits = {},
): LoadVerdict {
  const base = { pbId: 'PB-8.4' as const, fromKg: kg };
  if (kg === null || !(kg > 0)) return { ...base, status: 'unchecked', kg, reason: null, band: null };
  const band = plausibleBand(id, reps, rir, profile, history, traits);
  if (!band) return { ...base, status: 'unchecked', kg, reason: null, band: null };
  const slack = step / 2 + 1e-6;
  if (kg >= band.min - slack && kg <= band.max + slack) return { ...base, status: 'ok', kg, reason: null, band };
  const fixed = fitRound(band.target, band, round, step);
  const reason: LoadReason = kg > band.max ? (band.capKg !== null && kg > band.capKg ? 'overBodyWeight' : 'aboveBand') : 'belowBand';
  return { ...base, status: 'corrected', kg: fixed, reason, band };
}

/** Rounds a load and keeps it inside the band where the gym's steps allow (never above the band). */
function fitRound(kg: number, band: Band, round: (kg: number) => number, step: number): number {
  let r = round(kg);
  if (r > band.max + 1e-6) r = round(r - step);
  return Math.max(step, r);
}

export interface PushbackResult {
  kg: number;
  /** The original was outside the band: rebuilt from scratch. */
  corrected: boolean;
  reason: LoadReason | null;
}

/**
 * The lifter says a number is wrong ("too heavy" / "too light"). Philip re-checks the original first:
 * implausible → corrected from scratch; plausible → the load for ±2 RIR, moved at least one step.
 */
export function pushback(
  direction: 'heavy' | 'light',
  id: string,
  kg: number,
  reps: number,
  rir: number,
  profile: LoadProfile,
  history: readonly HistorySet[],
  round: (kg: number) => number,
  step: number,
  traits: ExerciseTraits = {},
): PushbackResult {
  const v = checkLoad(id, kg, reps, rir, profile, history, round, step, traits);
  if (v.status === 'corrected' && v.kg !== null && (direction === 'heavy' ? v.kg < kg : v.kg > kg)) return { kg: v.kg, corrected: true, reason: v.reason };
  const delta = direction === 'heavy' ? PB_LOADS.pushbackRir : -PB_LOADS.pushbackRir;
  let next = round(rirShift(kg, reps, rir, delta));
  if (direction === 'heavy' && next >= kg) next = round(kg - step);
  if (direction === 'light' && next <= kg) next = round(kg + step);
  return { kg: Math.max(step, next), corrected: false, reason: null };
}

/* ---------------- Loads inside Philip's words ---------------- */

const LOAD_IN_TEXT = /(\d+(?:[.,]\d+)?)\s*(kg|lb|lbs|pounds?)\b/i;
const KG_PER_LB = 0.45359237;

export interface TextLoadFix {
  exerciseId: string;
  fromKg: number;
  toKg: number;
}

/**
 * Story 16 §3.3: a chat reply that names an exercise and a load gets the same check. The first load
 * within ~60 characters after an exercise's name is checked at that exercise's usual reps; an
 * implausible one is replaced in the text (in the unit Philip wrote) and marked as corrected.
 */
export function fixTextLoads(
  text: string,
  names: readonly { id: string; name: string; reps: number; rir: number; traits?: ExerciseTraits }[],
  profile: LoadProfile,
  history: (id: string) => readonly HistorySet[],
  round: (kg: number) => number,
  step: number,
  correctedWord: string,
): { text: string; fixes: TextLoadFix[] } {
  let out = text;
  const fixes: TextLoadFix[] = [];
  for (const n of names) {
    const at = out.toLowerCase().indexOf(n.name.toLowerCase());
    if (at < 0 || n.name.length < 4) continue;
    const from = at + n.name.length;
    const window = out.slice(from, from + 60);
    const m = LOAD_IN_TEXT.exec(window);
    if (!m || m.index === undefined) continue;
    const value = Number((m[1] ?? '').replace(',', '.'));
    const lb = !/^kg$/i.test(m[2] ?? '');
    const kg = lb ? value * KG_PER_LB : value;
    const v = checkLoad(n.id, kg, n.reps, n.rir, profile, history(n.id), round, step, n.traits);
    if (v.status !== 'corrected' || v.kg === null) continue;
    const shown = lb ? Math.round(v.kg / KG_PER_LB) : Math.round(v.kg * 10) / 10;
    const repl = `${shown} ${lb ? 'lb' : 'kg'} (${correctedWord})`;
    const start = from + m.index;
    out = out.slice(0, start) + repl + out.slice(start + m[0].length);
    fixes.push({ exerciseId: n.id, fromKg: kg, toKg: v.kg });
  }
  return { text: out, fixes };
}
