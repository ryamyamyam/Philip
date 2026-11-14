/**
 * Story 11: one way to ask Philip for JSON. Cloud first when this device is paired (the key lives in
 * the Worker), else the key saved on this device. Lazy-loaded with the screens that use it.
 */
import { extractJson } from './foodAnalysis/parse';
import { AnalysisError } from './foodAnalysis/types';
import { askCloud, CloudError, cloudToken, cloudUrl } from './coachCloud';

export interface CoachAiOpts {
  apiKey: string | null;
  model: string | null;
  signal?: AbortSignal;
}

export interface CoachAiResult {
  raw: unknown;
  via: 'gemini-cloud' | 'gemini-device';
  model: string | null;
}

/** True when Philip can be asked at all (paired with the cloud, or a key on this device). */
export async function coachAvailable(apiKey: string | null): Promise<boolean> {
  return !!apiKey?.trim() || (!!cloudUrl() && !!(await cloudToken()));
}

export async function coachJson(prompt: string, opts: CoachAiOpts): Promise<CoachAiResult> {
  const paired = !!cloudUrl() && !!(await cloudToken());
  if (paired) {
    try {
      const r = await askCloud(prompt, { signal: opts.signal });
      if (r.status === 'ok') return { raw: extractJson(r.text), via: 'gemini-cloud', model: r.model || null };
    } catch (e) {
      // Fall back to this device's key when the cloud can't answer; otherwise surface it.
      if (!(e instanceof CloudError) || !opts.apiKey?.trim()) throw cloudToAnalysis(e);
    }
  }
  if (!opts.apiKey?.trim()) throw new AnalysisError('noKey');
  const { coachCheckinWithGemini, DEFAULT_GEMINI_MODEL, normalizeModel } = await import('./foodAnalysis/gemini');
  const model = normalizeModel(opts.model ?? DEFAULT_GEMINI_MODEL);
  const raw = await coachCheckinWithGemini({ apiKey: opts.apiKey, model, text: prompt, signal: opts.signal });
  return { raw, via: 'gemini-device', model };
}

function cloudToAnalysis(e: unknown): unknown {
  if (!(e instanceof CloudError)) return e;
  switch (e.code) {
    case 'rateLimited':
      return new AnalysisError('rateLimited');
    case 'unauthorized':
      return new AnalysisError('invalidKey');
    case 'network':
      return new AnalysisError('network');
    case 'server':
      return new AnalysisError('server');
    default:
      return new AnalysisError('invalidResponse');
  }
}
