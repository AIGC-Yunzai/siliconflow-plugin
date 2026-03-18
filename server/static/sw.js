const CACHE_NAME = 'sfchat-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/public/css/github.min.css',
  '/public/js/marked.min.js',
  '/public/js/highlight.min.js',
  '/public/js/mathjax/tex-mml-chtml.js',
  '/public/fonts/LXGWWenKai-Regular-9375313a.ttf',
  '/public/fonts/HYWH-65W.ttf',
  '/public/fonts/SpaceMono-Regular.ttf',
  '/public/images/bot-avatar.png',
  '/public/images/user-avatar.png',
  '/public/images/icon-192x192.png',
  '/public/images/icon-512x512.png'
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