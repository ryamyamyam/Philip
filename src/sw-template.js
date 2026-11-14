/* Philip service worker — generated at build time from src/sw-template.js. */
const PRECACHE = __PRECACHE__;
const VERSION = __VERSION__;
const CACHE = `philip-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('philip-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only same-origin requests. Gemini and other APIs go straight to the network.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // App shell: network first so updates arrive, cached shell when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./').then((r) => r || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

/* Rest alerts (Story 6 §8.2): "Time's up." pushed by the rest-alert Worker at the end of a rest. */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  // Story 11: "Philip has your plan." when a queued goal plan is ready (opens Home, which shows it).
  if (data.type === 'coach') {
    event.waitUntil(
      self.registration.showNotification(data.title || 'Philip has your plan.', {
        body: data.body || '',
        tag: 'coach',
        icon: './icon-192.png',
        badge: './icon-192.png',
        data: { url: './#/home' },
      }),
    );
    return;
  }
  if (data.type !== 'rest') return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // A visible Philip window shows its own banner; no system notification on top of it.
      if (wins.some((w) => w.visibilityState === 'visible')) return undefined;
      return self.registration.showNotification(data.title || 'Time’s up.', {
        body: data.body || '',
        tag: 'rest',
        renotify: true,
        icon: './icon-192.png',
        badge: './icon-192.png',
        data: { url: './#/workout' },
      });
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './#/workout', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins[0];
      if (win) return win.focus().then((w) => (w && 'navigate' in w ? w.navigate(url) : undefined));
      return self.clients.openWindow(url);
    }),
  );
});
