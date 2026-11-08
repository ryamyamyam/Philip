// Web Push for Philip's rest alerts (Story 6 §8.2, T-022): VAPID (RFC 8292) + aes128gcm payload
// encryption (RFC 8291), using only WebCrypto, so the Worker has no dependencies.

const enc = new TextEncoder();

/** @param {Uint8Array} bytes */
export function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} s */
export function fromB64url(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** @param {...Uint8Array} parts */
export function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

/** HKDF-SHA-256 (extract + expand) to `length` bytes. */
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/**
 * Encrypts a payload for one subscription (RFC 8291, single record).
 * @param {Uint8Array} payload
 * @param {{ p256dh: string; auth: string }} keys subscription keys (base64url)
 * @param {{ salt?: Uint8Array; serverKeys?: CryptoKeyPair }} [opts] fixed salt/keys for tests only
 */
export async function encryptPayload(payload, keys, opts = {}) {
  const uaPublic = fromB64url(keys.p256dh);
  const authSecret = fromB64url(keys.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('bad subscription keys');
  const server = opts.serverKeys ?? (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', server.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, server.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = concat(payload, new Uint8Array([2])); // last-record delimiter, no padding
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, plain));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/**
 * Imports the VAPID private key from base64url `d` plus the 65-byte public key.
 * @param {string} publicKeyB64 uncompressed P-256 point (base64url)
 * @param {string} privateKeyB64 32-byte scalar `d` (base64url)
 */
export async function importVapidKey(publicKeyB64, privateKeyB64) {
  const pub = fromB64url(publicKeyB64);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('bad VAPID public key');
  const jwk = { kty: 'EC', crv: 'P-256', x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), d: privateKeyB64, ext: false };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/**
 * The VAPID Authorization header for a push endpoint (RFC 8292): an ES256 JWT for the endpoint's origin.
 * @param {string} endpoint
 * @param {{ publicKey: string; privateKey: string; subject: string }} vapid
 * @param {number} nowSec
 */
export async function vapidAuthorization(endpoint, vapid, nowSec) {
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: vapid.subject })));
  const key = await importVapidKey(vapid.publicKey, vapid.privateKey);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${vapid.publicKey}`;
}

/**
 * Sends one push. Returns the push service's status (201 = accepted; 404/410 = subscription gone).
 * @param {{ endpoint: string; keys: { p256dh: string; auth: string } }} subscription
 * @param {object} message JSON payload for the service worker
 * @param {{ publicKey: string; privateKey: string; subject: string }} vapid
 * @param {typeof fetch} [fetcher]
 */
export async function sendPush(subscription, message, vapid, fetcher = fetch) {
  const body = await encryptPayload(enc.encode(JSON.stringify(message)), subscription.keys);
  const res = await fetcher(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, vapid, Math.floor(Date.now() / 1000)),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '120',
      Urgency: 'high',
      Topic: 'rest',
    },
    body,
  });
  return res.status;
}
