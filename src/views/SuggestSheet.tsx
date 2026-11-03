import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { getProfile } from '../db/repo';
import type { YMD } from '../db/types';
import { useEntriesForDate, useProfile, useTargetPlans } from '../hooks/useData';
import { t, type StringKey } from '../i18n';
import { defaultMealFor } from '../lib/meals';
import { fmtG, fmtKcal } from '../lib/format';
import { planForDate, sumMacros, targetForDate } from '../lib/nutrition';
import { phaseFor, remainingAll, type Remaining } from '../lib/remaining';
import { AnalysisError, suggestFoods, type AnalysisErrorCode, type AnalysisItem } from '../services/foodAnalysis';
import { useUI } from '../ui';
import { fromAnalysis } from './photo/reviewModel';

type State =
  | { status: 'loading' }
  | { status: 'done'; items: AnalysisItem[]; model: string }
  | { status: 'error'; code: AnalysisErrorCode; model: string };

const AFTER_KEY: Record<Remaining['status'], StringKey> = {
  left: 'today.kcal.left',
  over: 'today.kcal.over',
  toGo: 'today.kcal.toGo',
  reached: 'today.kcal.reached',
};
const AFTER_P: Record<Remaining['status'], StringKey> = {
  left: 'today.g.left',
  over: 'today.g.over',
  toGo: 'today.g.toGo',
  reached: 'today.g.reached',
};

/**
 * Optional "What should I eat?" (Story 3). Asks Gemini for options that fit what is left today.
 * Logging one goes through the review sheet like any AI estimate.
 */
export default function SuggestSheet({ date }: { date: YMD }) {
  const { closeSheet, openSheet, navigate } = useUI();
  const entries = useEntriesForDate(date);
  const plans = useTargetPlans();
  const profile = useProfile();
  const [state, setState] = useState<State>({ status: 'loading' });
  const abortRef = useRef<AbortController | null>(null);

  const consumed = useMemo(() => sumMacros(entries ?? []), [entries]);
  const target = useMemo(() => (plans ? targetForDate(plans, date) : null), [plans, date]);
  const phase = useMemo(() => phaseFor(plans ? planForDate(plans, date) : null, profile), [plans, date, profile]);
  const ready = entries !== undefined && target !== null;

  // Latest totals for the request, without re-asking every time a value changes.
  const latest = useRef({ consumed, target });
  latest.current = { consumed, target };

  const run = useCallback(async () => {
    const { consumed, target } = latest.current;
    if (!target) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ status: 'loading' });
    const p = await getProfile();
    try {
      const left = {
        calories: target.calories - consumed.calories,
        proteinG: target.proteinG - consumed.proteinG,
        fatG: target.fatG - consumed.fatG,
        carbsG: target.carbsG - consumed.carbsG,
      };
      const r = await suggestFoods(left, { apiKey: p.geminiKey, model: p.geminiModel, signal: ctrl.signal });
      if (!ctrl.signal.aborted) setState({ status: 'done', items: r.items, model: r.model });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setState({ status: 'error', code: e instanceof AnalysisError ? e.code : 'invalidResponse', model: p.geminiModel ?? '' });
    }
  }, []);

  useEffect(() => {
    if (ready) void run();
    return () => abortRef.current?.abort();
  }, [ready, run]);

  const log = (item: AnalysisItem, model: string) =>
    openSheet({
      kind: 'review',
      date,
      meal: defaultMealFor(),
      items: fromAnalysis([item], { provider: 'gemini', model, analyzedAt: Date.now() }),
      provider: 'gemini',
      model,
      notes: [],
      analyzedAt: Date.now(),
    });

  return (
    <Sheet title={t('suggest.title')} onClose={closeSheet}>
      <div className="stack">
        {state.status === 'loading' && (
          <div className="analyzing" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true" />
            <strong>{t('suggest.loading')}</strong>
          </div>
        )}
        {state.status === 'error' && (
          <>
            <div className={`banner ${state.code === 'noKey' ? 'banner-brand' : 'banner-danger'}`} role="alert">
              <Icon name={state.code === 'noKey' ? 'info' : 'warning'} />
              <span>{state.code === 'noKey' ? t('suggest.noKey') : t(`gemini.error.${state.code}`, { model: state.model })}</span>
            </div>
            {state.code === 'noKey' ? (
              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={() => {
                  closeSheet();
                  navigate('settings');
                }}
              >
                {t('suggest.openSettings')}
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-block" onClick={() => void run()}>
                {t('common.retry')}
              </button>
            )}
          </>
        )}
        {state.status === 'done' && target && (
          <>
            {state.items.length === 0 && <p className="subtle">{t('suggest.none')}</p>}
            <ul className="stack-sm suggest-list" aria-label={t('suggest.title')}>
              {state.items.map((it, i) => {
                const after = remainingAll(phase, sumMacros([consumed, it]), target);
                return (
                  <li key={i} className="card stack-sm suggest-item">
                    <div className="row">
                      <strong style={{ flex: 1 }}>{it.name}</strong>
                      <span className="num">
                        {it.grams != null ? `${fmtG(it.grams)} g · ` : ''}
                        {fmtKcal(it.calories)} {t('common.kcal')}
                      </span>
                    </div>
                    {it.description && <p className="subtle">{it.description}</p>}
                    <p className="small num">
                      P {fmtG(it.proteinG)} · F {fmtG(it.fatG)} · C {fmtG(it.carbsG)}
                    </p>
                    <p className="small subtle num">
                      {t('suggest.after', {
                        kcal: t(AFTER_KEY[after.calories.status], { kcal: fmtKcal(after.calories.amount) }),
                        protein: t(AFTER_P[after.proteinG.status], { g: fmtKcal(after.proteinG.amount) }),
                      })}
                    </p>
                    <button type="button" className="btn btn-secondary btn-block" onClick={() => log(it, state.model)}>
                      {t('suggest.log', { name: it.name })}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => void run()}>
              {t('suggest.again')}
            </button>
          </>
        )}
        <p className="subtle small">{t('suggest.note')}</p>
      </div>
    </Sheet>
  );
}
