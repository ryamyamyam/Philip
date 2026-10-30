import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { analyzeScreenshot } from '../ai/analysis';
import { AiError } from '../ai/provider';
import { imageSize, prepareForAi } from '../browser';
import { DEFAULT_MAX_ATTACHMENT_BYTES, DEFAULT_MAX_ATTACHMENTS } from '../config';
import {
  QaError,
  addAttachments,
  getAttachmentBlob,
  listAttachments,
  removeAttachment,
  updateAttachment,
  validateAttachment,
  type AttachmentInput,
} from '../repository';
import type { ScreenshotAttachment } from '../types';
import { Confirm } from './Confirm';
import { useQa } from './context';
import { ListBlock } from './fields';
import { AI_ERRORS, fileErrorMessage } from './strings';

export function useLimits() {
  const { config } = useQa();
  const maxBytes = config.maxAttachmentBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES;
  const maxCount = config.maxAttachmentsPerObservation ?? DEFAULT_MAX_ATTACHMENTS;
  return { maxBytes, maxCount, maxMb: Math.round(maxBytes / 1024 / 1024) };
}

export async function toInputs(files: File[]): Promise<AttachmentInput[]> {
  return Promise.all(
    files.map(async (f) => {
      const size = await imageSize(f);
      return { blob: f, fileName: f.name || null, width: size?.width ?? null, height: size?.height ?? null };
    }),
  );
}

/** Images from a paste event (desktop: Cmd/Ctrl+V after taking a screenshot). */
export function imagesFromClipboard(e: ClipboardEvent | React.ClipboardEvent): File[] {
  const items = Array.from(e.clipboardData?.items ?? []);
  return items
    .filter((i) => i.kind === 'file' && i.type.startsWith('image/'))
    .map((i) => i.getAsFile())
    .filter((f): f is File => !!f)
    .map((f) => (f.name && f.name !== 'image.png' ? f : new File([f], `pasted-${Date.now()}.${f.type.split('/')[1] ?? 'png'}`, { type: f.type })));
}

export function AddScreenshotButton({ onFiles, label = 'Add screenshots' }: { onFiles: (files: File[]) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className="qa-btn qa-btn-secondary">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h3l2-3h6l2 3h3v12H4V7Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      </svg>
      {label}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        className="qa-visually-hidden"
        data-testid="qa-screenshot-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (ref.current) ref.current.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </label>
  );
}

