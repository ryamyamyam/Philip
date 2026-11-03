import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FoodTextBox } from '../components/FoodTextBox';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { deleteSavedMeal, restoreSavedMeal } from '../db/repo';
import type { Meal, SavedMeal, YMD } from '../db/types';
import { useSavedMeals } from '../hooks/useData';
import { t } from '../i18n';
import { fmtKcal } from '../lib/format';
import { sumMacros } from '../lib/nutrition';
import { useUI, type SheetState } from '../ui';
import { fromSavedMeal, manualItem } from './photo/reviewModel';
import { useTextFood } from './photo/useTextFood';

type ReviewState = Extract<SheetState, { kind: 'review' }>;

/**
 * Typed food, saved meals and by-hand entry (owner feedback, Nov 2026). Shown inline on Today
 * behind "Enter yourself", and inside the Add food sheet (Meals). Every path ends in the review
 * sheet, where the meal is chosen and the save is confirmed.
 */
export function AddPanel({ date, meal, autoFocus = false }: { date: YMD; meal: Meal; autoFocus?: boolean }) {
  const { openSheet } = useUI();
  const toast = useToast();
  const meals = useSavedMeals();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<SavedMeal | null>(null);
  const textFood = useTextFood();

  const review = (extra: Partial<ReviewState> & Pick<ReviewState, 'items'>) =>
    openSheet({ kind: 'review', date, meal, provider: 'gemini', model: '', notes: [], analyzedAt: Date.now(), ...extra });

  // Typed text → review list. AI optional: falls back to a local parse, never blocks saving.
  const onText = async (text: string) => {
    setBusy(true);
    try {
      const r = await textFood(text);
      review({ items: r.items, model: r.model, notes: r.notes, notice: r.notice });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (m: SavedMeal) => {
    setDeleting(null);
    const removed = await deleteSavedMeal(m.id);
    if (removed) toast(t('meals.deleted', { name: removed.name }), { label: t('common.undo'), run: () => void restoreSavedMeal(removed) });
  };

  return (
    <div className="stack">
      <FoodTextBox onSend={onText} busy={busy} autoFocus={autoFocus} />

      {meals && meals.length > 0 && (
        <section className="stack-sm" aria-labelledby="saved-meals-h">
          <h3 id="saved-meals-h" className="section-title">
            {t('meals.saved')}
          </h3>
          <ul className="card card-flush list">
            {meals.map((m) => (
              <li key={m.id} className="list-item">
                <button
                  type="button"
                  className="list-button"
                  aria-label={t('meals.use', { name: m.name })}
                  onClick={() => review({ items: fromSavedMeal(m.items), savedMealId: m.id, title: m.name })}
                >
                  <span className="list-text">
                    <span className="list-title">{m.name}</span>
                    <span className="list-meta">{m.items.map((i) => i.name).join(', ')}</span>
                  </span>
                  <span className="list-value num">{fmtKcal(sumMacros(m.items).calories)}</span>
                </button>
                <button type="button" className="icon-btn" aria-label={t('meals.delete', { name: m.name })} onClick={() => setDeleting(m)}>
                  <Icon name="trash" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button type="button" className="btn btn-ghost btn-block" onClick={() => review({ items: [manualItem()] })}>
        <Icon name="pencil" /> {t('add.manual')}
      </button>
      {deleting && (
        <ConfirmDialog
          title={t('meals.deleteConfirm', { name: deleting.name })}
          body={<p>{t('meals.deleteBody')}</p>}
          confirmLabel={t('common.delete')}
          destructive
          onConfirm={() => void remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/** Add food sheet (still used by Meals): photo buttons + the same panel as Today. */
export function AddSheet({ date, meal }: { date: YMD; meal: Meal }) {
  const { closeSheet, openSheet } = useUI();
  const onPhoto = (file: File | undefined) => {
    if (file) openSheet({ kind: 'photo', date, meal, file });
  };
  return (
    <Sheet title={t('add.title')} onClose={closeSheet}>
      <div className="stack">
        <div className="add-actions">
          <label className="add-action">
            <Icon name="camera" />
            <span className="add-action-title">{t('add.camera')}</span>
            <input type="file" accept="image/*" capture="environment" className="visually-hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
          <label className="add-action">
            <Icon name="upload" />
            <span className="add-action-title">{t('add.library')}</span>
            <input type="file" accept="image/*" className="visually-hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
        </div>
        <AddPanel date={date} meal={meal} />
      </div>
    </Sheet>
  );
}
