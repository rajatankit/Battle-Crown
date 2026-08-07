import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { app } from "./firebase";

let messaging = null;

if (typeof window !== "undefined" && "Notification" in window) {
  messaging = getMessaging(app);
}

export async function requestNotificationPermission() {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) {
      console.log("Notifications not supported in this environment");
      return null;
    }

    if (!messaging) {
      console.log("Messaging not initialized");
      return null;
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      console.log("Notification permission denied");
      return null;
    }

    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
    if (!vapidKey) {
      console.error("Missing NEXT_PUBLIC_FIREBASE_VAPID_KEY env var");
      return null;
    }

    const token = await getToken(messaging, { vapidKey });

    console.log("FCM Token:", token);
    return token;
  } catch (err) {
    console.error("Error getting FCM token:", err);
    return null;
  }
}

// Call this after getting the token to save it against the logged-in user.
// `idToken` = await auth.currentUser.getIdToken()
export async function saveFcmToken(fcmToken, idToken) {
  try {
    const res = await fetch("/api/update-fcm", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ fcmToken }),
    });
    return await res.json();
  } catch (err) {
    console.error("Error saving FCM token:", err);
    return { success: false, error: err.message };
  }
}

export { messaging, onMessage };