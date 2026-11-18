import { useMemo, useRef, useState, type ReactNode } from 'react';
import { setMeta } from '../../db/repo';
import type { CycleRecord, Profile, WeightEntry, WorkoutSession, YMD } from '../../db/types';
import { useMeta } from '../../hooks/useData';
import { t, type StringKey } from '../../i18n';
import { t17, type S17Key } from '../../i18n/s17';
import { daysBetween } from '../../lib/date';
import { fmtDate, fmtNum } from '../../lib/format';
import { KG_PER_LB } from '../../lib/numbers';
import { PB_TODAY_LINE } from '../../lib/playbook/rules';
import {
  bfRow,
  chartWindow,
  goalSpan,
  linearAt,
  liftRows,
  strengthDateFor,
  weightRow,
  weightSeries,
  type GoalSpan,
  type LineStatus,
  type LiftRow,
} from '../../lib/goal/todayLine';
import type { LiftId } from '../../lib/training/program';
import { useUI } from '../../ui';

/** Meta key: the chart window he picked (remembered). */
export const TODAY_LINE_WINDOW = 'todayLineWindow';

const STATUS: Record<LineStatus, S17Key> = {
  onTrack: 'line.status.onTrack',
  ahead: 'line.status.ahead',
  aheadFast: 'line.status.aheadFast',
  behind: 'line.status.behind',
  above: 'line.status.above',
  holding: 'line.status.holding',
  dropping: 'line.status.dropping',
  weighBf: 'line.status.weighBf',
  noData: 'line.status.noData',
};
/** Status tone: the word always carries the meaning; the pill color only repeats it. */
const TONE: Record<LineStatus, 'good' | 'warn' | 'none'> = {
  onTrack: 'good',
  ahead: 'good',
  holding: 'good',
  aheadFast: 'warn',
  behind: 'warn',
  above: 'warn',
  dropping: 'warn',
  weighBf: 'warn',
  noData: 'none',
};
const LIFT_KEY: Record<LiftId, StringKey> = { squat: 'exercise.squat', bench: 'exercise.bench', rdl: 'exercise.rdl', ohp: 'exercise.ohp' };

export interface TodayLineProps {
  today: YMD;
  cycle: CycleRecord | null;
  cycles: readonly CycleRecord[];
  sessions: readonly WorkoutSession[];
  weights: readonly WeightEntry[];
  profile: Profile | null;
  unit: 'kg' | 'lb';
}

/**
 * Story 17 (N-2, N-3): "Today's line" on Home, above the Meal log. A two-card carousel (scroll-snap, no
 * library): BODY (weight chart + body-fat strip) and STRENGTH (the Big 4 as small multiples). Each chart
 * puts the dashed plan line, its on-track band and his real data on the same axes, with today marked;
 * the header line says expected · actual · status in words. See lib/goal/todayLine.ts for the math.
 */
