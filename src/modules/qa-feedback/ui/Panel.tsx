import { useEffect, useId, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { countByArchive } from '../search';
import { useQa } from './context';
import { QuickCapture } from './QuickCapture';
import { Inbox } from './Inbox';
import { ObservationDetail } from './ObservationDetail';
import { PromptBuilder } from './PromptBuilder';
import { ARCHIVE_TEXT } from './strings';
import '../qa-feedback.css';

export default function Panel() {
  const qa = useQa();
  const { db, projectId, view, go, close, selection } = qa;
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // OBS-A09A21: the tab counts only active items; archived ones are counted on the Archived switch.
  const counts = useLiveQuery(() => countByArchive(db, projectId), [db, projectId]);
  // Detail view registers a guard so Escape/close don't drop unsaved edits.
  const guard = useRef<(() => boolean) | null>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (!guard.current || guard.current())) close();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [close]);

  const tab = view.name === 'detail' ? 'inbox' : view.name;

  return (
    <>
    {/* Dims the app behind the sheet. Tapping it does not close: that would lose an unsaved capture. */}
    <div className="qa-scrim" aria-hidden="true" />
    <div ref={ref} className="qa-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className="qa-header">
        <div className="qa-header-row">
          <h2 id={titleId}>QA &amp; Feedback</h2>
          <button
            type="button"
            className="qa-icon-btn"
            aria-label="Close QA & Feedback"
            onClick={() => (!guard.current || guard.current()) && close()}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <nav className="qa-tabs" aria-label="QA sections">
          {(
            [
              ['capture', 'Capture'],
              ['inbox', ARCHIVE_TEXT.tab(counts?.active ?? null)],
              ['prompt', `Prompt${selection.length ? ` (${selection.length})` : ''}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-current={tab === k ? 'page' : undefined}
              onClick={() => (!guard.current || guard.current()) && go({ name: k })}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <div className="qa-body">
        {view.name === 'capture' && <QuickCapture />}
        {view.name === 'inbox' && <Inbox />}
        {view.name === 'detail' && <ObservationDetail key={view.id} id={view.id} guardRef={guard} />}
        {view.name === 'prompt' && <PromptBuilder />}
      </div>
    </div>
    </>
  );
}
