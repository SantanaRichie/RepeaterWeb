const CACHE_NAME = 'repeater-web-v11';
const ASSETS = [
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './repeaterlogo2.png',
  'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request).catch(() => {
        // Fallback for navigation (e.g., reloading the root page offline)
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});