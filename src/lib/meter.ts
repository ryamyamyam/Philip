/**
 * Meter levels (D-022). Presentation only — the meaning (left / over / to go / reached) and its
 * tone come from lib/remaining.ts; this only decides how full the bar is drawn and its color step.
 *
 *  - drain (ceilings: calories, fat, carbs when cutting or maintaining) empties like a health bar:
 *    full > 40% left, mid 15–40%, low < 15%, over when past the target.
 *  - fill (minimums: protein always, everything when bulking) fills up; done once reached.
 */
export type MeterMode = 'drain' | 'fill';
export type MeterLevel = 'full' | 'mid' | 'low' | 'over' | 'up' | 'done';
export type MeterTone = 'success' | 'warning' | 'danger';

export const METER_MID = 0.4;
export const METER_LOW = 0.15;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function meterLevel(
  mode: MeterMode,
  value: number,
  max: number,
  tone?: MeterTone,
): { fraction: number; level: MeterLevel } {
  const eaten = max > 0 ? value / max : 0;
  if (mode === 'fill') {
    const done = tone ? tone === 'success' : max > 0 && value >= max;
    return { fraction: done ? 1 : clamp01(eaten), level: done ? 'done' : 'up' };
  }
  const over = tone ? tone === 'danger' : max > 0 && value > max;
  if (over) return { fraction: 1, level: 'over' };
  const left = max > 0 ? clamp01(1 - eaten) : 0;
  return { fraction: left, level: left > METER_MID ? 'full' : left > METER_LOW ? 'mid' : 'low' };
}

/** Share eaten as a whole percent (0–100), for aria-valuenow — same as the previous bars. */
export function eatenPercent(value: number, max: number): number {
  return max > 0 ? Math.round(clamp01(value / max) * 100) : 0;
}
