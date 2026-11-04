import type { ReactNode } from 'react';

export interface DialogBarProps {
  /** Name plate ("Philip"). Omit for plain text — errors, safety and data messages stay plain. */
  speaker?: string;
  children: ReactNode;
  action?: { label: string; onClick: () => void };
  /** Announce changes (role=status). Leave off when a parent region already announces. */
  live?: boolean;
  className?: string;
}

/** Full-width dark strip where Philip speaks, styled like a game prompt (D-022). */
export function DialogBar({ speaker, children, action, live = false, className }: DialogBarProps) {
  return (
    <div
      className={`pm-dialog${speaker ? ' pm-dialog-voiced' : ''}${className ? ` ${className}` : ''}`}
      role={live ? 'status' : undefined}
      aria-live={live ? 'polite' : undefined}
    >
      {speaker && <span className="pm-dialog-speaker">{speaker}</span>}
      <p className="pm-dialog-text">{children}</p>
      {action ? (
        <button type="button" className="btn btn-sm pm-dialog-action" onClick={action.onClick}>
          {action.label}
          <span aria-hidden="true"> ▸</span>
        </button>
      ) : (
        speaker && <span className="pm-dialog-caret" aria-hidden="true" />
      )}
    </div>
  );
}
