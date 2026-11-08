import { afterEach, describe, expect, it, vi } from 'vitest';
import { cancelRestAlert, pushConfig, scheduleRestAlert } from './restPush';

const sub = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'BP', auth: 'AA' } };
const cfg = { url: 'https://philip-push.example.workers.dev', vapidKey: 'BKEY' };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('rest alerts client (Story 6 §8.2)', () => {
  it('is off unless both build variables are set; trims a trailing slash', () => {
    vi.stubEnv('VITE_PUSH_URL', '');
    vi.stubEnv('VITE_PUSH_VAPID_KEY', '');
    expect(pushConfig()).toBeNull();
    vi.stubEnv('VITE_PUSH_URL', 'https://w.example.dev/');
    vi.stubEnv('VITE_PUSH_VAPID_KEY', 'BKEY');
    expect(pushConfig()).toEqual({ url: 'https://w.example.dev', vapidKey: 'BKEY' });
  });

  it('PUT sends only the subscription, the end time and the text; DELETE sends the endpoint', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 200 });
    });
    expect(await scheduleRestAlert(cfg, sub, 123, 'Time’s up.', 'Next: Bench press, set 3.')).toBe(true);
    expect(await cancelRestAlert(cfg, sub)).toBe(true);
    expect(calls[0]?.url).toBe('https://philip-push.example.workers.dev/timer');
    expect(calls[0]?.init.method).toBe('PUT');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ subscription: sub, fireAt: 123, title: 'Time’s up.', body: 'Next: Bench press, set 3.' });
    expect(calls[1]?.init.method).toBe('DELETE');
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({ endpoint: sub.endpoint });
  });

  it('offline or refused → false, never throws', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    expect(await scheduleRestAlert(cfg, sub, 1, 'x', '')).toBe(false);
    vi.stubGlobal('fetch', async () => new Response('', { status: 429 }));
    expect(await scheduleRestAlert(cfg, sub, 1, 'x', '')).toBe(false);
  });
});
