// Philip rest-alert Worker (Story 6 §8.2, T-022) and Philip in the cloud (Story 11 §5.2, T-028).
// PUT /timer {subscription, fireAt, title, body} → one Durable Object per device sets an alarm;
// at fireAt it sends one Web Push. DELETE /timer {endpoint} cancels. Stores only the push
// subscription and the pending timer: no account, body, food or lift data.
// POST /coach {prompt, queue, subscription} (Bearer COACH_TOKEN) → Gemini with the Worker's key; when
// every free model is rate limited and `queue` is set, the request waits in the CoachQueue object and
// is retried by alarm, with a push when it's ready. GET /coach/job?id= hands the answer over once.
// GET /coach/ping checks the token. Prompts and replies are never logged; a queued one is deleted
// when fetched, after 48 h at most.
import { BadRequest, checkSubscription, checkTimer, cors, deviceName, rateLimit } from './timer.js';
import { sendPush } from './webpush.js';
import { checkCoach, COACH_RATE_PER_HOUR, generate, GIVE_UP_MS, JOB_TTL_MS, MAX_BODY, newJobId, nextRetryDelay, tokenOk } from './coach.js';

const json = (status, data, headers) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export default {
  /** @param {Request} request @param {any} env */
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = cors(origin, env.ALLOWED_ORIGIN);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (origin !== env.ALLOWED_ORIGIN) return json(403, { error: 'origin not allowed' }, headers);
    const url = new URL(request.url);
    if (url.pathname.startsWith('/coach')) return coachRoute(request, env, url, headers);
    if (url.pathname !== '/timer' || (request.method !== 'PUT' && request.method !== 'DELETE')) return json(404, { error: 'not found' }, headers);
    if (Number(request.headers.get('Content-Length') ?? 0) > 4096) return json(413, { error: 'too large' }, headers);
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'bad json' }, headers);
    }
    try {
      const endpoint = request.method === 'PUT' ? checkTimer(body, Date.now()).subscription.endpoint : checkSubscription({ endpoint: body?.endpoint, keys: { p256dh: '', auth: '' } }).endpoint;
      const stub = env.REST_TIMER.get(env.REST_TIMER.idFromName(await deviceName(endpoint)));
      const res = await stub.fetch('https://do/timer', { method: request.method, body: JSON.stringify(body) });
      return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json', ...headers } });
    } catch (e) {
      if (e instanceof BadRequest) return json(400, { error: e.message }, headers);
      throw e;
    }
  },
};

/** One per device (named by the endpoint hash). Holds at most one pending timer. */
export class RestTimer {
  /** @param {any} state @param {any} env */
  constructor(state, env) {
    this.storage = state.storage;
    this.env = env;
  }

  /** @param {Request} request */
  async fetch(request) {
    const now = Date.now();
    const body = await request.json();
    if (request.method === 'DELETE') {
      await this.storage.delete('timer');
      await this.storage.deleteAlarm();
      return json(200, { ok: true });
    }
    let timer;
    try {
      timer = checkTimer(body, now);
    } catch (e) {
      if (e instanceof BadRequest) return json(400, { error: e.message });
      throw e;
    }
    const rl = rateLimit((await this.storage.get('stamps')) ?? [], now);
    await this.storage.put('stamps', rl.stamps);
    if (!rl.ok) return json(429, { error: 'slow down' });
    await this.storage.put('timer', timer);
    await this.storage.setAlarm(timer.fireAt);
    return json(200, { ok: true, fireAt: timer.fireAt });
  }

  async alarm() {
    const timer = await this.storage.get('timer');
    if (!timer) return;
    await this.storage.delete('timer');
    const status = await sendPush(
      timer.subscription,
      { type: 'rest', title: timer.title, body: timer.body },
      { publicKey: this.env.VAPID_PUBLIC_KEY, privateKey: this.env.VAPID_PRIVATE_KEY, subject: this.env.VAPID_SUBJECT },
    );
    // Gone subscriptions (404/410): nothing else to clean up; the app re-subscribes when turned on again.
    if (status >= 500) throw new Error(`push service ${status}`); // let the runtime retry the alarm
  }
}

