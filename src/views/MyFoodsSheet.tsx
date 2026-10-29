import { useId, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { logSavedFood, updateSavedFood } from '../db/repo';
import type { Meal, YMD } from '../db/types';
import { useSavedFoods } from '../hooks/useData';
import { t } from '../i18n';
import { fmtG, fmtKcal } from '../lib/format';
import { matchesQuery } from '../lib/recents';
import { useUI } from '../ui';

export function MyFoodsSheet({ date, meal }: { date: YMD; meal: Meal }) {
  const { closeSheet, openSheet } = useUI();
  const toast = useToast();
  const saved = useSavedFoods();
  const [query, setQuery] = useState('');
  const searchId = useId();
  const list = useMemo(
    () =>
      (saved ?? [])
        .filter((s) => matchesQuery(s.name, query))
        .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name)),
    [saved, query],
  );

  return (
    <Sheet title={t('foods.title')} onClose={closeSheet} full>
      <div className="stack">
        <p className="subtle">{t('add.toMeal', { meal: t(`meal.${meal}`) })}</p>
        <label className="visually-hidden" htmlFor={searchId}>
          {t('add.search')}
        </label>
        <input
          id={searchId}
          className="input"
          type="search"
          placeholder={t('add.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="card card-flush">
          {list.length === 0 ? (
            <p className="empty">{saved?.length ? t('add.noResults') : t('add.empty')}</p>
          ) : (
            <ul className="list">
              {list.map((f) => (
                <li key={f.id} className="list-item">
                  <button
                    type="button"
                    className="icon-btn fav-toggle"
                    aria-pressed={f.favorite}
                    aria-label={f.favorite ? t('foods.unfavorite') : t('foods.favorite')}
                    onClick={() => void updateSavedFood(f.id, { favorite: !f.favorite })}
                  >
                    <Icon name="star" filled={f.favorite} />
                  </button>
                  <button
                    type="button"
                    className="list-button"
                    aria-label={t('add.relog', { name: f.name })}
                    onClick={async () => {
                      await logSavedFood(f.id, date, meal);
                      toast(t('add.logged', { name: f.name }));
                      closeSheet();
                    }}
                  >
                    <span className="list-text">
                      <span className="list-title">{f.name}</span>
                      <span className="list-meta num">
                        {f.grams != null ? `${fmtG(f.grams)} g · ` : ''}
                        {t('foods.uses', { count: f.useCount })}
                      </span>
                    </span>
                    <span className="list-value">{fmtKcal(f.calories)}</span>
                  </button>
                  <button type="button" className="icon-btn" aria-label={t('foods.edit')} onClick={() => openSheet({ kind: 'savedFood', id: f.id })}>
                    <Icon name="pencil" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  );
}
