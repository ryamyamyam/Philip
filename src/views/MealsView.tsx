import { useMemo, useState } from 'react';
import { CategoryChip } from '../components/CategoryChip';
import { DateNav } from '../components/DateNav';
import { Icon } from '../components/Icon';
import { MoveEntryDialog } from '../components/MoveEntryDialog';
import { SwipeRow } from '../components/SwipeRow';
import { useToast } from '../components/Toast';
import { deleteFoodEntry, moveFoodEntry, restoreFoodEntry } from '../db/repo';
import { MEALS, type FoodEntry, type Meal } from '../db/types';
import { useEntriesForDate } from '../hooks/useData';
import { useSwipe } from '../hooks/useSwipe';
import { t } from '../i18n';
import { MEAL_CATEGORY } from '../lib/category';
import { addDays } from '../lib/date';
import { fmtDate, fmtG, fmtKcal } from '../lib/format';
import { groupByMeal, sumMacros } from '../lib/nutrition';
import { useUI } from '../ui';

/** Decorative meal symbols (owner feedback, Nov 2026 — fewer words, more emoji). Hidden from screen readers. */
const MEAL_EMOJI: Record<Meal, string> = { breakfast: '🌅', lunch: '🌞', dinner: '🌙', snack: '🍿' };

/** Foods shown per meal before "+N more" (UX-4: the tab fits on one iPhone screen). */
export const MEAL_PREVIEW = 2;

/** Former Meals tab (round 2). Not routed since Story 3 — Today lists the day's meals. Kept, not deleted. */
export default function MealsView() {
  const { date, setDate, openSheet } = useUI();
  const entries = useEntriesForDate(date);
  const byMeal = useMemo(() => groupByMeal(entries ?? []), [entries]);
  const swipe = useSwipe(
    () => setDate(addDays(date, 1)),
    () => setDate(addDays(date, -1)),
  );
  return (
    <div className="view view-fit" {...swipe}>
      <DateNav />
      <div className="stack-sm meals-stack">
        {MEALS.map((meal) => (
          <MealCard key={`${date}-${meal}`} meal={meal} entries={byMeal[meal]} onAdd={() => openSheet({ kind: 'add', date, meal })} />
        ))}
      </div>
    </div>
  );
}

/**
 * One meal's foods with swipe Move/Delete and tap-to-edit. Used by Today (Story 3: no "+" and no
 * "+N more" there — `onAdd` and `collapse` are optional) and by the old Meals tab.
 */
export function MealCard({ meal, entries, onAdd, collapse = true }: { meal: Meal; entries: FoodEntry[]; onAdd?: () => void; collapse?: boolean }) {
  const { openSheet } = useUI();
  const toast = useToast();
  const [moving, setMoving] = useState<FoodEntry | null>(null);
  const [expanded, setExpanded] = useState(false);

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
  const hidden = expanded || !collapse ? 0 : Math.max(0, entries.length - MEAL_PREVIEW);
  const shown = hidden ? entries.slice(0, MEAL_PREVIEW) : entries;
  return (
    <section className="card card-flush meal-card" aria-label={mealName}>
      <div className="meal-head">
        <h2>
          <CategoryChip category={MEAL_CATEGORY[meal]} icon={MEAL_EMOJI[meal]} label={mealName} />
        </h2>
        {entries.length > 0 && <span className="meal-total pm-display num">{t('today.mealTotal', { kcal: fmtKcal(total) })}</span>}
        {onAdd && (
          <button type="button" className="icon-btn" onClick={onAdd} aria-label={t('today.addToMeal', { meal: mealName })}>
            <Icon name="plus" />
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="meal-empty">{t('today.emptyMeal')}</p>
      ) : (
        <ul className="list">
          {shown.map((e) => (
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
                      {e.grams != null && <span className="entry-grams">{fmtG(e.grams)} g</span>}
                      <MacroChip k="p" value={e.proteinG} />
                      <MacroChip k="f" value={e.fatG} />
                      <MacroChip k="c" value={e.carbsG} />
                    </span>
                  </span>
                  <span className="list-value pm-display num">{fmtKcal(e.calories)}</span>
                </button>
              </SwipeRow>
            </li>
          ))}
          {hidden > 0 && (
            <li className="list-item">
              <button type="button" className="btn btn-ghost meal-more" aria-expanded={false} onClick={() => setExpanded(true)}>
                {t('meals.more', { count: hidden })}
              </button>
            </li>
          )}
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
