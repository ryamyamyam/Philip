import { useEffect, useId, useRef, useState } from 'react';
import type { FoodEntry, Meal, YMD } from '../db/types';
import { t } from '../i18n';
import { isValidYmd } from '../lib/date';
import { MealPicker } from './MealPicker';

/** Small dialog to move an entry to another day and/or meal (reached from the swipe actions). */
export function MoveEntryDialog({
  entry,
  onMove,
  onCancel,
}: {
  entry: FoodEntry;
  onMove: (target: { date: YMD; meal: Meal }) => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const dateId = useId();
  const [date, setDate] = useState<YMD>(entry.date);
  const [meal, setMeal] = useState<Meal>(entry.meal);
  const dateRef = useRef<HTMLInputElement>(null);
  const unchanged = date === entry.date && meal === entry.meal;

  useEffect(() => {
    dateRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="dialog" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog-box" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{t('today.moveTitle', { name: entry.name })}</h2>
        <p className="muted small">{t('today.moveBody')}</p>
        <div className="field">
          <label className="field-label" htmlFor={dateId}>
            {t('entry.date')}
          </label>
          <input
            ref={dateRef}
            id={dateId}
            className="input"
            type="date"
            value={date}
            onChange={(e) => isValidYmd(e.target.value) && setDate(e.target.value)}
          />
        </div>
        <MealPicker value={meal} onChange={setMeal} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" disabled={unchanged} onClick={() => onMove({ date, meal })}>
            {t('today.moveConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
