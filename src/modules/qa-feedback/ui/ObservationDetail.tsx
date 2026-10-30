import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { structureObservation } from '../ai/analysis';
import { AiError } from '../ai/provider';
import { deleteObservation, getObservation, updateObservation, type ObservationChanges } from '../repository';
import { STRUCTURED_FIELDS, type Observation, type StructuredField } from '../types';
import { Confirm } from './Confirm';
import { useQa } from './context';
import { AiBadge, ListBlock, PrioritySelect, StatusSelect, TextField, TypeSelect } from './fields';
import { SavedScreenshots } from './Screenshots';
import { AI_ERRORS, PRIORITY_LABELS, TYPE_LABELS, fmtWhen } from './strings';

type Draft = Pick<Observation, StructuredField | 'type' | 'priority' | 'status' | 'notes' | 'aiFields'> & { tags: string };

function toDraft(o: Observation): Draft {
  return {
    title: o.title,
    feature: o.feature,
    description: o.description,
    actualBehavior: o.actualBehavior,
    expectedBehavior: o.expectedBehavior,
    proposedSolution: o.proposedSolution,
    type: o.type,
    priority: o.priority,
    status: o.status,
    notes: o.notes,
    tags: o.tags.join(', '),
    aiFields: o.aiFields,
  };
}

