// Service worker: keeps a copy of the whole site, so it works without a network
// after the first visit. The publish step fills in PRECACHE with a version (a hash
// of every file) and the file list; a new publish changes this file, which makes
// browsers install the new copy and drop the old one. Without a list (the
// unpublished web/ folder, previews) it caches nothing and removes old copies.

const PRECACHE = {"version":"20fac71a8c3a9769","files":["data/bank.json","fonts/OFL.txt","fonts/atkinson-hyperlegible-next-400.woff2","fonts/atkinson-hyperlegible-next-700.woff2","index.html","js/content/bank.js","js/main.js","js/quiz/engine.js","js/quiz/policies.js","js/quiz/progress.js","js/quiz/rng.js","js/quiz/storage.js","js/render/format.js","js/render/richtext.js","js/render/vnode.js","js/ui/app.js","js/ui/dial.js","js/ui/glossary.js","js/visuals/ac-circuit.js","js/visuals/block-diagram.js","js/visuals/dc-circuit.js","js/visuals/rectifier.js","js/visuals/registry.js","js/visuals/rlc-circuit.js","js/visuals/schema.js","js/visuals/series-regulator.js","js/visuals/svg.js","js/visuals/transformer.js","js/visuals/transistor-stage.js","js/visuals/waveform.js","styles.css"]};

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
