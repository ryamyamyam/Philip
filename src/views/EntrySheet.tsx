import { useEffect, useId, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { MacroFields, toFormValues, validateMacroForm, type MacroFormErrors, type MacroFormValues } from '../components/MacroFields';
import { MealPicker } from '../components/MealPicker';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import {
  addFoodEntry,
  addSavedFood,
  deleteFoodEntry,
  duplicateFoodEntry,
  restoreFoodEntry,
  saveEntryAsFood,
  updateFoodEntry,
} from '../db/repo';
import type { Macros, Meal, YMD } from '../db/types';
import { useEntry } from '../hooks/useData';
import { t } from '../i18n';
import { isValidYmd } from '../lib/date';
import { parseDecimal } from '../lib/numbers';
import { scaleToGrams } from '../lib/nutrition';
import { useUI } from '../ui';

interface Props {
  date: YMD;
  meal: Meal;
  entryId?: string;
}

/** Manual add / edit of a single food entry. */
export function EntrySheet({ date, meal, entryId }: Props) {
  const { closeSheet } = useUI();
  const toast = useToast();
  const entry = useEntry(entryId);
  const editing = Boolean(entryId);
  const nameId = useId();
  const dateId = useId();

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [mealValue, setMeal] = useState<Meal>(meal);
  const [dateValue, setDateValue] = useState<YMD>(date);
  const [values, setValues] = useState<MacroFormValues>(toFormValues({}));
  const [errors, setErrors] = useState<MacroFormErrors>({});
  const [saveForLater, setSaveForLater] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  // Weight-linked scaling: when the base weight is known, changing grams rescales macros
  // until the user edits a macro directly.
  const scaleBase = useRef<{ grams: number; macros: Macros } | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!editing || !entry || loaded.current) return;
    loaded.current = true;
    setName(entry.name);
    setMeal(entry.meal);
    setDateValue(entry.date);
    setValues(toFormValues(entry));
    if (entry.grams && entry.grams > 0) {
      scaleBase.current = { grams: entry.grams, macros: entry };
    }
  }, [editing, entry]);

  const onField = (key: keyof MacroFormValues, v: string) => {
    setErrors((e) => ({ ...e, [key]: undefined }));
    if (key === 'grams' && scaleBase.current) {
      const g = parseDecimal(v);
      if (g != null && !Number.isNaN(g) && g > 0) {
        const scaled = scaleToGrams(scaleBase.current.macros, scaleBase.current.grams, g);
        if (scaled) {
          setValues({ grams: v, ...toFormValuesMacros(scaled) });
          return;
        }
      }
    } else if (key !== 'grams') {
      scaleBase.current = null;
    }
    setValues((s) => ({ ...s, [key]: v }));
  };

  const save = async () => {
    const trimmed = name.trim();
    const { errors: errs, values: parsed } = validateMacroForm(values);
    setErrors(errs);
    setNameError(!trimmed);
    if (!trimmed || !parsed || !isValidYmd(dateValue)) return;
    setBusy(true);
    try {
      if (editing && entryId) {
        await updateFoodEntry(entryId, { name: trimmed, meal: mealValue, date: dateValue, ...parsed });
      } else {
        let savedFoodId: string | null = null;
        if (saveForLater) savedFoodId = await addSavedFood({ name: trimmed, ...parsed });
        await addFoodEntry({
          date: dateValue,
          meal: mealValue,
          name: trimmed,
          ...parsed,
          source: 'manual',
          savedFoodId,
          estimate: null,
        });
      }
      closeSheet();
    } catch {
      toast(t('error.generic'));
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!entryId) return;
    const removed = await deleteFoodEntry(entryId);
    closeSheet();
    if (removed) toast(t('today.deleted', { name: removed.name }), { label: t('common.undo'), run: () => void restoreFoodEntry(removed) });
  };

  const duplicate = async () => {
    if (!entryId) return;
    await duplicateFoodEntry(entryId);
    closeSheet();
    toast(t('today.duplicated'));
  };

  const saveToFoods = async () => {
    if (!entryId) return;
    await saveEntryAsFood(entryId);
    toast(t('entry.savedToFoods'));
  };

  if (editing && entry === null) {
    return (
      <Sheet title={t('entry.editTitle')} onClose={closeSheet}>
        <p className="empty">{t('error.generic')}</p>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={editing ? t('entry.editTitle') : t('entry.addTitle')}
      onClose={closeSheet}
      full
      footer={
        <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={busy || (editing && !entry)}>
          {t('common.save')}
        </button>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
      >
        {entry?.source === 'photo' && <span className="chip chip-warning">{t('entry.sourcePhoto')}</span>}
        {entry?.source === 'saved' && <span className="chip">{t('entry.sourceSaved')}</span>}
        <div className="field">
          <label className="field-label" htmlFor={nameId}>
            {t('entry.name')}
          </label>
          <input
            id={nameId}
            className="input"
            value={name}
            placeholder={t('entry.namePlaceholder')}
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="next"
            maxLength={120}
            aria-invalid={nameError || undefined}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(false);
            }}
          />
          {nameError && <span className="field-error">{t('error.nameRequired')}</span>}
        </div>
        <MealPicker value={mealValue} onChange={setMeal} />
        <MacroFields
          values={values}
          errors={errors}
          onChange={onField}
          gramsHint={scaleBase.current ? t('entry.scaleHint') : undefined}
        />
        {editing && (
          <div className="field">
            <label className="field-label" htmlFor={dateId}>
              {t('entry.date')}
            </label>
            <input
              id={dateId}
              className="input"
              type="date"
              value={dateValue}
              onChange={(e) => isValidYmd(e.target.value) && setDateValue(e.target.value)}
            />
          </div>
        )}
        {!editing && (
          <label className="checkbox-row">
            <input type="checkbox" checked={saveForLater} onChange={(e) => setSaveForLater(e.target.checked)} />
            <span>{t('entry.saveForLater')}</span>
          </label>
        )}
        {/* Hidden submit lets the iOS keyboard "Go" key save. */}
        <button type="submit" hidden />
      </form>

      {editing && entry && (
        <div className="stack-sm" style={{ marginTop: 'var(--space-6)' }}>
          <button type="button" className="btn btn-secondary btn-block" onClick={duplicate}>
            <Icon name="copy" /> {t('common.duplicate')}
          </button>
          {!entry.savedFoodId && (
            <button type="button" className="btn btn-secondary btn-block" onClick={saveToFoods}>
              <Icon name="bookmark" /> {t('entry.saveToFoods')}
            </button>
          )}
          <button type="button" className="btn btn-danger-ghost btn-block" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" /> {t('common.delete')}
          </button>
        </div>
      )}

      {confirmDelete && entry && (
        <ConfirmDialog
          title={t('entry.deleteConfirm', { name: entry.name })}
          confirmLabel={t('common.delete')}
          destructive
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Sheet>
  );
}

function toFormValuesMacros(m: Macros): Omit<MacroFormValues, 'grams'> {
  const { grams: _g, ...rest } = toFormValues(m);
  return rest;
}
