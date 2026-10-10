// Service worker : l'app fonctionne hors connexion une fois ouverte.
// - coquille de l'app pré-cachée ;
// - fichiers de thèmes mis en cache à la demande (quelques Ko chacun) ;
// - Wikipédia jamais mis en cache (pour ne pas consommer de stockage).
const VERSION = 'v2';
const SHELL = `shell-${VERSION}`;
const DATA = 'data';
const FONTS = 'fonts';

const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'manifest.webmanifest',
  'data/themes.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Répond depuis le cache tout de suite, et met à jour en arrière-plan.
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request)
    .then((res) => { if (res.ok) cache.put(request, res.clone()); return res; })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === location.origin) {
    if (url.pathname.endsWith('.webmanifest')) {
      // Toujours la version en ligne : Chrome s'en sert pour identifier et installer l'app.
      event.respondWith(fetch(request).catch(() => caches.match(request, { ignoreSearch: true })));
    } else if (request.mode === 'navigate') {
      event.respondWith(staleWhileRevalidate(new Request('index.html'), SHELL));
    } else if (url.pathname.includes('/data/themes/')) {
      event.respondWith(staleWhileRevalidate(request, DATA));
    } else {
      event.respondWith(staleWhileRevalidate(request, SHELL));
    }
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONTS));
  }
});
