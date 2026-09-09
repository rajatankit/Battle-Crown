import { adminAuth } from "./firebase-admin";

// Extracts and verifies the Firebase ID token from a request's
// Authorization header. Returns the verified uid, or null if missing/invalid.
export async function getVerifiedUid(request) {
  const authHeader = request.headers.get("authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!idToken) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return decoded.uid;
  } catch (err) {
    console.error("Token verification failed:", err);
    return null;
  }
}