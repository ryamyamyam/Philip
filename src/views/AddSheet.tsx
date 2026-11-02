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
import { FoodTextBox } from '../components/FoodTextBox';
import { useTextFood } from './photo/useTextFood';

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
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const textFood = useTextFood();

  // Typed text → review list (OBS-A2F21F). AI optional: falls back to a local parse, never blocks saving.
  const onText = async (text: string) => {
    setBusy(true);
    try {
      const r = await textFood(text);
      openSheet({ kind: 'review', date, meal, items: r.items, provider: 'gemini', model: r.model, notes: r.notes, analyzedAt: Date.now(), notice: r.notice });
    } finally {
      setBusy(false);
    }
  };

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
    <Sheet title={t('add.title')} onClose={closeSheet} full={more}>
      <div className="stack">
        <p className="subtle add-to-meal">{t('add.toMeal', { meal: t(`meal.${meal}`) })}</p>
        <div className="add-actions">
          <label className="add-action">
            <Icon name="camera" />
            <span className="add-action-title">{t('add.camera')}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="visually-hidden"
              onChange={(e) => onPhoto(e.target.files?.[0])}
            />
          </label>
          <label className="add-action">
            <Icon name="upload" />
            <span className="add-action-title">{t('add.library')}</span>
            <input type="file" accept="image/*" className="visually-hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
        </div>
        <FoodTextBox onSend={onText} busy={busy} />

        <button type="button" className="btn btn-ghost add-more-link" aria-expanded={more} onClick={() => setMore((m) => !m)}>
          {t('add.moreOptions')}
        </button>
        {more && (
          <div className="stack add-more" role="region" aria-label={t('add.moreOptions')}>
        <MealPicker value={meal} onChange={setMeal} />
        <div className="row add-more-actions">
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => openSheet({ kind: 'entry', date, meal })}>
            <Icon name="pencil" /> {t('add.manual')}
          </button>
          <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => openSheet({ kind: 'handoff', date, meal, file: null })}>
            <Icon name="sparkle" /> {t('add.claude')}
          </button>
        </div>
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
        )}
      </div>
    </Sheet>
  );
}
