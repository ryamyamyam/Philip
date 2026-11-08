import { useMemo, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CornerButton } from '../../components/CornerButton';
import { DialogBar } from '../../components/DialogBar';
import { GymCharacter } from '../../components/GymCharacter';
import { PixelStamp } from '../../components/PixelStamp';
import { useToast } from '../../components/Toast';
import { deleteWorkoutSession, LockedSessionError } from '../../db/repo';
import type { CycleRecord, Profile, TmRecord, TrainingProgram, WeightEntry, WorkoutSession, YMD } from '../../db/types';
import { t, type StringKey } from '../../i18n';
import { addDays, todayYmd } from '../../lib/date';
import { fmtDate, fmtNum } from '../../lib/format';
import { startingWeight } from '../../lib/training/cycleGoal';
import { KG_PER_LB } from '../../lib/training/plates';
import { DAY_LIFT, DELOAD_WEEK, type LiftId } from '../../lib/training/program';
import { tmsForCycle, type WorkoutCardState } from '../../lib/training/progress';
import { isoWeekday, planDates, trainingDaysOrDefault, type PlannedDay } from '../../lib/training/schedule';
import { buildSession } from '../../lib/training/session';
import { fmtIn } from './units';

const LIFT_KEY: Record<LiftId, StringKey> = { squat: 'exercise.squat', bench: 'exercise.bench', rdl: 'exercise.rdl', ohp: 'exercise.ohp' };
const TAG_KEY: Record<LiftId, StringKey> = { squat: 'cal.tag.squat', bench: 'cal.tag.bench', rdl: 'cal.tag.rdl', ohp: 'cal.tag.ohp' };
const STATUS_KEY: Record<WorkoutSession['status'], StringKey> = {
  done: 'cal.status.done',
  skipped: 'cal.status.skipped',
  in_progress: 'cal.status.open',
};
const WEEKDAYS: StringKey[] = ['cal.wd.mon', 'cal.wd.tue', 'cal.wd.wed', 'cal.wd.thu', 'cal.wd.fri', 'cal.wd.sat', 'cal.wd.sun'];
const liftName = (l: LiftId) => t(LIFT_KEY[l]);