/** Story 11: the /coach routes (token-checked), all handled by one CoachQueue object for the owner. */
async function coachRoute(request, env, url, headers) {
  if (!tokenOk(request.headers.get('Authorization'), env.COACH_TOKEN)) return json(401, { error: 'not paired' }, headers);
  const stub = env.COACH_QUEUE.get(env.COACH_QUEUE.idFromName('owner'));
  const forward = async (path, init) => {
    const res = await stub.fetch(`https://do${path}`, init);
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json', ...headers } });
  };
  if (url.pathname === '/coach/ping' && request.method === 'GET') return json(200, { ok: true }, headers);
  if (url.pathname === '/coach/job' && request.method === 'GET') return forward(`/job?id=${encodeURIComponent(url.searchParams.get('id') ?? '')}`, { method: 'GET' });
  if (url.pathname !== '/coach' || request.method !== 'POST') return json(404, { error: 'not found' }, headers);
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY) return json(413, { error: 'too large' }, headers);
  let body;
  try {
    body = checkCoach(await request.json());
  } catch (e) {
    return json(400, { error: e instanceof BadRequest ? e.message : 'bad json' }, headers);
  }
  return forward('/run', { method: 'POST', body: JSON.stringify(body) });
}

/** The owner's coach requests: rate limit, Gemini calls, and the retry queue (alarm). */
export class CoachQueue {
  /** @param {any} state @param {any} env */
  constructor(state, env) {
    this.storage = state.storage;
    this.env = env;
    this.fetchImpl = (...a) => fetch(...a);
  }

  /** @param {Request} request */
  async fetch(request) {
    const now = Date.now();
    const url = new URL(request.url);
    if (url.pathname === '/job') {
      const id = url.searchParams.get('id') ?? '';
      const job = /^[0-9a-f]{24}$/.test(id) ? await this.storage.get(`job:${id}`) : null;
      if (!job) return json(404, { error: 'gone' });
      if (job.status === 'done') {
        await this.storage.delete(`job:${id}`);
        return json(200, { status: 'done', text: job.text, model: job.model });
      }
      if (job.status === 'failed') {
        await this.storage.delete(`job:${id}`);
        return json(200, { status: 'failed' });
      }
      return json(200, { status: 'waiting' });
    }
    const body = await request.json();
    const recent = ((await this.storage.get('stamps')) ?? []).filter((t) => t > now - 3600_000);
    if (recent.length >= COACH_RATE_PER_HOUR) return json(429, { error: 'slow down' });
    await this.storage.put('stamps', [...recent, now]);
    const r = await generate(body.prompt, this.env, this.fetchImpl);
    if (r.ok) return json(200, { text: r.text, model: r.model });
    if (r.code === 'config') return json(502, { error: 'worker not configured' });
    if (!body.queue) return json(r.code === 'rateLimited' ? 429 : 502, { error: r.code });
    const id = newJobId();
    const nextAt = now + nextRetryDelay(0);
    await this.storage.put(`job:${id}`, { prompt: body.prompt, subscription: body.subscription ?? null, attempts: 0, createdAt: now, nextAt, status: 'waiting' });
    await this.schedule(nextAt);
    return json(202, { jobId: id });
  }

  async schedule(at) {
    const cur = await this.storage.getAlarm?.();
    if (!cur || at < cur) await this.storage.setAlarm(at);
  }

  async alarm() {
    const now = Date.now();
    const all = await this.storage.list({ prefix: 'job:' });
    let next = null;
    for (const [key, job] of all) {
      if (now - job.createdAt > JOB_TTL_MS) {
        await this.storage.delete(key);
        continue;
      }
      if (job.status !== 'waiting') continue;
      if (job.nextAt > now) {
        next = next === null ? job.nextAt : Math.min(next, job.nextAt);
        continue;
      }
      const r = await generate(job.prompt, this.env, this.fetchImpl);
      if (r.ok) {
        await this.storage.put(key, { status: 'done', text: r.text, model: r.model, createdAt: job.createdAt });
        if (job.subscription) await this.notify(job.subscription, 'Philip has your plan.', 'Open the app to review it.');
      } else if (r.code === 'config' || now - job.createdAt > GIVE_UP_MS) {
        await this.storage.put(key, { status: 'failed', createdAt: job.createdAt });
        if (job.subscription) await this.notify(job.subscription, 'Philip could not answer.', 'Open the app to ask him in Claude instead.');
      } else {
        const attempts = job.attempts + 1;
        const nextAt = now + nextRetryDelay(attempts);
        await this.storage.put(key, { ...job, attempts, nextAt });
        next = next === null ? nextAt : Math.min(next, nextAt);
      }
    }
    if (next !== null) await this.storage.setAlarm(next);
  }

  async notify(subscription, title, body) {
    try {
      await sendPush(subscription, { type: 'coach', title, body }, { publicKey: this.env.VAPID_PUBLIC_KEY, privateKey: this.env.VAPID_PRIVATE_KEY, subject: this.env.VAPID_SUBJECT });
    } catch {
      /* the app polls on open anyway */
    }
  }
}
