/* ============================================================
   LANZZ PROJECT — Service Worker (Merged)
   Gabungan dari 9 service worker:
   - Lanzz Project / Services / Play Bros / Informatika
   - Lanzz.io / LanzzPlay / Space / Blase / Tools
   ============================================================ */

const SW_VERSION = 'lnz-v4.0.0';

const CACHE_STATIC  = `${SW_VERSION}-static`;
const CACHE_RUNTIME = `${SW_VERSION}-runtime`;
const CACHE_FONTS   = `${SW_VERSION}-fonts`;
const CACHE_HTML    = `${SW_VERSION}-html`;

/* ---------- PRECACHE (gabungan semua app shell) ---------- */
const PRECACHE_ASSETS = [
  // Root & halaman utama
  './',
  './index.html',
  './manifest.json',
  './manifest.webmanifest',

  // Halaman app lain
  './halaman.design.html',
  './lanzz-bros.html',
  './lanzz-informatika.html',
  './lanzz-io.html',
  './lanzz-play.html',
  './lanzz-space.html',
  './lanzz-tools.html',

  // Ikon - Lanzz Project
  './icon-lnz/favicon.ico',
  './icon-lnz/favicon-16x16.png',
  './icon-lnz/favicon-32x32.png',
  './icon-lnz/apple-touch-icon.png',
  './icon-lnz/android-chrome-192x192.png',
  './icon-lnz/android-chrome-512x512.png',
  './icon-lnz/icon-192.png',
  './icon-lnz/icon-512.png',

  // Ikon - Bros
  './icon-bros/android-chrome-192x192.png',
  './icon-bros/android-chrome-512x512.png',

  // Ikon - Informatika
  './icon-it/favicon.ico',
  './icon-it/favicon-16x16.png',
  './icon-it/favicon-32x32.png',
  './icon-it/apple-touch-icon.png',
  './icon-it/android-chrome-192x192.png',
  './icon-it/android-chrome-512x512.png',

  // Ikon - IO
  './icon-io/favicon.ico',
  './icon-io/favicon-16x16.png',
  './icon-io/favicon-32x32.png',
  './icon-io/apple-touch-icon.png',
  './icon-io/android-chrome-192x192.png',
  './icon-io/android-chrome-512x512.png',

  // Ikon - Games (LanzzPlay)
  './icon-games/favicon.ico',
  './icon-games/favicon-16x16.png',
  './icon-games/favicon-32x32.png',
  './icon-games/apple-touch-icon.png',
  './icon-games/android-chrome-192x192.png',
  './icon-games/android-chrome-512x512.png',

  // Ikon - Blase
  './icon-blase/site.webmanifest',
  './icon-blase/favicon.ico',
  './icon-blase/favicon-16x16.png',
  './icon-blase/favicon-32x32.png',
  './icon-blase/apple-touch-icon.png',
  './icon-blase/android-chrome-192x192.png',
  './icon-blase/android-chrome-512x512.png',

  // CDN three.js (dari Lanzz Space)
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'
];

/* ---------- HOST YANG DI-CACHE RUNTIME ---------- */
const CDN_HOSTS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'i.imgur.com',
  'raw.githubusercontent.com'
];

/* Host API yang HARUS skip cache (biar selalu fresh) */
const BYPASS_HOSTS = [
  'api.web3forms.com',
  'api.qrserver.com' // kecuali QR, ini tetap di-cache lihat fetch handler
];

/* ============================================================
   INSTALL
   ============================================================ */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) =>
      Promise.all(
        PRECACHE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Gagal precache:', url, err);
          })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

/* ============================================================
   ACTIVATE
   ============================================================ */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(SW_VERSION))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ============================================================
   FETCH
   ============================================================ */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Skip protokol non-http
  if (!url.protocol.startsWith('http')) return;

  // Skip API yang butuh fresh data
  if (url.hostname === 'api.web3forms.com') return;

  // ---------- 1) NAVIGASI HTML → network-first, fallback cache ----------
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(networkFirstHTML(req));
    return;
  }

  // ---------- 2) Google Fonts → cache-first ----------
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(cacheFirst(req, CACHE_FONTS));
    return;
  }

  // ---------- 3) CDN / Imgur / raw github → stale-while-revalidate ----------
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req, CACHE_RUNTIME));
    return;
  }

  // ---------- 4) QR server (khusus Tools) → SWR ----------
  if (url.hostname === 'api.qrserver.com') {
    event.respondWith(staleWhileRevalidate(req, CACHE_RUNTIME));
    return;
  }

  // ---------- 5) Same-origin asset → cache-first + revalidate background ----------
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstWithRevalidate(req, CACHE_STATIC));
    return;
  }
});

/* ============================================================
   STRATEGY FUNCTIONS
   ============================================================ */

// Network-first buat HTML
function networkFirstHTML(req) {
  return fetch(req)
    .then((res) => {
      if (res && res.status === 200) {
        const copy = res.clone();
        caches.open(CACHE_HTML).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    })
    .catch(() =>
      caches.match(req).then((cached) => {
        if (cached) return cached;
        // Fallback terakhir: coba index.html, kalau nggak ada → offline page
        return caches.match('./index.html').then((r) =>
          r || new Response('Offline — halaman belum tersedia.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          })
        );
      })
    );
}

// Cache-first
function cacheFirst(req, cacheName) {
  return caches.match(req).then((cached) => {
    if (cached) return cached;
    return fetch(req).then((res) => {
      if (res && res.status === 200 && res.type !== 'opaque') {
        const copy = res.clone();
        caches.open(cacheName).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => cached);
  });
}

// Cache-first + update background
function cacheFirstWithRevalidate(req, cacheName) {
  return caches.match(req).then((cached) => {
    const fetchPromise = fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(cacheName).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => cached);
    return cached || fetchPromise;
  });
}

// Stale-while-revalidate
function staleWhileRevalidate(req, cacheName) {
  return caches.match(req).then((cached) => {
    const fetchPromise = fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(cacheName).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => cached);
    return cached || fetchPromise;
  });
}

/* ============================================================
   MESSAGE (skipWaiting & clear cache dari client)
   ============================================================ */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();

  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    );
  }
});