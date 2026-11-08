import { useMemo, useState } from 'react';
import { CornerButton } from '../../components/CornerButton';
import type { WorkoutSession } from '../../db/types';
import { t, type StringKey } from '../../i18n';
import { addDays, todayYmd } from '../../lib/date';
import { fmtDate } from '../../lib/format';
import { DAY_LIFT, type LiftId } from '../../lib/training/program';
import type { WorkoutCardState } from '../../lib/training/progress';
import { fmtIn } from './units';

const LIFT_KEY: Record<LiftId, StringKey> = { squat: 'exercise.squat', bench: 'exercise.bench', rdl: 'exercise.rdl', ohp: 'exercise.ohp' };
const STATUS_KEY: Record<WorkoutSession['status'], StringKey> = {
  done: 'cal.status.done',
  skipped: 'cal.status.skipped',
  in_progress: 'cal.status.open',
};
const WEEKDAYS: StringKey[] = ['cal.wd.mon', 'cal.wd.tue', 'cal.wd.wed', 'cal.wd.thu', 'cal.wd.fri', 'cal.wd.sat', 'cal.wd.sun'];

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

/**
 * Workout opens on a calendar (owner feedback, Nov 5): today is selected, past days show what you
 * trained (or skipped), and today's button goes into the session.
 */
export function WorkoutCalendar({
  sessions,
  state,
  unit,
  onOpenToday,
}: {
  sessions: readonly WorkoutSession[];
  state: WorkoutCardState;
  unit: 'kg' | 'lb';
  onOpenToday: () => void;
}) {
  const today = todayYmd();
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(monthStart(today));
  const byDate = useMemo(() => {
    const m = new Map<string, WorkoutSession[]>();
    for (const s of sessions) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return m;
  }, [sessions]);
  const grid = monthGrid(month);
  const daySessions = byDate.get(selected) ?? [];

  const mark = (date: string): WorkoutSession['status'] | null => {
    const list = byDate.get(date);
    if (!list?.length) return null;
    if (list.some((s) => s.status === 'done')) return 'done';
    if (list.some((s) => s.status === 'in_progress')) return 'in_progress';
    return 'skipped';
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
          {grid.map((date, i) =>
            date ? (
              <button
                key={date}
                type="button"
                role="gridcell"
                className={`cal-day${date === today ? ' is-today' : ''}${mark(date) ? ` is-${mark(date)}` : ''}`}
                aria-selected={date === selected}
                aria-label={`${fmtDate(date, 'long')}${mark(date) ? ` · ${t(STATUS_KEY[mark(date) ?? 'done'])}` : ''}`}
                onClick={() => setSelected(date)}
              >
                <span className="num">{Number(date.slice(8))}</span>
                {mark(date) && <span className="cal-dot" aria-hidden="true">{mark(date) === 'done' ? '✓' : mark(date) === 'in_progress' ? '•' : '–'}</span>}
              </button>
            ) : (
              <span key={`b${i}`} className="cal-blank" />
            ),
          )}
        </div>
        <p className="small muted">{t('cal.legend')}</p>
      </section>

      <section className="card stack-sm" aria-labelledby="cal-day-h">
        <h2 id="cal-day-h">{selected === today ? t('cal.today') : fmtDate(selected, 'long')}</h2>
        {daySessions.map((s) => (
          <details key={s.id} className="cal-session">
            <summary className="num">
              {t('home.workout.dayTitle', { day: s.day, lift: t(LIFT_KEY[DAY_LIFT[s.day]]) })} · {t('home.workout.blockLine', { block: s.block, week: s.week })} ·{' '}
              {t(STATUS_KEY[s.status])}
            </summary>
            <SessionLog session={s} unit={unit} />
          </details>
        ))}
        {selected === today ? (
          <TodayAction state={state} onOpen={onOpenToday} />
        ) : daySessions.length === 0 ? (
          <p className="small muted">{selected < today ? t('cal.rest') : t('cal.future')}</p>
        ) : null}
      </section>
    </div>
  );
}

function TodayAction({ state, onOpen }: { state: WorkoutCardState; onOpen: () => void }) {
  // Story 6 §2: one workout a day. Once today's is done, nothing else starts today.
  if (state.kind === 'doneToday') {
    return (
      <>
        <p className="small" role="status">
          {t('cal.doneToday')}
        </p>
        {state.next && state.nextDate && (
          <p className="small num">{t('cal.doneNext', { day: state.next.day, lift: t(LIFT_KEY[DAY_LIFT[state.next.day]]), date: fmtDate(state.nextDate, 'weekday') })}</p>
        )}
        {state.cycleDone && (
          <button type="button" className="btn btn-primary btn-block" onClick={onOpen}>
            {t('home.workout.briefing')}
          </button>
        )}
      </>
    );
  }
  if (state.kind === 'resume') {
    return (
      <button type="button" className="btn btn-primary btn-block" onClick={onOpen}>
        {t('cal.resume', { day: state.session.day, lift: t(LIFT_KEY[DAY_LIFT[state.session.day]]) })}
      </button>
    );
  }
  if (state.kind === 'next') {
    return (
      <button type="button" className="btn btn-primary btn-block" onClick={onOpen}>
        {t('cal.open', { day: state.day, lift: t(LIFT_KEY[DAY_LIFT[state.day]]) })}
      </button>
    );
  }
  return (
    <button type="button" className="btn btn-primary btn-block" onClick={onOpen}>
      {t('home.workout.briefing')}
    </button>
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
