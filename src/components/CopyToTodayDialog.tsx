import { useEffect, useId, useState } from 'react';
import type { FoodEntry, Meal } from '../db/types';
import { t } from '../i18n';
import { MealPicker } from './MealPicker';

/**
 * Story 12: "Copy to today" (a swipe action next to Move and Delete). Pick the meal it goes into
 * (the original meal is preselected); the copy lands on today with the same foods and numbers.
 */
export function CopyToTodayDialog({ entry, onCopy, onCancel }: { entry: FoodEntry; onCopy: (meal: Meal) => void; onCancel: () => void }) {
  const titleId = useId();
  const [meal, setMeal] = useState<Meal>(entry.meal);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="dialog" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog-box" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{t('today.copyTitle', { name: entry.name })}</h2>
        <p className="muted small">{t('today.copyBody')}</p>
        <MealPicker value={meal} onChange={setMeal} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onCopy(meal)}>
            {t('today.copyConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
