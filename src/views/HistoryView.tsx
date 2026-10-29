import { useMemo, useState } from 'react';
import { CalorieChart } from '../components/CalorieChart';
import { Icon } from '../components/Icon';
import type { Macros } from '../db/types';
import { useEntriesInRange, useProfile, useTargetPlans } from '../hooks/useData';
import { t, type StringKey } from '../i18n';
import { addDays, startOfWeek, todayYmd } from '../lib/date';
import { fmtDate, fmtG, fmtKcal } from '../lib/format';
import { averages, MIN_DAYS_FOR_TRENDS, summarizeDays, summarizeWeek, type Averages, type DaySummary } from '../lib/history';
import { useUI } from '../ui';

export default function HistoryView() {
  const today = todayYmd();
  const start30 = addDays(today, -29);
  const [range, setRange] = useState<7 | 30>(7);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const earliest = weekStart < start30 ? weekStart : start30;
  const entries = useEntriesInRange(earliest, today);
  const plans = useTargetPlans();
  const profile = useProfile();

  const days30 = useMemo(() => (entries && plans ? summarizeDays(entries, plans, start30, today) : null), [entries, plans, start30, today]);
  if (!days30 || !entries || !plans) return <div className="view" />;

  const days7 = days30.slice(-7);
  const avg7 = averages(days7);
  const avg30 = averages(days30);
  const enough = avg30.loggedDays >= MIN_DAYS_FOR_TRENDS;
  const shown = range === 7 ? days7 : days30;

  return (
    <div className="view">
      <header className="view-header">
        <h1>{t('history.title')}</h1>
      </header>
      <div className="stack">
        {!enough ? (
          <section className="card stack-sm" aria-live="polite">
            <h2>{t('history.notEnough')}</h2>
            <p className="muted small">{t('history.notEnoughHint', { count: avg30.loggedDays })}</p>
          </section>
        ) : (
          <>
            <section className="card stack" aria-labelledby="trend-h">
              <div className="row">
                <h2 id="trend-h" style={{ flex: 1 }}>
                  {t('history.chartCalories', { days: range })}
                </h2>
              </div>
              <div className="segmented" role="radiogroup" aria-label={t('history.range')}>
                {([7, 30] as const).map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={range === r} onClick={() => setRange(r)}>
                    {t(r === 7 ? 'history.range7' : 'history.range30')}
                  </button>
                ))}
              </div>
              <CalorieChart days={shown} />
            </section>
            <AverageCard title={t('history.avg7')} a={avg7} showAdherence={Boolean(profile?.adherenceEnabled)} />
            <AverageCard title={t('history.avg30')} a={avg30} showAdherence={Boolean(profile?.adherenceEnabled)} />
          </>
        )}
        <WeekCard weekStart={weekStart} setWeekStart={setWeekStart} entries={entries} plans={plans} showAdherence={Boolean(profile?.adherenceEnabled)} />
        <DailyLog days={days30} showAdherence={Boolean(profile?.adherenceEnabled)} />
      </div>
    </div>
  );
}

const MACRO_ROWS: { key: keyof Macros; label: StringKey; unit: 'kcal' | 'g' }[] = [
  { key: 'calories', label: 'macro.calories', unit: 'kcal' },
  { key: 'proteinG', label: 'macro.protein', unit: 'g' },
  { key: 'fatG', label: 'macro.fat', unit: 'g' },
  { key: 'carbsG', label: 'macro.carbs', unit: 'g' },
];

function MacroStats({ value, target }: { value: Macros; target: Macros | null }) {
  return (
    <div className="avg-grid">
      {MACRO_ROWS.map((m) => {
        const f = m.unit === 'kcal' ? fmtKcal : fmtG;
        return (
          <div key={m.key} className="stat">
            <span className="stat-label">{t(m.label)}</span>
            <span className="stat-value">
              {f(value[m.key])} <span className="stat-unit">{m.unit}</span>
            </span>
            {target && <span className="stat-sub">{t('history.vsTarget', { target: `${f(target[m.key])} ${m.unit}` })}</span>}
          </div>
        );
      })}
    </div>
  );
}

