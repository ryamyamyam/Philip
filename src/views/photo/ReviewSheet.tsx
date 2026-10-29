import { useId, useMemo, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Icon } from '../../components/Icon';
import { MealPicker } from '../../components/MealPicker';
import { NumberField } from '../../components/NumberField';
import { Sheet } from '../../components/Sheet';
import { useToast } from '../../components/Toast';
import { addFoodEntries } from '../../db/repo';
import type { Meal, YMD } from '../../db/types';
import { t } from '../../i18n';
import { fmtG, fmtKcal } from '../../lib/format';
import { LIMITS, type FieldError } from '../../lib/numbers';
import { useUI } from '../../ui';
import { blankItem, editItem, reviewTotals, toEntries, validateItems, type ItemErrors, type ReviewItem } from './reviewModel';

interface Props {
  date: YMD;
  meal: Meal;
  items: ReviewItem[];
  provider: 'gemini' | 'claude-handoff';
  model: string;
  notes: string[];
  analyzedAt: number;
}

/** Mandatory review step: nothing from an AI estimate is saved until the user confirms here. */
export default function ReviewSheet(props: Props) {
  const { closeSheet } = useUI();
  const toast = useToast();
  const [items, setItems] = useState<ReviewItem[]>(() => (props.items.length ? props.items : [blankItem()]));
  const [meal, setMeal] = useState<Meal>(props.meal);
  const [errors, setErrors] = useState<Record<string, ItemErrors>>({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const totals = useMemo(() => reviewTotals(items), [items]);

  const update = (key: string, field: Parameters<typeof editItem>[1], value: string) => {
    setItems((list) => list.map((it) => (it.key === key ? editItem(it, field, value) : it)));
    setErrors((e) => (e[key] ? { ...e, [key]: { ...e[key], [field]: undefined } } : e));
  };

  const save = async () => {
    const v = validateItems(items);
    setErrors(v.errors);
    if (!v.ok) return;
    setSaving(true);
    try {
      await addFoodEntries(toEntries(items, { date: props.date, meal, provider: props.provider, model: props.model, analyzedAt: props.analyzedAt }));
      closeSheet();
    } catch {
      setSaving(false);
      toast(t('error.generic'));
    }
  };

  return (
    <Sheet
      title={t('photo.title')}
      onClose={closeSheet}
      full
      canClose={() => {
        setConfirmDiscard(true);
        return false;
      }}
      footer={
        <>
          <div className="review-total num" aria-live="polite">
            <span>{t('photo.total')}</span>
            <strong>{fmtKcal(totals.calories)} {t('common.kcal')}</strong>
            <span className="subtle">
              P {fmtG(totals.proteinG)} · F {fmtG(totals.fatG)} · C {fmtG(totals.carbsG)}
            </span>
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={saving || items.length === 0}>
            {items.length === 1 ? t('photo.saveOne') : t('photo.saveAll', { count: items.length })}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="banner banner-warning review-warning" role="note">
          <Icon name="warning" />
          <strong>{t('photo.warning')}</strong>
        </div>
        <MealPicker value={meal} onChange={setMeal} />
        {props.notes.length > 0 && (
          <details className="card review-notes">
            <summary>{t('photo.notes')}</summary>
            <ul>
              {props.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </details>
        )}
        {props.items.length === 0 && <p className="banner">{t('photo.noItems')}</p>}
        <h3 className="section-title">{t('photo.items')}</h3>
        {items.map((it, idx) => (
          <ItemEditor
            key={it.key}
            index={idx}
            item={it}
            errors={errors[it.key] ?? {}}
            onChange={(f, v) => update(it.key, f, v)}
            onRemove={items.length > 1 ? () => setItems((l) => l.filter((x) => x.key !== it.key)) : undefined}
          />
        ))}
        <button type="button" className="btn btn-secondary btn-block" onClick={() => setItems((l) => [...l, blankItem()])}>
          <Icon name="plus" /> {t('photo.addItem')}
        </button>
      </div>
      {confirmDiscard && (
        <ConfirmDialog
          title={t('photo.discardConfirm')}
          confirmLabel={t('photo.discard')}
          destructive
          onConfirm={closeSheet}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </Sheet>
  );
}

function ItemEditor({
  item,
  index,
  errors,
  onChange,
  onRemove,
}: {
  item: ReviewItem;
  index: number;
  errors: ItemErrors;
  onChange: (field: Parameters<typeof editItem>[1], value: string) => void;
  onRemove?: () => void;
}) {
  const nameId = useId();
  const err = (k: keyof ItemErrors) => (errors[k] && errors[k] !== 'nameRequired' ? (errors[k] as FieldError) : null);
  return (
    <section className="card stack-sm review-item" aria-label={item.name || `#${index + 1}`}>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label className="field-label" htmlFor={nameId}>
            {t('entry.name')}
          </label>
          <input
            id={nameId}
            className="input"
            value={item.name}
            maxLength={120}
            aria-invalid={errors.name ? true : undefined}
            onChange={(e) => onChange('name', e.target.value)}
          />
          {errors.name && <span className="field-error">{t('error.nameRequired')}</span>}
        </div>
        {onRemove && (
          <button type="button" className="icon-btn review-remove" onClick={onRemove} aria-label={`${t('photo.removeItem')}: ${item.name}`}>
            <Icon name="trash" />
          </button>
        )}
      </div>
      {(item.confidence || item.description) && (
        <p className="subtle">
          {item.confidence && (
            <span className={`chip ${item.confidence === 'high' ? 'chip-success' : item.confidence === 'medium' ? '' : 'chip-warning'}`}>
              {t(`photo.confidence.${item.confidence}`)}
            </span>
          )}{' '}
          {item.description}
        </p>
      )}
      <div className="grid-2">
        <NumberField label={t('entry.grams')} value={item.grams} onChange={(v) => onChange('grams', v)} error={err('grams')} max={LIMITS.grams.max} />
        <NumberField label={t('entry.calories')} value={item.calories} onChange={(v) => onChange('calories', v)} error={err('calories')} max={LIMITS.calories.max} />
        <NumberField label={t('entry.protein')} value={item.proteinG} onChange={(v) => onChange('proteinG', v)} error={err('proteinG')} max={LIMITS.macro.max} />
        <NumberField label={t('entry.fat')} value={item.fatG} onChange={(v) => onChange('fatG', v)} error={err('fatG')} max={LIMITS.macro.max} />
        <NumberField label={t('entry.carbs')} value={item.carbsG} onChange={(v) => onChange('carbsG', v)} error={err('carbsG')} max={LIMITS.macro.max} />
      </div>
    </section>
  );
}
