// Philip in the cloud (Story 11 §5.2). Pure helpers for the /coach routes, tested.
// The Gemini key is a Worker secret (GEMINI_API_KEY); the app sends only a pairing token
// (COACH_TOKEN, another secret). Request and reply bodies are never logged.
import { BadRequest, checkSubscription } from './timer.js';

export const MAX_PROMPT = 40_000;
export const MAX_BODY = 64 * 1024;
export const COACH_RATE_PER_HOUR = 60;
export const JOB_TTL_MS = 48 * 3600_000;
export const GIVE_UP_MS = 24 * 3600_000;
/** Retry delays after a rate limit: 5, 15, 30 min, then hourly up to 24 h. */
export const RETRY_MS = [5, 15, 30, 60].map((m) => m * 60_000);
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 50_000;

/** Free models, strongest first; set GEMINI_MODELS in wrangler.toml to change. */
export const DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

export function models(env) {
  const list = String(env.GEMINI_MODELS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,80}$/.test(s));
  return list.length ? list : DEFAULT_MODELS;
}

/** Constant-time token check. A missing secret refuses everyone. */
export function tokenOk(header, secret) {
  if (typeof secret !== 'string' || secret.length < 16) return false;
  const m = /^Bearer\s+(.+)$/.exec(header ?? '');
  const got = m ? m[1].trim() : '';
  const a = new TextEncoder().encode(got);
  const b = new TextEncoder().encode(secret);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

/** Validates POST /coach. */
export function checkCoach(body) {
  if (!body || typeof body !== 'object') throw new BadRequest('body missing');
  const prompt = body.prompt;
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT) throw new BadRequest('prompt missing or too long');
  const subscription = body.subscription == null ? null : checkSubscription(body.subscription);
  return { prompt, queue: body.queue === true, subscription };
}

export const nextRetryDelay = (attempts) => RETRY_MS[Math.min(attempts, RETRY_MS.length - 1)];

const usesDefaultTemperature = (model) => {
  const m = /^gemini-(\d+)/.exec(model);
  return m != null && Number(m[1]) >= 3;
};

function replyText(json) {
  const cand = json?.candidates?.[0];
  if (!cand || json?.promptFeedback?.blockReason) return null;
  const text = (cand.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  return text.trim() ? text : null;
}

/**
 * Tries each model in order. Rate limits, missing models and server errors move on to the next one.
 * Returns { ok: true, text, model } or { ok: false, code: 'rateLimited' | 'server' | 'config' }.
 */
export async function generate(prompt, env, fetchImpl = fetch) {
  if (!env.GEMINI_API_KEY) return { ok: false, code: 'config' };
  let limited = false;
  for (const model of models(env)) {
    let res;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      res = await fetchImpl(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { ...(usesDefaultTemperature(model) ? {} : { temperature: 0.2 }), responseMimeType: 'application/json' },
        }),
        signal: ctl.signal,
      });
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429) {
      limited = true;
      continue;
    }
    if (res.status === 401 || res.status === 403) return { ok: false, code: 'config' };
    if (!res.ok) continue;
    const text = replyText(await res.json().catch(() => null));
    if (text) return { ok: true, text, model };
  }
  return { ok: false, code: limited ? 'rateLimited' : 'server' };
}

export function newJobId() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
