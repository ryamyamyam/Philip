import { useEffect, useId, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { createProject, listProjects } from '../repository';
import { countObservations } from '../search';
import { useQa } from './context';
import { QuickCapture } from './QuickCapture';
import { Inbox } from './Inbox';
import { ObservationDetail } from './ObservationDetail';
import { PromptBuilder } from './PromptBuilder';
import '../qa-feedback.css';

export default function Panel() {
  const qa = useQa();
  const { db, projectId, view, go, close, selection } = qa;
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const count = useLiveQuery(() => countObservations(db, projectId), [db, projectId]);
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
    <div ref={ref} className="qa-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className="qa-header">
        <div className="qa-header-row">
          <h2 id={titleId}>QA &amp; Feedback</h2>
          <ProjectSwitcher />
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
              ['inbox', `Inbox${count != null ? ` (${count})` : ''}`],
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
  );
}

function ProjectSwitcher() {
  const { db, projectId, setProjectId, notify } = useQa();
  const projects = useLiveQuery(() => listProjects(db), [db]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const selectId = useId();

  if (adding) {
    return (
      <form
        className="qa-project-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const p = await createProject(db, { name });
          setProjectId(p.id);
          setAdding(false);
          setName('');
          notify(`Project “${p.name}” created`);
        }}
      >
        <input className="qa-input" aria-label="New project name" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <button type="submit" className="qa-btn qa-btn-primary" disabled={!name.trim()}>
          Add
        </button>
        <button type="button" className="qa-btn" onClick={() => setAdding(false)}>
          Cancel
        </button>
      </form>
    );
  }
  return (
    <div className="qa-project">
      <label className="qa-visually-hidden" htmlFor={selectId}>
        Project
      </label>
      <select
        id={selectId}
        className="qa-select"
        value={projectId}
        onChange={(e) => (e.target.value === '__new' ? setAdding(true) : setProjectId(e.target.value))}
      >
        {(projects ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value="__new">+ New project…</option>
      </select>
    </div>
  );
}
