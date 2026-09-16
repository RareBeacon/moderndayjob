/*
 * Jobiest service worker: installable PWA shell + offline fallback.
 * Deliberately conservative:
 *   - navigations are network-first (the product is server-rendered and
 *     always fresh); only when the network fails do we serve the offline page.
 *   - static assets (/_next/static, icons, fonts) are cache-first, they are
 *     content-hashed and safe to cache long-term.
 *   - API calls are NEVER cached or intercepted beyond pass-through.
 */
const VERSION = 'jobiest-v1';
const OFFLINE_URL = '/offline';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(req).then((hit) => hit || caches.match(OFFLINE_URL)),
      ),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
            return res;
          }),
      ),
    );
  }
});
