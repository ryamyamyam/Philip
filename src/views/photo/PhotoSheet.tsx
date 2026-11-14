import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AmbientScene } from '../../components/AmbientScene';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import type { Meal, YMD } from '../../db/types';
import { getProfile } from '../../db/repo';
import { t } from '../../i18n';
import { AnalysisError, analyzeFoodPhoto, PHOTO_DETAILS_MAX, type AnalysisErrorCode } from '../../services/foodAnalysis';
import { useUI } from '../../ui';
import { fromAnalysis, manualItem } from './reviewModel';

type State = { status: 'details' } | { status: 'analyzing' } | { status: 'error'; code: AnalysisErrorCode; retryAfter: number | null; model: string };

/**
 * Capture → details (optional note, OBS-D9A254) → analyzing → (review | error with retry/manual/Claude fallback).
 * Nothing is sent to Gemini until the owner taps Add details or Just judge it.
 */
export default function PhotoSheet({ date, meal, file }: { date: YMD; meal: Meal; file: File }) {
  const { closeSheet, openSheet } = useUI();
  const [state, setState] = useState<State>({ status: 'details' });
  const [details, setDetails] = useState('');
  const detailsId = useId();
  const hintId = useId();
  const [preview, setPreview] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const run = useCallback(async (note: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ status: 'analyzing' });
    const profile = await getProfile();
    try {
      const result = await analyzeFoodPhoto(file, { apiKey: profile.geminiKey, model: profile.geminiModel, details: note, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      const used = note.trim();
      openSheet({
        kind: 'review',
        date,
        meal,
        items: fromAnalysis(result.items),
        provider: 'gemini',
        model: result.model,
        notes: used ? [t('photo.detailsUsed', { details: used }), ...result.notes] : result.notes,
        analyzedAt: Date.now(),
      });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const err = e instanceof AnalysisError ? e : new AnalysisError('invalidResponse', String(e));
      setState({ status: 'error', code: err.code, retryAfter: err.retryAfterSec, model: profile.geminiModel ?? '' });
    }
  }, [file, date, meal, openSheet]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <Sheet title={t('photo.title')} onClose={closeSheet} full>
      <div className="stack">
        {preview && <img className="photo-preview" src={preview} alt="" />}
        {state.status === 'details' ? (
          <form
            className="stack-sm photo-details"
            onSubmit={(e) => {
              e.preventDefault();
              void run(details);
            }}
          >
            <label className="field-label" htmlFor={detailsId}>
              {t('photo.detailsLabel')}
            </label>
            <textarea
              id={detailsId}
              className="input food-text-input"
              rows={3}
              maxLength={PHOTO_DETAILS_MAX}
              placeholder={t('photo.detailsPlaceholder')}
              aria-describedby={hintId}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
            <span id={hintId} className="subtle">
              {t('photo.detailsHint')}
            </span>
            <button type="submit" className="btn btn-primary btn-block" disabled={!details.trim()}>
              <Icon name="send" /> {t('photo.addDetails')}
            </button>
            <button type="button" className="btn btn-secondary btn-block" onClick={() => void run('')}>
              {t('photo.skipDetails')}
            </button>
          </form>
        ) : state.status === 'analyzing' ? (
          <div className="analyzing" role="status" aria-live="polite">
            <AmbientScene variant="analyzing" />
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
                <button type="button" className="btn btn-primary btn-block" onClick={() => void run(details)}>
                  {t('common.retry')}
                </button>
              )}
              <button type="button" className="btn btn-secondary btn-block" onClick={() => openSheet({ kind: 'handoff', date, meal, file, details: details.trim() || null })}>
                <Icon name="sparkle" /> {t('photo.useClaude')}
              </button>
              <button type="button" className="btn btn-secondary btn-block" onClick={() =>
                  openSheet({ kind: 'review', date, meal, items: [manualItem()], provider: 'gemini', model: '', notes: [], analyzedAt: Date.now() })
                }
              >
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
