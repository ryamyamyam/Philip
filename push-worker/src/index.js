// Philip rest-alert Worker (Story 6 §8.2, T-022).
// PUT /timer {subscription, fireAt, title, body} → one Durable Object per device sets an alarm;
// at fireAt it sends one Web Push. DELETE /timer {endpoint} cancels. Stores only the push
// subscription and the pending timer: no account, body, food or lift data.
import { BadRequest, checkSubscription, checkTimer, cors, deviceName, rateLimit } from './timer.js';
import { sendPush } from './webpush.js';

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
