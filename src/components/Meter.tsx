import type { CSSProperties } from 'react';
import { eatenPercent, meterLevel, type MeterMode, type MeterTone } from '../lib/meter';

export interface MeterProps {
  /** Accessible name of the progress bar. */
  label: string;
  /** Eaten so far and the target. */
  value: number;
  max: number;
  /** drain = ceiling (empties like a health bar); fill = minimum (fills up). */
  mode: MeterMode;
  /** Tone from lib/remaining.ts; decides "over" and "reached" exactly like the card text. */
  tone?: MeterTone;
  size?: 'hero' | 'row';
  /** Spoken value, e.g. "620 kcal left". */
  valueText?: string;
}

/**
 * Capsule meter (D-022). aria-valuenow stays "percent eaten" as before; the drawing shows what is
 * left for ceilings. Color is never the only signal — the card always prints left / over / to go.
 */
export function Meter({ label, value, max, mode, tone, size = 'row', valueText }: MeterProps) {
  const { fraction, level } = meterLevel(mode, value, max, tone);
  const style = { '--pm-fill': String(fraction) } as CSSProperties;
  return (
    <div
      className={`pm-meter pm-meter-${size} pm-meter-${level}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={eatenPercent(value, max)}
      aria-valuetext={valueText}
    >
      <span className="pm-meter-fill" style={style} />
    </div>
  );
}
