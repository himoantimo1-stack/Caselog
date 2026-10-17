/* Offline shell for the phone edition. Only the app's own files are cached here; cases live in IndexedDB.
   Cache first, refresh in the background: the app opens instantly with no signal, and an update you upload
   arrives on the next launch. A hospital Wi-Fi sign-in page can never replace the app's files, because
   redirected or cross-site responses are not stored. */
const VERSION = 'caselog-phone-v2.0.0';
const SHELL = [
  './index.html',
  './styles.css',
  './store.js',
  './options.js',
  './charts.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('caselog') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const key = req.mode === 'navigate' ? './index.html' : req;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(key, { ignoreSearch: true });
    const network = fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic' && !res.redirected) cache.put(key, res.clone());
        return res;
      })
      .catch(() => null);
    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    const res = await network;
    return res || new Response('CaseLog is offline and has not been opened online yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  })());
});
