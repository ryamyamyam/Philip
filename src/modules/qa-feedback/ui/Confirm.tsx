import { useEffect, useId, useRef, type ReactNode } from 'react';

export function Confirm({
  title,
  body,
  confirmLabel,
  destructive,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onCancel]);
  return (
    <div className="qa-confirm" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="qa-confirm-box" role="alertdialog" aria-modal="true" aria-labelledby={id}>
        <h3 id={id}>{title}</h3>
        {body && <div className="qa-muted">{body}</div>}
        <div className="qa-row qa-end">
          <button ref={cancelRef} type="button" className="qa-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={`qa-btn ${destructive ? 'qa-btn-danger' : 'qa-btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
