// Service worker: keeps a copy of the whole site, so it works without a network
// after the first visit. The publish step fills in PRECACHE with a version (a hash
// of every file) and the file list; a new publish changes this file, which makes
// browsers install the new copy and drop the old one. Without a list (the
// unpublished web/ folder, previews) it caches nothing and removes old copies.

const PRECACHE = null; // filled in by `python3 -m tools publish`

const PREFIX = 'radioquiz-';
const CACHE = PRECACHE ? `${PREFIX}${PRECACHE.version}` : null;
const scope = new URL(self.registration.scope);
const FILES = PRECACHE ? new Set(PRECACHE.files.map((f) => new URL(f, scope).pathname)) : new Set();
const INDEX = new URL('index.html', scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    if (CACHE) {
      const cache = await caches.open(CACHE);
      // bypass the HTTP cache so a new version never stores stale files
      await cache.addAll(PRECACHE.files.map((f) => new Request(new URL(f, scope), { cache: 'reload' })));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!CACHE || req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== scope.origin) return;
  let path = url.pathname;
  if (req.mode === 'navigate' && (path === scope.pathname || path === INDEX)) path = INDEX;
  if (!FILES.has(path)) return; // not part of the site copy: normal network request
  event.respondWith((async () => {
    const hit = await caches.match(new URL(path, scope).href, { cacheName: CACHE });
    return hit || fetch(req);
  })());
});