/** YYYY-MM-01 of the month containing `ymd`, moved by `delta` months. */
function monthStart(ymd: string, delta = 0): string {
  const [y, m] = ymd.split('-').map(Number);
  const d = new Date(y ?? 1970, (m ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Monday-first grid of dates for a month (with blanks before the 1st). */
function monthGrid(first: string): (string | null)[] {
  const [y, m] = first.split('-').map(Number);
  const start = new Date(y ?? 1970, (m ?? 1) - 1, 1);
  const lead = (start.getDay() + 6) % 7;
  const days = new Date(y ?? 1970, m ?? 1, 0).getDate();
  return [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, i) => addDays(first, i))];
}

/** Body weight in the owner's display unit, one decimal. */
const fmtBody = (kg: number, unit: 'kg' | 'lb') =>
  t(unit === 'kg' ? 'home.kg' : 'home.lb', { n: fmtNum(unit === 'kg' ? kg : kg / KG_PER_LB, 1) });

export interface WorkoutCalendarProps {
  sessions: readonly WorkoutSession[];
  state: WorkoutCardState;
  program: TrainingProgram;
  cycle: CycleRecord | null;
  tmHistory: readonly TmRecord[];
  profile: Profile | null;
  weights: readonly WeightEntry[];
  /** Today's workout was just finished: play the stamp press once on today's cell (reduced motion: none). */
  justFinished?: boolean;
  onOpenToday: () => void;
}

/**
 * Workout opens on a calendar (owner feedback, Nov 5; Story 6 §3): done days carry an ink stamp,
 * the rest of the cycle is projected onto the training days (never stored), the cycle's last
 * planned day is the goal day with a flower stamp, and the box under it is Philip's notice for the
 * selected day (done, resume, start, planned, goal, or past logs with Delete log).
 */
export function WorkoutCalendar({ sessions, state, program, cycle, tmHistory, profile, weights, justFinished, onOpenToday }: WorkoutCalendarProps) {
  const today = todayYmd();
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(monthStart(today));
  const byDate = useMemo(() => {
    const m = new Map<string, WorkoutSession[]>();
    for (const s of sessions) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return m;
  }, [sessions]);
  const planned = useMemo(
    () => planDates({ today, trainingDays: program.trainingDays, sessions, cycle: cycle ? program.currentCycle : null }),
    [today, program.trainingDays, program.currentCycle, sessions, cycle],
  );
  const plannedByDate = useMemo(() => new Map(planned.map((p) => [p.date, p])), [planned]);
  const grid = monthGrid(month);

  const mark = (date: string): WorkoutSession['status'] | null => {
    const list = byDate.get(date);
    if (!list?.length) return null;
    if (list.some((s) => s.status === 'done')) return 'done';
    if (list.some((s) => s.status === 'in_progress')) return 'in_progress';
    return 'skipped';
  };

  const cellLabel = (date: string): string => {
    const parts = [fmtDate(date, 'long')];
    const m = mark(date);
    if (m) parts.push(t(m === 'done' ? 'cal.aria.done' : STATUS_KEY[m]));
    const p = plannedByDate.get(date);
    if (p && m !== 'done') {
      parts.push(t('cal.aria.planned', { day: p.day, lift: liftName(p.lift) }));
      if (p.isGoalDay) parts.push(t('cal.aria.goal', { n: program.currentCycle }));
    }
    return parts.join(' · ');
  };

  return (
    <div className="stack">
      <section className="card stack-sm cal" aria-labelledby="cal-h">
        <div className="cal-head">
          <CornerButton side="left" icon="chevronLeft" label={t('cal.prev')} onClick={() => setMonth(monthStart(month, -1))} />
          <h2 id="cal-h" className="pm-display">
            {new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(`${month}T12:00:00`))}
          </h2>
          <CornerButton side="right" icon="chevronRight" label={t('cal.next')} onClick={() => setMonth(monthStart(month, 1))} />
        </div>
        <div className="cal-grid" role="grid" aria-labelledby="cal-h">
          {WEEKDAYS.map((k) => (
            <span key={k} className="cal-wd small" aria-hidden="true">
              {t(k)}
            </span>
          ))}
          {grid.map((date, i) => {
            if (!date) return <span key={`b${i}`} className="cal-blank" />;
            const m = mark(date);
            const p = m === 'done' ? undefined : plannedByDate.get(date);
            return (
              <button
                key={date}
                type="button"
                role="gridcell"
                className={`cal-day${date === today ? ' is-today' : ''}${m ? ` is-${m}` : ''}${p ? ' is-planned' : ''}${p?.isGoalDay ? ' is-goal' : ''}`}
                aria-selected={date === selected}
                aria-label={cellLabel(date)}
                onClick={() => setSelected(date)}
              >
                <span className="num cal-num">{Number(date.slice(8))}</span>
                {m === 'done' ? (
                  <PixelStamp kind="done" className={`cal-stamp${justFinished && date === today ? ' is-pressing' : ''}`} />
                ) : p?.isGoalDay ? (
                  <PixelStamp kind="goal" className="cal-stamp cal-flower" />
                ) : p ? (
                  <span className="cal-tag" aria-hidden="true">
                    {t(TAG_KEY[p.lift])}
                  </span>
                ) : m ? (
                  <span className="cal-dot" aria-hidden="true">
                    {m === 'in_progress' ? '•' : '–'}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="small muted">{t('cal.legend')}</p>
      </section>

      <DayBox
        key={selected}
        date={selected}
        today={today}
        sessions={byDate.get(selected) ?? []}
        plan={plannedByDate.get(selected) ?? null}
        nextPlanned={planned[0] ?? null}
        state={state}
        program={program}
        cycle={cycle}
        tmHistory={tmHistory}
        profile={profile}
        weights={weights}
        onOpenToday={onOpenToday}
      />
    </div>
  );
}

const Philip = ({ pose, children }: { pose: Parameters<typeof GymCharacter>[0]['pose']; children: React.ReactNode }) => (
  <DialogBar speaker={t('coach.speaker')} portrait={<GymCharacter pose={pose} framing="bust" scale={2} className="pm-dialog-portrait" />}>
    {children}
  </DialogBar>
);

function DayBox({
  date,
  today,
  sessions,
  plan,
  nextPlanned,
  state,
  program,
  cycle,
  tmHistory,
  profile,
  weights,
  onOpenToday,
}: {
  date: YMD;
  today: YMD;
  sessions: WorkoutSession[];
  plan: PlannedDay | null;
  nextPlanned: PlannedDay | null;
  state: WorkoutCardState;
  program: TrainingProgram;
  cycle: CycleRecord | null;
  tmHistory: readonly TmRecord[];
  profile: Profile | null;
  weights: readonly WeightEntry[];
  onOpenToday: () => void;
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState<WorkoutSession | null>(null);
  const unit = program.weightUnit;
  const isToday = date === today;
  const done = sessions.find((s) => s.status === 'done');
  const open = sessions.find((s) => s.status === 'in_progress');

  const askDelete = (s: WorkoutSession) => setConfirm(s);
  const doDelete = async () => {
    const s = confirm;
    setConfirm(null);
    if (!s) return;
    try {
      await deleteWorkoutSession(s.id);
      toast(t('cal.deleted'));
    } catch (e) {
      toast(t(e instanceof LockedSessionError ? 'cal.locked' : 'error.generic'));
    }
  };

  let philip: React.ReactNode = null;
  let body: React.ReactNode = null;

  if (isToday && state.kind === 'doneToday') {
    const s = state.session;
    const top = topResult(s, unit);
    philip = <Philip pose="cross-smug">{t('cal.line.done')}</Philip>;
    body = (
      <>
        <div className="cal-notice">
          <PixelStamp kind="done" size="large" className="cal-notice-stamp" />
          <div className="stack-sm">
            <p className="cal-notice-title">{t('cal.doneTitle')}</p>
            <p className="small num">
              {t('home.workout.dayTitle', { day: s.day, lift: liftName(DAY_LIFT[s.day]) })} · {t('home.workout.blockLine', { block: s.block, week: s.week })}
              {s.finishedAt ? ` · ${t('home.workout.minutes', { n: Math.max(1, Math.round((s.finishedAt - s.startedAt) / 60000)) })}` : ''}
            </p>
            {top && <p className="small num">{top}</p>}
            {state.next && state.nextDate && (
              <p className="small num">{t('cal.doneNext', { day: state.next.day, lift: liftName(DAY_LIFT[state.next.day]), date: fmtDate(state.nextDate, 'weekday') })}</p>
            )}
          </div>
        </div>
        <details className="cal-session">
          <summary>{t('cal.viewLog')}</summary>
          <SessionLog session={s} unit={unit} />
        </details>
        <div className="ex-actions">
          {state.cycleDone && (
            <button type="button" className="btn btn-primary" onClick={onOpenToday}>
              {t('home.workout.briefing')}
            </button>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => askDelete(s)}>
            {t('cal.delete')}
          </button>
        </div>
      </>
    );
  } else if (isToday && state.kind === 'resume') {
    philip = <Philip pose="cross-unimpressed">{t('cal.line.resume')}</Philip>;
    body = (
      <>
        <p className="small num">{t('home.workout.dayLine', { block: state.session.block, week: state.session.week, day: state.session.day, lift: liftName(DAY_LIFT[state.session.day]) })}</p>
        <div className="ex-actions">
          <button type="button" className="btn btn-primary" onClick={onOpenToday}>
            {t('cal.resume', { day: state.session.day, lift: liftName(DAY_LIFT[state.session.day]) })}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => askDelete(state.session)}>
            {t('cal.delete')}
          </button>
        </div>
      </>
    );
  } else if (isToday && state.kind === 'next') {
    const onPlan = trainingDaysOrDefault(program.trainingDays).includes(isoWeekday(today));
    const preview = previewFor(program, cycle, tmHistory, state.week, state.day, unit);
    philip = (
      <Philip pose="point-down-smirk">
        {onPlan ? t('cal.line.today', { day: state.day, lift: liftName(DAY_LIFT[state.day]) }) : t('cal.line.offDay')}
      </Philip>
    );
    body = (
      <>
        <p className="small num">
          {t('home.workout.blockLine', { block: blockOf(cycle), week: state.week })}
          {preview ? ` · ${t('home.workout.minutes', { n: preview.minutes })}` : ''}
          {state.week === DELOAD_WEEK ? ` · ${t('home.deload')}` : ''}
        </p>
        {preview?.top && <p className="small num">{preview.top}</p>}
        <button type="button" className="btn btn-primary btn-block" onClick={onOpenToday}>
          {t('cal.open', { day: state.day, lift: liftName(DAY_LIFT[state.day]) })}
        </button>
      </>
    );
  } else if (isToday && (state.kind === 'briefing' || state.kind === 'cycleDone')) {
    body = (
      <button type="button" className="btn btn-primary btn-block" onClick={onOpenToday}>
        {t('home.workout.briefing')}
      </button>
    );
  }

  // Logs on this date that the today-states above don't already show.
  const shownId = isToday && state.kind === 'doneToday' ? state.session.id : isToday && state.kind === 'resume' ? state.session.id : null;
  const logs = sessions.filter((s) => s.id !== shownId);

  // A future (or today-not-yet-shown) planned day, and the goal day.
  let planBox: React.ReactNode = null;
  if (plan && !isToday && !done && !open) {
    const preview = previewFor(program, cycle, tmHistory, plan.week, plan.day, unit);
    if (!philip) {
      philip = plan.isGoalDay ? (
        <Philip pose="point-up">{t('cal.line.goal')}</Philip>
      ) : (
        <Philip pose="phone">{t('cal.line.planned', { weekday: fmtDate(plan.date, 'weekday'), lift: liftName(plan.lift) })}</Philip>
      );
    }
    planBox = (
      <>
        {plan.isGoalDay && cycle && <GoalBlock cycle={cycle} profile={profile} weights={weights} today={today} />}
        <p className="small num">
          {t('cal.planned', { day: plan.day, lift: liftName(plan.lift), block: blockOf(cycle), week: plan.week })}
          {preview ? ` · ${t('home.workout.minutes', { n: preview.minutes })}` : ''}
        </p>
        {preview?.top && <p className="small num">{preview.top}</p>}
      </>
    );
  }

  const empty = !body && !planBox && logs.length === 0;

  return (
    <section className="stack-sm" aria-labelledby="cal-day-h">
      {philip}
      <div className="card stack-sm">
        <h2 id="cal-day-h">{isToday ? t('cal.today') : fmtDate(date, 'long')}</h2>
        {body}
        {planBox}
        {logs.map((s) => {
          const locked = s.cycle !== program.currentCycle;
          return (
            <div key={s.id} className="stack-sm">
              <details className="cal-session">
                <summary className="num">
                  {t('home.workout.dayTitle', { day: s.day, lift: liftName(DAY_LIFT[s.day]) })} · {t('home.workout.blockLine', { block: s.block, week: s.week })} ·{' '}
                  {t(STATUS_KEY[s.status])}
                </summary>
                <SessionLog session={s} unit={unit} />
              </details>
              {locked ? (
                <p className="small muted">{t('cal.lockedLine')}</p>
              ) : (
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => askDelete(s)}>
                  {t('cal.delete')}
                </button>
              )}
            </div>
          );
        })}
        {empty && <p className="small muted">{date < today ? t('cal.rest') : nextPlanned ? t('cal.restDay') : t('cal.future')}</p>}
      </div>
      {confirm && (
        <ConfirmDialog
          title={t('cal.deleteTitle')}
          body={
            <>
              <p>
                {t('cal.deleteWhat', { day: confirm.day, lift: liftName(DAY_LIFT[confirm.day]), date: fmtDate(confirm.date, 'weekday') })}
              </p>
              <p>{t(confirm.reviewed && !confirm.reviewApplied ? 'cal.deleteLegacy' : 'cal.deleteUndo')}</p>
            </>
          }
          confirmLabel={t('cal.deleteConfirm')}
          destructive
          onConfirm={() => void doDelete()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </section>
  );
}

const blockOf = (cycle: CycleRecord | null) => cycle?.block ?? 'A';

/** "Top set 76.7 kg × 7" from what was actually lifted on the main lift's key sets. */
function topResult(s: WorkoutSession, unit: 'kg' | 'lb'): string | null {
  const main = s.exercises.find((e) => e.slot === 'main');
  if (!main) return null;
  const done = main.actual.filter((a) => a.done && a.kg !== null && a.reps !== null);
  const best = done.sort((a, b) => (b.kg ?? 0) - (a.kg ?? 0))[0];
  return best && best.kg !== null ? t('cal.topResult', { weight: fmtIn(best.kg, unit), reps: best.reps ?? 0 }) : null;
}

/** Minutes and top-set preview for a planned day (orders are frozen only when a session starts). */
function previewFor(
  program: TrainingProgram,
  cycle: CycleRecord | null,
  tmHistory: readonly TmRecord[],
  week: 1 | 2 | 3 | 4,
  day: 1 | 2 | 3 | 4,
  unit: 'kg' | 'lb',
): { minutes: number; top: string | null } | null {
  if (!cycle) return null;
  const tms = tmsForCycle(tmHistory, cycle.index);
  if (tms[DAY_LIFT[day]] === null) return null;
  const plan = buildSession({
    cycle: cycle.index,
    week,
    day,
    phase: cycle.phase,
    tms: { squat: tms.squat ?? 0, bench: tms.bench ?? 0, rdl: tms.rdl ?? 0, ohp: tms.ohp ?? 0 },
    bar: program.bar,
    weightUnit: program.weightUnit,
    restBonusSec: cycle.restBonusSec ?? 0,
  });
  const top = plan.exercises[0]?.prescription.at(-1);
  return {
    minutes: plan.estMinutes,
    top: top?.kg != null ? t(top.kind === 'amrap' ? 'home.workout.topSetPlus' : 'home.workout.topSet', { weight: fmtIn(top.kg, unit), reps: top.repMax }) : null,
  };
}

/**
 * The goal day's expected result, straight from the cycle's goal snapshot (what the owner confirmed
 * in the briefing). On a bulk the body-fat line is a ceiling, on a cut a target: never a promise.
 */
function GoalBlock({ cycle, profile, weights, today }: { cycle: CycleRecord; profile: Profile | null; weights: readonly WeightEntry[]; today: YMD }) {
  const unit = profile?.unitPrefs.weight ?? 'kg';
  const g = cycle.goal;
  const delta = g.endWeightKg - g.startWeightKg;
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  const weightLine =
    cycle.phase === 'maintain' || Math.abs(delta) < 0.05
      ? t('cal.goal.hold', { weight: fmtBody(g.startWeightKg, unit) })
      : t('cal.goal.weight', { end: fmtBody(g.endWeightKg, unit), delta: `${sign}${fmtBody(Math.abs(delta), unit)}`, start: fmtBody(g.startWeightKg, unit) });
  const bf = g.bfLinePct;
  const bfLine =
    bf === null
      ? t('cal.goal.bfNone')
      : cycle.phase === 'gain'
        ? t('cal.goal.bfCeiling', { bf: fmtNum(bf, 1) })
        : cycle.phase === 'lose'
          ? t('cal.goal.bfTarget', { bf: fmtNum(bf, 1), points: g.startBfPct !== null ? fmtNum(Math.abs(g.startBfPct - bf), 1) : '1' })
          : t('cal.goal.bfHold', { bf: fmtNum(bf, 1) });
  const now = startingWeight(weights, today, profile?.weightKg ?? null);
  const nowBf = profile?.bodyFatPct ?? null;
  return (
    <div className="cal-goal stack-sm">
      <div className="cal-notice">
        <PixelStamp kind="goal" size="large" className="cal-notice-stamp" />
        <div className="stack-sm">
          <p className="cal-notice-title">{t('cal.goal.title', { n: cycle.index })}</p>
          <p className="small num">{weightLine}</p>
          <p className="small num">{bfLine}</p>
        </div>
      </div>
      <p className="small num">
        {now ? t(now.source === 'average' ? 'cal.goal.nowAvg' : now.source === 'latest' ? 'cal.goal.nowLatest' : 'cal.goal.nowProfile', { weight: fmtBody(now.kg, unit) }) : t('cal.goal.nowNone')}
        {' · '}
        {nowBf !== null ? t('cal.goal.nowBf', { bf: fmtNum(nowBf, 1) }) : t('cal.goal.bfNone')}
      </p>
      <p className="small muted">{t('cal.goal.footnote')}</p>
    </div>
  );
}

/** Read-only log of a past session: what you actually lifted, with notes and check-ins. */
function SessionLog({ session, unit }: { session: WorkoutSession; unit: 'kg' | 'lb' }) {
  if (session.exercises.length === 0) return <p className="small muted">{t('cal.skippedNote')}</p>;
  return (
    <ul className="plan-ex cal-log">
      {session.exercises.map((e) => {
        const done = e.actual.filter((a) => a.done);
        return (
          <li key={e.slot} className="small num">
            <strong>{t(`exercise.${e.exerciseId}` as StringKey)}</strong>{' '}
            {e.swappedFrom ? <span className="cal-flag">({t('cal.swappedFrom', { name: t(`exercise.${e.swappedFrom}` as StringKey) })}) </span> : null}
            {e.skipped
              ? t('session.skipped')
              : done.length
                ? done.map((a) => `${a.kg !== null ? fmtIn(a.kg, unit) : t('cal.bw')} × ${a.reps ?? '?'}`).join(' · ')
                : t('cal.notLogged')}
            {e.actual
              .filter((a) => a.flag || a.note)
              .map((a) => (
                <span key={a.order} className="cal-flag">
                  {' '}
                  · {t('session.setN', { n: a.order + 1 })}: {a.flag ? t(`checkin.flag.${a.flag}` as StringKey) : ''}
                  {a.note ? ` “${a.note}”` : ''}
                </span>
              ))}
            {e.note ? <span className="cal-flag"> · {e.note}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
