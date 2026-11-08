/**
 * Rest alerts (Story 6 §8.2, T-021): the app side of the push Worker in `push-worker/`.
 * An installed iPhone web app can't schedule its own notification, so when a rest starts the app
 * asks our free Worker to send a push at the rest end. Fire-and-forget, 3 s timeout; offline or any
 * error just means no push (the in-app banner still works). Sends only the push subscription, the
 * end time and the "next set" text — no body, food or lift data.
 */

export interface PushConfig {
  url: string;
  vapidKey: string;
}

/** Worker URL and public VAPID key from the build (GitHub Actions variables). Null = feature hidden. */
export function pushConfig(): PushConfig | null {
  const url = (import.meta.env.VITE_PUSH_URL as string | undefined)?.trim();
  const vapidKey = (import.meta.env.VITE_PUSH_VAPID_KEY as string | undefined)?.trim();
  return url && vapidKey ? { url: url.replace(/\/+$/, ''), vapidKey } : null;
}

export interface StoredSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const pushSupported = (): boolean =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type SubscribeResult = { ok: true; sub: StoredSubscription } | { ok: false; reason: 'unsupported' | 'denied' | 'error' };

/** Asks for notification permission (must run from a tap) and subscribes this device. */
export async function subscribeRestAlerts(cfg: PushConfig): Promise<SubscribeResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: 'denied' };
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(cfg.vapidKey) }));
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return { ok: false, reason: 'error' };
    return { ok: true, sub: { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } } };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function unsubscribeRestAlerts(): Promise<void> {
  try {
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.ready;
    await (await reg.pushManager.getSubscription())?.unsubscribe();
  } catch {
    /* best effort */
  }
}

async function call(cfg: PushConfig, method: 'PUT' | 'DELETE', body: unknown): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 3000);
  try {
    const res = await fetch(`${cfg.url}/timer`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Replaces this device's pending rest alert. Resolves false when offline or the Worker refused. */
export const scheduleRestAlert = (cfg: PushConfig, sub: StoredSubscription, fireAt: number, title: string, body: string) =>
  call(cfg, 'PUT', { subscription: sub, fireAt, title, body });

export const cancelRestAlert = (cfg: PushConfig, sub: StoredSubscription) => call(cfg, 'DELETE', { endpoint: sub.endpoint });

/** A short beep made with Web Audio (no audio file). Muted by the iPhone's silent switch. */
export function beep(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const tone = (at: number, freq: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.14);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.16);
    };
    tone(0, 880);
    tone(0.18, 1320);
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* sound is a nicety */
  }
}
