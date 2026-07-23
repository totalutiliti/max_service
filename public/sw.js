const CACHE_VERSION = "max-service-public-v2";
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

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === "string" ? payload.title.slice(0, 120) : "Max Service";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 500) : "Você tem uma nova atualização.";
  const tag = typeof payload.tag === "string" ? payload.tag.slice(0, 180) : "max-service-update";
  const url = typeof payload.data?.url === "string" && payload.data.url.startsWith("/")
    ? payload.data.url
    : "/demo";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      icon: "/max-service-mark-192.png",
      badge: "/max-service-mark-192.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = typeof event.notification.data?.url === "string" ? event.notification.data.url : "/demo";
  const target = new URL(rawUrl, self.location.origin);
  const targetUrl = target.origin === self.location.origin ? target.href : new URL("/demo", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
