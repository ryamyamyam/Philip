import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { analyzeBatch, type BatchAnalysis } from '../ai/analysis';
import { AiError } from '../ai/provider';
import { copyText, promptFileName, saveTextFile } from '../browser';
import { shortRef } from '../db';
import { moveObservation, planFromAi, planFromFeatures, resolveGroups, type GroupPlan } from '../prompt/grouping';
import { buildDevelopmentPrompt } from '../prompt/template';
import {
  getObservationsByIds,
  getPrompt,
  listAttachments,
  markPromptExported,
  recentPrompts,
  regeneratePrompt,
  savePrompt,
  updatePromptContent,
} from '../repository';
import type { DevelopmentPrompt, Observation, ScreenshotAttachment } from '../types';
import { Confirm } from './Confirm';
import { useQa } from './context';
import { AI_ERRORS, TYPE_LABELS, fmtWhen } from './strings';

export function PromptBuilder() {
  const { db, projectId, config, selection, setSelection, go, aiAvailable, aiLabel } = useQa();
  const project = useLiveQuery(() => db.projects.get(projectId), [db, projectId]);
  const selKey = selection.join(',');
  const loaded = useLiveQuery(async () => ({ key: selKey, rows: await getObservationsByIds(db, projectId, selection) }), [db, projectId, selKey]);
  // Only trust results for the current selection (the hook keeps the previous result while loading).
  const observations = loaded && loaded.key === selKey ? loaded.rows : undefined;
  const recents = useLiveQuery(() => recentPrompts(db, projectId), [db, projectId]);

  const [plan, setPlan] = useState<GroupPlan | null>(null);
  const [batch, setBatch] = useState<BatchAnalysis | null>(null);
  const [planFor, setPlanFor] = useState('');
  const [prompt, setPrompt] = useState<DevelopmentPrompt | null>(null);
  const [content, setContent] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingReplace, setPendingReplace] = useState<null | (() => void)>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const editorId = useId();

  // Observations deleted elsewhere drop out of the selection (never silently from a prompt).
  useEffect(() => {
    if (observations && observations.length !== selection.length) setSelection(observations.map((o) => o.id));
  }, [observations, selection.length, setSelection]); // observations is always for the current selection

  // Reset grouping when the selected set changes.
  useEffect(() => {
    if (!observations) return;
    const key = observations.map((o) => o.id).join(',');
    if (key !== planFor) {
      setPlan(planFromFeatures(observations));
      setBatch(null);
      setPlanFor(key);
    }
  }, [observations, planFor]);

  const groups = useMemo(() => (plan && observations ? resolveGroups(plan, observations) : []), [plan, observations]);
  const edited = !!prompt && content !== prompt.generatedContent;

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const loadAttachments = async (obs: Observation[]) => {
    const map: Record<string, ScreenshotAttachment[]> = {};
    for (const o of obs) if (o.attachmentCount) map[o.id] = await listAttachments(db, projectId, o.id);
    return map;
  };

  const generate = async (opts: { plan?: GroupPlan; batch?: BatchAnalysis | null } = {}) => {
    if (!observations?.length || !project) return;
    const usePlan = opts.plan ?? plan ?? planFromFeatures(observations);
    const useBatch = opts.batch !== undefined ? opts.batch : batch;
    const text = buildDevelopmentPrompt({
      app: { appName: config.appName, appVersion: config.appVersion, appDescription: config.appDescription, projectName: project.name },
      observations,
      groups: resolveGroups(usePlan, observations),
      attachments: await loadAttachments(observations),
      batch: useBatch,
    });
    const mode = useBatch ? 'ai' : 'template';
    const metadata = useBatch ? { provider: useBatch.provider, model: useBatch.model, recovered: useBatch.recovered.length } : null;
    const ids = observations.map((o) => o.id);
    if (prompt && prompt.observationIds.join(',') === ids.join(',')) {
      await regeneratePrompt(db, projectId, prompt.id, { content: text, mode, metadata });
      setPrompt((await getPrompt(db, projectId, prompt.id)) ?? null);
    } else {
      setPrompt(await savePrompt(db, projectId, { observationIds: ids, content: text, mode, metadata }));
    }
    setContent(text);
    setExportMsg(null);
  };

  /** Never overwrites the user's edits without asking. */
  const guarded = (fn: () => void) => (edited ? setPendingReplace(() => fn) : fn());

  const runAi = async () => {
    if (!config.ai || !observations?.length) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const b = await analyzeBatch(config.ai, observations, await loadAttachments(observations), config.appName);
      const p = planFromAi(b, observations);
      setBatch(b);
      setPlan(p);
      guarded(() => void generate({ plan: p, batch: b }));
    } catch (e) {
      setAiError(e instanceof AiError ? `${AI_ERRORS[e.code]} The template prompt still works.` : 'AI analysis failed. The template prompt still works.');
    } finally {
      setAiBusy(false);
    }
  };

  const onEdit = (v: string) => {
    setContent(v);
    if (!prompt) return;
    window.clearTimeout(saveTimer.current);
    const id = prompt.id;
    saveTimer.current = window.setTimeout(() => void updatePromptContent(db, projectId, id, v), 600);
  };

  const exportAs = async (format: 'clipboard' | 'txt' | 'md') => {
    if (!content.trim()) return;
    // Copy/share first, with no await before it: iOS only allows these during the tap itself.
    const persist = async () => {
      if (!prompt) return;
      window.clearTimeout(saveTimer.current);
      await updatePromptContent(db, projectId, prompt.id, content);
      await markPromptExported(db, projectId, prompt.id, format);
    };
    if (format === 'clipboard') {
      const ok = await copyText(content);
      setExportMsg(ok ? { ok, text: 'Copied. Paste it into Claude Code.' } : { ok, text: 'Copy failed. Select the text in the editor and copy it manually.' });
      if (ok) await persist();
      return;
    }
    try {
      const r = await saveTextFile(promptFileName(config.appId, format), content, format === 'md' ? 'text/markdown' : 'text/plain');
      if (r === 'cancelled') return;
      setExportMsg({ ok: true, text: r === 'shared' ? 'Shared.' : 'Downloaded.' });
      await persist();
    } catch {
      setExportMsg({ ok: false, text: 'Export failed. Copy the text instead.' });
    }
  };

  const openRecent = (p: DevelopmentPrompt) =>
    guarded(() => {
      setSelection(p.observationIds);
      setPrompt(p);
      setContent(p.content);
      setExportMsg(null);
    });

  if (!observations) return <p className="qa-hint">Loading…</p>;

  return (
    <div className="qa-stack">
      {observations.length === 0 ? (
        <div className="qa-stack">
          <p className="qa-empty">Select observations in the inbox, then come back here to turn them into one Claude Code prompt.</p>
          <button type="button" className="qa-btn qa-btn-primary" onClick={() => go({ name: 'inbox' })}>
            Go to inbox
          </button>
        </div>
      ) : (
        <>
          <section className="qa-section" aria-label="Grouping">
            <h3 className="qa-section-title">
              {observations.length} observation{observations.length === 1 ? '' : 's'} in {groups.length} group{groups.length === 1 ? '' : 's'}
            </h3>
            <p className="qa-hint">
              {batch ? `Grouping suggested by ${batch.model}.` : 'Grouped only when they name the same feature/screen.'} Move items to change it.
            </p>
            {groups.map((g, gi) => (
              <div key={g.key} className="qa-group">
                <div className="qa-group-head">
                  <strong>
                    {gi + 1}. {g.label}
                  </strong>
                  <span className="qa-hint">{g.observationIds.length > 1 ? g.reason : 'Independent'}</span>
                </div>
                <ul className="qa-group-list">
                  {g.observationIds.map((id) => {
                    const o = observations.find((x) => x.id === id)!;
                    return (
                      <li key={id} className="qa-group-item">
                        <span className="qa-group-title">
                          <span className="qa-mono">{shortRef(id)}</span> {o.title}{' '}
                          <span className="qa-hint">· {TYPE_LABELS[o.type]}</span>
                        </span>
                        <div className="qa-row">
                          <select
                            className="qa-select qa-select-small"
                            aria-label={`Group for ${o.title}`}
                            value={g.key}
                            onChange={(e) => plan && setPlan(moveObservation(plan, o, e.target.value === g.key ? g.key : e.target.value))}
                          >
                            {groups.map((x, xi) => (
                              <option key={x.key} value={x.key}>
                                {x.key === g.key ? `Group ${xi + 1} (current)` : `Move to group ${xi + 1}`}
                              </option>
                            ))}
                            {g.observationIds.length > 1 && <option value="solo">Keep separate</option>}
                          </select>
                          <button
                            type="button"
                            className="qa-icon-btn"
                            aria-label={`Remove ${o.title} from selection`}
                            onClick={() => setSelection(selection.filter((x) => x !== id))}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M6 6l12 12M18 6L6 18" />
                            </svg>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {batch && batch.recovered.length > 0 && (
              <p className="qa-banner qa-banner-warning">
                The AI left out {batch.recovered.length} observation{batch.recovered.length === 1 ? '' : 's'}; they were kept as separate groups.
              </p>
            )}
          </section>

          <div className="qa-row qa-wrap">
            <button type="button" className="qa-btn qa-btn-primary" onClick={() => guarded(() => void generate())}>
              {prompt ? 'Regenerate prompt' : 'Generate prompt'}
            </button>
            {config.ai && aiAvailable && (
              <button type="button" className="qa-btn qa-btn-secondary" disabled={aiBusy} onClick={() => void runAi()}>
                {aiBusy ? 'Analyzing…' : batch ? 'Re-run AI analysis' : 'Improve with AI'}
              </button>
            )}
            {batch && (
              <button
                type="button"
                className="qa-btn qa-btn-small"
                onClick={() => {
                  const p = planFromFeatures(observations);
                  setBatch(null);
                  setPlan(p);
                  guarded(() => void generate({ plan: p, batch: null }));
                }}
              >
                Drop AI suggestions
              </button>
            )}
          </div>
          {config.ai && aiAvailable && !batch && (
            <p className="qa-hint">“Improve with AI” sends the text of these observations (not the images) to {aiLabel || 'the AI provider'} for grouping, acceptance criteria and open questions.</p>
          )}
          {aiError && (
            <p className="qa-banner qa-banner-warning" role="alert">
              {aiError}
            </p>
          )}
        </>
      )}

      {(prompt || content) && (
        <section className="qa-section">
          <div className="qa-row qa-wrap">
            <label className="qa-section-title" htmlFor={editorId}>
              Prompt {prompt?.mode === 'ai' ? '(AI-assisted)' : '(template)'}
            </label>
            <span className="qa-spacer" />
            {edited && <span className="qa-badge">Edited</span>}
          </div>
          <textarea id={editorId} className="qa-input qa-textarea qa-editor" value={content} onChange={(e) => onEdit(e.target.value)} spellCheck={false} />
          <span className="qa-hint">{content.length.toLocaleString()} characters</span>
          <div className="qa-sticky-actions qa-row qa-wrap">
            <button type="button" className="qa-btn qa-btn-primary" onClick={() => void exportAs('clipboard')}>
              Copy
            </button>
            <button type="button" className="qa-btn qa-btn-secondary" onClick={() => void exportAs('txt')}>
              Save .txt
            </button>
            <button type="button" className="qa-btn qa-btn-secondary" onClick={() => void exportAs('md')}>
              Save .md
            </button>
          </div>
          {exportMsg && (
            <p className={`qa-banner ${exportMsg.ok ? 'qa-banner-success' : 'qa-banner-danger'}`} role="status">
              {exportMsg.text}
            </p>
          )}
        </section>
      )}

      {recents && recents.length > 0 && (
        <details className="qa-details">
          <summary>Recent prompts</summary>
          <ul className="qa-list">
            {recents.map((p) => (
              <li key={p.id} className="qa-item">
                <button type="button" className="qa-item-main" onClick={() => openRecent(p)}>
                  <span className="qa-item-title">
                    {p.observationIds.length} observation{p.observationIds.length === 1 ? '' : 's'} · {p.mode === 'ai' ? 'AI-assisted' : 'template'}
                  </span>
                  <span className="qa-item-meta">
                    {fmtWhen(p.generatedAt)}
                    {p.exportedAt ? ` · exported (${p.exportFormat})` : ''}
                    {p.content !== p.generatedContent ? ' · edited' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {pendingReplace && (
        <Confirm
          title="Replace your edited prompt?"
          body="You changed the prompt text. Regenerating replaces it with a fresh version. Copy your edits first if you want to keep them."
          confirmLabel="Replace"
          destructive
          onCancel={() => setPendingReplace(null)}
          onConfirm={() => {
            const fn = pendingReplace;
            setPendingReplace(null);
            fn();
          }}
        />
      )}
    </div>
  );
}
