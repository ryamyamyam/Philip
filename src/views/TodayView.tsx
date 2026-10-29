import { useMemo } from 'react';
import { CalorieRing } from '../components/CalorieRing';
import { Icon } from '../components/Icon';
import { MacroBars } from '../components/MacroBars';
import { BackupReminder } from '../components/BackupReminder';
import { MEALS, type FoodEntry, type Meal } from '../db/types';
import { useEntriesForDate, useProfile, useTargetPlans } from '../hooks/useData';
import { useSwipe } from '../hooks/useSwipe';
import { t } from '../i18n';
import { addDays, isValidYmd, todayYmd } from '../lib/date';
import { fmtDate, fmtG, fmtKcal, fmtRelativeDay } from '../lib/format';
import { groupByMeal, sumMacros, targetForDate } from '../lib/nutrition';
import { adherenceScore } from '../lib/adherence';
import { useUI } from '../ui';

export function TodayView() {
  const { date, setDate, openSheet, navigate } = useUI();
  const entries = useEntriesForDate(date);
  const plans = useTargetPlans();
  const profile = useProfile();
  const today = todayYmd();

  const totals = useMemo(() => sumMacros(entries ?? []), [entries]);
  const target = useMemo(() => (plans ? targetForDate(plans, date) : null), [plans, date]);
  const byMeal = useMemo(() => groupByMeal(entries ?? []), [entries]);
  const score = useMemo(
    () => (profile?.adherenceEnabled && target && entries && entries.length ? adherenceScore(totals, target) : null),
    [profile?.adherenceEnabled, target, totals, entries],
  );

  const swipe = useSwipe(
    () => setDate(addDays(date, 1)),
    () => setDate(addDays(date, -1)),
  );
  const relative = fmtRelativeDay(date, today);

  return (
    <div className="view" {...swipe}>
      <header className="date-nav">
        <button type="button" className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label={t('today.prevDay')}>
          <Icon name="chevronLeft" />
        </button>
        <div className="date-nav-title">
          <h1>{relative ?? fmtDate(date, 'weekday')}</h1>
          <span className="subtle">{fmtDate(date, 'long')}</span>
          <input
            className="date-input-overlay"
            type="date"
            value={date}
            aria-label={t('today.pickDate')}
            onChange={(e) => isValidYmd(e.target.value) && setDate(e.target.value)}
          />
        </div>
        <button type="button" className="icon-btn" onClick={() => setDate(addDays(date, 1))} aria-label={t('today.nextDay')}>
          <Icon name="chevronRight" />
        </button>
      </header>

      <div className="stack">
        {date !== today && (
          <button type="button" className="btn btn-ghost today-link" style={{ alignSelf: 'center' }} onClick={() => setDate(today)}>
            {t('today.goToToday')}
          </button>
        )}
        <BackupReminder />

        <section className="card summary-card" aria-label={t('macro.calories')}>
          <CalorieRing consumed={totals.calories} target={target?.calories ?? null} />
          {score && score.status === 'scored' && (
            <span className="chip chip-brand adherence-pill num">{t('today.adherence', { score: `${score.score}/100` })}</span>
          )}
          <MacroBars consumed={totals} target={target} />
          {plans && !target && (
            <div className="banner banner-brand">
              <Icon name="targets" />
              <div className="stack-sm">
                <span>{t('today.noTarget')}</span>
                <button type="button" className="btn btn-primary" onClick={() => navigate('targets')}>
                  {t('today.setTargets')}
                </button>
              </div>
            </div>
          )}
        </section>

        {MEALS.map((meal) => (
          <MealCard key={meal} meal={meal} entries={byMeal[meal]} onAdd={() => openSheet({ kind: 'add', date, meal })} />
        ))}
      </div>
    </div>
  );
}

function MealCard({ meal, entries, onAdd }: { meal: Meal; entries: FoodEntry[]; onAdd: () => void }) {
  const { openSheet } = useUI();
  const total = sumMacros(entries).calories;
  const mealName = t(`meal.${meal}`);
  return (
    <section className="card card-flush meal-card" aria-label={mealName}>
      <div className="meal-head">
        <h2>{mealName}</h2>
        {entries.length > 0 && <span className="meal-total num">{t('today.mealTotal', { kcal: fmtKcal(total) })}</span>}
        <button type="button" className="icon-btn" onClick={onAdd} aria-label={t('today.addToMeal', { meal: mealName })}>
          <Icon name="plus" />
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="meal-empty">{t('today.emptyMeal')}</p>
      ) : (
        <ul className="list">
          {entries.map((e) => (
            <li key={e.id} className="list-item">
              <button
                type="button"
                className="list-button"
                onClick={() => openSheet({ kind: 'entry', date: e.date, meal: e.meal, entryId: e.id })}
              >
                <span className="list-text">
                  <span className="list-title">
                    {e.name}
                    {e.source === 'photo' && (
                      <>
                        {' '}
                        <span className="chip chip-warning" title={t('entry.sourcePhoto')}>
                          <Icon name="sparkle" />
                          <span className="visually-hidden">{t('entry.sourcePhoto')}</span>
                        </span>
                      </>
                    )}
                  </span>
                  <span className="list-meta entry-macros num">
                    {e.grams != null && <span>{fmtG(e.grams)} g</span>}
                    <span>P {fmtG(e.proteinG)}</span>
                    <span>F {fmtG(e.fatG)}</span>
                    <span>C {fmtG(e.carbsG)}</span>
                  </span>
                </span>
                <span className="list-value">{fmtKcal(e.calories)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
