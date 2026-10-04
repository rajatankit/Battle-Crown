// public/sw.js
//
// Deliberately minimal: Battle Crown's data (tournaments, crowns, match
// status) changes constantly, so this service worker does NOT cache API
// responses or pages — it only exists so the browser treats the site as
// an installable PWA. Everything is fetched fresh from the network,
// same as a normal page load.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through — always hit the network, never serve cached/stale data.
  event.respondWith(fetch(event.request));
});