/* Service Worker de la invitación de Pilar.
   Cachea la "cáscara" (HTML + assets) para que cargue rápido y funcione offline.
   Estrategia:
   - Navegaciones / API: network-first (siempre datos frescos; si no hay red, cae al cache).
   - Assets estáticos: cache-first (imágenes, música, íconos).
*/
const CACHE = "pili-v2";
const SHELL = [
  "/",
  "/invitacion",
  "/muro",
  "/fotos",
  "/frases",
  "/historia",
  "/juegos",
  "/manifest.webmanifest",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
  "/assets/favicon.png",
  "/assets/bunny.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // No interferir con la API ni con recursos de otros dominios (R2, Spotify, Google).
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  const isNavigation = req.mode === "navigate";
  if (isNavigation) {
    // network-first para el HTML
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/invitacion")))
    );
    return;
  }

  // cache-first para assets
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      });
    })
  );
});
