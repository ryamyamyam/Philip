import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import type { Meal, YMD } from '../../db/types';
import { getProfile } from '../../db/repo';
import { t } from '../../i18n';
import { AnalysisError, analyzeFoodPhoto, type AnalysisErrorCode } from '../../services/foodAnalysis';
import { useUI } from '../../ui';
import { fromAnalysis } from './reviewModel';

type State = { status: 'analyzing' } | { status: 'error'; code: AnalysisErrorCode; retryAfter: number | null; model: string };

/** Capture → analyzing → (review | error with retry/manual/Claude fallback). */
export default function PhotoSheet({ date, meal, file }: { date: YMD; meal: Meal; file: File }) {
  const { closeSheet, openSheet } = useUI();
  const [state, setState] = useState<State>({ status: 'analyzing' });
  const [preview, setPreview] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const run = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ status: 'analyzing' });
    const profile = await getProfile();
    try {
      const result = await analyzeFoodPhoto(file, { apiKey: profile.geminiKey, model: profile.geminiModel, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      openSheet({
        kind: 'review',
        date,
        meal,
        items: fromAnalysis(result.items),
        provider: 'gemini',
        model: result.model,
        notes: result.notes,
        analyzedAt: Date.now(),
      });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const err = e instanceof AnalysisError ? e : new AnalysisError('invalidResponse', String(e));
      setState({ status: 'error', code: err.code, retryAfter: err.retryAfterSec, model: profile.geminiModel ?? '' });
    }
  }, [file, date, meal, openSheet]);

  useEffect(() => {
    void run();
    return () => abortRef.current?.abort();
  }, [run]);

  return (
    <Sheet title={t('photo.title')} onClose={closeSheet} full>
      <div className="stack">
        {preview && <img className="photo-preview" src={preview} alt="" />}
        {state.status === 'analyzing' ? (
          <div className="analyzing" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true" />
            <strong>{t('photo.analyzing')}</strong>
            <span className="subtle">{t('photo.analyzingHint')}</span>
          </div>
        ) : (
          <>
            <div className={`banner ${state.code === 'noKey' ? 'banner-brand' : 'banner-danger'}`} role="alert">
              <Icon name={state.code === 'noKey' ? 'info' : 'warning'} />
              <span>
                {state.code === 'noKey' ? t('photo.noKey') : t(`gemini.error.${state.code}`, { model: state.model })}
                {state.code === 'rateLimited' && state.retryAfter ? ` (~${Math.ceil(state.retryAfter)}s)` : ''}
              </span>
            </div>
            <div className="stack-sm">
              {state.code !== 'noKey' && (
                <button type="button" className="btn btn-primary btn-block" onClick={() => void run()}>
                  {t('common.retry')}
                </button>
              )}
              <button type="button" className="btn btn-secondary btn-block" onClick={() => openSheet({ kind: 'handoff', date, meal, file })}>
                <Icon name="sparkle" /> {t('photo.useClaude')}
              </button>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => openSheet({ kind: 'entry', date, meal })}>
                <Icon name="pencil" /> {t('photo.useManual')}
              </button>
            </div>
          </>
        )}
        <p className="subtle">{t('photo.privacy')}</p>
      </div>
    </Sheet>
  );
}
