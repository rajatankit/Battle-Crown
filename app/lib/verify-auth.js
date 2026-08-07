import { adminAuth } from "./firebase-admin";

// Reads "Authorization: Bearer <firebase-id-token>" header, verifies it,
// and returns the verified uid — or null if invalid/missing.
export async function getVerifiedUid(request) {
  const authHeader = request.headers.get("authorization") || "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!idToken) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return decoded.uid;
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return null;
  }
}