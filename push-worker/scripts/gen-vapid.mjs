// Generates a VAPID key pair for the rest-alert Worker. Run once: `node scripts/gen-vapid.mjs`.
// Public key → GitHub Pages build variable VITE_PUSH_VAPID_KEY and Worker secret VAPID_PUBLIC_KEY.
// Private key → Worker secret VAPID_PRIVATE_KEY only. Never commit it.
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
const { d } = await crypto.subtle.exportKey('jwk', kp.privateKey);
console.log(`VAPID_PUBLIC_KEY=${b64url(pub)}`);
console.log(`VAPID_PRIVATE_KEY=${d}`);