export function ObservationDetail({ id, guardRef }: { id: string; guardRef: MutableRefObject<(() => boolean) | null> }) {
  const { db, projectId, config, go, notify, selection, setSelection, aiAvailable, aiLabel } = useQa();
  const obs = useLiveQuery(async () => (await getObservation(db, projectId, id)) ?? null, [db, projectId, id]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState<null | (() => void)>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (obs && !draft) setDraft(toDraft(obs));
  }, [obs, draft]);

  const dirty = !!(obs && draft && JSON.stringify(toDraft(obs)) !== JSON.stringify(draft));
  dirtyRef.current = dirty;

  useEffect(() => {
    guardRef.current = () => {
      if (!dirtyRef.current) return true;
      return window.confirm('Discard unsaved changes to this observation?');
    };
    return () => {
      guardRef.current = null;
    };
  }, [guardRef]);

  if (obs === null) {
    return (
      <div className="qa-stack">
        <p className="qa-empty">This observation no longer exists in this project.</p>
        <button type="button" className="qa-btn" onClick={() => go({ name: 'inbox' })}>
          Back to inbox
        </button>
      </div>
    );
  }
  if (!obs || !draft) return <p className="qa-hint">Loading…</p>;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v, ...(STRUCTURED_FIELDS.includes(k as StructuredField) ? { aiFields: d.aiFields.filter((f) => f !== k) } : {}) } : d));

  const save = async () => {
    setSaveError(null);
    const changes: ObservationChanges = {
      ...draft,
      tags: draft.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    try {
      const next = await updateObservation(db, projectId, id, changes);
      setDraft(toDraft(next));
      notify('Changes saved');
    } catch {
      setSaveError('Could not save. Your edits are still on screen.');
    }
  };

  const back = () => {
    if (dirty) setConfirmLeave(() => () => go({ name: 'inbox' }));
    else go({ name: 'inbox' });
  };

  const reanalyze = async () => {
    if (!config.ai) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const result = await structureObservation(config.ai, { text: obs.originalText, context: obs.technicalContext, appName: config.appName });
      await updateObservation(db, projectId, id, { aiAnalysis: result });
    } catch (e) {
      setAiError(e instanceof AiError ? AI_ERRORS[e.code] : 'AI analysis failed.');
    } finally {
      setAiBusy(false);
    }
  };

  const fillEmpty = () => {
    const a = obs.aiAnalysis;
    if (!a) return;
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d };
      const filled: StructuredField[] = [];
      for (const f of STRUCTURED_FIELDS) {
        const s = a.suggested[f];
        if (s && !d[f].trim()) {
          next[f] = s;
          filled.push(f);
        }
      }
      next.aiFields = [...new Set([...d.aiFields, ...filled])];
      return next;
    });
  };

  const selected = selection.includes(id);
  const ctx = obs.technicalContext;
  const a = obs.aiAnalysis;

  return (
    <div className="qa-stack">
      <div className="qa-row qa-wrap">
        <button type="button" className="qa-btn qa-btn-small" onClick={back}>
          ‹ Inbox
        </button>
        <span className="qa-spacer" />
        <label className="qa-check">
          <input type="checkbox" checked={selected} onChange={() => setSelection(selected ? selection.filter((x) => x !== id) : [...selection, id])} />
          <span>Include in prompt</span>
        </label>
      </div>

      <TextField label="Title" value={draft.title} onChange={(v) => set('title', v)} ai={draft.aiFields.includes('title')} />
      <p className="qa-hint">
        Captured {fmtWhen(obs.createdAt)}
        {obs.captureMethod === 'voice' ? ' by voice' : ''}
        {obs.updatedAt > obs.createdAt + 1000 ? ` · edited ${fmtWhen(obs.updatedAt)}` : ''}
      </p>

      <section className="qa-section">
        <h3 className="qa-section-title">Original words (never changed)</h3>
        <blockquote className="qa-quote">{obs.originalText || <em>No text — screenshots only.</em>}</blockquote>
        {obs.rawTranscript && (
          <details>
            <summary className="qa-hint">Raw voice transcript</summary>
            <blockquote className="qa-quote">{obs.rawTranscript}</blockquote>
          </details>
        )}
      </section>

      <div className="qa-grid-2">
        <TypeSelect value={draft.type} onChange={(v) => set('type', v)} />
        <PrioritySelect value={draft.priority} onChange={(v) => set('priority', v)} />
        <StatusSelect value={draft.status} onChange={(v) => set('status', v)} />
        <TextField label="Feature or screen" value={draft.feature} onChange={(v) => set('feature', v)} ai={draft.aiFields.includes('feature')} />
      </div>
      <TextField label="Description" multiline value={draft.description} onChange={(v) => set('description', v)} ai={draft.aiFields.includes('description')} />
      <TextField label="What happens (actual)" multiline value={draft.actualBehavior} onChange={(v) => set('actualBehavior', v)} ai={draft.aiFields.includes('actualBehavior')} />
      <TextField label="What should happen (expected)" multiline value={draft.expectedBehavior} onChange={(v) => set('expectedBehavior', v)} ai={draft.aiFields.includes('expectedBehavior')} />
      <TextField label="Proposed solution" multiline value={draft.proposedSolution} onChange={(v) => set('proposedSolution', v)} ai={draft.aiFields.includes('proposedSolution')} />
      <TextField label="Notes" multiline value={draft.notes} onChange={(v) => set('notes', v)} />
      <TextField label="Tags" value={draft.tags} onChange={(v) => set('tags', v)} placeholder="comma, separated" />

      <SavedScreenshots observationId={id} userNote={obs.originalText} />

      {(a || (config.ai && aiAvailable)) && (
        <section className="qa-section">
          <h3 className="qa-section-title">AI analysis</h3>
          {a ? (
            <div className="qa-ai-box">
              <span className="qa-label">
                <AiBadge /> {a.model} · {fmtWhen(a.analyzedAt)} — suggestions, not facts
              </span>
              <ListBlock title="You said" items={a.facts} />
              <ListBlock title="Interpretations (not stated by you)" items={a.interpretations} />
              <ListBlock title="Unknown" items={a.unknowns} />
              {(a.suggested.type || a.suggested.priority) && (
                <p className="qa-hint">
                  Suggested{a.suggested.type ? ` type: ${TYPE_LABELS[a.suggested.type]}` : ''}
                  {a.suggested.priority ? ` · priority: ${PRIORITY_LABELS[a.suggested.priority]}${a.priorityReason ? ` (${a.priorityReason})` : ''}` : ''}
                </p>
              )}
              <button type="button" className="qa-btn qa-btn-small" onClick={fillEmpty}>
                Fill empty fields from suggestions
              </button>
            </div>
          ) : (
            <p className="qa-hint">Sends the original text to {aiLabel || 'the AI provider'}.</p>
          )}
          {config.ai && aiAvailable && (
            <button type="button" className="qa-btn qa-btn-secondary" disabled={aiBusy} onClick={() => void reanalyze()}>
              {aiBusy ? 'Analyzing…' : a ? 'Re-analyze' : 'Analyze with AI'}
            </button>
          )}
          {aiError && (
            <p className="qa-banner qa-banner-warning" role="alert">
              {aiError}
            </p>
          )}
        </section>
      )}

      {ctx && (
        <details className="qa-details">
          <summary>Captured context</summary>
          <dl className="qa-dl">
            {ctx.screen && (
              <>
                <dt>Screen</dt>
                <dd>{ctx.screen}</dd>
              </>
            )}
            {ctx.route && (
              <>
                <dt>Route</dt>
                <dd>{ctx.route}</dd>
              </>
            )}
            {ctx.viewport && (
              <>
                <dt>Viewport</dt>
                <dd>{ctx.viewport}</dd>
              </>
            )}
            {ctx.appVersion && (
              <>
                <dt>Version</dt>
                <dd>{ctx.appVersion}</dd>
              </>
            )}
            {ctx.userAgent && (
              <>
                <dt>Browser</dt>
                <dd>{ctx.userAgent}</dd>
              </>
            )}
          </dl>
        </details>
      )}

      <button type="button" className="qa-btn qa-btn-danger-ghost" onClick={() => setConfirmDelete(true)}>
        Delete observation
      </button>

      {saveError && (
        <p className="qa-banner qa-banner-danger" role="alert">
          {saveError}
        </p>
      )}
      <div className="qa-sticky-actions">
        <button type="button" className="qa-btn qa-btn-primary qa-btn-block" disabled={!dirty} onClick={() => void save()}>
          {dirty ? 'Save changes' : 'Saved'}
        </button>
      </div>

      {confirmDelete && (
        <Confirm
          title="Delete this observation?"
          body="Its screenshots are deleted too. Prompts already generated keep their text."
          confirmLabel="Delete"
          destructive
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await deleteObservation(db, projectId, id);
            setSelection(selection.filter((x) => x !== id));
            dirtyRef.current = false;
            notify('Observation deleted');
            go({ name: 'inbox' });
          }}
        />
      )}
      {confirmLeave && (
        <Confirm
          title="Discard unsaved changes?"
          confirmLabel="Discard"
          destructive
          onCancel={() => setConfirmLeave(null)}
          onConfirm={() => {
            dirtyRef.current = false;
            confirmLeave();
          }}
        />
      )}
    </div>
  );
}
