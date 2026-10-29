import type { DaySummary } from '../lib/history';
import { useWidth } from '../hooks/useWidth';
import { getLocale, t } from '../i18n';
import { fmtDate, fmtKcal } from '../lib/format';
import { parseYmd } from '../lib/date';

const H = 180;
const PAD = { top: 12, right: 8, bottom: 22, left: 40 };

function niceMax(v: number): number {
  if (v <= 0) return 1000;
  const step = v > 3000 ? 1000 : 500;
  return Math.ceil(v / step) * step;
}

/** Daily calorie bars with the (possibly changing) daily target drawn as a stepped line. */
export function CalorieChart({ days }: { days: DaySummary[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const max = niceMax(Math.max(...days.map((d) => Math.max(d.totals.calories, d.target?.calories ?? 0))) * 1.05);
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / days.length;
  const barW = Math.max(2, Math.min(28, slot * 0.62));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const ticks = [0, max / 2, max];
  const labelEvery = days.length > 10 ? 7 : 1;

  // Stepped target path, broken where no target exists.
  let path = '';
  days.forEach((d, i) => {
    if (!d.target) return;
    const x0 = PAD.left + i * slot;
    const x1 = x0 + slot;
    const yy = y(d.target.calories);
    const prev = days[i - 1];
    path += prev?.target ? ` L${x0},${yy} L${x1},${yy}` : ` M${x0},${yy} L${x1},${yy}`;
  });

  const logged = days.filter((d) => d.logged);
  const label = t('history.chartCalories', { days: days.length }) + '. ' + logged.map((d) => t('history.dayLabel', { date: fmtDate(d.date, 'short'), kcal: fmtKcal(d.totals.calories) })).join('; ');

  return (
    <div ref={ref} className="chart">
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label={label}>
        {ticks.map((tv) => (
          <g key={tv}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(tv)} y2={y(tv)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(tv)} dy="0.32em" textAnchor="end" className="chart-axis">
              {fmtKcal(tv)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx = PAD.left + i * slot + slot / 2;
          const over = d.target && d.totals.calories > d.target.calories * 1.1;
          return (
            <g key={d.date}>
              {d.logged && (
                <rect
                  x={cx - barW / 2}
                  y={y(d.totals.calories)}
                  width={barW}
                  height={Math.max(1, PAD.top + innerH - y(d.totals.calories))}
                  rx={Math.min(4, barW / 2)}
                  fill={over ? 'var(--color-action)' : 'var(--color-brand)'}
                />
              )}
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 6} textAnchor="middle" className="chart-axis">
                  {days.length > 10 ? fmtDate(d.date, 'short') : new Intl.DateTimeFormat(getLocale(), { weekday: 'narrow' }).format(parseYmd(d.date))}
                </text>
              )}
            </g>
          );
        })}
        {path && <path d={path.trim()} fill="none" stroke="var(--color-text)" strokeWidth={1.5} strokeDasharray="4 3" />}
      </svg>
      <div className="chart-legend" aria-hidden="true">
        <span>
          <i className="swatch" style={{ background: 'var(--color-brand)' }} /> {t('macro.calories')}
        </span>
        <span>
          <i className="swatch swatch-line" /> {t('history.chartTarget')}
        </span>
      </div>
    </div>
  );
}
