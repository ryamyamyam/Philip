import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { CoachQueue } from '../src/index.js';
import { checkCoach, generate, models, nextRetryDelay, tokenOk, COACH_RATE_PER_HOUR } from '../src/coach.js';
import { BadRequest } from '../src/timer.js';

const ORIGIN = 'https://ryan.github.io';
const TOKEN = 'a-very-long-pairing-token-123456';

const gemini = (text) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

test('token: constant-time match, missing or short secret refuses all', () => {
  assert.ok(tokenOk(`Bearer ${TOKEN}`, TOKEN));
  assert.equal(tokenOk(`Bearer ${TOKEN}x`, TOKEN), false);
  assert.equal(tokenOk(null, TOKEN), false);
  assert.equal(tokenOk('Bearer short', 'short'), false);
  assert.equal(tokenOk(`Bearer ${TOKEN}`, undefined), false);
});

test('checkCoach: prompt required and capped; subscription checked', () => {
  assert.equal(checkCoach({ prompt: 'hi', queue: true }).queue, true);
  assert.throws(() => checkCoach({ prompt: '' }), BadRequest);
  assert.throws(() => checkCoach({ prompt: 'x'.repeat(40_001) }), BadRequest);
  assert.throws(() => checkCoach({ prompt: 'x', subscription: { endpoint: 'https://evil.example/x', keys: { p256dh: 'a', auth: 'b' } } }), BadRequest);
});

test('generate: falls through rate-limited models, reports rate limit when all are', async () => {
  const env = { GEMINI_API_KEY: 'k', GEMINI_MODELS: 'm-one,m-two' };
  assert.deepEqual(models(env), ['m-one', 'm-two']);
  const calls = [];
  let r = await generate('p', env, async (url, init) => {
    calls.push(url);
    assert.equal(init.headers['x-goog-api-key'], 'k');
    return url.includes('m-one') ? new Response('{}', { status: 429 }) : gemini('{"message":"ok"}');
  });
  assert.deepEqual(r, { ok: true, text: '{"message":"ok"}', model: 'm-two' });
  assert.equal(calls.length, 2);
  r = await generate('p', env, async () => new Response('{}', { status: 429 }));
  assert.deepEqual(r, { ok: false, code: 'rateLimited' });
  r = await generate('p', { GEMINI_MODELS: 'x1' }, async () => gemini('x'));
  assert.equal(r.code, 'config');
  assert.equal(nextRetryDelay(0), 5 * 60_000);
  assert.equal(nextRetryDelay(99), 60 * 60_000);
});

function fakeEnv(fetchImpl) {
  const data = new Map();
  const storage = {
    alarm: null,
    get: async (k) => data.get(k),
    put: async (k, v) => void data.set(k, structuredClone(v)),
    delete: async (k) => void data.delete(k),
    list: async ({ prefix }) => new Map([...data].filter(([k]) => k.startsWith(prefix))),
    getAlarm: async () => storage.alarm,
    setAlarm: async (t) => void (storage.alarm = t),
  };
  const env = { ALLOWED_ORIGIN: ORIGIN, COACH_TOKEN: TOKEN, GEMINI_API_KEY: 'k', GEMINI_MODELS: 'm1' };
  const q = new CoachQueue({ storage }, env);
  q.fetchImpl = fetchImpl;
  env.COACH_QUEUE = { idFromName: (n) => n, get: () => ({ fetch: (url, init) => q.fetch(new Request(url, init)) }) };
  return { env, q, storage, data };
}

const post = (body, token = TOKEN) =>
  new Request('https://w/coach', { method: 'POST', headers: { Origin: ORIGIN, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('POST /coach: token required, answers directly when a model is free', async () => {
  const { env } = fakeEnv(async () => gemini('{"a":1}'));
  assert.equal((await worker.fetch(post({ prompt: 'x' }, 'wrong-token-wrong-token'), env)).status, 401);
  const res = await worker.fetch(post({ prompt: 'x' }), env);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { text: '{"a":1}', model: 'm1' });
  const ping = await worker.fetch(new Request('https://w/coach/ping', { headers: { Origin: ORIGIN, Authorization: `Bearer ${TOKEN}` } }), env);
  assert.equal(ping.status, 200);
});

test('rate limited + queue: 202, retried by alarm, handed over once, then gone', async () => {
  let free = false;
  const { env, q, storage } = fakeEnv(async () => (free ? gemini('{"plan":true}') : new Response('{}', { status: 429 })));
  const noQueue = await worker.fetch(post({ prompt: 'x' }), env);
  assert.equal(noQueue.status, 429);
  const res = await worker.fetch(post({ prompt: 'x', queue: true }), env);
  assert.equal(res.status, 202);
  const { jobId } = await res.json();
  assert.ok(storage.alarm > Date.now());
  const job = (id) => worker.fetch(new Request(`https://w/coach/job?id=${id}`, { headers: { Origin: ORIGIN, Authorization: `Bearer ${TOKEN}` } }), env);
  assert.equal((await (await job(jobId)).json()).status, 'waiting');
  // Still limited at the first retry: rescheduled.
  const first = await storage.get(`job:${jobId}`);
  await storage.put(`job:${jobId}`, { ...first, nextAt: Date.now() - 1 });
  await q.alarm();
  assert.equal((await storage.get(`job:${jobId}`)).attempts, 1);
  free = true;
  await storage.put(`job:${jobId}`, { ...(await storage.get(`job:${jobId}`)), nextAt: Date.now() - 1 });
  await q.alarm();
  const done = await (await job(jobId)).json();
  assert.deepEqual(done, { status: 'done', text: '{"plan":true}', model: 'm1' });
  assert.equal((await job(jobId)).status, 404, 'deleted once handed over');
});

test('coach rate limit per hour', async () => {
  const { env, storage } = fakeEnv(async () => gemini('{}'));
  await storage.put('stamps', Array.from({ length: COACH_RATE_PER_HOUR }, () => Date.now()));
  assert.equal((await worker.fetch(post({ prompt: 'x' }), env)).status, 429);
});
