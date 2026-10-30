/**
 * Gemini adapter for the QA module (REST generateContent, JSON mode).
 * Docs: https://ai.google.dev/api/generate-content
 *
 * The key is supplied by the host at call time and sent only in the x-goog-api-key header.
 * This is a client-side call: suitable for a single-user, local-first app with the user's own key.
 */
import { AiError, extractJsonObject, type AiJsonRequest, type AiJsonResult, type AiProvider } from './provider';

export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 60_000;
const MODEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,80}$/;

export interface GeminiCredentials {
  apiKey: string;
  model: string;
}

export interface GeminiProviderOptions {
  /** Called on every request so key changes in the host's settings take effect immediately. */
  getCredentials: () => Promise<GeminiCredentials | null>;
  fetchImpl?: typeof fetch;
}

interface GeminiErrorBody {
  error?: { code?: number; message?: string; details?: { reason?: string; retryDelay?: string }[] };
}

export function mapGeminiHttpError(status: number, payload: GeminiErrorBody | null): AiError {
  const msg = payload?.error?.message ?? `HTTP ${status}`;
  const reasons = (payload?.error?.details ?? []).map((d) => d.reason ?? '');
  if (reasons.includes('API_KEY_INVALID') || /api key not valid/i.test(msg) || status === 401 || status === 403) {
    return new AiError('invalidKey', msg);
  }
  if (status === 404) return new AiError('modelUnavailable', msg);
  if (status === 429) {
    const delay = payload?.error?.details?.find((d) => d.retryDelay)?.retryDelay;
    const sec = delay ? Number.parseFloat(delay) : NaN;
    return new AiError('rateLimited', msg, Number.isFinite(sec) ? sec : null);
  }
  if (status >= 500) return new AiError('server', msg);
  return new AiError('invalidResponse', msg);
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

function responseText(json: GeminiResponse): string {
  if (json.promptFeedback?.blockReason) throw new AiError('blocked', json.promptFeedback.blockReason);
  const cand = json.candidates?.[0];
  if (!cand) throw new AiError('invalidResponse', 'No candidates');
  if (cand.finishReason && ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY'].includes(cand.finishReason)) {
    throw new AiError('blocked', cand.finishReason);
  }
  const text = (cand.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  if (!text.trim()) throw new AiError('invalidResponse', 'Empty response');
  return text;
}

export function createGeminiProvider(opts: GeminiProviderOptions): AiProvider {
  const f = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function creds(): Promise<GeminiCredentials> {
    const c = await opts.getCredentials();
    if (!c || !c.apiKey.trim()) throw new AiError('notConfigured');
    const model = c.model.trim().replace(/^models\//, '');
    if (!MODEL_RE.test(model)) throw new AiError('modelUnavailable', 'Invalid model name');
    return { apiKey: c.apiKey.trim(), model };
  }

  async function post(c: GeminiCredentials, req: AiJsonRequest, withSchema: boolean): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const onAbort = () => ctrl.abort();
    req.signal?.addEventListener('abort', onAbort);
    const parts: Record<string, unknown>[] = [
      ...(req.images ?? []).map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } })),
      { text: req.input },
    ];
    try {
      return await f(`${GEMINI_ENDPOINT}/models/${encodeURIComponent(c.model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.instructions }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            ...(withSchema && req.schema ? { responseSchema: req.schema } : {}),
          },
        }),
        signal: ctrl.signal,
        referrerPolicy: 'no-referrer',
      });
    } catch (e) {
      if (req.signal?.aborted) throw e;
      if (ctrl.signal.aborted) throw new AiError('timeout');
      throw new AiError('network', e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(timer);
      req.signal?.removeEventListener('abort', onAbort);
    }
  }

  return {
    id: 'gemini',
    async label() {
      const c = await opts.getCredentials();
      return c?.model ? `Gemini (${c.model})` : 'Gemini';
    },
    async isConfigured() {
      const c = await opts.getCredentials();
      return !!c?.apiKey.trim();
    },
    async generateJson(req: AiJsonRequest): Promise<AiJsonResult> {
      const c = await creds();
      let res = await post(c, req, true);
      if (res.status === 400 && req.schema) {
        // Some models reject response schemas; retry once with JSON mode only.
        const mapped = mapGeminiHttpError(400, (await res.clone().json().catch(() => null)) as GeminiErrorBody | null);
        if (mapped.code === 'invalidKey') throw mapped;
        res = await post(c, req, false);
      }
      if (!res.ok) throw mapGeminiHttpError(res.status, (await res.json().catch(() => null)) as GeminiErrorBody | null);
      const json = (await res.json().catch(() => {
        throw new AiError('invalidResponse', 'Body is not JSON');
      })) as GeminiResponse;
      return { data: extractJsonObject(responseText(json)), model: c.model };
    },
  };
}
