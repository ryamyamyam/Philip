/**
 * Story 11 §5.2: Philip in the cloud. The app side of the Worker's `/coach` route (push-worker/).
 *
 * The Gemini key lives in the Worker as a secret, so the phone needs only a pairing token (stored on
 * this device, never in backups). The Worker tries its free models in order; when all are rate
 * limited it can queue the request and retry on a schedule, then send a push when Philip's answer is
 * ready. The Worker never logs request or reply bodies; a queued request waits there until fetched
 * (at most 48 h).
 */
import { db, type PhilipDB } from '../db/db';
import { META } from '../db/repo';
import type { StoredSubscription } from './restPush';

const TIMEOUT_MS = 60_000;

/** The Worker URL (the same Worker as rest alerts). Null = no cloud in this build. */
export function cloudUrl(): string | null {
  const url = (import.meta.env.VITE_PUSH_URL as string | undefined)?.trim();
  return url ? url.replace(/\/+$/, '') : null;
}

export async function cloudToken(database: PhilipDB = db): Promise<string | null> {
  const v = (await database.meta.get(META.coachCloudToken))?.value;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export async function setCloudToken(token: string | null, database: PhilipDB = db): Promise<void> {
  const t = token?.trim() ?? '';
  if (t) await database.meta.put({ key: META.coachCloudToken, value: t.slice(0, 200) });
  else await database.meta.delete(META.coachCloudToken);
}

export type CloudErrorCode = 'notPaired' | 'unauthorized' | 'rateLimited' | 'network' | 'server' | 'invalid';

export class CloudError extends Error {
  constructor(public readonly code: CloudErrorCode) {
    super(code);
    this.name = 'CloudError';
  }
}

export type CloudResult = { status: 'ok'; text: string; model: string } | { status: 'queued'; jobId: string };

type FetchLike = typeof fetch;

interface Opts {
  queue?: boolean;
  subscription?: StoredSubscription | null;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
  url?: string | null;
  token?: string | null;
}

async function call(path: string, init: RequestInit, opts: Opts): Promise<Response> {
  const url = opts.url !== undefined ? opts.url : cloudUrl();
  const token = opts.token !== undefined ? opts.token : await cloudToken();
  if (!url || !token) throw new CloudError('notPaired');
  const f = opts.fetchImpl ?? fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const onAbort = () => ctl.abort();
  opts.signal?.addEventListener('abort', onAbort);
  try {
    const res = await f(`${url}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      signal: ctl.signal,
      referrerPolicy: 'no-referrer',
    });
    if (res.status === 401 || res.status === 403) throw new CloudError('unauthorized');
    return res;
  } catch (e) {
    if (e instanceof CloudError) throw e;
    throw new CloudError('network');
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

/** Sends one prompt. With `queue`, a rate-limited request is queued instead of failing. */
export async function askCloud(prompt: string, opts: Opts = {}): Promise<CloudResult> {
  const res = await call('/coach', { method: 'POST', body: JSON.stringify({ prompt, queue: opts.queue === true, subscription: opts.subscription ?? null }) }, opts);
  const json = (await res.json().catch(() => null)) as { text?: unknown; model?: unknown; jobId?: unknown } | null;
  if (res.status === 202 && typeof json?.jobId === 'string') return { status: 'queued', jobId: json.jobId };
  if (res.status === 429) throw new CloudError('rateLimited');
  if (!res.ok) throw new CloudError(res.status >= 500 ? 'server' : 'invalid');
  if (typeof json?.text !== 'string') throw new CloudError('invalid');
  return { status: 'ok', text: json.text, model: typeof json.model === 'string' ? json.model : '' };
}

export type JobResult = { status: 'waiting' } | { status: 'ok'; text: string; model: string } | { status: 'failed' } | { status: 'gone' };

/** Polls a queued request. A finished one is handed over once and then deleted by the Worker. */
export async function cloudJob(jobId: string, opts: Opts = {}): Promise<JobResult> {
  const res = await call(`/coach/job?id=${encodeURIComponent(jobId)}`, { method: 'GET' }, opts);
  if (res.status === 404) return { status: 'gone' };
  const json = (await res.json().catch(() => null)) as { status?: unknown; text?: unknown; model?: unknown } | null;
  if (!res.ok || !json) throw new CloudError(res.status >= 500 ? 'server' : 'invalid');
  if (json.status === 'done' && typeof json.text === 'string') return { status: 'ok', text: json.text, model: typeof json.model === 'string' ? json.model : '' };
  if (json.status === 'failed') return { status: 'failed' };
  return { status: 'waiting' };
}

/** Settings › Philip in the cloud › Test: checks the token without spending Gemini quota. */
export async function pingCloud(token: string, opts: Opts = {}): Promise<'ok' | 'unauthorized' | 'unreachable'> {
  try {
    const res = await call('/coach/ping', { method: 'GET' }, { ...opts, token });
    return res.ok ? 'ok' : 'unreachable';
  } catch (e) {
    return e instanceof CloudError && e.code === 'unauthorized' ? 'unauthorized' : 'unreachable';
  }
}
