/**
 * Gemini adapter. The only module that knows about the Gemini REST API.
 * Docs: https://ai.google.dev/api/generate-content
 *
 * The key is sent only to generativelanguage.googleapis.com, in the x-goog-api-key header
 * (not the URL, so it doesn't end up in logs or history).
 */
import { extractJson, validateAnalysis } from './parse';
import { FOOD_ANALYSIS_INSTRUCTIONS, GEMINI_RESPONSE_SCHEMA } from './prompt';
import { AnalysisError, type AnalysisResult } from './types';

export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';
/** Default model: confirmed free-tier with image input as of Oct 2026. Configurable in Settings. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
export const SUGGESTED_GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
const TIMEOUT_MS = 45_000;

type FetchLike = typeof fetch;

export interface GeminiRequest {
  apiKey: string;
  model: string;
  imageBase64: string;
  mimeType: string;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
}

const MODEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,80}$/;

export function normalizeModel(model: string | null | undefined): string {
  const m = (model ?? '').trim().replace(/^models\//, '');
  return MODEL_RE.test(m) ? m : DEFAULT_GEMINI_MODEL;
}

function body(imageBase64: string, mimeType: string, withSchema: boolean) {
  return {
    contents: [
      {
        role: 'user',
        parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: FOOD_ANALYSIS_INSTRUCTIONS }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      ...(withSchema ? { responseSchema: GEMINI_RESPONSE_SCHEMA } : {}),
    },
  };
}

interface GeminiErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: { '@type'?: string; reason?: string; retryDelay?: string }[];
  };
}

/** Maps an HTTP failure to a typed error. Exported for tests. */
export function mapHttpError(status: number, payload: GeminiErrorBody | null, headers?: Headers): AnalysisError {
  const err = payload?.error;
  const msg = err?.message ?? `HTTP ${status}`;
  const reasons = (err?.details ?? []).map((d) => d.reason ?? '');
  if (reasons.includes('API_KEY_INVALID') || /api key not valid|API_KEY_INVALID/i.test(msg)) return new AnalysisError('invalidKey', msg);
  if (status === 401 || status === 403) return new AnalysisError('invalidKey', msg);
  if (status === 404) return new AnalysisError('modelUnavailable', msg);
  if (status === 429) {
    const delay = err?.details?.find((d) => d.retryDelay)?.retryDelay;
    const fromBody = delay ? Number.parseFloat(delay) : NaN;
    const fromHeader = Number(headers?.get('retry-after'));
    const retry = Number.isFinite(fromBody) ? fromBody : Number.isFinite(fromHeader) && fromHeader > 0 ? fromHeader : null;
    return new AnalysisError('rateLimited', msg, retry);
  }
  if (status === 400 && /not (found|supported)|unsupported model|model/i.test(msg) && /model/i.test(msg)) {
    return new AnalysisError('modelUnavailable', msg);
  }
  if (status >= 500) return new AnalysisError('server', msg);
  return new AnalysisError('invalidResponse', msg);
}

async function post(req: GeminiRequest, withSchema: boolean): Promise<Response> {
  const f = req.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), TIMEOUT_MS);
  const onAbort = () => ctrl.abort(req.signal?.reason);
  req.signal?.addEventListener('abort', onAbort);
  try {
    return await f(`${GEMINI_ENDPOINT}/models/${encodeURIComponent(normalizeModel(req.model))}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': req.apiKey },
      body: JSON.stringify(body(req.imageBase64, req.mimeType, withSchema)),
      signal: ctrl.signal,
      referrerPolicy: 'no-referrer',
    });
  } catch (e) {
    if (req.signal?.aborted) throw e;
    if (ctrl.signal.aborted) throw new AnalysisError('timeout');
    throw new AnalysisError('network', e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
    req.signal?.removeEventListener('abort', onAbort);
  }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/** Pulls model text out of a generateContent response. Exported for tests. */
export function responseText(json: GeminiResponse): string {
  if (json.promptFeedback?.blockReason) throw new AnalysisError('blocked', json.promptFeedback.blockReason);
  const cand = json.candidates?.[0];
  if (!cand) throw new AnalysisError('invalidResponse', 'No candidates');
  if (cand.finishReason && ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY'].includes(cand.finishReason)) {
    throw new AnalysisError('blocked', cand.finishReason);
  }
  const text = (cand.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  if (!text.trim()) throw new AnalysisError('invalidResponse', `Empty response (${cand.finishReason ?? 'unknown'})`);
  return text;
}

export async function analyzeWithGemini(req: GeminiRequest): Promise<AnalysisResult> {
  if (!req.apiKey.trim()) throw new AnalysisError('noKey');
  let res = await post(req, true);
  if (res.status === 400) {
    // Some models reject structured-output schemas. Retry once with JSON mode only,
    // unless the failure is clearly about the key.
    const payload = (await res.clone().json().catch(() => null)) as GeminiErrorBody | null;
    const mapped = mapHttpError(400, payload);
    if (mapped.code === 'invalidKey' || mapped.code === 'modelUnavailable') throw mapped;
    res = await post(req, false);
  }
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as GeminiErrorBody | null;
    throw mapHttpError(res.status, payload, res.headers);
  }
  const json = (await res.json().catch(() => {
    throw new AnalysisError('invalidResponse', 'Body is not JSON');
  })) as GeminiResponse;
  return validateAnalysis(extractJson(responseText(json)));
}

/** Verifies the key and model with a lightweight metadata call (no image, no generation quota). */
export async function testGeminiKey(apiKey: string, model: string, fetchImpl: FetchLike = fetch): Promise<void> {
  if (!apiKey.trim()) throw new AnalysisError('noKey');
  let res: Response;
  try {
    res = await fetchImpl(`${GEMINI_ENDPOINT}/models/${encodeURIComponent(normalizeModel(model))}`, {
      headers: { 'x-goog-api-key': apiKey },
      referrerPolicy: 'no-referrer',
    });
  } catch (e) {
    throw new AnalysisError('network', e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) throw mapHttpError(res.status, (await res.json().catch(() => null)) as GeminiErrorBody | null, res.headers);
}

/** Lists models this key can call with generateContent, for the Settings picker. */
export async function listGeminiModels(apiKey: string, fetchImpl: FetchLike = fetch): Promise<string[]> {
  let res: Response;
  try {
    res = await fetchImpl(`${GEMINI_ENDPOINT}/models?pageSize=200`, {
      headers: { 'x-goog-api-key': apiKey },
      referrerPolicy: 'no-referrer',
    });
  } catch (e) {
    throw new AnalysisError('network', e instanceof Error ? e.message : String(e));
  }
  if (!res.ok) throw mapHttpError(res.status, (await res.json().catch(() => null)) as GeminiErrorBody | null, res.headers);
  const json = (await res.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
  return (json.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => (m.name ?? '').replace(/^models\//, ''))
    .filter((n) => /flash|pro/i.test(n) && !/image|tts|audio|live|embedding/i.test(n))
    .sort();
}