export default function TodayLine({ today, cycle, cycles, sessions, weights, profile, unit }: TodayLineProps) {
  const { navigate, openSheet } = useUI();
  const stored = useMeta<'goal' | '4wk'>(TODAY_LINE_WINDOW);
  const mode: 'goal' | '4wk' = stored === '4wk' ? '4wk' : 'goal';
  const [page, setPage] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  const data = useMemo(() => {
    if (!cycle) return null;
    const span = goalSpan(cycle);
    const win = chartWindow(span, today, mode);
    return {
      span,
      win,
      weight: weightRow(span, weights, today, profile?.weightKg ?? null),
      bf: bfRow(span, { pct: profile?.bodyFatPct ?? null, date: profile?.bodyFatDate ?? null }, today),
      series: weightSeries(weights, win.from, win.to),
      lifts: liftRows(cycle, cycles, sessions, today, win.from, win.to),
      strengthDate: strengthDateFor(cycle, cycles, sessions, today),
    };
  }, [cycle, cycles, sessions, weights, profile?.weightKg, profile?.bodyFatPct, profile?.bodyFatDate, today, mode]);

  if (!data) {
    return (
      <section className="tl tl-empty pm-cart pm-cat-teal" aria-label={t17('line.title')}>
        <span className="pm-cart-label">{t17('line.title')}</span>
        <span className="pm-cart-sub">{t17('line.noGoal')}</span>
        <button type="button" className="btn btn-sm btn-secondary" onClick={() => openSheet({ kind: 'goal', manual: true })}>
          {t17('line.setGoal')}
        </button>
      </section>
    );
  }

  const go = (i: number) => {
    setPage(i);
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const onScroll = () => {
    const el = track.current;
    if (el && el.clientWidth > 0) setPage(Math.round(el.scrollLeft / el.clientWidth));
  };
  const w = (kg: number) => (unit === 'kg' ? `${fmtNum(kg, 1)} kg` : `${fmtNum(kg / KG_PER_LB, 1)} lb`);
  const wl = (kg: number) => (unit === 'kg' ? `${fmtNum(kg, 0)}` : `${fmtNum(kg / KG_PER_LB, 0)}`);

  const names = [t17('line.body'), t17('line.strength')];
  return (
    <section className="tl" aria-label={t17('line.title')} data-testid="today-line" data-tour="home-goal">
      <div className="tl-foot">
        <span className="tl-title">{t17('line.title')}</span>
        <div className="tl-dots" role="group" aria-label={t17('line.title')}>
          {names.map((name, i) => (
            <button key={name} type="button" className="tl-dot" aria-pressed={page === i} disabled={page === i} aria-label={t17('line.dot', { name })} onClick={() => go(i)} />
          ))}
        </div>
        <div className="segmented tl-window" role="radiogroup" aria-label={t17('line.windowLabel')}>
          {(['goal', '4wk'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => void setMeta(TODAY_LINE_WINDOW, m)}>
              {t17(m === 'goal' ? 'line.window.goal' : 'line.window.4wk')}
            </button>
          ))}
        </div>
      </div>
      <div className="tl-track" ref={track} onScroll={onScroll}>
        <button type="button" className="tl-card pm-cart pm-cat-teal" aria-label={bodyAria(data, w)} onClick={() => navigate('progress')} data-testid="tl-body">
          <span className="tl-row num">
            <span className="tl-k">{t17('line.weight')}</span> {t17('line.expected', { v: w(data.weight.expected) })} · {data.weight.actual !== null ? t17(data.weight.source === 'average' ? 'line.avg' : 'line.now', { v: w(data.weight.actual) }) : t17('line.status.noData')}{' '}
            <Pill status={data.weight.status} />
          </span>
          <WeightChart span={data.span} win={data.win} series={data.series} today={today} unit={unit} />
          <span className="tl-row num">
            <span className="tl-k">{t17('line.bf')}</span>{' '}
            {data.bf.expected === null
              ? t17('line.noBfGoal')
              : `${t17('line.expected', { v: `${data.bf.expected}%` })} · ${data.bf.actual !== null && data.bf.date ? t17(data.bf.stale ? 'line.old' : 'line.latest', { v: `${fmtNum(data.bf.actual, 0)}%`, date: fmtDate(data.bf.date, 'short') }) : t17('line.status.noData')}`}{' '}
            {data.bf.expected !== null && <Pill status={data.bf.status} />}
          </span>
          {data.bf.expected !== null && <BfStrip span={data.span} win={data.win} bf={data.bf} today={today} />}
        </button>
        <button type="button" className="tl-card pm-cart pm-cat-sky" aria-label={strengthAria(data.lifts, wl)} onClick={() => navigate('progress')} data-testid="tl-strength">
          <span className="tl-grid">
            {data.lifts.map((l) => (
              <LiftTile key={l.lift} row={l} win={data.win} today={today} wl={wl} />
            ))}
          </span>
          <span className="tl-row num tl-combined">{data.strengthDate ? t17('line.combined', { date: fmtDate(data.strengthDate, 'short') }) : t17('line.combinedNone')}</span>
        </button>
      </div>
    </section>
  );
}

function Pill({ status }: { status: LineStatus }) {
  return <span className={`pm-pill tl-pill tone-${TONE[status]}`}>{t17(STATUS[status])}</span>;
}

