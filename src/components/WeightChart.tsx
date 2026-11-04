import type { WeightEntry, YMD } from '../db/types';
import { useWidth } from '../hooks/useWidth';
import { t } from '../i18n';
import { addDays, daysBetween } from '../lib/date';
import { fmtDate, fmtNum } from '../lib/format';
import { expectedWeightOn, type WeightPlanLine } from '../lib/weight';

const H = 150;
const PAD = { top: 10, right: 8, bottom: 24, left: 52 };
const MIN_SPAN_DAYS = 14;

/**
 * Actual weight (dots + line) against the expected line from the plan (dashed). Inline SVG,
 * same SVG conventions as the old calorie chart. Colors follow D-022 (sky line, ink outline, slate plan). `toUnit` converts kg to the display unit.
 */
export function WeightChart({
  entries,
  line,
  today,
  toUnit,
  unit,
}: {
  entries: WeightEntry[];
  line: WeightPlanLine | null;
  today: YMD;
  toUnit: (kg: number) => number;
  unit: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const firstDates = [today, ...(entries[0] ? [entries[0].date] : []), ...(line ? [line.startDate] : [])].sort();
  let start = firstDates[0]!;
  const lastEntry = entries[entries.length - 1]?.date ?? today;
  const end = lastEntry > today ? lastEntry : today;
  if (daysBetween(start, end) < MIN_SPAN_DAYS) start = addDays(end, -MIN_SPAN_DAYS);
  const span = Math.max(1, daysBetween(start, end));

  const values = entries.map((e) => toUnit(e.weightKg));
  const expStart = line ? toUnit(expectedWeightOn(line, line.startDate > start ? line.startDate : start)) : null;
  const expEnd = line ? toUnit(expectedWeightOn(line, end)) : null;
  const all = [...values, ...(expStart != null ? [expStart, expEnd!] : [])];
  const lo = all.length ? Math.floor(Math.min(...all) - 1) : 0;
  const hi = all.length ? Math.ceil(Math.max(...all) + 1) : 1;

  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = H - PAD.top - PAD.bottom;
  const x = (d: YMD) => PAD.left + (daysBetween(start, d) / span) * innerW;
  const y = (v: number) => PAD.top + innerH - ((v - lo) / Math.max(1, hi - lo)) * innerH;
  const actualPath = entries.map((e, i) => `${i ? 'L' : 'M'}${x(e.date)},${y(toUnit(e.weightKg))}`).join(' ');
  const expFrom = line && line.startDate > start ? line.startDate : start;

  const label =
    t('progress.chartLabel', { unit }) +
    (entries.length ? ' ' + entries.map((e) => `${fmtDate(e.date, 'short')}: ${fmtNum(toUnit(e.weightKg), 1)}`).join('; ') : '');

  return (
    <div ref={ref} className="chart">
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={label}>
        {[lo, (lo + hi) / 2, hi].map((tv) => (
          <g key={tv}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(tv)} y2={y(tv)} stroke="var(--color-border-strong)" strokeWidth={1} shapeRendering="crispEdges" />
            <text x={PAD.left - 6} y={y(tv)} dy="0.32em" textAnchor="end" className="chart-axis">
              {fmtNum(tv, 1)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 6} className="chart-axis">
          {fmtDate(start, 'short')}
        </text>
        <text x={width - PAD.right} y={H - 6} textAnchor="end" className="chart-axis">
          {fmtDate(end, 'short')}
        </text>
        {line && expStart != null && (
          <path
            d={`M${x(expFrom)},${y(toUnit(expectedWeightOn(line, expFrom)))} L${x(end)},${y(expEnd!)}`}
            fill="none"
            stroke="var(--color-panel-head)"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        )}
        {entries.length > 1 && <path d={actualPath} fill="none" stroke="var(--color-meter-fill-up)" strokeWidth={3} strokeLinejoin="miter" />}
        {entries.map((e) => (
          <circle key={e.date} cx={x(e.date)} cy={y(toUnit(e.weightKg))} r={4} fill="var(--color-meter-fill-up)" stroke="var(--color-ink)" strokeWidth={2} />
        ))}
      </svg>
      <div className="chart-legend" aria-hidden="true">
        <span>
          <i className="swatch" style={{ background: 'var(--color-meter-fill-up)' }} /> {t('progress.actual')}
        </span>
        {line && (
          <span>
            <i className="swatch swatch-line" /> {t('progress.expected')}
          </span>
        )}
      </div>
    </div>
  );
}