/** Screenshots chosen during capture, before the observation exists. */
export function PendingScreenshots({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [files]);
  if (!files.length) return null;
  return (
    <ul className="qa-thumbs" aria-label="Screenshots to attach">
      {files.map((_, i) => (
        <li key={i} className="qa-thumb">
          {urls[i] && <img src={urls[i]} alt={`Screenshot ${i + 1}`} />}
          <button type="button" className="qa-thumb-remove" aria-label={`Remove screenshot ${i + 1}`} onClick={() => onRemove(i)}>
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Validates new files against limits before they're queued. Returns accepted files and an error message. */
export function screenFiles(files: File[], existing: number, maxBytes: number, maxCount: number, maxMb: number): { ok: File[]; error: string | null } {
  const ok: File[] = [];
  let error: string | null = null;
  for (const f of files) {
    try {
      validateAttachment(f, { maxBytes });
      if (existing + ok.length >= maxCount) throw new QaError('tooManyFiles');
      ok.push(f);
    } catch (e) {
      error = e instanceof QaError ? fileErrorMessage(e, maxMb, maxCount) : 'The file could not be read.';
    }
  }
  return { ok, error };
}

/** Saved screenshots for an observation: view, add, describe, analyze, remove. */
export function SavedScreenshots({ observationId, userNote }: { observationId: string; userNote: string }) {
  const { db, projectId, config, aiAvailable, aiLabel, notify } = useQa();
  const { maxBytes, maxCount, maxMb } = useLimits();
  const shots = useLiveQuery(() => listAttachments(db, projectId, observationId), [db, projectId, observationId]);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ScreenshotAttachment | null>(null);
  const [removing, setRemoving] = useState<ScreenshotAttachment | null>(null);

  const add = async (files: File[]) => {
    setError(null);
    const { ok, error: err } = screenFiles(files, shots?.length ?? 0, maxBytes, maxCount, maxMb);
    if (err) setError(err);
    if (!ok.length) return;
    try {
      await addAttachments(db, projectId, observationId, await toInputs(ok), { maxBytes, maxCount });
      notify(`${ok.length} screenshot${ok.length === 1 ? '' : 's'} added`);
    } catch (e) {
      setError(e instanceof QaError ? fileErrorMessage(e, maxMb, maxCount) : 'Storage is full or unavailable. The screenshot was not saved.');
    }
  };

  return (
    <section className="qa-section" aria-label="Screenshots" onPaste={(e) => {
      const imgs = imagesFromClipboard(e);
      if (imgs.length) {
        e.preventDefault();
        void add(imgs);
      }
    }}>
      <h3 className="qa-section-title">Screenshots {shots?.length ? `(${shots.length})` : ''}</h3>
      {shots && shots.length > 0 && (
        <ul className="qa-shot-list">
          {shots.map((a, i) => (
            <ShotRow
              key={a.id}
              shot={a}
              index={i}
              onView={() => setViewing(a)}
              onRemove={() => setRemoving(a)}
              canAnalyze={!!config.ai && aiAvailable}
              aiLabel={aiLabel}
              userNote={userNote}
            />
          ))}
        </ul>
      )}
      <AddScreenshotButton onFiles={(f) => void add(f)} label={shots?.length ? 'Add more' : 'Add screenshots'} />
      {error && (
        <p className="qa-banner qa-banner-danger" role="alert">
          {error}
        </p>
      )}
      {viewing && <Viewer shot={viewing} onClose={() => setViewing(null)} />}
      {removing && (
        <Confirm
          title="Remove this screenshot?"
          body="The image is deleted from this device. The observation stays."
          confirmLabel="Remove"
          destructive
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            await removeAttachment(db, projectId, removing.id);
            setRemoving(null);
          }}
        />
      )}
    </section>
  );
}

function useBlobUrl(attachmentId: string): string | null {
  const { db, projectId } = useQa();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    let live = true;
    void getAttachmentBlob(db, projectId, attachmentId).then((b) => {
      if (!live || !b) return;
      u = URL.createObjectURL(b);
      setUrl(u);
    });
    return () => {
      live = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [db, projectId, attachmentId]);
  return url;
}

function ShotRow({
  shot,
  index,
  onView,
  onRemove,
  canAnalyze,
  aiLabel,
  userNote,
}: {
  shot: ScreenshotAttachment;
  index: number;
  onView: () => void;
  onRemove: () => void;
  canAnalyze: boolean;
  aiLabel: string;
  userNote: string;
}) {
  const { db, projectId, config } = useQa();
  const url = useBlobUrl(shot.id);
  const [desc, setDesc] = useState(shot.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    if (!config.ai) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await getAttachmentBlob(db, projectId, shot.id);
      if (!blob) throw new Error('missing');
      const image = await prepareForAi(blob);
      const result = await analyzeScreenshot(config.ai, image, userNote);
      await updateAttachment(db, projectId, shot.id, { aiAnalysis: result });
    } catch (e) {
      setError(e instanceof AiError ? AI_ERRORS[e.code] : 'The screenshot could not be analyzed.');
    } finally {
      setBusy(false);
    }
  };

  const a = shot.aiAnalysis;
  return (
    <li className="qa-shot">
      <button type="button" className="qa-shot-img" onClick={onView} aria-label={`View screenshot ${index + 1}`}>
        {url ? <img src={url} alt="" /> : <span className="qa-hint">Loading…</span>}
      </button>
      <div className="qa-shot-meta">
        <span className="qa-hint">
          {shot.fileName ?? `Screenshot ${index + 1}`}
          {shot.width && shot.height ? ` · ${shot.width}×${shot.height}` : ''}
        </span>
        <input
          className="qa-input"
          aria-label={`Note for screenshot ${index + 1}`}
          placeholder="Note (optional)"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onBlur={() => desc !== shot.description && void updateAttachment(db, projectId, shot.id, { description: desc })}
        />
        <div className="qa-row qa-wrap">
          {canAnalyze && (
            <button type="button" className="qa-btn qa-btn-small" disabled={busy} onClick={() => void analyze()} title={`Sends this image to ${aiLabel}`}>
              {busy ? 'Analyzing…' : a ? 'Re-analyze with AI' : 'Analyze with AI'}
            </button>
          )}
          <button type="button" className="qa-btn qa-btn-small qa-btn-danger-ghost" onClick={onRemove}>
            Remove
          </button>
        </div>
        {canAnalyze && !a && <span className="qa-hint">Analysis sends this image to {aiLabel || 'the AI provider'}.</span>}
        {error && (
          <p className="qa-banner qa-banner-danger" role="alert">
            {error}
          </p>
        )}
        {a && (
          <div className="qa-ai-box">
            <span className="qa-label">AI visual description — unverified, not your observation</span>
            <p>{a.summary}</p>
            <ListBlock title="Possible visual issues" items={a.possibleIssues} />
            <ListBlock title="Visible text" items={a.visibleText} />
          </div>
        )}
      </div>
    </li>
  );
}

function Viewer({ shot, onClose }: { shot: ScreenshotAttachment; onClose: () => void }) {
  const url = useBlobUrl(shot.id);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="qa-viewer" role="dialog" aria-modal="true" aria-label="Screenshot" onClick={onClose}>
      {url && <img src={url} alt={shot.fileName ?? 'Screenshot'} />}
      <button type="button" className="qa-btn" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