function AverageCard({ title, a, showAdherence }: { title: string; a: Averages; showAdherence: boolean }) {
  return (
    <section className="card stack-sm" aria-label={title}>
      <h2>{title}</h2>
      {a.avg ? <MacroStats value={a.avg} target={a.avgTarget} /> : <p className="subtle">{t('history.noEntries')}</p>}
      {showAdherence && a.avgAdherence != null && (
        <p className="small num">
          {t('history.weekAdherence')}: <strong>{a.avgAdherence}/100</strong>
        </p>
      )}
      <p className="subtle">{t('history.loggedDays', { count: a.loggedDays, total: a.days })}</p>
    </section>
  );
}

function WeekCard({
  weekStart,
  setWeekStart,
  entries,
  plans,
  showAdherence,
}: {
  weekStart: string;
  setWeekStart: (d: string) => void;
  entries: Parameters<typeof summarizeWeek>[0];
  plans: Parameters<typeof summarizeWeek>[1];
  showAdherence: boolean;
}) {
  const w = summarizeWeek(entries, plans, weekStart);
  const isCurrent = weekStart === startOfWeek(todayYmd());
  return (
    <section className="card stack" aria-labelledby="week-h">
      <div className="week-nav">
        <button type="button" className="icon-btn" aria-label={t('history.prevWeek')} onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <Icon name="chevronLeft" />
        </button>
        <h2 id="week-h">{isCurrent ? t('history.week') : t('history.weekOf', { date: fmtDate(weekStart, 'weekday') })}</h2>
        <button type="button" className="icon-btn" aria-label={t('history.nextWeek')} onClick={() => setWeekStart(addDays(weekStart, 7))} disabled={isCurrent}>
          <Icon name="chevronRight" />
        </button>
      </div>
      <dl className="kv num">
        <dt>{t('history.weekPlanned')}</dt>
        <dd>{w.planned ? `${fmtKcal(w.planned.calories)} kcal` : '—'}</dd>
        <dt>{t('history.weekActual')}</dt>
        <dd>{fmtKcal(w.actual.calories)} kcal</dd>
        <dt>{t('history.weekAvg')}</dt>
        <dd>{w.dailyAvg ? `${fmtKcal(w.dailyAvg.calories)} kcal` : '—'}</dd>
        {showAdherence && (
          <>
            <dt>{t('history.weekAdherence')}</dt>
            <dd>{w.avgAdherence != null ? `${w.avgAdherence}/100` : '—'}</dd>
          </>
        )}
      </dl>
      <p className="subtle">{t('history.loggedDays', { count: w.loggedDays, total: 7 })}</p>
    </section>
  );
}

function DailyLog({ days, showAdherence }: { days: DaySummary[]; showAdherence: boolean }) {
  const { setDate, navigate } = useUI();
  const logged = [...days].reverse().filter((d) => d.logged);
  return (
    <section className="card card-flush" aria-labelledby="daily-h">
      <h2 id="daily-h" style={{ padding: 'var(--space-4) var(--space-4) var(--space-2)' }}>
        {t('history.daily')}
      </h2>
      {logged.length === 0 ? (
        <p className="empty">{t('history.noEntries')}</p>
      ) : (
        <ul className="list">
          {logged.map((d) => (
            <li key={d.date} className="list-item">
              <button
                type="button"
                className="list-button"
                onClick={() => {
                  setDate(d.date);
                  navigate('today');
                }}
              >
                <span className="list-text">
                  <span className="list-title">{fmtDate(d.date, 'weekday')}</span>
                  <span className="list-meta num">
                    P {fmtG(d.totals.proteinG)} · F {fmtG(d.totals.fatG)} · C {fmtG(d.totals.carbsG)}
                    {showAdherence && d.adherence.status === 'scored' ? ` · ${d.adherence.score}/100` : ''}
                  </span>
                </span>
                <span className="list-value">
                  {fmtKcal(d.totals.calories)}
                  {d.target && <span className="subtle"> / {fmtKcal(d.target.calories)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
