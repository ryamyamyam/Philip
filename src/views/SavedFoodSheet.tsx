import { useEffect, useId, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { MacroFields, toFormValues, validateMacroForm, type MacroFormErrors, type MacroFormValues } from '../components/MacroFields';
import { Sheet } from '../components/Sheet';
import { db } from '../db/db';
import { deleteSavedFood, updateSavedFood } from '../db/repo';
import { t } from '../i18n';
import { useUI } from '../ui';

/** Edit a saved food. Past entries keep their copied values. */
export function SavedFoodSheet({ id }: { id: string }) {
  const { closeSheet } = useUI();
  const food = useLiveQuery(async () => (await db.savedFoods.get(id)) ?? null, [id]);
  const nameId = useId();
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [values, setValues] = useState<MacroFormValues>(toFormValues({}));
  const [errors, setErrors] = useState<MacroFormErrors>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (food && !loaded.current) {
      loaded.current = true;
      setName(food.name);
      setValues(toFormValues(food));
    }
  }, [food]);

  const save = async () => {
    const { errors: errs, values: parsed } = validateMacroForm(values);
    setErrors(errs);
    setNameError(!name.trim());
    if (!parsed || !name.trim()) return;
    await updateSavedFood(id, { name: name.trim(), ...parsed });
    closeSheet();
  };

  if (food === null) {
    return (
      <Sheet title={t('foods.edit')} onClose={closeSheet}>
        <p className="empty">{t('add.noResults')}</p>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={t('foods.edit')}
      onClose={closeSheet}
      full
      footer={
        <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={!food}>
          {t('common.save')}
        </button>
      }
    >
      <div className="stack">
        <p className="subtle">{t('foods.editNote')}</p>
        <div className="field">
          <label className="field-label" htmlFor={nameId}>
            {t('entry.name')}
          </label>
          <input
            id={nameId}
            className="input"
            value={name}
            maxLength={120}
            aria-invalid={nameError || undefined}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(false);
            }}
          />
          {nameError && <span className="field-error">{t('error.nameRequired')}</span>}
        </div>
        <MacroFields values={values} errors={errors} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />
        {food && (
          <label className="checkbox-row">
            <input type="checkbox" checked={food.favorite} onChange={(e) => void updateSavedFood(id, { favorite: e.target.checked })} />
            <span>{t('foods.favorite')}</span>
          </label>
        )}
        <button type="button" className="btn btn-danger-ghost btn-block" onClick={() => setConfirmDelete(true)}>
          <Icon name="trash" /> {t('common.delete')}
        </button>
      </div>
      {confirmDelete && food && (
        <ConfirmDialog
          title={t('foods.deleteConfirm', { name: food.name })}
          confirmLabel={t('common.delete')}
          destructive
          onConfirm={async () => {
            await deleteSavedFood(id);
            closeSheet();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Sheet>
  );
}
