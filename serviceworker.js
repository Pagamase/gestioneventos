
self.addEventListener('install', function (e) {
  console.log('✅ Service Worker instalado');
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (e) {
  console.log('✅ Service Worker activado');
  return self.clients.claim();
});
