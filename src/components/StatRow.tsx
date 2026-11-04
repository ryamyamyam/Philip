import type { ReactNode } from 'react';

export interface StatRowProps {
  label: string;
  value: ReactNode;
  /** The one red accent: over target or otherwise notable. Text, not only color. */
  notable?: boolean;
  hint?: string;
}

/** Label pill left, value right (D-022). Use inside a `<dl className="pm-rows">`. */
export function StatRow({ label, value, notable = false, hint }: StatRowProps) {
  return (
    <div className={`pm-row${notable ? ' pm-row-notable' : ''}`}>
      <dt className="pm-pill">{label}</dt>
      <dd className="pm-row-value num">
        {value}
        {hint && <span className="pm-row-hint">{hint}</span>}
      </dd>
    </div>
  );
}
