import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { adminAuth } from "../../../lib/firebase-admin";

// Client must send: Authorization: Bearer <firebase-id-token>
// Get this token client-side with: await auth.currentUser.getIdToken()
async function getVerifiedUid(request) {
  const authHeader = request.headers.get("authorization") || "";
  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!idToken) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    return decoded.uid;
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return null;
  }
}

export async function POST(request) {
  try {
    const uid = await getVerifiedUid(request);

    if (!uid) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: invalid or missing auth token" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const fcmToken = body.fcmToken?.toString();

    console.log("========== UPDATE FCM ==========");
    console.log("UID:", uid);
    console.log("TOKEN:", fcmToken);

    if (!fcmToken) {
      return NextResponse.json(
        { success: false, error: "FCM Token is required" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { uid } });

    if (!existingUser) {
      console.log("User not found");
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { uid },
      data: { fcmToken },
    });

    console.log("FCM Token Updated Successfully");

    return NextResponse.json({
      success: true,
      message: "FCM Token Updated Successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("UPDATE FCM ERROR:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}