import { t } from '../i18n';
import { fmtKcal } from '../lib/format';

interface Props {
  consumed: number;
  target: number | null;
}

const R = 88;
const STROKE = 16;
const C = 2 * Math.PI * R;

/** SVG calorie ring. Remaining calories are the primary value; overflow wraps as a darker arc. */
export function CalorieRing({ consumed, target }: Props) {
  const hasTarget = target != null && target > 0;
  const remaining = hasTarget ? target - consumed : 0;
  const over = hasTarget && remaining < 0;
  const frac = hasTarget ? Math.max(0, consumed / target) : 0;
  const main = Math.min(1, frac);
  const overflow = over ? Math.min(1, frac - 1) : 0;

  const label = !hasTarget
    ? t('today.ringLabelNoTarget', { consumed: fmtKcal(consumed) })
    : over
      ? t('today.ringLabelOver', { over: fmtKcal(-remaining), target: fmtKcal(target), consumed: fmtKcal(consumed) })
      : t('today.ringLabel', { remaining: fmtKcal(remaining), target: fmtKcal(target), consumed: fmtKcal(consumed) });

  return (
    <div className="ring-wrap">
      <div className="ring" role="img" aria-label={label}>
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r={R} fill="none" stroke="var(--color-track)" strokeWidth={STROKE} />
          {main > 0 && (
            <circle
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${main * C} ${C}`}
              transform="rotate(-90 100 100)"
              className="ring-arc"
            />
          )}
          {overflow > 0 && (
            <circle
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke="var(--color-action-pressed)"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${overflow * C} ${C}`}
              transform="rotate(-90 100 100)"
              className="ring-arc"
            />
          )}
        </svg>
        <div className="ring-center" aria-hidden="true">
          <span className={`ring-value num${over ? ' is-over' : ''}`}>
            {hasTarget ? fmtKcal(Math.abs(remaining)) : fmtKcal(consumed)}
          </span>
          <span className="ring-caption">
            {hasTarget ? (over ? `${t('common.kcal')} ${t('today.over')}` : `${t('common.kcal')} ${t('today.remaining')}`) : t('common.kcal')}
          </span>
        </div>
      </div>
      <dl className="ring-stats" aria-hidden="true">
        <div>
          <dt>{t('today.consumed')}</dt>
          <dd className="num">{fmtKcal(consumed)}</dd>
        </div>
        <div>
          <dt>{t('today.target')}</dt>
          <dd className="num">{hasTarget ? fmtKcal(target) : '—'}</dd>
        </div>
      </dl>
    </div>
  );
}
