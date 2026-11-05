/**
 * Bar and plate loader (Story 5 §4.7, T-012). Pure: no React, no DB.
 * The gym's bars are in kg and its plates may be in lb, so every barbell order is rounded to a
 * weight that can actually be loaded, and the per-side plate list is shown with it.
 */
export const KG_PER_LB = 0.45359237;

export type PlateUnit = 'kg' | 'lb';

export interface BarSetup {
  /** The empty bar, in kg (a 45 lb bar is 20.41 kg). */
  barKg: number;
  plateUnit: PlateUnit;
  /** Plate sizes available, in `plateUnit` (one pair of each size is assumed to be unlimited). */
  plates: readonly number[];
}

export const LB_PLATES = [45, 35, 25, 10, 5, 2.5] as const;
export const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25] as const;
export const DEFAULT_BAR_SETUP: BarSetup = { barKg: 20, plateUnit: 'lb', plates: LB_PLATES };

export const toUnit = (kg: number, unit: PlateUnit): number => (unit === 'kg' ? kg : kg / KG_PER_LB);
export const fromUnit = (value: number, unit: PlateUnit): number => (unit === 'kg' ? value : value * KG_PER_LB);

export interface Load {
  /** What is actually on the bar, in kg. */
  totalKg: number;
  /** Plates for one side, heaviest first, in `unit`. Empty = bar only. */
  perSide: number[];
  unit: PlateUnit;
}

/** Integer scale so that 1.25 and 2.5 become whole numbers. */
const SCALE = 100;

const reachCache = new Map<string, Uint8Array>();

/** Which per-side weights (scaled) can be made from the plate sizes. Cached per plate set. */
function reachable(sizes: readonly number[], maxScaled: number): Uint8Array {
  const key = sizes.join(',');
  const cached = reachCache.get(key);
  if (cached && cached.length > maxScaled) return cached;
  const ok = computeReachable(sizes, Math.max(maxScaled, 2 * (cached?.length ?? 0), 40000));
  reachCache.set(key, ok);
  return ok;
}

function computeReachable(sizes: readonly number[], maxScaled: number): Uint8Array {
  const ok = new Uint8Array(maxScaled + 1);
  ok[0] = 1;
  for (let w = 1; w <= maxScaled; w++) {
    for (const s of sizes) if (s <= w && ok[w - s]) { ok[w] = 1; break; }
  }
  return ok;
}

/**
 * The loadable weight nearest to `targetKg` (ties go to the lighter load) and its plates.
 * Never below the empty bar.
 */
export function loadFor(targetKg: number, setup: BarSetup = DEFAULT_BAR_SETUP): Load {
  const unit = setup.plateUnit;
  const barU = toUnit(setup.barKg, unit);
  const sideTargetU = Math.max(0, (toUnit(targetKg, unit) - barU) / 2);
  const biggest = Math.max(0, ...setup.plates);
  const maxScaled = Math.ceil((sideTargetU + biggest) * SCALE);
  const sizes = [...setup.plates].map((p) => Math.round(p * SCALE)).filter((p) => p > 0).sort((a, b) => b - a);
  const ok = reachable(sizes, maxScaled);
  const goal = sideTargetU * SCALE;
  let best = 0;
  let bestDiff = Infinity;
  // Search a window of one big plate around the goal (from 0 if nothing in it is loadable).
  const from = Math.max(0, Math.floor(goal) - (sizes[0] ?? 0));
  for (let w = from; w <= maxScaled; w++) {
    if (w > goal + bestDiff) break;
    if (!ok[w]) continue;
    const diff = Math.abs(w - goal);
    if (diff < bestDiff - 1e-9) {
      best = w;
      bestDiff = diff;
    }
  }
  if (bestDiff === Infinity) best = 0;
  // Heaviest plates first, as you'd load them: take the biggest plate that still leaves a loadable rest.
  const perSide: number[] = [];
  for (let w = best; w > 0; ) {
    const p = sizes.find((s) => s <= w && ok[w - s]);
    if (p === undefined) break;
    perSide.push(p / SCALE);
    w -= p;
  }
  const totalKg = setup.barKg + 2 * fromUnit(best / SCALE, unit);
  return { totalKg, perSide, unit };
}

/** Rounds a dumbbell or machine weight to the nearest step (2.5 kg, or 5 lb when the user works in lb). */
export function roundToStep(kg: number, unit: PlateUnit): number {
  if (unit === 'kg') return Math.round(kg / 2.5) * 2.5;
  return Math.round(toUnit(kg, 'lb') / 5) * 5 * KG_PER_LB;
}

/** Both units for display: kg to 0.1, lb to whole pounds. */
export function dualUnits(kg: number): { kg: number; lb: number } {
  return { kg: Math.round(kg * 10) / 10, lb: Math.round(toUnit(kg, 'lb')) };
}
