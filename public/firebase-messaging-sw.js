importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js');

// NOTE: Service workers cannot read .env variables at runtime — these values
// must be hardcoded here. This is safe: Firebase's client-side config
// (apiKey, projectId, etc.) is meant to be public and is NOT a secret.
// Copy these exact values from your lib/firebase.js file.
firebase.initializeApp({
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const title = payload.notification?.title || payload.data?.title || "Notification";
  const body = payload.notification?.body || payload.data?.body || "";

  self.registration.showNotification(title, {
    body,
    icon: "/icon-192.png",
    data: payload.fcmOptions?.link || payload.data?.link || "/dashboard",
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