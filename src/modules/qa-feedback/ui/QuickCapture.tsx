import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { structureObservation } from '../ai/analysis';
import { AiError } from '../ai/provider';
import { QaError, addAttachments, createObservation, getMetaValue, setMetaValue } from '../repository';
import { webSpeechProvider, type TranscriptionErrorCode, type TranscriptionSession } from '../transcription';
import { OBSERVATION_TYPES, type AiObservationAnalysis, type ObservationType, type Priority, type StructuredField } from '../types';
import { useQa } from './context';
import { AiBadge, ListBlock, PrioritySelect, TextField, TypeSelect } from './fields';
import { META_FAB_HIDDEN } from './QaFeedback';
import { AddScreenshotButton, PendingScreenshots, imagesFromClipboard, screenFiles, toInputs, useLimits } from './Screenshots';
import { AI_ERRORS, PRIORITY_LABELS, SPEECH_ERRORS, TYPE_LABELS, fileErrorMessage } from './strings';

type Details = Record<StructuredField, string>;
const EMPTY: Details = { title: '', feature: '', description: '', actualBehavior: '', expectedBehavior: '', proposedSolution: '' };

/** Tap → speak → review if needed → save. Everything except the text is optional. */
export function QuickCapture() {
  const { config, db, projectId, openContext, aiAvailable, aiLabel, notify, go } = useQa();
  const { maxBytes, maxCount, maxMb } = useLimits();
  const transcription = config.transcription === undefined ? webSpeechProvider : config.transcription;
  const voiceSupported = useMemo(() => !!transcription?.isSupported(), [transcription]);
  const textId = useId();

  const [text, setText] = useState('');
  const [raw, setRaw] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speechError, setSpeechError] = useState<TranscriptionErrorCode | null>(null);
  const session = useRef<TranscriptionSession | null>(null);
  const base = useRef('');

  const [type, setType] = useState<ObservationType | null>(null);
  const [details, setDetails] = useState<Details>(() => ({ ...EMPTY, feature: openContext?.screen ?? '' }));
  const [priority, setPriority] = useState<Priority | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<AiObservationAnalysis | null>(null);
  const [aiFields, setAiFields] = useState<StructuredField[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiAbort = useRef<AbortController | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id: string; title: string; warning: string | null } | null>(null);
  const storedFabHidden = useLiveQuery(() => getMetaValue<boolean>(db, META_FAB_HIDDEN), [db]);
  const [fabOverride, setFabOverride] = useState<boolean | null>(null);
  const fabHidden = fabOverride ?? storedFabHidden;

  useEffect(
    () => () => {
      session.current?.abort();
      aiAbort.current?.abort();
    },
    [],
  );

  const rawParts = useRef<string[]>([]);
  const startVoice = () => {
    if (!transcription) return;
    setSpeechError(null);
    base.current = text.trim();
    setListening(true);
    let current = '';
    session.current = transcription.start(
      {
        onText: (t) => {
          current = t;
          setText(base.current ? `${base.current} ${t}` : t);
          // Raw recognizer output across all recordings, independent of later typing.
          setRaw([...rawParts.current, t].join(' ').trim() || null);
        },
        onError: (code) => code !== 'aborted' && setSpeechError(code),
        onEnd: () => {
          if (current) rawParts.current = [...rawParts.current, current];
          setListening(false);
          session.current = null;
        },
      },
      { lang: config.speechLang ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-US') },
    );
  };
  const stopVoice = () => session.current?.stop();

  const setField = (f: StructuredField, v: string) => {
    setDetails((d) => ({ ...d, [f]: v }));
    setAiFields((a) => a.filter((x) => x !== f)); // user edited: no longer an AI draft
  };

  const addFiles = (incoming: File[]) => {
    const { ok, error } = screenFiles(incoming, files.length, maxBytes, maxCount, maxMb);
    setFileError(error);
    if (ok.length) setFiles((f) => [...f, ...ok]);
  };

  const runAi = async () => {
    if (!config.ai || !text.trim()) return;
    aiAbort.current?.abort();
    const ctrl = new AbortController();
    aiAbort.current = ctrl;
    setAiBusy(true);
    setAiError(null);
    try {
      const result = await structureObservation(config.ai, { text, context: openContext, appName: config.appName }, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setAnalysis(result);
      // Fill only empty fields; never overwrite what the user typed.
      const filled: StructuredField[] = [];
      setDetails((d) => {
        const next = { ...d };
        for (const f of Object.keys(EMPTY) as StructuredField[]) {
          const s = result.suggested[f];
          if (s && !d[f].trim()) {
            next[f] = s;
            filled.push(f);
          }
        }
        return next;
      });
      setAiFields((a) => [...new Set([...a, ...filled])]);
      if (!type && result.suggested.type) setType(result.suggested.type);
      setShowDetails(true);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setAiError(e instanceof AiError ? AI_ERRORS[e.code] : 'AI structuring failed. You can still save.');
    } finally {
      if (!ctrl.signal.aborted) setAiBusy(false);
    }
  };

  const reset = () => {
    setText('');
    setRaw(null);
    rawParts.current = [];
    setType(null);
    setDetails({ ...EMPTY, feature: openContext?.screen ?? '' });
    setPriority(null);
    setFiles([]);
    setFileError(null);
    setAnalysis(null);
    setAiFields([]);
    setAiError(null);
    setShowDetails(false);
  };

  const canSave = (text.trim() || files.length > 0) && !saving && !listening;

  const save = async () => {
    if (!canSave) return;
    session.current?.abort();
    aiAbort.current?.abort();
    setAiBusy(false);
    setSaving(true);
    try {
      const obs = await createObservation(db, projectId, {
        originalText: text,
        rawTranscript: raw,
        captureMethod: raw ? 'voice' : 'text',
        ...details,
        type: type ?? 'other',
        priority,
        technicalContext: openContext,
        aiAnalysis: analysis,
        aiFields,
        userId: config.getUserId?.() ?? null,
      });
      let warning: string | null = null;
      if (files.length) {
        try {
          await addAttachments(db, projectId, obs.id, await toInputs(files), { maxBytes, maxCount });
        } catch (e) {
          warning = `Saved, but the screenshots could not be stored: ${
            e instanceof QaError ? fileErrorMessage(e, maxMb, maxCount) : 'storage is full or unavailable.'
          } Add them from the inbox.`;
        }
      }
      setSaved({ id: obs.id, title: obs.title, warning });
      notify('Observation saved');
      reset();
      document.getElementById(textId)?.focus();
    } catch {
      setSaved(null);
      setAiError('Could not save to this device’s storage. Your text is still here — copy it somewhere safe.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="qa-stack"
      onPaste={(e) => {
        const imgs = imagesFromClipboard(e);
        if (imgs.length) {
          e.preventDefault();
          addFiles(imgs);
        }
      }}
    >
      {saved && (
        <div className={`qa-banner ${saved.warning ? 'qa-banner-warning' : 'qa-banner-success'}`} role="status">
          <span>{saved.warning ?? `Saved “${saved.title}”. Capture the next one, or`}</span>
          <button type="button" className="qa-link" onClick={() => go({ name: 'detail', id: saved.id })}>
            open it
          </button>
        </div>
      )}

      {voiceSupported ? (
        <button
          type="button"
          className={`qa-mic${listening ? ' qa-mic-on' : ''}`}
          aria-pressed={listening}
          onClick={listening ? stopVoice : startVoice}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {listening ? <path d="M7 7h10v10H7z" /> : <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-6 9a6 6 0 0 0 12 0M12 18v3" />}
          </svg>
          <span>{listening ? 'Listening… tap to stop' : text ? 'Tap to keep talking' : 'Tap and describe what you noticed'}</span>
        </button>
      ) : (
        <p className="qa-hint">Voice input isn’t available in this browser. Type below — on iPhone, the keyboard’s mic key dictates too.</p>
      )}
      {speechError && (
        <p className="qa-banner qa-banner-warning" role="alert">
          {SPEECH_ERRORS[speechError]}
        </p>
      )}

      <div className="qa-field">
        <label className="qa-label" htmlFor={textId}>
          What did you notice?
        </label>
        <textarea
          id={textId}
          className="qa-input qa-textarea qa-textarea-lg"
          value={text}
          placeholder="e.g. On Today, the calorie ring overlaps the date when the text size is large. It should sit below it."
          onChange={(e) => {
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save();
          }}
          readOnly={listening}
        />
        {raw && <span className="qa-hint">Your words are saved exactly as shown when you tap Save.</span>}
      </div>

      <div className="qa-chips" role="group" aria-label="Type (optional)">
        {/* Same labels and colors as the inbox badge, so the saved type is recognizable (OBS-EF13DE). */}
        {OBSERVATION_TYPES.map((t) => (
          <button key={t} type="button" className={`qa-chip qa-chip-${t}`} aria-pressed={type === t} onClick={() => setType(type === t ? null : t)}>
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <TextField
        label="Feature or screen"
        value={details.feature}
        onChange={(v) => setField('feature', v)}
        ai={aiFields.includes('feature')}
        hint={openContext?.screen ? 'Filled from where you were. Change it if needed.' : undefined}
      />

      <div className="qa-row qa-wrap">
        <AddScreenshotButton onFiles={addFiles} />
        {config.ai && aiAvailable && (
          <button type="button" className="qa-btn qa-btn-secondary" onClick={() => void runAi()} disabled={aiBusy || !text.trim()}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
            </svg>
            {aiBusy ? 'Structuring…' : 'Structure with AI'}
          </button>
        )}
      </div>
      <p className="qa-hint">
        No screen recording here: take a normal screenshot (iPhone: side + volume up), then add it from Photos. On a computer you can paste an image.
        {config.ai && aiAvailable ? ` “Structure with AI” sends only your text to ${aiLabel || 'the AI provider'}.` : ''}
      </p>
      <PendingScreenshots files={files} onRemove={(i) => setFiles((f) => f.filter((_, n) => n !== i))} />
      {fileError && (
        <p className="qa-banner qa-banner-danger" role="alert">
          {fileError}
        </p>
      )}
      {aiError && (
        <p className="qa-banner qa-banner-warning" role="alert">
          {aiError}
        </p>
      )}

      {analysis && (
        <div className="qa-ai-box">
          <span className="qa-label">
            <AiBadge /> AI reading of your words — check before saving
          </span>
          <ListBlock title="You said" items={analysis.facts} />
          <ListBlock title="Interpretations (not stated by you)" items={analysis.interpretations} />
          <ListBlock title="Unknown" items={analysis.unknowns} />
          {analysis.suggested.priority && analysis.suggested.priority !== priority && (
            <p>
              Suggested priority: <strong>{PRIORITY_LABELS[analysis.suggested.priority]}</strong>
              {analysis.priorityReason ? ` — ${analysis.priorityReason}` : ''}{' '}
              <button type="button" className="qa-link" onClick={() => setPriority(analysis.suggested.priority ?? null)}>
                Use it
              </button>
            </p>
          )}
        </div>
      )}

      <details className="qa-details" open={showDetails} onToggle={(e) => setShowDetails((e.target as HTMLDetailsElement).open)}>
        <summary>More details (optional)</summary>
        <div className="qa-stack">
          <TextField label="Title" value={details.title} onChange={(v) => setField('title', v)} ai={aiFields.includes('title')} placeholder="Defaults to your first sentence" />
          <TextField label="Description" multiline value={details.description} onChange={(v) => setField('description', v)} ai={aiFields.includes('description')} />
          <TextField label="What happens (actual)" multiline value={details.actualBehavior} onChange={(v) => setField('actualBehavior', v)} ai={aiFields.includes('actualBehavior')} />
          <TextField label="What should happen (expected)" multiline value={details.expectedBehavior} onChange={(v) => setField('expectedBehavior', v)} ai={aiFields.includes('expectedBehavior')} />
          <TextField label="Proposed solution" multiline value={details.proposedSolution} onChange={(v) => setField('proposedSolution', v)} ai={aiFields.includes('proposedSolution')} />
          <div className="qa-grid-2">
            <TypeSelect value={type ?? 'other'} onChange={setType} />
            <PrioritySelect value={priority} onChange={setPriority} />
          </div>
        </div>
      </details>

      <div className="qa-sticky-actions">
        <button type="button" className="qa-btn qa-btn-primary qa-btn-block" onClick={() => void save()} disabled={!canSave}>
          {saving ? 'Saving…' : 'Save observation'}
        </button>
      </div>

      {config.floatingButton !== false && (
        <label className="qa-check qa-hint">
          <input type="checkbox" checked={fabHidden !== true} onChange={(e) => {
              setFabOverride(!e.target.checked);
              void setMetaValue(db, META_FAB_HIDDEN, !e.target.checked);
            }} />
          <span>Show the floating capture button on every screen</span>
        </label>
      )}
    </div>
  );
}
