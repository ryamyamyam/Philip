import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
import { t } from '../i18n';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  full?: boolean;
  /** Return false to block closing (e.g. unsaved AI estimate). */
  canClose?: () => boolean;
  headerAction?: ReactNode;
}

/** Bottom sheet modal dialog with focus management and Escape to close. */
export function Sheet({ title, onClose, children, footer, full = false, canClose, headerAction }: SheetProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const attemptClose = () => {
    if (!canClose || canClose()) onClose();
  };
  const closeRef = useRef(attemptClose);
  closeRef.current = attemptClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && attemptClose()}>
      <div
        ref={ref}
        className={`sheet${full ? ' sheet-full' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="sheet-header">
          <h2 id={titleId}>{title}</h2>
          {headerAction}
          <button type="button" className="icon-btn" onClick={attemptClose} aria-label={t('common.close')}>
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>
  );
}
