import { test } from 'node:test';
import assert from 'node:assert/strict';
import { b64url, concat, encryptPayload, fromB64url, sendPush, vapidAuthorization } from '../src/webpush.js';

const enc = new TextEncoder();
const hkdf = async (salt, ikm, info, len) => {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
};

/** Browser side of RFC 8291: decrypt with the subscriber's private key. */
async function decrypt(body, uaKeys, auth) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeys.publicKey));
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaKeys.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, cipher));
  assert.equal(plain.at(-1), 2, 'last-record delimiter');
  return new TextDecoder().decode(plain.slice(0, -1));
}

async function subscriber() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const p256dh = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  return { keys, auth, sub: { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: b64url(p256dh), auth: b64url(auth) } } };
}

async function vapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return { kp, vapid: { publicKey: b64url(pub), privateKey: jwk.d, subject: 'https://example.github.io/philip' } };
}

test('base64url round-trips', () => {
  const bytes = crypto.getRandomValues(new Uint8Array(65));
  assert.deepEqual(fromB64url(b64url(bytes)), bytes);
  assert.ok(!/[+/=]/.test(b64url(bytes)));
});

test('aes128gcm payload decrypts on the subscriber side (RFC 8291)', async () => {
  const { keys, auth, sub } = await subscriber();
  const msg = JSON.stringify({ type: 'rest', title: 'Time’s up.', body: 'Next: Bench press, set 3.' });
  const body = await encryptPayload(enc.encode(msg), sub.keys);
  assert.deepEqual([...body.slice(16, 20)], [0, 0, 16, 0], 'rs = 4096');
  assert.equal(body[20], 65, 'keyid is the 65-byte server public key');
  assert.equal(await decrypt(body, keys, auth), msg);
});

test('refuses malformed subscription keys', async () => {
  await assert.rejects(encryptPayload(enc.encode('x'), { p256dh: b64url(new Uint8Array(10)), auth: b64url(new Uint8Array(16)) }));
});

test('VAPID header: ES256 JWT for the endpoint origin, verifiable with the public key (RFC 8292)', async () => {
  const { kp, vapid } = await vapidKeys();
  const h = await vapidAuthorization('https://web.push.apple.com/abc?x=1', vapid, 1_800_000_000);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
  assert.ok(m, h);
  const [, head, claims, sig, k] = m;
  assert.equal(k, vapid.publicKey);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(fromB64url(head))), { typ: 'JWT', alg: 'ES256' });
  const c = JSON.parse(new TextDecoder().decode(fromB64url(claims)));
  assert.equal(c.aud, 'https://web.push.apple.com');
  assert.equal(c.exp, 1_800_000_000 + 12 * 3600);
  assert.equal(c.sub, vapid.subject);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, fromB64url(sig), enc.encode(`${head}.${claims}`));
  assert.ok(ok, 'signature verifies');
});

test('sendPush posts an encrypted body with the push headers', async () => {
  const { keys, auth, sub } = await subscriber();
  const { vapid } = await vapidKeys();
  let seen;
  const status = await sendPush(sub, { type: 'rest', title: 'Time’s up.', body: '' }, vapid, async (url, init) => {
    seen = { url, init };
    return new Response(null, { status: 201 });
  });
  assert.equal(status, 201);
  assert.equal(seen.url, sub.endpoint);
  assert.equal(seen.init.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(seen.init.headers.TTL, '120');
  assert.match(seen.init.headers.Authorization, /^vapid t=/);
  assert.equal(JSON.parse(await decrypt(seen.init.body, keys, auth)).title, 'Time’s up.');
});
