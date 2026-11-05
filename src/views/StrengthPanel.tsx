import { StatPanel } from '../components/StatPanel';
import { StatRow } from '../components/StatRow';
import { useCycles, useTrainingProgram, useWorkoutSessions } from '../hooks/useData';
import { useWidth } from '../hooks/useWidth';
import { t, type StringKey } from '../i18n';
import { fmtDate } from '../lib/format';
import { LIFTS, type LiftId } from '../lib/training/program';
import { e1rmPoints, type E1rmPoint } from '../lib/training/progress';
import { liftOf } from '../lib/training/sessionLog';
import { fmtIn } from './workout/units';

const LIFT_KEY: Record<LiftId, StringKey> = { squat: 'exercise.squat', bench: 'exercise.bench', rdl: 'exercise.rdl', ohp: 'exercise.ohp' };

/**
 * Progress › Strength (Story 5 §7, T-014): e1RM per lift from + sets and top sets (≤10 reps), training
 * max by cycle, sessions done per week, average session time. Inline SVG, no chart library.
 */
export function StrengthPanel() {
  const program = useTrainingProgram();
  const sessions = useWorkoutSessions();
  const cycles = useCycles();
  if (program === undefined || !sessions || !cycles) return null;
  if (!program) return <p className="subtle">{t('strength.noProgram')}</p>;
  const unit = program.weightUnit;
  const points = e1rmPoints(sessions, liftOf);
  const done = sessions.filter((s) => s.status === 'done' && s.finishedAt);
  const avgMin = done.length ? Math.round(done.reduce((sum, s) => sum + ((s.finishedAt ?? 0) - s.startedAt), 0) / done.length / 60000) : null;
  const current = program.currentCycle;

  return (
    <div className="stack">
      {LIFTS.map((lift) => (
        <LiftChart key={lift} lift={lift} points={points.filter((p) => p.lift === lift)} unit={unit} />
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

const H = 90;
const PAD = { top: 8, right: 8, bottom: 8, left: 8 };

function LiftChart({ lift, points, unit }: { lift: LiftId; points: E1rmPoint[]; unit: 'kg' | 'lb' }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const best = points.reduce((m, p) => Math.max(m, p.e1rmKg), 0);
  const last = points[points.length - 1];
  const min = Math.min(...points.map((p) => p.e1rmKg));
  const max = Math.max(...points.map((p) => p.e1rmKg));
  const span = Math.max(1, max - min);
  const x = (i: number) => PAD.left + (points.length <= 1 ? (width - PAD.left - PAD.right) / 2 : (i / (points.length - 1)) * (width - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - (v - min) / span) * (H - PAD.top - PAD.bottom);
  const label = last
    ? t('strength.chartLabel', { lift: t(LIFT_KEY[lift]), latest: fmtIn(last.e1rmKg, unit), best: fmtIn(best, unit), date: fmtDate(last.date, 'short') })
    : t('strength.noData', { lift: t(LIFT_KEY[lift]) });
  return (
    <StatPanel title={t(LIFT_KEY[lift])} aside={last ? <span className="pm-pill num">{fmtIn(last.e1rmKg, unit)}</span> : undefined}>
      <div ref={ref} className="strength-chart">
        {points.length > 0 ? (
          <svg width={width} height={H} role="img" aria-label={label} shapeRendering="crispEdges">
            <polyline
              fill="none"
              stroke="var(--cat-sky)"
              strokeWidth={2}
              points={points.map((p, i) => `${x(i)},${y(p.e1rmKg)}`).join(' ')}
            />
            {points.map((p, i) => (
              <rect key={`${p.date}-${i}`} x={x(i) - 3} y={y(p.e1rmKg) - 3} width={6} height={6} fill={p.e1rmKg === best ? 'var(--color-notable)' : 'var(--color-ink)'} />
            ))}
          </svg>
        ) : null}
      </div>
      <p className="small">{label}</p>
    </StatPanel>
  );
}
