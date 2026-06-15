const CACHE_NAME = 'thinc-pwa-v1';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './analyzer.js',
  './thinc-logo.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Do not cache API requests
  if (e.request.url.includes('/api/') || e.request.url.includes('youtube.com')) {
    return;
  }
  
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request).catch(() => caches.match('./index.html'));
    })
  );
});
