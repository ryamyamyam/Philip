import { useId, useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { MealPicker } from '../components/MealPicker';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { addFoodEntry, deleteFoodEntry, logSavedFood } from '../db/repo';
import type { Meal, YMD } from '../db/types';
import { useRecentEntries, useSavedFoods } from '../hooks/useData';
import { t } from '../i18n';
import { fmtG, fmtKcal } from '../lib/format';
import { frequentFoods, matchesQuery, recentFoods, savedToQuick, type QuickFood } from '../lib/recents';
import { useUI } from '../ui';
import { db } from '../db/db';

type ListTab = 'recent' | 'frequent' | 'favorites';

export function AddSheet({ date, meal: initialMeal }: { date: YMD; meal: Meal }) {
  const { closeSheet, openSheet } = useUI();
  const toast = useToast();
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<ListTab>('recent');
  const entries = useRecentEntries();
  const saved = useSavedFoods();
  const searchId = useId();

  const lists = useMemo(() => {
    if (!entries || !saved) return null;
    return {
      recent: recentFoods(entries, saved),
      frequent: frequentFoods(entries, saved),
      favorites: saved.filter((s) => s.favorite).sort((a, b) => a.name.localeCompare(b.name)).map(savedToQuick),
    };
  }, [entries, saved]);

  const searchResults = useMemo(() => {
    if (!query.trim() || !entries || !saved) return null;
    const fromSaved = saved.filter((s) => matchesQuery(s.name, query)).map(savedToQuick);
    const savedKeys = new Set(fromSaved.map((f) => f.savedFoodId));
    const fromRecent = recentFoods(entries, saved, 200).filter(
      (f) => matchesQuery(f.name, query) && !(f.savedFoodId && savedKeys.has(f.savedFoodId)),
    );
    return [...fromSaved, ...fromRecent].slice(0, 40);
  }, [query, entries, saved]);

  const onPhoto = (file: File | undefined) => {
    if (file) openSheet({ kind: 'photo', date, meal, file });
  };

  const relog = async (f: QuickFood) => {
    let id: string;
    if (f.savedFoodId && (await db.savedFoods.get(f.savedFoodId))) {
      id = await logSavedFood(f.savedFoodId, date, meal);
    } else {
      id = await addFoodEntry({
        date,
        meal,
        name: f.name,
        grams: f.grams,
        calories: f.calories,
        proteinG: f.proteinG,
        fatG: f.fatG,
        carbsG: f.carbsG,
        source: 'manual',
        savedFoodId: null,
        estimate: null,
      });
    }
    toast(t('add.logged', { name: f.name }), {
      label: t('common.undo'),
      run: async () => {
        const removed = await deleteFoodEntry(id);
        if (removed?.savedFoodId) {
          const s = await db.savedFoods.get(removed.savedFoodId);
          if (s && removed.source === 'saved') await db.savedFoods.update(s.id, { useCount: Math.max(0, s.useCount - 1) });
        }
      },
    });
    closeSheet();
  };

  const list = searchResults ?? lists?.[tab] ?? [];

  return (
    <Sheet title={t('add.title')} onClose={closeSheet} full>
      <div className="stack">
        <MealPicker value={meal} onChange={setMeal} />

        <div className="add-actions">
          <label className="add-action">
            <Icon name="camera" />
            <span className="add-action-title">{t('add.camera')}</span>
            <span className="add-action-hint">{t('add.cameraHint')}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="visually-hidden"
              onChange={(e) => onPhoto(e.target.files?.[0])}
            />
          </label>
          <button type="button" className="add-action" onClick={() => openSheet({ kind: 'entry', date, meal })}>
            <Icon name="pencil" />
            <span className="add-action-title">{t('add.manual')}</span>
            <span className="add-action-hint">{t('add.manualHint')}</span>
          </button>
        </div>
        <label className="btn btn-ghost" style={{ alignSelf: 'center' }}>
          {t('add.library')}
          <input type="file" accept="image/*" className="visually-hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>

        <div className="field">
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
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>

        {!searchResults && (
          <div className="segmented" role="tablist">
            {(['recent', 'frequent', 'favorites'] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>
                {t(`add.${k}`)}
              </button>
            ))}
          </div>
        )}

        <div className="card card-flush">
          {list.length === 0 ? (
            <p className="empty">{searchResults ? t('add.noResults') : t('add.empty')}</p>
          ) : (
            <ul className="list">
              {list.map((f) => (
                <li key={f.key} className="list-item">
                  <button type="button" className="list-button" onClick={() => void relog(f)} aria-label={t('add.relog', { name: f.name })}>
                    <span className="list-text">
                      <span className="list-title">
                        {f.savedFoodId && lists?.favorites.some((x) => x.savedFoodId === f.savedFoodId) && (
                          <span className="fav-star">
                            <Icon name="star" filled />{' '}
                          </span>
                        )}
                        {f.name}
                      </span>
                      <span className="list-meta num">
                        {f.grams != null ? `${fmtG(f.grams)} g · ` : ''}P {fmtG(f.proteinG)} · F {fmtG(f.fatG)} · C {fmtG(f.carbsG)}
                      </span>
                    </span>
                    <span className="list-value">{fmtKcal(f.calories)}</span>
                  </button>
                  {f.savedFoodId && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t('foods.edit')}
                      onClick={() => openSheet({ kind: 'savedFood', id: f.savedFoodId! })}
                    >
                      <Icon name="more" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => openSheet({ kind: 'myFoods', date, meal })}>
          <Icon name="bookmark" /> {t('add.myFoods')}
        </button>
      </div>
    </Sheet>
  );
}
