// Offline support. App shell: precached, served stale-while-revalidate. Library: hashed files cache-first (they never
// change), the small index/manifest files network-first so newly published books show up.
const VERSION = 'v3';
const SHELL = `shell-${VERSION}`;
const LIBRARY = 'library';
const SHELL_FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/player.js', 'js/store.js', 'js/vault.js', 'js/icons.js', 'js/eq.js',
  'fonts/fonts.css', 'fonts/Barlow-400.woff2', 'fonts/Barlow-500.woff2', 'fonts/Barlow-600.woff2',
  'fonts/BarlowCondensed-500.woff2', 'fonts/BarlowCondensed-600.woff2', 'fonts/BarlowCondensed-700.woff2',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

const isMutable = (path) => /\/library\/(vault\.json|index\.enc|[^/]+\/book\.enc)$/.test(path);

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.includes('/library/')) {
    e.respondWith(isMutable(url.pathname) ? networkFirst(e.request) : cacheFirst(e.request));
    return;
  }
  e.respondWith(staleWhileRevalidate(e));
});

// App shell: answer from cache instantly (works offline), refresh the copy for the next launch.
async function staleWhileRevalidate(e) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(e.request, { ignoreSearch: true });
  const refresh = fetch(e.request).then((res) => {
    if (res.ok) cache.put(e.request, res.clone());
    return res;
  });
  if (hit) {
    e.waitUntil(refresh.catch(() => {}));
    return hit;
  }
  return refresh;
}

async function cacheFirst(req) {
  const cache = await caches.open(LIBRARY);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(LIBRARY);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res.ok) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

// The page asks which library files are cached / to drop a book's audio.
self.addEventListener('message', async (e) => {
  const { type, prefix } = e.data || {};
  const cache = await caches.open(LIBRARY);
  if (type === 'evict') {
    for (const req of await cache.keys()) if (new URL(req.url).pathname.includes(`/library/${prefix}/`)) await cache.delete(req);
    e.source?.postMessage({ type: 'evicted', prefix });
  }
});
