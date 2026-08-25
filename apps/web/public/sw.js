/*
 * A deliberately small service worker: cache the shell, serve it when the network is gone.
 *
 * It never caches a plan — plans live in localStorage and must not be duplicated into a
 * second store the user cannot see. Navigations are network-first so a deploy is picked up
 * immediately; static assets are cache-first because they are content-hashed.
 */
const CACHE = 'wealthplanner-shell-v1';
const SHELL = ['/cs', '/sk', '/cs/plan', '/sk/plan', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((hit) => {
            if (hit) return hit;
            /*
             * Fall back inside the requested locale. Hardcoding '/cs/plan' served the Czech
             * page to an offline Slovak visitor — the same symptom as the storage bug, by a
             * completely separate route.
             */
            const locale = url.pathname.split('/')[1] === 'sk' ? 'sk' : 'cs';
            return caches.match(`/${locale}/plan`);
          }),
        ),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/icon.svg') {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});