function bodyAria(d: { weight: ReturnType<typeof weightRow>; bf: ReturnType<typeof bfRow> }, w: (kg: number) => string): string {
  const parts = [
    t17('line.title'),
    t17('line.aria.weight', { exp: w(d.weight.expected), now: d.weight.actual !== null ? w(d.weight.actual) : '–', status: t17(STATUS[d.weight.status]) }),
  ];
  if (d.bf.expected !== null) parts.push(t17('line.aria.bf', { exp: `${d.bf.expected}%`, now: d.bf.actual !== null ? `${fmtNum(d.bf.actual, 0)}%` : '–', status: t17(STATUS[d.bf.status]) }));
  return parts.join(' ');
}

function strengthAria(rows: readonly LiftRow[], wl: (kg: number) => string): string {
  return [t17('line.strength'), ...rows.map((r) => t17('line.aria.lift', { lift: t(LIFT_KEY[r.lift]), exp: r.expected !== null ? wl(r.expected) : '–', now: r.actual !== null ? wl(r.actual) : '–', status: t17(STATUS[r.status]) }))].join(' ');
}

/* ---------------- Charts (inline SVG, design tokens, no library) ---------------- */

const W = 320;

interface Scale {
  x: (d: YMD) => number;
  y: (v: number) => number;
}

function scale(win: { from: YMD; to: YMD }, lo: number, hi: number, h: number, pad = 3): Scale {
  const days = Math.max(1, daysBetween(win.from, win.to));
  const span = hi - lo || 1;
  return {
    x: (d) => Math.round((Math.min(days, Math.max(0, daysBetween(win.from, d))) / days) * (W - 2 * pad) + pad),
    y: (v) => Math.round(h - pad - ((v - lo) / span) * (h - 2 * pad)),
  };
}

