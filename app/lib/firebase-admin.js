// app/lib/firebase-admin.js
// Sirf Firebase Admin setup yahan hai. Yahan koi route/auth logic nahi.
// Is file ko kabhi khud ko import mat karna.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
// .env me "\n" literal hota hai, usse asli newline banao
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("Firebase Admin env missing:", {
    FIREBASE_PROJECT_ID: !!projectId,
    FIREBASE_CLIENT_EMAIL: !!clientEmail,
    FIREBASE_PRIVATE_KEY: !!privateKey,
  });
  throw new Error("Firebase Admin configuration is incomplete");
}

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
export const messaging = getMessaging(app);