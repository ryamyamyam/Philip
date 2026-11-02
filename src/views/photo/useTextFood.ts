import { useCallback, useMemo, useRef } from 'react';
import { getProfile } from '../../db/repo';
import { useRecentEntries, useSavedFoods } from '../../hooks/useData';
import { t } from '../../i18n';
import { localRows } from '../../lib/foodText';
import { recentFoods, savedToQuick } from '../../lib/recents';
import { AnalysisError, analyzeFoodText } from '../../services/foodAnalysis';
import { fromAnalysis, fromLocal, type ReviewItem } from './reviewModel';

export interface TextFoodResult {
  items: ReviewItem[];
  /** Shown when the AI path wasn't used or failed (rows were parsed locally). */
  notice: string | null;
  notes: string[];
  model: string;
}

/**
 * Typed food text → review rows (OBS-A2F21F / OBS-BC1840).
 * With a Gemini key: Gemini text analysis, same validator as photos.
 * Without a key, on error, or when Gemini finds nothing: local parse + My Foods / recents match.
 */
export function useTextFood(): (text: string) => Promise<TextFoodResult> {
  const entries = useRecentEntries();
  const saved = useSavedFoods();
  const candidates = useMemo(
    () => [...(saved ?? []).map(savedToQuick), ...(entries && saved ? recentFoods(entries, saved, 200) : [])],
    [entries, saved],
  );
  const ref = useRef(candidates);
  ref.current = candidates;

  return useCallback(async (text: string) => {
    const local = (notice: string | null, model = ''): TextFoodResult => ({ items: fromLocal(localRows(text, ref.current)), notice, notes: [], model });
    const profile = await getProfile();
    if (!profile.geminiKey) return local(t('add.textLocal'));
    try {
      const r = await analyzeFoodText(text, { apiKey: profile.geminiKey, model: profile.geminiModel });
      if (r.items.length === 0) return local(t('add.textNothing'), r.model);
      return { items: fromAnalysis(r.items, { provider: 'gemini', model: r.model, analyzedAt: Date.now() }), notice: null, notes: r.notes, model: r.model };
    } catch (e) {
      const code = e instanceof AnalysisError ? e.code : 'invalidResponse';
      return local(t('add.textFallback', { reason: t(`gemini.error.${code}`, { model: profile.geminiModel ?? '' }) }), profile.geminiModel ?? '');
    }
  }, []);
}
