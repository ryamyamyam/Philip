import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { QaFeedbackConfig } from '../config';
import { QaFeedbackDB } from '../db';
import { ensureDefaultProject, getMetaValue, setMetaValue } from '../repository';
import { captureContext } from '../browser';
import type { ObservationFilter } from '../search';
import type { TechnicalContext } from '../types';
import { QaCtx, type QaUI, type QaView } from './context';
import '../qa-fab.css';

const Panel = lazy(() => import('./Panel'));

export const OPEN_EVENT = 'qa-feedback:open';

/** Opens the QA panel from anywhere in the host app (e.g. a Settings row). */
export function openQaFeedback(view: 'capture' | 'inbox' | 'prompt' = 'capture'): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { view } }));
}

const META_PROJECT = 'selectedProjectId';
const META_FAB_HIDDEN = 'floatingButtonHidden';

/**
 * Mount once near the root of the host app. Renders a small floating capture button (optional)
 * and, when opened, the QA panel as a bottom sheet over the app. Lazy-loads the panel so the host's startup cost
 * is one tiny component.
 */
export function QaFeedback({ config }: { config: QaFeedbackConfig }) {
  const db = useMemo(() => new QaFeedbackDB(config.dbName), [config.dbName]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<QaView>({ name: 'capture' });
  const [projectId, setProjectIdState] = useState<string | null>(null);
  const [openContext, setOpenContext] = useState<TechnicalContext | null>(null);
  const [filter, setFilter] = useState<ObservationFilter>({ status: 'open' });
  const [selection, setSelection] = useState<string[]>([]);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiLabel, setAiLabel] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [initError, setInitError] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const fabHidden = useLiveQuery(() => getMetaValue<boolean>(db, META_FAB_HIDDEN), [db]);

  const ensureProject = useCallback(async () => {
    if (projectId) return projectId;
    try {
      const saved = await getMetaValue<string>(db, META_PROJECT);
      const exists = saved ? await db.projects.get(saved) : undefined;
      const id = exists?.id ?? (await ensureDefaultProject(db, config.appId, config.defaultProjectName ?? config.appName)).id;
      setProjectIdState(id);
      return id;
    } catch {
      setInitError(true);
      return null;
    }
  }, [db, projectId, config.appId, config.appName, config.defaultProjectName]);

  const show = useCallback(
    (v: QaView['name'] = 'capture') => {
      // Record where the user was *before* the panel covers the screen.
      try {
        setOpenContext(captureContext(config.appVersion, config.getContext?.()));
      } catch {
        setOpenContext(null);
      }
      setView(v === 'capture' ? { name: 'capture' } : v === 'inbox' ? { name: 'inbox' } : { name: 'prompt' });
      setOpen(true);
      void ensureProject();
      const ai = config.ai;
      if (ai) {
        void ai.isConfigured().then(setAiAvailable, () => setAiAvailable(false));
        void ai.label().then(setAiLabel, () => undefined);
      }
    },
    [config, ensureProject],
  );

  useEffect(() => {
    const onOpen = (e: Event) => show((e as CustomEvent<{ view?: 'capture' | 'inbox' | 'prompt' }>).detail?.view);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, [show]);

  const setProjectId = useCallback(
    (id: string) => {
      setProjectIdState(id);
      setSelection([]); // selections never cross projects
      setFilter({ status: 'open' });
      void setMetaValue(db, META_PROJECT, id);
    },
    [db],
  );

  const notify = useCallback((text: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const ui: QaUI | null = projectId
    ? {
        config,
        db,
        projectId,
        setProjectId,
        view,
        go: setView,
        close: () => setOpen(false),
        openContext,
        filter,
        setFilter,
        selection,
        setSelection,
        aiAvailable,
        aiLabel,
        notify,
      }
    : null;

  const fab = config.floatingButton !== false && fabHidden !== true && !open;

  return (
    <>
      {fab && (
        <button type="button" className="qa-fab" aria-label="Capture feedback" title="Capture feedback (QA)" onClick={() => show('capture')}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M8 9V7a4 4 0 0 1 8 0v2M6 9h12v5a6 6 0 0 1-12 0V9Zm-3 3h3m12 0h3M4 6l2.5 2M20 6l-2.5 2M4 19l2.5-2M20 19l-2.5-2M12 13v6" />
          </svg>
        </button>
      )}
      {open && initError && (
        <div className="qa-panel qa-panel-error" role="alert">
          <p>QA storage could not be opened in this browser (private mode or storage disabled).</p>
          <button type="button" className="qa-btn" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      )}
      {open && ui && (
        <QaCtx.Provider value={ui}>
          <Suspense fallback={null}>
            <Panel />
          </Suspense>
        </QaCtx.Provider>
      )}
      {toast && (
        <div className="qa-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </>
  );
}

export { META_FAB_HIDDEN };
