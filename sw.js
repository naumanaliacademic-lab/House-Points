/* House Points — offline support.
 * Network first (so updates arrive straight away), falling back to the cached copy when offline. */
const CACHE = 'house-points-v1';
const FILES = [
  './', 'index.html', 'css/style.css', 'js/store.js', 'js/importer.js', 'js/app.js',
  'js/vendor/pdf.min.js', 'js/vendor/pdf.worker.min.js', 'icon.svg', 'manifest.webmanifest',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
