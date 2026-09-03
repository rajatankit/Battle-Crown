importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js');

// NOTE: Service workers cannot read .env variables at runtime — these values
// must be hardcoded here. This is safe: Firebase's client-side config
// (apiKey, projectId, etc.) is meant to be public and is NOT a secret.
firebase.initializeApp({
  apiKey: "AIzaSyAEWtDLJ1pZfqmMStyK5QjRmGOYrDob3Do",
  authDomain: "battle-crown-official.firebaseapp.com",
  projectId: "battle-crown-official",
  storageBucket: "battle-crown-official.firebasestorage.app",
  messagingSenderId: "884967460942",
  appId: "1:884967460942:web:4458bd8af5927f4f2d331f",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const title = payload.notification?.title || payload.data?.title || "Notification";
  const body = payload.notification?.body || payload.data?.body || "";
  const isHigh = payload.data?.severity === "high";

  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    data: payload.fcmOptions?.link || payload.data?.link || "/dashboard",
    requireInteraction: isHigh, // High alert tab tak screen pe rahega jab tak tap na kare
    vibrate: isHigh ? [300, 100, 300, 100, 300] : [200],
    tag: payload.data?.alertId || undefined, // Same alert ka notification stack ho, spam na lage
  });
});

// Handle notification click — opens/focuses the app at the target link
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const targetUrl = event.notification.data || "/dashboard";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});