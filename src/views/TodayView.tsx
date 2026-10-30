import { useMemo, useState } from 'react';
import { CalorieRing } from '../components/CalorieRing';
import { Icon } from '../components/Icon';
import { MacroBars } from '../components/MacroBars';
import { BackupReminder } from '../components/BackupReminder';
import { MoveEntryDialog } from '../components/MoveEntryDialog';
import { SwipeRow } from '../components/SwipeRow';
import { useToast } from '../components/Toast';
import { deleteFoodEntry, moveFoodEntry, restoreFoodEntry } from '../db/repo';
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
          <button type="button" className="btn btn-secondary today-link" onClick={() => setDate(today)}>
            <Icon name={date > today ? 'chevronLeft' : 'chevronRight'} />
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
  const toast = useToast();
  const [moving, setMoving] = useState<FoodEntry | null>(null);

  const remove = async (e: FoodEntry) => {
    const removed = await deleteFoodEntry(e.id);
    if (removed) toast(t('today.deleted', { name: removed.name }), { label: t('common.undo'), run: () => void restoreFoodEntry(removed) });
  };
  const move = async (e: FoodEntry, target: { date: string; meal: Meal }) => {
    setMoving(null);
    const prev = await moveFoodEntry(e.id, target);
    if (prev) toast(t('today.moved', { date: fmtDate(target.date, 'weekday') }), { label: t('common.undo'), run: () => void moveFoodEntry(e.id, prev) });
  };

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
            <li key={e.id} className="list-item list-item-swipe">
              <SwipeRow
                label={t('today.entryActions', { name: e.name })}
                actions={
                  <>
                    <button type="button" className="swipe-action swipe-action-move" onClick={() => setMoving(e)}>
                      <Icon name="calendar" />
                      <span>{t('today.move')}</span>
                    </button>
                    <button type="button" className="swipe-action swipe-action-delete" onClick={() => void remove(e)}>
                      <Icon name="trash" />
                      <span>{t('common.delete')}</span>
                    </button>
                  </>
                }
              >
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
                    {e.grams != null && <span className="entry-grams">{fmtG(e.grams)} g</span>}
                    <MacroChip k="p" value={e.proteinG} />
                    <MacroChip k="f" value={e.fatG} />
                    <MacroChip k="c" value={e.carbsG} />
                  </span>
                </span>
                <span className="list-value">{fmtKcal(e.calories)}</span>
              </button>
              </SwipeRow>
            </li>
          ))}
        </ul>
      )}
      {moving && <MoveEntryDialog entry={moving} onCancel={() => setMoving(null)} onMove={(target) => void move(moving, target)} />}
    </section>
  );
}

const MACRO_LABEL = { p: 'macro.protein', f: 'macro.fat', c: 'macro.carbs' } as const;

/** Compact macro value: letter + grams in a rounded square, one color per macro (OBS-352C94). */
function MacroChip({ k, value }: { k: 'p' | 'f' | 'c'; value: number }) {
  return (
    <span className={`macro-chip macro-chip-${k}`}>
      <span aria-hidden="true">{k.toUpperCase()}</span>
      <span className="visually-hidden">{t(MACRO_LABEL[k])}</span> {fmtG(value)}
      <span className="visually-hidden"> {t('common.g')}</span>
    </span>
  );
}
