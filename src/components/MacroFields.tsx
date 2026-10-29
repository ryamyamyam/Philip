import type { Macros } from '../db/types';
import { t } from '../i18n';
import { LIMITS, validateNumber, type FieldError } from '../lib/numbers';
import { fmtNum } from '../lib/format';
import { NumberField } from './NumberField';

export interface MacroFormValues {
  grams: string;
  calories: string;
  proteinG: string;
  fatG: string;
  carbsG: string;
}

export type MacroFormErrors = Partial<Record<keyof MacroFormValues, FieldError>>;

export function toFormValues(m: Partial<Macros> & { grams?: number | null }): MacroFormValues {
  const s = (n: number | null | undefined) => (n == null ? '' : String(n));
  return { grams: s(m.grams), calories: s(m.calories), proteinG: s(m.proteinG), fatG: s(m.fatG), carbsG: s(m.carbsG) };
}

export function validateMacroForm(v: MacroFormValues): { errors: MacroFormErrors; values: (Macros & { grams: number | null }) | null } {
  const grams = validateNumber(v.grams, LIMITS.grams);
  const calories = validateNumber(v.calories, LIMITS.calories);
  const proteinG = validateNumber(v.proteinG, LIMITS.macro);
  const fatG = validateNumber(v.fatG, LIMITS.macro);
  const carbsG = validateNumber(v.carbsG, LIMITS.macro);
  const errors: MacroFormErrors = {};
  if (grams.error) errors.grams = grams.error;
  if (calories.error) errors.calories = calories.error;
  if (proteinG.error) errors.proteinG = proteinG.error;
  if (fatG.error) errors.fatG = fatG.error;
  if (carbsG.error) errors.carbsG = carbsG.error;
  if (Object.keys(errors).length) return { errors, values: null };
  return {
    errors,
    values: {
      grams: grams.value,
      calories: calories.value ?? 0,
      proteinG: proteinG.value ?? 0,
      fatG: fatG.value ?? 0,
      carbsG: carbsG.value ?? 0,
    },
  };
}

/** Returns implied kcal if macros and calories disagree noticeably (alcohol/fiber cause small gaps). */
export function energyMismatch(v: MacroFormValues): number | null {
  const n = (s: string) => {
    const r = validateNumber(s, { min: 0, max: 1e6, required: true });
    return r.error ? null : r.value;
  };
  const kcal = n(v.calories);
  const p = n(v.proteinG);
  const f = n(v.fatG);
  const c = n(v.carbsG);
  if (kcal == null || p == null || f == null || c == null) return null;
  const implied = p * 4 + c * 4 + f * 9;
  if (implied === 0 && kcal === 0) return null;
  const diff = Math.abs(implied - kcal);
  return diff > Math.max(50, 0.25 * Math.max(kcal, implied)) ? implied : null;
}

interface Props {
  values: MacroFormValues;
  errors: MacroFormErrors;
  onChange: (key: keyof MacroFormValues, value: string) => void;
  showGrams?: boolean;
  gramsHint?: string;
}

export function MacroFields({ values, errors, onChange, showGrams = true, gramsHint }: Props) {
  const mismatch = energyMismatch(values);
  return (
    <div className="stack-sm">
      <div className="grid-2">
        {showGrams && (
          <NumberField
            label={t('entry.grams')}
            value={values.grams}
            onChange={(v) => onChange('grams', v)}
            error={errors.grams}
            max={LIMITS.grams.max}
            hint={gramsHint}
            name="grams"
          />
        )}
        <NumberField
          label={t('entry.calories')}
          value={values.calories}
          onChange={(v) => onChange('calories', v)}
          error={errors.calories}
          max={LIMITS.calories.max}
          name="calories"
        />
        <NumberField label={t('entry.protein')} value={values.proteinG} onChange={(v) => onChange('proteinG', v)} error={errors.proteinG} max={LIMITS.macro.max} name="protein" />
        <NumberField label={t('entry.fat')} value={values.fatG} onChange={(v) => onChange('fatG', v)} error={errors.fatG} max={LIMITS.macro.max} name="fat" />
        <NumberField label={t('entry.carbs')} value={values.carbsG} onChange={(v) => onChange('carbsG', v)} error={errors.carbsG} max={LIMITS.macro.max} name="carbs" />
      </div>
      {mismatch != null && (
        <p className="field-hint" role="note">
          {t('entry.energyMismatch', { kcal: fmtNum(mismatch, 0) })}
        </p>
      )}
    </div>
  );
}
