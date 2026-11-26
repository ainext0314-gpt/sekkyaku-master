const cacheName = 'sekkyaku-shell-v3';
const shell = [
  './', './index.html', './styles.css', './app/ui.mjs', './app/training.mjs',
  './app/storage.mjs', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(shell)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(
    names.filter((name) => name.startsWith('sekkyaku-shell-') && name !== cacheName)
      .map((name) => caches.delete(name)),
  )).then(() => self.clients.claim()));
});

const shellUrls = new Set(shell.map((path) => new URL(path, self.registration.scope).href));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate' && shellUrls.has(event.request.url)) {
    event.respondWith(fetch(event.request).catch(() => caches.match('./index.html')));
  } else if (shellUrls.has(event.request.url)) {
    event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
  }
});
