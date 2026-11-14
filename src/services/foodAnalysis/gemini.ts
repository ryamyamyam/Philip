/**
 * Gemini adapter. The only module that knows about the Gemini REST API.
 * Docs: https://ai.google.dev/api/generate-content
 *
 * The key is sent only to generativelanguage.googleapis.com, in the x-goog-api-key header
 * (not the URL, so it doesn't end up in logs or history).
 */
import { extractJson, validateAnalysis } from './parse';
import { foodPhotoPrompt, foodSuggestPrompt, foodTextPrompt, GEMINI_RESPONSE_SCHEMA, type SuggestTargets } from './prompt';
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
  /** Owner's note about the photo, e.g. "I only ate half of the rice" (OBS-D9A254). */
  details?: string | null;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
}

export interface GeminiTextRequest {
  apiKey: string;
  model: string;
  text: string;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
}

type Part = { inline_data: { mime_type: string; data: string } } | { text: string };

interface GenerateRequest {
  apiKey: string;
  model: string;
  parts: Part[];
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
}

const MODEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,80}$/;

export function normalizeModel(model: string | null | undefined): string {
  const m = (model ?? '').trim().replace(/^models\//, '');
  return MODEL_RE.test(m) ? m : DEFAULT_GEMINI_MODEL;
}

/**
 * Gemini 3+ models are tuned for the default temperature (1.0); Google advises against lowering it,
 * since low values can make them loop until the output is cut off (→ unreadable JSON). Older models
 * keep 0.2 for steadier numbers. Exported for tests.
 */
export function usesDefaultTemperature(model: string): boolean {
  const m = normalizeModel(model).match(/^gemini-(\d+)/);
  return m != null && Number(m[1]) >= 3;
}

function body(parts: Part[], withSchema: boolean, model: string) {
  return {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      ...(usesDefaultTemperature(model) ? {} : { temperature: 0.2 }),
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

async function post(req: GenerateRequest, withSchema: boolean): Promise<Response> {
  const f = req.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), TIMEOUT_MS);
  const onAbort = () => ctrl.abort(req.signal?.reason);
  req.signal?.addEventListener('abort', onAbort);
  try {
    return await f(`${GEMINI_ENDPOINT}/models/${encodeURIComponent(normalizeModel(req.model))}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': req.apiKey },
      body: JSON.stringify(body(req.parts, withSchema, req.model)),
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

export function analyzeWithGemini(req: GeminiRequest): Promise<AnalysisResult> {
  const { imageBase64, mimeType, details, ...rest } = req;
  return generate({ ...rest, parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: foodPhotoPrompt(details) }] });
}

/** Text path (OBS-A2F21F): same request, schema, error mapping and validator as the photo path. */
export function analyzeTextWithGemini(req: GeminiTextRequest): Promise<AnalysisResult> {
  const { text, ...rest } = req;
  return generate({ ...rest, parts: [{ text: foodTextPrompt(text) }] });
}

/** Suggestions (Story 3): same request, schema, error mapping and validator; each item is one option. */
export function suggestWithGemini(req: Omit<GeminiTextRequest, 'text'> & { left: SuggestTargets }): Promise<AnalysisResult> {
  const { left, ...rest } = req;
  return generateWithRetry({ ...rest, parts: [{ text: foodSuggestPrompt(left) }] });
}

async function generate(req: GenerateRequest): Promise<AnalysisResult> {
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

/**
 * One automatic retry when the reply was unreadable (cut-off or malformed JSON). Free-tier
 * replies occasionally truncate; a second try usually succeeds. Other errors are not retried.
 */
async function generateWithRetry(req: GenerateRequest): Promise<AnalysisResult> {
  try {
    return await generate(req);
  } catch (e) {
    if (e instanceof AnalysisError && e.code === 'invalidResponse' && !req.signal?.aborted) return generate(req);
    throw e;
  }
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

/**
 * Workout check-in (owner feedback, Nov 5): Philip reads the owner's note about a set. Returns the
 * raw JSON; the caller validates and clamps it (`parseCoachReply`) and never applies it without OK.
 */
export async function coachCheckinWithGemini(req: GeminiTextRequest): Promise<unknown> {
  if (!req.apiKey.trim()) throw new AnalysisError('noKey');
  const res = await post({ apiKey: req.apiKey, model: req.model, parts: [{ text: req.text }], signal: req.signal, fetchImpl: req.fetchImpl }, false);
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as GeminiErrorBody | null;
    throw mapHttpError(res.status, payload, res.headers);
  }
  const json = (await res.json().catch(() => {
    throw new AnalysisError('invalidResponse', 'Body is not JSON');
  })) as GeminiResponse;
  return extractJson(responseText(json));
}
