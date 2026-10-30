import { useEffect, useId, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { db } from '../db/db';
import { META, setMeta, updateProfile } from '../db/repo';
import { useLastBackupAt, useMeta, useProfile } from '../hooks/useData';
import { t } from '../i18n';
import {
  BackupError,
  backupFileName,
  createBackup,
  deleteAllData,
  parseBackup,
  restoreBackup,
  type ParsedBackup,
  type RestoreMode,
} from '../lib/backup';
import { fmtDateTime } from '../lib/format';
import { isStandalone, type PersistState } from '../lib/pwa';
import { AnalysisError } from '../services/foodAnalysis';
import { openQaFeedback } from '../modules/qa-feedback';
import { DEFAULT_GEMINI_MODEL, listGeminiModels, normalizeModel, SUGGESTED_GEMINI_MODELS, testGeminiKey } from '../services/foodAnalysis/gemini';

export default function SettingsView() {
  return (
    <div className="view">
      <header className="view-header">
        <h1>{t('settings.title')}</h1>
      </header>
      <div className="stack">
        <DataSection />
        <GeminiSection />
        <UnitsSection />
        <QaSection />
        <DangerSection />
        <p className="subtle">{t('settings.about')}</p>
        <p className="subtle">{t('settings.version', { version: __APP_VERSION__ })}</p>
      </div>
    </div>
  );
}

/* ---------------- Backup & restore ---------------- */

function DataSection() {
  const toast = useToast();
  const lastBackup = useLastBackupAt();
  const persisted = useMeta<PersistState>(META.storagePersisted);
  const [includeKey, setIncludeKey] = useState(false);
  const [pending, setPending] = useState<ParsedBackup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportBackup = async () => {
    setError(null);
    const backup = await createBackup(db, { includeApiKey: includeKey });
    const json = JSON.stringify(backup, null, 2);
    const name = backupFileName();
    const file = new File([json], name, { type: 'application/json' });
    let done = false;
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: t('backup.shareTitle') });
        done = true;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return; // user cancelled
        // fall through to download
      }
    }
    if (!done) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
    await setMeta(META.lastBackupAt, Date.now());
    toast(t('backup.exported'));
  };

  const onFile = async (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!f) return;
    setError(null);
    let text: string;
    try {
      text = await f.text();
    } catch {
      setError(t('backup.error.read'));
      return;
    }
    try {
      setPending(parseBackup(text));
    } catch (e) {
      if (e instanceof BackupError) {
        setError(
          e.code === 'version'
            ? t('backup.error.version', { version: e.version ?? '?' })
            : e.code === 'invalid'
              ? t('backup.error.invalid', { detail: e.detail })
              : t(`backup.error.${e.code}`),
        );
      } else setError(t('backup.error.read'));
    }
  };

  return (
    <section id="settings-data" className="card stack" aria-labelledby="data-h">
      <h2 id="data-h">{t('settings.data')}</h2>
      <p className="small muted">{t('settings.dataNote')}</p>
      <p className="small">
        {lastBackup ? t('settings.lastBackup', { date: fmtDateTime(lastBackup) }) : t('settings.neverBackedUp')}
      </p>
      <p className="subtle">
        {persisted === 'granted'
          ? t('settings.storagePersisted')
          : persisted === 'denied'
            ? t('settings.storageNotPersisted')
            : t('settings.storageUnknown')}
      </p>
      {!isStandalone() && <p className="subtle">{t('install.body')}</p>}
      <button type="button" className="btn btn-primary btn-block" onClick={() => void exportBackup()}>
        <Icon name="download" /> {t('settings.export')}
      </button>
      <label className="checkbox-row small">
        <input type="checkbox" checked={includeKey} onChange={(e) => setIncludeKey(e.target.checked)} />
        <span>{t('settings.exportIncludeKey')}</span>
      </label>
      <label className="btn btn-secondary btn-block">
        <Icon name="upload" /> {t('settings.import')}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>
      {error && (
        <div className="banner banner-danger" role="alert">
          <Icon name="warning" />
          <span>{error}</span>
        </div>
      )}
      {pending && <RestoreDialog parsed={pending} onClose={() => setPending(null)} onError={setError} />}
    </section>
  );
}

