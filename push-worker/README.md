# Philip rest alerts: push Worker (Story 6 §8.2, T-022)

A tiny Cloudflare Worker that sends the "Time's up." notification when a rest timer ends, even with the iPhone locked. An installed iPhone web app can't schedule its own notification; a server has to send the push.

- One Durable Object per device (named by a hash of its push endpoint). It holds at most one pending timer and sets an **alarm** at the rest end. The alarm sends one Web Push.
- It stores only the push subscription and that timer. There is no account, and no body, food or lift data.
- There are no runtime dependencies. VAPID and the payload encryption use WebCrypto (`src/webpush.js`).
- It runs on Cloudflare's free plan: Workers plus SQLite-backed Durable Objects.
  - A rest timer costs about 2–3 requests (PUT, the alarm, sometimes a DELETE), so a busy workout day is a few hundred requests.
  - Free-plan quotas when this was written (verify on the Cloudflare pricing page before you rely on them): 100,000 Worker requests a day, plus a separate daily Durable Objects allowance.

## API (called by the app)

| Method | Path | Body | Effect |
|---|---|---|---|
| `PUT` | `/timer` | `{ subscription, fireAt, title, body }` | Replaces this device's pending timer. `fireAt` must be within 15 minutes. |
| `DELETE` | `/timer` | `{ endpoint }` | Cancels it. |

**Guards:**
- Only `ALLOWED_ORIGIN` may call the Worker (CORS plus an Origin check).
- Only Apple, Google, Mozilla and Microsoft push endpoints are accepted.
- Text is capped at 120 characters.
- Each device gets 120 requests an hour.
- Requests over 4 KB are refused.

## One-time setup (owner)

1. **Create a free account** at <https://dash.cloudflare.com/sign-up>. The Workers free plan is enough; no card is needed.
2. **Log in from this folder:**
   ```sh
   cd push-worker
   npx wrangler@4 login
   ```
3. **Make the VAPID keys** (once):
   ```sh
   npm run keys
   ```
   It prints `VAPID_PUBLIC_KEY=…` and `VAPID_PRIVATE_KEY=…`. Keep the private key secret. Don't commit it or paste it into chat.
4. **Edit `wrangler.toml`.** Set `ALLOWED_ORIGIN` to your GitHub Pages origin, for example `https://yourname.github.io` (no path), and `VAPID_SUBJECT` to your Pages URL.
5. **Deploy and set the secrets:**
   ```sh
   npx wrangler@4 deploy
   npx wrangler@4 secret put VAPID_PUBLIC_KEY    # paste the public key
   npx wrangler@4 secret put VAPID_PRIVATE_KEY   # paste the private key
   ```
   Wrangler prints the Worker URL, for example `https://philip-push.<you>.workers.dev`.
6. **Tell the app where the Worker is.** These values are public. In the GitHub repo, go to Settings › Secrets and variables › Actions › **Variables** and add:
   - `VITE_PUSH_URL` = the Worker URL;
   - `VITE_PUSH_VAPID_KEY` = the public key.

   The Pages build passes them to Vite (wired in T-021). Until they're set, Settings › Training › Rest alerts stays hidden.

## Rotating the keys

Run `npm run keys` again. Put the new pair as Worker secrets, update `VITE_PUSH_VAPID_KEY`, and redeploy Pages. Old subscriptions stop working, so turn Rest alerts off and on again in the app.

## Tests

```sh
cd push-worker && npm test
```

The tests use Node's built-in test runner and nothing else:
- the encrypted payload decrypts on the subscriber side (RFC 8291);
- the VAPID JWT verifies (RFC 8292);
- PUT, replace and DELETE work on a fake Durable Object;
- the alarm sends exactly one push;
- the guards hold.

`npx wrangler@4 deploy --dry-run` checks the config and bundle.
