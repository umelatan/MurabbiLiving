// Bump this on every deploy so installed devices pick up the new app shell.
const CACHE_NAME = 'murabbi-living-v2';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './css/fonts.css',
  './js/main.js',
  './js/router.js',
  './js/nav.js',
  './js/auth.js',
  './js/firebase-config.js',
  './js/firebase-keys.js',
  './js/loginScreen.js',
  './js/lib/store.js',
  './js/lib/discounts.js',
  './js/lib/toast.js',
  './js/lib/modal.js',
  './js/lib/eventState.js',
  './js/lib/utils.js',
  './js/views/events.js',
  './js/views/cashier.js',
  './js/views/salesLog.js',
  './js/views/priceList.js',
  './js/views/dashboard.js',
  './data/seed-price-list.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-192.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/fonts/manrope-500.woff2',
  './assets/fonts/manrope-600.woff2',
  './assets/fonts/manrope-700.woff2',
  './assets/fonts/manrope-800.woff2',
  './assets/fonts/work-sans-400.woff2',
  './assets/fonts/work-sans-500.woff2',
  './assets/fonts/work-sans-600.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Firebase Auth/Firestore traffic goes straight to the network — Firestore has its
  // own offline cache (IndexedDB) and we don't want to interfere with it.
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('google.com')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
