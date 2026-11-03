import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { QaError, addAttachments, createObservation, getMetaValue, setMetaValue } from '../repository';
import { webSpeechProvider, type TranscriptionErrorCode, type TranscriptionSession } from '../transcription';
import { OBSERVATION_TYPES, type ObservationType } from '../types';
import { useQa } from './context';
import { META_FAB_HIDDEN } from './QaFeedback';
import { AddScreenshotButton, PendingScreenshots, imagesFromClipboard, screenFiles, toInputs, useLimits } from './Screenshots';
import { SPEECH_ERRORS, TYPE_LABELS, fileErrorMessage } from './strings';

/**
 * Tap → speak or type → save. Everything except the text is optional.
 * OBS-A09A21: the capture form is only words, a type and screenshots. Feature/screen, "Structure with AI"
 * and "More details" were removed; title, description, priority etc. can still be filled in later on the
 * observation's detail screen (AI analysis is available there too). The screen is still recorded
 * automatically in the captured context.
 */
export function QuickCapture() {
  const { config, db, projectId, openContext, notify, go } = useQa();
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
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id: string; title: string; warning: string | null } | null>(null);
  const storedFabHidden = useLiveQuery(() => getMetaValue<boolean>(db, META_FAB_HIDDEN), [db]);
  const [fabOverride, setFabOverride] = useState<boolean | null>(null);
  const fabHidden = fabOverride ?? storedFabHidden;

  useEffect(
    () => () => {
      session.current?.abort();
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

  const addFiles = (incoming: File[]) => {
    const { ok, error } = screenFiles(incoming, files.length, maxBytes, maxCount, maxMb);
    setFileError(error);
    if (ok.length) setFiles((f) => [...f, ...ok]);
  };

  const reset = () => {
    setText('');
    setRaw(null);
    rawParts.current = [];
    setType(null);
    setFiles([]);
    setFileError(null);
    setSaveError(null);
  };

  const canSave = (text.trim() || files.length > 0) && !saving && !listening;

  const save = async () => {
    if (!canSave) return;
    session.current?.abort();
    setSaving(true);
    try {
      const obs = await createObservation(db, projectId, {
        originalText: text,
        rawTranscript: raw,
        captureMethod: raw ? 'voice' : 'text',
        type: type ?? 'other',
        technicalContext: openContext,
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
      setSaveError('Could not save to this device’s storage. Your text is still here — copy it somewhere safe.');
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

      <div className="qa-field">
        {/* A visible label: chips alone didn't say what they were for. */}
        <span className="qa-label" id={`${textId}-type`}>
          Type (optional)
        </span>
        <div className="qa-chips" role="group" aria-labelledby={`${textId}-type`}>
          {/* Same labels and colors as the inbox badge, so the saved type is recognizable (OBS-EF13DE). */}
          {OBSERVATION_TYPES.map((t) => (
            <button key={t} type="button" className={`qa-chip qa-chip-${t}`} aria-pressed={type === t} onClick={() => setType(type === t ? null : t)}>
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="qa-field">
        <AddScreenshotButton onFiles={addFiles} />
        <p className="qa-hint">Take a normal screenshot (iPhone: side + volume up), then add it from Photos. On a computer you can paste one.</p>
      </div>
      <PendingScreenshots files={files} onRemove={(i) => setFiles((f) => f.filter((_, n) => n !== i))} />
      {fileError && (
        <p className="qa-banner qa-banner-danger" role="alert">
          {fileError}
        </p>
      )}
      {saveError && (
        <p className="qa-banner qa-banner-danger" role="alert">
          {saveError}
        </p>
      )}

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
