import { useId, useMemo, useState } from 'react';
import { CalorieChart } from '../components/CalorieChart';
import { NumberField } from '../components/NumberField';
import { useToast } from '../components/Toast';
import { WeightChart } from '../components/WeightChart';
import { logWeight } from '../db/repo';
import { useEntriesInRange, useProfile, useTargetPlans, useWeightEntries } from '../hooks/useData';
import { t } from '../i18n';
import { addDays, isValidYmd, todayYmd } from '../lib/date';
import { fmtDate, fmtG, fmtKcal, fmtNum } from '../lib/format';
import { averages, summarizeDays } from '../lib/history';
import { KG_PER_LB, validateNumber, type FieldError } from '../lib/numbers';
import { planForDate } from '../lib/nutrition';
import { goalDate, latestWeight, weightPlanLine, WEIGHT_LOG_RANGE } from '../lib/weight';
import { CurrentCard, TargetsSections } from './TargetsView';

/**
 * Progress tab (OBS-F047E3): suggested targets + goal date, weight log against the expected line,
 * 7-day intake vs target, then the (compact) body-stats calculator from the old Targets tab.
 */
export default function ProgressView() {
  const plans = useTargetPlans();
  const profile = useProfile();
  const today = todayYmd();
  const current = plans ? planForDate(plans, today) : null;

  return (
    <div className="view">
      <header className="view-header">
        <h1>{t('progress.title')}</h1>
      </header>
      <div className="stack">
        <CurrentCard plan={current} />
        {profile && plans && <WeightCard plans={plans} />}
        <WeekIntake />
        <h2 className="section-title">{t('progress.bodyStats')}</h2>
        <TargetsSections showCurrent={false} compact />
      </div>
    </div>
  );
}

function WeightCard({ plans }: { plans: NonNullable<ReturnType<typeof useTargetPlans>> }) {
  const profile = useProfile();
  const entries = useWeightEntries();
  const toast = useToast();
  const today = todayYmd();
  const lb = profile?.unitPrefs.weight === 'lb';
  const unit = lb ? 'lb' : 'kg';
  const toUnit = (kg: number) => (lb ? kg / KG_PER_LB : kg);
  const [value, setValue] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState<FieldError | null>(null);
  const dateId = useId();

  const line = useMemo(() => (profile ? weightPlanLine(plans, profile, today) : null), [plans, profile, today]);
  const reach = line ? goalDate(line) : null;
  const latest = entries ? latestWeight(entries) : null;
  const range = lb
    ? { min: Math.ceil(WEIGHT_LOG_RANGE.min / KG_PER_LB), max: Math.floor(WEIGHT_LOG_RANGE.max / KG_PER_LB) }
    : WEIGHT_LOG_RANGE;

  const save = async () => {
    const v = validateNumber(value, { ...range, required: true });
    if (v.error || v.value == null || !isValidYmd(date)) {
      setError(v.error ?? 'invalid');
      return;
    }
    const kg = lb ? v.value * KG_PER_LB : v.value;
    await logWeight(date, kg);
    setValue('');
    toast(t('progress.logged', { value: fmtNum(v.value, 1), unit }));
  };

  return (
    <section className="card stack-sm" aria-labelledby="weight-h">
      <h2 id="weight-h">{t('progress.weight')}</h2>
      <form
        className="weight-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <NumberField
          label={t('progress.weightLabel', { unit })}
          value={value}
          onChange={(v) => {
            setValue(v);
            setError(null);
          }}
          error={error}
          min={range.min}
          max={range.max}
        />
        <div className="field">
          <label className="field-label" htmlFor={dateId}>
            {t('entry.date')}
          </label>
          <input id={dateId} className="input" type="date" value={date} max={addDays(today, 1)} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary weight-save">
          {t('progress.logWeight')}
        </button>
      </form>
      {latest && (
        <p className="subtle num">{t('progress.latest', { value: fmtNum(toUnit(latest.weightKg), 1), unit, date: fmtDate(latest.date) })}</p>
      )}
      {entries && (entries.length > 0 || line) && <WeightChart entries={entries} line={line} today={today} toUnit={toUnit} unit={unit} />}
      {line && reach && line.targetKg != null && (
        <p className="subtle num">{t('progress.reach', { value: fmtNum(toUnit(line.targetKg), 1), unit, date: fmtDate(reach) })}</p>
      )}
      {!line && <p className="subtle">{t('progress.noLine')}</p>}
    </section>
  );
}

function WeekIntake() {
  const plans = useTargetPlans();
  const today = todayYmd();
  const start = addDays(today, -6);
  const entries = useEntriesInRange(start, today);
  const days = useMemo(() => (entries && plans ? summarizeDays(entries, plans, start, today) : null), [entries, plans, start, today]);
  const avg = useMemo(() => (days ? averages(days) : null), [days]);
  if (!avg || !days) return null;
  return (
    <section className="card stack-sm" aria-labelledby="week-h">
      <h2 id="week-h">{t('history.avg7')}</h2>
      {avg.avg ? (
        <>
          <p className="week-kcal num">
            <strong>{fmtKcal(avg.avg.calories)}</strong> {t('common.kcal')}
            {avg.avgTarget && <span className="subtle"> · {t('history.vsTarget', { target: fmtKcal(avg.avgTarget.calories) })}</span>}
          </p>
          <p className="subtle num">
            P {fmtG(avg.avg.proteinG)}
            {avg.avgTarget ? `/${fmtG(avg.avgTarget.proteinG)}` : ''} g · F {fmtG(avg.avg.fatG)}
            {avg.avgTarget ? `/${fmtG(avg.avgTarget.fatG)}` : ''} g · C {fmtG(avg.avg.carbsG)}
            {avg.avgTarget ? `/${fmtG(avg.avgTarget.carbsG)}` : ''} g
          </p>
          <p className="subtle">{t('history.loggedDays', { count: avg.loggedDays, total: avg.days })}</p>
          <CalorieChart days={days} />
        </>
      ) : (
        <p className="subtle">{t('history.noEntries')}</p>
      )}
    </section>
  );
}