function RestoreDialog({ parsed, onClose, onError }: { parsed: ParsedBackup; onClose: () => void; onError: (m: string) => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [localCount, setLocalCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const d = parsed.file.data;
  useEffect(() => {
    void db.foodEntries.count().then(setLocalCount);
  }, []);
  const exportedMs = Date.parse(parsed.file.exportedAt);
  const exported = Number.isFinite(exportedMs) ? fmtDateTime(exportedMs) : '?';

  const run = async () => {
    setBusy(true);
    try {
      const s = await restoreBackup(db, parsed.file, mode);
      toast(t('backup.restored', { entries: s.entriesAdded + s.entriesUpdated }));
      onClose();
    } catch {
      onError(t('backup.error.write'));
      onClose();
    }
  };

  return (
    <ConfirmDialog
      title={t('backup.restoreTitle')}
      confirmLabel={t('backup.confirmRestore')}
      destructive={mode === 'replace'}
      confirmDisabled={busy}
      onCancel={onClose}
      onConfirm={() => void run()}
      body={
        <>
          <p>{t('backup.fileSummary', { date: exported, entries: d.foodEntries.length, plans: d.targetPlans.length, foods: d.savedFoods.length })}</p>
          {parsed.duplicatesSkipped > 0 && <p>{t('backup.duplicates', { count: parsed.duplicatesSkipped })}</p>}
          <p>
            <strong>{t('backup.mode')}</strong>
          </p>
          <div className="segmented" role="radiogroup" aria-label={t('backup.mode')}>
            {(['merge', 'replace'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>
                {m === 'merge' ? t('backup.modeMerge') : t('backup.modeReplace')}
              </button>
            ))}
          </div>
          <p>{mode === 'merge' ? t('backup.modeMergeHint') : t('backup.modeReplaceHint')}</p>
          {mode === 'replace' && localCount != null && localCount > 0 && (
            <div className="banner banner-danger">
              <Icon name="warning" />
              <span>{t('backup.replaceWarning', { entries: localCount })}</span>
            </div>
          )}
        </>
      }
    />
  );
}

/* ---------------- Gemini ---------------- */

function GeminiSection() {
  const profile = useProfile();
  const toast = useToast();
  const keyId = useId();
  const modelId = useId();
  const listId = useId();
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState<string[]>(SUGGESTED_GEMINI_MODELS);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (profile && !loaded.current) {
      loaded.current = true;
      setKey(profile.geminiKey ?? '');
      setModel(profile.geminiModel ?? DEFAULT_GEMINI_MODEL);
    }
  }, [profile]);

  const errMsg = (e: unknown, m: string) =>
    e instanceof AnalysisError ? t(`gemini.error.${e.code}`, { model: m }) : t('error.generic');

  const save = async () => {
    const m = normalizeModel(model);
    setModel(m);
    await updateProfile({ geminiKey: key.trim() || null, geminiModel: m });
    toast(t('settings.geminiSaved'));
  };

  const test = async () => {
    const m = normalizeModel(model);
    setBusy(true);
    setStatus(null);
    try {
      await testGeminiKey(key.trim(), m);
      await updateProfile({ geminiKey: key.trim() || null, geminiModel: m });
      setStatus({ ok: true, msg: t('settings.geminiTestOk', { model: m }) });
      listGeminiModels(key.trim())
        .then((list) => list.length && setModels(list))
        .catch(() => undefined);
    } catch (e) {
      setStatus({ ok: false, msg: errMsg(e, m) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack" aria-labelledby="gem-h">
      <h2 id="gem-h">{t('settings.gemini')}</h2>
      <div className="field">
        <label className="field-label" htmlFor={keyId}>
          {t('settings.geminiKey')}
        </label>
        <input
          id={keyId}
          className="input"
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <span className="field-hint">{t('settings.geminiKeyHint')}</span>
      </div>
      <div className="field">
        <label className="field-label" htmlFor={modelId}>
          {t('settings.geminiModel')}
        </label>
        <input
          id={modelId}
          className="input"
          list={listId}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        <datalist id={listId}>
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <span className="field-hint">{t('settings.geminiModelHint')}</span>
      </div>
      <div className="row-wrap">
        <button type="button" className="btn btn-primary" onClick={() => void save()}>
          {t('common.save')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void test()} disabled={busy || !key.trim()}>
          {t('settings.geminiTest')}
        </button>
        {profile?.geminiKey && (
          <button
            type="button"
            className="btn btn-danger-ghost"
            onClick={() => {
              setKey('');
              void updateProfile({ geminiKey: null });
            }}
          >
            {t('settings.geminiRemove')}
          </button>
        )}
      </div>
      {status && (
        <div className={`banner ${status.ok ? 'banner-success' : 'banner-danger'}`} role="status">
          <Icon name={status.ok ? 'check' : 'warning'} />
          <span>{status.msg}</span>
        </div>
      )}
      <p className="subtle">{t('settings.geminiPrivacy')}</p>
    </section>
  );
}

/* ---------------- Units ---------------- */

function UnitsSection() {
  const profile = useProfile();
  if (!profile) return null;
  const u = profile.unitPrefs;
  return (
    <section className="card stack" aria-labelledby="units-h">
      <h2 id="units-h">{t('settings.units')}</h2>
      <div className="field">
        <span className="field-label">{t('settings.unitWeight')}</span>
        <div className="segmented" role="radiogroup" aria-label={t('settings.unitWeight')}>
          {(['lb', 'kg'] as const).map((w) => (
            <button key={w} type="button" role="radio" aria-checked={u.weight === w} onClick={() => void updateProfile({ unitPrefs: { ...u, weight: w } })}>
              {w}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">{t('settings.unitHeight')}</span>
        <div className="segmented" role="radiogroup" aria-label={t('settings.unitHeight')}>
          {(['in', 'cm'] as const).map((h) => (
            <button key={h} type="button" role="radio" aria-checked={u.height === h} onClick={() => void updateProfile({ unitPrefs: { ...u, height: h } })}>
              {h === 'in' ? 'ft / in' : 'cm'}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- QA & Feedback ---------------- */

function QaSection() {
  return (
    <section className="card stack" aria-labelledby="qa-h">
      <h2 id="qa-h">{t('settings.qa')}</h2>
      <p className="small muted">{t('settings.qaNote')}</p>
      <div className="row-wrap">
        <button type="button" className="btn btn-secondary" onClick={() => openQaFeedback('capture')}>
          {t('settings.qaCapture')}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => openQaFeedback('inbox')}>
          {t('settings.qaInbox')}
        </button>
      </div>
    </section>
  );
}

/* ---------------- Danger zone ---------------- */

function DangerSection() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const confirmWord = t('settings.deleteAllConfirmWord');
  const inputId = useId();
  return (
    <section className="card stack" aria-labelledby="danger-h">
      <h2 id="danger-h">{t('settings.danger')}</h2>
      <button type="button" className="btn btn-danger-ghost btn-block" onClick={() => setOpen(true)}>
        <Icon name="trash" /> {t('settings.deleteAll')}
      </button>
      {open && (
        <ConfirmDialog
          title={t('settings.deleteAll')}
          confirmLabel={t('common.delete')}
          destructive
          confirmDisabled={typed.trim() !== confirmWord}
          onCancel={() => {
            setOpen(false);
            setTyped('');
          }}
          onConfirm={async () => {
            await deleteAllData(db);
            setOpen(false);
            setTyped('');
            toast(t('settings.deleteAllDone'));
          }}
          body={
            <>
              <p>{t('settings.deleteAllBody')}</p>
              <label className="visually-hidden" htmlFor={inputId}>
                {confirmWord}
              </label>
              <input
                id={inputId}
                className="input"
                value={typed}
                autoCapitalize="characters"
                autoComplete="off"
                placeholder={confirmWord}
                onChange={(e) => setTyped(e.target.value)}
              />
            </>
          }
        />
      )}
    </section>
  );
}
