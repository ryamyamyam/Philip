import { StatPanel } from '../components/StatPanel';
import { StatRow } from '../components/StatRow';
import { useCycles, useTmHistory, useTrainingProgram, useWorkoutSessions } from '../hooks/useData';
import { useWidth } from '../hooks/useWidth';
import { t, type StringKey } from '../i18n';
import { fmtDate } from '../lib/format';
import { LIFTS, type LiftId } from '../lib/training/program';
import { datePosition, e1rmPoints, enteredPrPoints, weeklyE1rm, type PrPoint, type WeeklyE1rm } from '../lib/training/progress';
import { liftOf } from '../lib/training/sessionLog';
import { fmtIn } from './workout/units';

const LIFT_KEY: Record<LiftId, StringKey> = { squat: 'exercise.squat', bench: 'exercise.bench', rdl: 'exercise.rdl', ohp: 'exercise.ohp' };

/**
 * Progress › Strength (Story 5 §7, T-014): per lift, red dots for the 1RMs he entered and blue dots for
 * the best estimated 1RM of each week from his logged main-lift sets (OBS-1F8106); training max by cycle,
 * sessions done per week, average session time. Inline SVG, no chart library.
 */
export function StrengthPanel() {
  const program = useTrainingProgram();
  const sessions = useWorkoutSessions();
  const cycles = useCycles();
  const tmHistory = useTmHistory();
  if (program === undefined || !sessions || !cycles || !tmHistory) return null;
  if (!program) return <p className="subtle">{t('strength.noProgram')}</p>;
  const unit = program.weightUnit;
  const weekly = weeklyE1rm(e1rmPoints(sessions, liftOf));
  const prs = enteredPrPoints(tmHistory);
  const done = sessions.filter((s) => s.status === 'done' && s.finishedAt);
  const avgMin = done.length ? Math.round(done.reduce((sum, s) => sum + ((s.finishedAt ?? 0) - s.startedAt), 0) / done.length / 60000) : null;
  const current = program.currentCycle;

  return (
    <div className="stack">
      <div className="strength-legend small" aria-hidden="true">
        <span><i className="strength-dot strength-dot-pr" /> {t('strength.legendPr')}</span>
        <span><i className="strength-dot strength-dot-est" /> {t('strength.legendEst')}</span>
      </div>
      <details className="strength-how">
        <summary className="details-summary">{t('strength.howTitle')}</summary>
        <p className="small">{t('strength.how')}</p>
      </details>
      {LIFTS.map((lift) => (
        <LiftChart key={lift} lift={lift} weekly={weekly.filter((p) => p.lift === lift)} prs={prs.filter((p) => p.lift === lift)} unit={unit} />
      ))}
      <StatPanel title={t('strength.training')}>
        <dl className="pm-rows">
          {current > 0 &&
            ([1, 2, 3, 4] as const).map((w) => {
              const n = sessions.filter((s) => s.cycle === current && s.week === w && s.status === 'done').length;
              return <StatRow key={w} label={t('plan.weekN', { n: w })} value={t('strength.sessions', { n })} />;
            })}
          {avgMin !== null && <StatRow label={t('strength.avgTime')} value={t('summary.timeValue', { n: avgMin })} />}
        </dl>
      </StatPanel>
      {cycles.length > 0 && (
        <StatPanel title={t('strength.tmTitle')}>
          <ul className="plan-ex num">
            {cycles.map((c) => (
              <li key={c.index} className="small">
                <strong>{t('strength.cycleN', { n: c.index, block: c.block })}</strong>{' '}
                {LIFTS.map((l) => `${t(LIFT_KEY[l])} ${c.tms[l] ? fmtIn(c.tms[l], unit) : '–'}`).join(' · ')}
              </li>
            ))}
          </ul>
        </StatPanel>
      )}
    </div>
  );
}

const H = 110;
const PAD = { top: 8, right: 8, bottom: 8, left: 8 };
const DOT = 6;

function LiftChart({ lift, weekly, prs, unit }: { lift: LiftId; weekly: WeeklyE1rm[]; prs: PrPoint[]; unit: 'kg' | 'lb' }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const values = [...weekly.map((p) => p.e1rmKg), ...prs.map((p) => p.oneRmKg)];
  const dates = [...weekly.map((p) => p.date), ...prs.map((p) => p.date)].sort();
  const first = dates[0];
  const lastDate = dates[dates.length - 1];
  // Headroom above and below, so a single or flat series sits mid-chart instead of on an edge.
  const pad = values.length && Math.max(...values) === Math.min(...values) ? Math.max(2.5, Math.max(...values) * 0.05) : (Math.max(...values) - Math.min(...values)) * 0.1;
  const min = Math.min(...values) - pad;
  const max = Math.max(...values) + pad;
  const span = Math.max(1, max - min);
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const x = (d: string) => PAD.left + (first && lastDate ? datePosition(d, first, lastDate) : 0.5) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - min) / span) * (H - PAD.top - PAD.bottom);
  const est = weekly[weekly.length - 1];
  const pr = prs[prs.length - 1];
  const name = t(LIFT_KEY[lift]);
  const label =
    est || pr
      ? [
          pr ? t('strength.prLabel', { lift: name, pr: fmtIn(pr.oneRmKg, unit), date: fmtDate(pr.date, 'short') }) : t('strength.noPr', { lift: name }),
          est ? t('strength.estLabel', { est: fmtIn(est.e1rmKg, unit), date: fmtDate(est.date, 'short'), weeks: weekly.length }) : t('strength.noEst'),
        ].join(' ')
      : t('strength.noData', { lift: name });
  return (
    <StatPanel title={name} aside={est ? <span className="pm-pill num">{fmtIn(est.e1rmKg, unit)}</span> : undefined}>
      <div ref={ref} className="strength-chart">
        {values.length > 0 ? (
          <svg width={width} height={H} role="img" aria-label={label} shapeRendering="crispEdges">
            {weekly.length > 1 && (
              <polyline fill="none" stroke="var(--cat-sky)" strokeWidth={2} points={weekly.map((p) => `${x(p.date)},${y(p.e1rmKg)}`).join(' ')} />
            )}
            {weekly.map((p) => (
              <rect key={`e-${p.week}`} data-dot="est" x={x(p.date) - DOT / 2} y={y(p.e1rmKg) - DOT / 2} width={DOT} height={DOT} fill="var(--cat-sky)" stroke="var(--color-ink)" strokeWidth={1} />
            ))}
            {prs.map((p, i) => (
              <rect key={`p-${p.date}-${i}`} data-dot="pr" x={x(p.date) - DOT / 2 - 1} y={y(p.oneRmKg) - DOT / 2 - 1} width={DOT + 2} height={DOT + 2} fill="var(--color-notable)" stroke="var(--color-ink)" strokeWidth={1} />
            ))}
          </svg>
        ) : null}
      </div>
      <p className="small">{label}</p>
    </StatPanel>
  );
}
