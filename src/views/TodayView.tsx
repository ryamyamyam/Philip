import { useMemo, useState } from 'react';
import { BackupReminder } from '../components/BackupReminder';
import { DateNav } from '../components/DateNav';
import { ActionButton, ActionFileButton } from '../components/ActionButton';
import { AmbientScene } from '../components/AmbientScene';
import { DeckActions } from '../components/ControlDeck';
import { TodayCard } from '../components/TodayCard';
import { MEALS } from '../db/types';
import { useEntriesForDate, useProfile, useSavedMeals, useTargetPlans } from '../hooks/useData';
import { useSwipe } from '../hooks/useSwipe';
import { t } from '../i18n';
import { addDays, todayYmd } from '../lib/date';
import { defaultMealFor, everydayToOffer } from '../lib/meals';
import { fmtKcal } from '../lib/format';
import { Icon } from '../components/Icon';
import { fromSavedMeal } from './photo/reviewModel';
import { groupByMeal, planForDate, sumMacros, targetForDate } from '../lib/nutrition';
import { adherenceScore } from '../lib/adherence';
import { phaseFor } from '../lib/remaining';
import { useUI } from '../ui';
import { AddPanel } from './AddSheet';
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
  // OBS-A0308B: everyday saved meals ("my usual breakfast") for meals still empty on this day.
  const savedMeals = useSavedMeals();
  const usual = useMemo(
    () => (entries && savedMeals ? everydayToOffer(savedMeals, new Set(MEALS.filter((m) => byMeal[m].length > 0))) : []),
    [entries, savedMeals, byMeal],
  );
  const meal = defaultMealFor();
  const [typing, setTyping] = useState(false);

  const swipe = useSwipe(
    () => setDate(addDays(date, 1)),
    () => setDate(addDays(date, -1)),
  );

  const onPhoto = (file: File | undefined) => {
    if (file) openSheet({ kind: 'photo', date, meal, file });
  };

  return (
    <div className="view view-fit view-today" {...swipe}>
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
            onAsk={target && isToday ? () => openSheet({ kind: 'suggest', date }) : undefined}
          />
        )}
        <DeckActions label={t('deck.log')} className="log-actions">
          {/* One photo button (owner feedback, Nov 3): without `capture`, iOS offers Take Photo or Photo Library. */}
          <ActionFileButton variant="primary" size="lg" icon="camera" className="log-photo" accept="image/*" onFile={onPhoto} data-tour="photo">
            {t('add.library')}
          </ActionFileButton>
          <ActionButton
            variant="quiet"
            size="lg"
            icon="pencil"
            className="log-type"
            data-tour="type"
            aria-expanded={typing}
            aria-controls="today-type"
            onClick={() => setTyping((v) => !v)}
          >
            {t('today.enterYourself')}
          </ActionButton>
        </DeckActions>
        {typing && (
          <section id="today-type" className="card add-inline" aria-label={t('add.title')}>
            <AddPanel date={date} meal={meal} autoFocus />
          </section>
        )}
        {!isToday && <p className="subtle log-date-note">{t('today.loggingPast')}</p>}

        {usual.length > 0 && (
          <section className="stack-sm usual-meals" aria-labelledby="usual-meals-h">
            <h3 id="usual-meals-h" className="section-title">
              {t('meals.usualTitle')}
            </h3>
            <ul className="card card-flush list">
              {usual.map((m) => (
                <li key={m.id} className="list-item">
                  <button
                    type="button"
                    className="list-button"
                    aria-label={t('meals.usualLog', { meal: t(`meal.${m.everyday ?? 'snack'}`).toLocaleLowerCase(), name: m.name })}
                    onClick={() =>
                      openSheet({
                        kind: 'review',
                        date,
                        meal: m.everyday ?? meal,
                        items: fromSavedMeal(m.items),
                        provider: 'gemini',
                        model: '',
                        notes: [],
                        analyzedAt: Date.now(),
                        savedMealId: m.id,
                        title: m.name,
                      })
                    }
                  >
                    <span className="list-text">
                      <span className="list-title">
                        {t(`meal.${m.everyday ?? 'snack'}`)}: {m.name}
                      </span>
                      <span className="list-meta">{m.items.map((i) => i.name).join(', ')}</span>
                    </span>
                    <span className="list-value pm-display num">{fmtKcal(sumMacros(m.items).calories)}</span>
                    <Icon name="plus" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="subtle">{t('meals.usualHint')}</p>
          </section>
        )}

        <section className="stack-sm" aria-label={t('today.logged')}>
          {entries && entries.length === 0 && (
            <div className="today-empty-world">
              <AmbientScene variant="empty" />
              <p className="subtle today-empty">{t('today.nothingLogged')}</p>
            </div>
          )}
          {MEALS.filter((m) => byMeal[m].length > 0).map((m) => (
            <MealCard key={`${date}-${m}`} meal={m} entries={byMeal[m]} collapse={false} />
          ))}
        </section>

      </div>
    </div>
  );
}
