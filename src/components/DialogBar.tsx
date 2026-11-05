import type { ReactNode } from 'react';

export interface DialogBarProps {
  /** Name plate ("Philip"). Omit for plain text — errors, safety and data messages stay plain. */
  speaker?: string;
  children: ReactNode;
  action?: { label: string; onClick: () => void };
  /** Announce changes (role=status). Leave off when a parent region already announces. */
  live?: boolean;
  className?: string;
  /** Anchor for Philip's tour (T-010). */
  tourAnchor?: string;
  /** Philip's face, shown before the text (decorative). */
  portrait?: ReactNode;
}

/**
 * Full-width dark strip where Philip speaks, styled like a game prompt (D-022). No ▼ caret: on a
 * static line it read as "tap to continue" (owner feedback, Nov 5); only the tour shows one.
 */
export function DialogBar({ speaker, children, action, live = false, className, tourAnchor, portrait }: DialogBarProps) {
  return (
    <div
      className={`pm-dialog${speaker ? ' pm-dialog-voiced' : ''}${portrait ? ' pm-dialog-with-portrait' : ''}${className ? ` ${className}` : ''}`}
      role={live ? 'status' : undefined}
      aria-live={live ? 'polite' : undefined}
      data-tour={tourAnchor}
    >
      {speaker && <span className="pm-dialog-speaker">{speaker}</span>}
      {portrait}
      <p className="pm-dialog-text">{children}</p>
      {action ? (
        <button type="button" className="btn btn-sm pm-dialog-action" onClick={action.onClick}>
          {action.label}
          <span aria-hidden="true"> ▸</span>
        </button>
      ) : null}
    </div>
  );
}
