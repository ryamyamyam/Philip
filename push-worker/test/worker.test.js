import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { RestTimer } from '../src/index.js';
import { BadRequest, checkTimer, cors, deviceName, MAX_AHEAD_MS, rateLimit, RATE_LIMIT_PER_HOUR } from '../src/timer.js';

const ORIGIN = 'https://ryan.github.io';
const sub = { endpoint: 'https://web.push.apple.com/QWER', keys: { p256dh: 'BP'.padEnd(87, 'A'), auth: 'A'.repeat(22) } };

test('checkTimer: within 15 minutes, known push services only, text capped', () => {
  const now = 1_000_000;
  const t = checkTimer({ subscription: sub, fireAt: now + 90_000, title: 'Time’s up.', body: 'x'.repeat(500) }, now);
  assert.equal(t.fireAt, now + 90_000);
  assert.equal(t.body.length, 120);
  assert.throws(() => checkTimer({ subscription: sub, fireAt: now + MAX_AHEAD_MS + 1 }, now), BadRequest);
  assert.throws(() => checkTimer({ subscription: sub, fireAt: now - 60_000 }, now), BadRequest);
  assert.throws(() => checkTimer({ subscription: { ...sub, endpoint: 'https://evil.example.com/x' }, fireAt: now + 1000 }, now), BadRequest);
  assert.throws(() => checkTimer({ subscription: { ...sub, endpoint: 'http://web.push.apple.com/x' }, fireAt: now + 1000 }, now), BadRequest);
  assert.equal(checkTimer({ subscription: sub, fireAt: now + 1000 }, now).title, 'Time’s up.');
});

test('rate limit: a sliding hour', () => {
  let stamps = [];
  for (let i = 0; i < RATE_LIMIT_PER_HOUR; i++) {
    const r = rateLimit(stamps, 1000 + i);
    assert.ok(r.ok);
    stamps = r.stamps;
  }
  assert.equal(rateLimit(stamps, 2000).ok, false);
  assert.ok(rateLimit(stamps, 1000 + 3600_001).ok);
});

test('CORS only for the Pages origin; device name is a stable hash', async () => {
  assert.equal(cors(ORIGIN, ORIGIN)['Access-Control-Allow-Origin'], ORIGIN);
  assert.equal(cors('https://other.example', ORIGIN)['Access-Control-Allow-Origin'], undefined);
  assert.equal(await deviceName(sub.endpoint), await deviceName(sub.endpoint));
  assert.match(await deviceName(sub.endpoint), /^[0-9a-f]{64}$/);
});

/** In-memory stand-ins for Durable Object storage and the namespace binding. */
function fakeEnv() {
  const objects = new Map();
  const env = {
    ALLOWED_ORIGIN: ORIGIN,
    VAPID_PUBLIC_KEY: 'x',
    VAPID_PRIVATE_KEY: 'y',
    VAPID_SUBJECT: 'https://ryan.github.io/philip',
    REST_TIMER: {
      idFromName: (n) => n,
      get: (id) => {
        if (!objects.has(id)) {
          const data = new Map();
          const storage = {
            alarm: null,
            get: async (k) => data.get(k),
            put: async (k, v) => void data.set(k, structuredClone(v)),
            delete: async (k) => void data.delete(k),
            setAlarm: async (t) => void (storage.alarm = t),
            deleteAlarm: async () => void (storage.alarm = null),
          };
          const obj = new RestTimer({ storage }, env);
          objects.set(id, { obj, storage, data });
        }
        const o = objects.get(id);
        return { fetch: (url, init) => o.obj.fetch(new Request(url, init)) };
      },
    },
  };
  return { env, objects };
}

const req = (method, body, origin = ORIGIN) =>
  new Request('https://push.example.workers.dev/timer', { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('PUT sets one alarm per device; a new PUT replaces it; DELETE cancels', async () => {
  const { env, objects } = fakeEnv();
  const fireAt = Date.now() + 90_000;
  let res = await worker.fetch(req('PUT', { subscription: sub, fireAt, title: 'Time’s up.', body: 'Next: Bench, set 3.' }), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const [o] = [...objects.values()];
  assert.equal(o.storage.alarm, fireAt);
  res = await worker.fetch(req('PUT', { subscription: sub, fireAt: fireAt + 30_000 }), env);
  assert.equal(objects.size, 1, 'same device, same object');
  assert.equal(o.storage.alarm, fireAt + 30_000);
  res = await worker.fetch(req('DELETE', { endpoint: sub.endpoint }), env);
  assert.equal(res.status, 200);
  assert.equal(o.storage.alarm, null);
  assert.equal(o.data.get('timer'), undefined);
});

test('refuses other origins, bad bodies and unknown routes', async () => {
  const { env } = fakeEnv();
  assert.equal((await worker.fetch(req('PUT', { subscription: sub, fireAt: Date.now() + 1000 }, 'https://evil.example'), env)).status, 403);
  assert.equal((await worker.fetch(req('PUT', { subscription: sub, fireAt: Date.now() + 3600_000 }), env)).status, 400);
  assert.equal((await worker.fetch(new Request('https://x/other', { method: 'PUT', headers: { Origin: ORIGIN }, body: '{}' }), env)).status, 404);
  const pre = await worker.fetch(new Request('https://x/timer', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env);
  assert.equal(pre.status, 204);
});

test('the alarm sends one push and clears the timer', async () => {
  const sent = [];
  const storage = new Map();
  const st = {
    get: async (k) => storage.get(k),
    put: async (k, v) => void storage.set(k, v),
    delete: async (k) => void storage.delete(k),
    setAlarm: async () => {},
    deleteAlarm: async () => {},
  };
  // Real VAPID keys so the push request can be signed.
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const { b64url } = await import('../src/webpush.js');
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const realSub = {
    endpoint: 'https://web.push.apple.com/QWER',
    keys: { p256dh: b64url(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) },
  };
  const env = { VAPID_PUBLIC_KEY: b64url(pub), VAPID_PRIVATE_KEY: jwk.d, VAPID_SUBJECT: 'https://ryan.github.io/philip' };
  const t = new RestTimer({ storage: st }, env);
  storage.set('timer', { subscription: realSub, fireAt: Date.now(), title: 'Time’s up.', body: 'Next: Bench, set 3.' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url, init });
    return new Response(null, { status: 201 });
  };
  try {
    await t.alarm();
    await t.alarm(); // nothing pending → no second push
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, realSub.endpoint);
  assert.equal(storage.get('timer'), undefined);
});