const path = (pts: readonly [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');

function Frame({ h, children, label }: { h: number; children: ReactNode; label: string }) {
  return (
    <svg className="tl-chart" viewBox={`0 0 ${W} ${h}`} width="100%" height={h} role="img" aria-label={label} preserveAspectRatio="none">
      {children}
    </svg>
  );
}

function TodayMark({ x, h }: { x: number; h: number }) {
  return <rect className="tl-today" x={x} y={0} width={2} height={h} shapeRendering="crispEdges" />;
}

function WeightChart({ span, win, series, today, unit }: { span: GoalSpan; win: { from: YMD; to: YMD }; series: ReturnType<typeof weightSeries>; today: YMD; unit: 'kg' | 'lb' }) {
  const h = 54;
  const band = PB_TODAY_LINE.weightKg;
  const planA = linearAt(span.start, span.end, span.startKg, span.endKg, win.from);
  const planB = linearAt(span.start, span.end, span.startKg, span.endKg, win.to);
  const vals = [planA - band, planA + band, planB - band, planB + band, ...series.dots.map((d) => d[1])];
  const lo = Math.min(...vals) - 0.2;
  const hi = Math.max(...vals) + 0.2;
  const s = scale(win, lo, hi, h);
  const few = series.dots.length < PB_TODAY_LINE.minWeighIns;
  const bandPts = `${s.x(win.from)},${s.y(planA + band)} ${s.x(win.to)},${s.y(planB + band)} ${s.x(win.to)},${s.y(planB - band)} ${s.x(win.from)},${s.y(planA - band)}`;
  const end = unit === 'kg' ? `${fmtNum(span.endKg, 1)}` : `${fmtNum(span.endKg / KG_PER_LB, 0)}`;
  return (
    <span className="tl-chart-wrap">
      <Frame h={h} label={t17('line.weight')}>
        <polygon className="tl-band" points={bandPts} />
        <path className="tl-plan" d={path([[s.x(win.from), s.y(planA)], [s.x(win.to), s.y(planB)]])} vectorEffect="non-scaling-stroke" />
        {!few && series.dots.map(([d, v]) => <rect key={d} className="tl-dot-faint" x={s.x(d) - 2} y={s.y(v) - 2} width={4} height={4} shapeRendering="crispEdges" />)}
        {!few && series.avg.length > 1 && <path className="tl-actual" d={path(series.avg.map(([d, v]) => [s.x(d), s.y(v)]))} vectorEffect="non-scaling-stroke" />}
        {!few && series.avg.length === 1 && series.avg[0] && <rect className="tl-actual-dot" x={s.x(series.avg[0][0]) - 3} y={s.y(series.avg[0][1]) - 3} width={6} height={6} shapeRendering="crispEdges" />}
        {today >= win.from && today <= win.to && <TodayMark x={s.x(today)} h={h} />}
      </Frame>
      {win.to === span.end && <span className="tl-end small num" aria-hidden="true">{t17('line.goalEnd', { v: end, date: fmtDate(span.end, 'short') })}</span>}
      {few && <span className="tl-few small">{t17('line.fewWeighIns')}</span>}
    </span>
  );
}

function BfStrip({ span, win, bf, today }: { span: GoalSpan; win: { from: YMD; to: YMD }; bf: ReturnType<typeof bfRow>; today: YMD }) {
  const h = 16;
  const line = span.bfLine ?? 0;
  const start = span.startBf ?? line;
  const a = linearAt(span.start, span.end, start, line, win.from);
  const b = linearAt(span.start, span.end, start, line, win.to);
  const band = PB_TODAY_LINE.bfPts;
  const vals = [a - band, a + band, b - band, b + band, ...(bf.actual !== null ? [bf.actual] : [])];
  const s = scale(win, Math.min(...vals), Math.max(...vals), h, 2);
  const pts = `${s.x(win.from)},${s.y(a + band)} ${s.x(win.to)},${s.y(b + band)} ${s.x(win.to)},${s.y(b - band)} ${s.x(win.from)},${s.y(a - band)}`;
  const showDot = bf.actual !== null && bf.date !== null && bf.date >= win.from && bf.date <= win.to;
  return (
    <Frame h={h} label={t17('line.bf')}>
      <polygon className="tl-band" points={pts} />
      <path className="tl-plan" d={path([[s.x(win.from), s.y(a)], [s.x(win.to), s.y(b)]])} vectorEffect="non-scaling-stroke" />
      {showDot && bf.actual !== null && bf.date && <rect className="tl-actual-dot" x={s.x(bf.date) - 3} y={s.y(bf.actual) - 3} width={6} height={6} shapeRendering="crispEdges" />}
      {today >= win.from && today <= win.to && <TodayMark x={s.x(today)} h={h} />}
    </Frame>
  );
}

function LiftTile({ row, win, today, wl }: { row: LiftRow; win: { from: YMD; to: YMD }; today: YMD; wl: (kg: number) => string }) {
  const h = 30;
  const vals = [...row.plan.map((p) => p[1]), ...row.points.map((p) => p[1])];
  const lo = vals.length ? Math.min(...vals) * 0.97 : 0;
  const hi = vals.length ? Math.max(...vals) * 1.03 : 1;
  const s = scale(win, lo, hi, h, 2);
  // Weekly steps: horizontal to the next week, then up.
  const steps: [number, number][] = [];
  row.plan.forEach(([d, v], i) => {
    const x = s.x(d);
    if (i > 0) steps.push([x, steps[steps.length - 1]?.[1] ?? s.y(v)]);
    steps.push([x, s.y(v)]);
  });
  return (
    <span className="tl-tile">
      <span className="tl-tile-head">
        <span className="tl-tile-name">{t17(`line.lift.${row.lift}`)}</span>
        <Pill status={row.status} />
      </span>
      <span className="tl-chart-wrap">
      <span className="tl-tile-nums num small" aria-hidden="true">
        {t17('line.tileNums', { exp: row.expected !== null ? wl(row.expected) : '–', now: row.actual !== null ? wl(row.actual) : '–' })}
      </span>
      {vals.length > 0 && (
        <Frame h={h} label={t(LIFT_KEY[row.lift])}>
          {steps.length > 1 && <path className="tl-plan" d={path(steps)} vectorEffect="non-scaling-stroke" />}
          {row.points.map(([d, v]) => <rect key={d} className="tl-actual-dot" x={s.x(d) - 2} y={s.y(v) - 2} width={5} height={5} shapeRendering="crispEdges" />)}
          {row.points.length > 1 && <path className="tl-actual" d={path(row.points.map(([d, v]) => [s.x(d), s.y(v)]))} vectorEffect="non-scaling-stroke" />}
          {today >= win.from && today <= win.to && <TodayMark x={s.x(today)} h={h} />}
        </Frame>
      )}
      </span>
    </span>
  );
}
