import { useId } from 'react';
import { MEALS, type Meal } from '../db/types';
import { t } from '../i18n';

export function MealPicker({ value, onChange }: { value: Meal; onChange: (m: Meal) => void }) {
  const id = useId();
  return (
    <div className="field">
      <span className="field-label" id={id}>
        {t('entry.meal')}
      </span>
      <div className="segmented" role="radiogroup" aria-labelledby={id}>
        {MEALS.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={value === m} onClick={() => onChange(m)}>
            {t(`meal.${m}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
