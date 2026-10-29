import { useId } from 'react';
import { t } from '../i18n';
import type { FieldError } from '../lib/numbers';

interface NumberFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: FieldError | null;
  min?: number;
  max?: number;
  hint?: string;
  suffix?: string;
  autoFocus?: boolean;
  name?: string;
}

/** Text input tuned for decimal entry on iOS (inputmode=decimal keeps the numeric keypad). */
export function NumberField({ label, value, onChange, error, min = 0, max, hint, autoFocus, name }: NumberFieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  const hintId = `${id}-hint`;
  const msg =
    error === 'tooLow'
      ? t('error.tooLow', { min })
      : error === 'tooHigh'
        ? t('error.tooHigh', { max: max ?? '' })
        : error
          ? t(`error.${error}`)
          : null;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        className="input num"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="next"
        value={value}
        autoFocus={autoFocus}
        aria-invalid={msg ? true : undefined}
        aria-describedby={[msg ? errId : '', hint ? hintId : ''].filter(Boolean).join(' ') || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && !msg && (
        <span id={hintId} className="field-hint">
          {hint}
        </span>
      )}
      {msg && (
        <span id={errId} className="field-error">
          {msg}
        </span>
      )}
    </div>
  );
}
