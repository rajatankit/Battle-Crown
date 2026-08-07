// lib/firebase-admin.js
//
// Uses the modular Firebase Admin SDK style (firebase-admin/app, /auth, etc.)
// instead of the old `import admin from "firebase-admin"` default import.
// The old style can break under Next.js Turbopack due to ESM/CJS interop,
// causing `admin.apps` to come back undefined.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

function getPrivateKey() {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  if (!key) return undefined;
  // .env files store literal "\n" — convert back to real newlines
  return key.replace(/\\n/g, "\n");
}

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = getPrivateKey();

if (!projectId || !clientEmail || !privateKey) {
  throw new Error(
    "Missing Firebase Admin env vars. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env.local"
  );
}

const app = !getApps().length
  ? initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    })
  : getApps()[0];

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
export const messaging = getMessaging(app);