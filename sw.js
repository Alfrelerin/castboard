const CACHE_NAME = 'castboard-v16';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('googleapis.com') || e.request.url.includes('firebaseio.com') || e.request.url.includes('firestore.googleapis.com') || e.request.url.includes('gstatic.com/firebasejs')) return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
