import { useMemo } from 'react';
import { BackupReminder } from '../components/BackupReminder';
import { DateNav } from '../components/DateNav';
import { Icon } from '../components/Icon';
import { TodayCard } from '../components/TodayCard';
import { MEALS } from '../db/types';
import { useEntriesForDate, useProfile, useTargetPlans } from '../hooks/useData';
import { useSwipe } from '../hooks/useSwipe';
import { t } from '../i18n';
import { addDays, todayYmd } from '../lib/date';
import { defaultMealFor } from '../lib/meals';
import { groupByMeal, planForDate, sumMacros, targetForDate } from '../lib/nutrition';
import { adherenceScore } from '../lib/adherence';
import { phaseFor } from '../lib/remaining';
import { useUI } from '../ui';
import { MealCard } from './MealsView';

/**
 * Today (Story 3) — the first screen. Answers "what's left?", then puts logging one tap away,
 * then a compact list of what's logged. Past days: ‹ › or the date picker; tap a food to fix it.
 */
export function TodayView() {
  const { date, setDate, navigate, openSheet } = useUI();
  const entries = useEntriesForDate(date);
  const plans = useTargetPlans();
  const profile = useProfile();

  const totals = useMemo(() => sumMacros(entries ?? []), [entries]);
  const target = useMemo(() => (plans ? targetForDate(plans, date) : null), [plans, date]);
  const phase = useMemo(() => phaseFor(plans ? planForDate(plans, date) : null, profile), [plans, date, profile]);
  const byMeal = useMemo(() => groupByMeal(entries ?? []), [entries]);
  const score = useMemo(
    () => (profile?.adherenceEnabled && target && entries && entries.length ? adherenceScore(totals, target) : null),
    [profile?.adherenceEnabled, target, totals, entries],
  );
  const isToday = date === todayYmd();
  const meal = defaultMealFor();

  const swipe = useSwipe(
    () => setDate(addDays(date, 1)),
    () => setDate(addDays(date, -1)),
  );

  const onPhoto = (file: File | undefined) => {
    if (file) openSheet({ kind: 'photo', date, meal, file });
  };

  return (
    <div className="view view-fit" {...swipe}>
      <DateNav />
      <div className="stack">
        <BackupReminder />
        {plans && (
          <TodayCard
            consumed={totals}
            target={target}
            phase={phase}
            adherence={score && score.status === 'scored' ? t('today.adherence', { score: `${score.score}/100` }) : null}
            onSetTargets={() => navigate('targets')}
          />
        )}
        <div className="log-actions">
          <label className="btn btn-primary log-photo">
            <Icon name="camera" />
            <span>{t('add.camera')}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="visually-hidden"
              onChange={(e) => {
                onPhoto(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <button type="button" className="btn btn-secondary log-more" onClick={() => openSheet({ kind: 'add', date, meal })}>
            <Icon name="plus" /> {t('today.logFood')}
          </button>
        </div>
        {!isToday && <p className="subtle log-date-note">{t('today.loggingPast')}</p>}

        <section className="stack-sm" aria-label={t('today.logged')}>
          {entries && entries.length === 0 && <p className="subtle today-empty">{t('today.nothingLogged')}</p>}
          {MEALS.filter((m) => byMeal[m].length > 0).map((m) => (
            <MealCard key={`${date}-${m}`} meal={m} entries={byMeal[m]} collapse={false} />
          ))}
        </section>

        {target && isToday && (
          <button type="button" className="btn btn-ghost today-suggest" onClick={() => openSheet({ kind: 'suggest', date })}>
            <Icon name="sparkle" /> {t('suggest.open')}
          </button>
        )}
      </div>
    </div>
  );
}
