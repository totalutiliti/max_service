const CACHE_VERSION = "max-service-public-v1";
const PUBLIC_SHELL = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/max-service-mark-192.png",
  "/max-service-mark-512.png",
  "/max-service-brand.png",
];
const PUBLIC_ASSETS = new Set(PUBLIC_SHELL);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PUBLIC_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        if (url.pathname === "/") {
          const landing = await caches.match("/");
          if (landing) return landing;
        }
        return caches.match("/offline.html");
      }),
    );
    return;
  }

  if (PUBLIC_ASSETS.has(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then((cached) => cached ?? fetch(request)));
  }
});
