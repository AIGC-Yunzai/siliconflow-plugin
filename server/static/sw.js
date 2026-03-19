const CACHE_NAME = 'sfchat-v16';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/github.min.css',
  '/js/marked.min.js',
  '/js/highlight.min.js',
  '/js/mathjax/tex-mml-chtml.js',
  '/fonts/LXGWWenKai-Regular-9375313a.ttf',
  '/fonts/HYWH-65W.ttf',
  '/fonts/SpaceMono-Regular.ttf',
  '/images/bot-avatar.png',
  '/images/user-avatar.png',
  '/images/icon-192x192.png',
  '/images/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
}); 