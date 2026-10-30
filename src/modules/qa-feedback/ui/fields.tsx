import { useId } from 'react';
import { OBSERVATION_TYPES, PRIORITIES, STATUSES, type ObservationStatus, type ObservationType, type Priority } from '../types';
import { PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS } from './strings';

export function AiBadge() {
  return (
    <span className="qa-badge qa-badge-ai" title="Drafted by AI from your words — check it">
      AI
    </span>
  );
}

export function TextField({
  label,
  value,
  onChange,
  multiline,
  ai,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  ai?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="qa-field">
      <label className="qa-label" htmlFor={id}>
        {label} {ai && <AiBadge />}
      </label>
      {multiline ? (
        <textarea id={id} className="qa-input qa-textarea" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} rows={3} />
      ) : (
        <input id={id} className="qa-input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
      )}
      {hint && <span className="qa-hint">{hint}</span>}
    </div>
  );
}

export function TypeSelect({ value, onChange, label = 'Type' }: { value: ObservationType; onChange: (v: ObservationType) => void; label?: string }) {
  const id = useId();
  return (
    <div className="qa-field">
      <label className="qa-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="qa-select" value={value} onChange={(e) => onChange(e.target.value as ObservationType)}>
        {OBSERVATION_TYPES.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABELS[t]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function PrioritySelect({ value, onChange }: { value: Priority | null; onChange: (v: Priority | null) => void }) {
  const id = useId();
  return (
    <div className="qa-field">
      <label className="qa-label" htmlFor={id}>
        Priority
      </label>
      <select id={id} className="qa-select" value={value ?? ''} onChange={(e) => onChange((e.target.value || null) as Priority | null)}>
        <option value="">Not set</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABELS[p]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function StatusSelect({ value, onChange }: { value: ObservationStatus; onChange: (v: ObservationStatus) => void }) {
  const id = useId();
  return (
    <div className="qa-field">
      <label className="qa-label" htmlFor={id}>
        Status
      </label>
      <select id={id} className="qa-select" value={value} onChange={(e) => onChange(e.target.value as ObservationStatus)}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ListBlock({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="qa-listblock">
      <span className="qa-label">{title}</span>
      <ul>
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}
