  const CACHE_NAME = 'rotina-foco-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

// Estratégia simples: tenta a rede primeiro, cai pro cache se estiver offline.
// Só aplica isso a pedidos GET — POST (como as chamadas pro Worker de IA)
// vai direto pra rede, sem passar pelo cache (Cache API não suporta POST).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
