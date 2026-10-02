// app/lib/admin-auth.js
// Token verify karne ke helpers.
//
// Normal user route:
//   const { ok, response, user } = await requireUser(req);
//   if (!ok) return response;
//
// Admin route:
//   const { ok, response, email } = await requireAdmin(req);
//   if (!ok) return response;

import { NextResponse } from "next/server";
import { adminAuth } from "@/app/lib/firebase-admin";

function fail(error, status) {
  return {
    ok: false,
    response: NextResponse.json({ success: false, error }, { status }),
  };
}

function getAdminEmails() {
  // Server-only env. NEXT_PUBLIC_ kabhi mat lagana.
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireUser(req) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return fail("Missing auth token", 401);

  try {
    const user = await adminAuth.verifyIdToken(token);
    return { ok: true, user };
  } catch (err) {
    console.error("Token verify failed:", err?.message);
    return fail("Invalid or expired token", 401);
  }
}

export async function requireAdmin(req) {
  const result = await requireUser(req);
  if (!result.ok) return result;

  const email = (result.user.email || "").toLowerCase();
  if (!email || !getAdminEmails().includes(email)) {
    return fail("Not authorized as admin", 403);
  }

  return { ok: true, email, user: result.user };
}

export async function getVerifiedUid(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid;
  } catch (e) {
    console.error("Token verification failed:", e.message);
    return null;
  }
}