// Request checks for the rest-alert Worker (Story 6 §8.2). Pure, tested.

export const MAX_AHEAD_MS = 15 * 60 * 1000;
export const MAX_TEXT = 120;
export const RATE_LIMIT_PER_HOUR = 120;

/** Push services we deliver to (Apple, Google, Mozilla, Microsoft). Anything else is refused. */
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

export class BadRequest extends Error {}

/** @param {unknown} s */
export function checkSubscription(s) {
  if (!s || typeof s !== 'object') throw new BadRequest('subscription missing');
  const { endpoint, keys } = /** @type {any} */ (s);
  if (typeof endpoint !== 'string' || endpoint.length > 1000) throw new BadRequest('bad endpoint');
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new BadRequest('bad endpoint');
  }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some((r) => r.test(url.hostname))) throw new BadRequest('unknown push service');
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || keys.p256dh.length > 200 || keys.auth.length > 50) {
    throw new BadRequest('bad keys');
  }
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/**
 * Validates PUT /timer. fireAt must be in the future and within 15 minutes; text is capped.
 * @param {unknown} body
 * @param {number} now
 */
export function checkTimer(body, now) {
  if (!body || typeof body !== 'object') throw new BadRequest('body missing');
  const b = /** @type {any} */ (body);
  const subscription = checkSubscription(b.subscription);
  if (typeof b.fireAt !== 'number' || !Number.isFinite(b.fireAt)) throw new BadRequest('fireAt missing');
  if (b.fireAt < now - 5000 || b.fireAt > now + MAX_AHEAD_MS) throw new BadRequest('fireAt must be within 15 minutes');
  const text = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_TEXT) : fallback);
  return { subscription, fireAt: Math.max(now, b.fireAt), title: text(b.title, 'Time’s up.'), body: text(b.body, '') };
}

/** SHA-256 of the endpoint, hex: the Durable Object name for one device. */
export async function deviceName(endpoint) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** CORS headers for the one allowed origin (the GitHub Pages site). */
export function cors(origin, allowed) {
  const ok = origin && allowed && origin === allowed;
  return {
    ...(ok ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Methods': 'PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Sliding one-hour window rate limit stored with the device.
 * @param {number[]} stamps previous request times (ms)
 * @param {number} now
 */
export function rateLimit(stamps, now) {
  const recent = (stamps ?? []).filter((t) => t > now - 3600_000);
  if (recent.length >= RATE_LIMIT_PER_HOUR) return { ok: false, stamps: recent };
  return { ok: true, stamps: [...recent, now] };
}
