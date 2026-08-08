import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { adminAuth } from "../../../lib/firebase-admin";

async function getVerifiedUser(request) {
  const authHeader = request.headers.get("authorization") || "";

  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!idToken) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);

    return {
      uid: decoded.uid,
      email: decoded.email || null,
    };
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return null;
  }
}

export async function POST(request) {
  try {
    const firebaseUser = await getVerifiedUser(request);

    if (!firebaseUser) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized: invalid or missing auth token",
        },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const fcmToken = body.fcmToken?.toString().trim();

    if (!fcmToken) {
      return NextResponse.json(
        {
          success: false,
          error: "FCM Token is required",
        },
        { status: 400 }
      );
    }

    console.log("========== UPDATE FCM ==========");
    console.log("Firebase UID:", firebaseUser.uid);
    console.log("Firebase Email:", firebaseUser.email);
    console.log("FCM Token received:", !!fcmToken);

    // 1. First try exact Firebase UID
    let existingUser = await prisma.user.findUnique({
      where: {
        uid: firebaseUser.uid,
      },
    });

    // 2. If UID doesn't match, try the verified Firebase email
    // This handles users created before UID/database sync was fixed.
    if (!existingUser && firebaseUser.email) {
      existingUser = await prisma.user.findUnique({
        where: {
          email: firebaseUser.email,
        },
      });
    }

    if (!existingUser) {
      console.log("User not found by UID or email");

      return NextResponse.json(
        {
          success: false,
          error: "User not found",
        },
        { status: 404 }
      );
    }

    // Update only the FCM token.
    // We don't change the stored UID automatically.
    const updatedUser = await prisma.user.update({
      where: {
        uid: existingUser.uid,
      },
      data: {
        fcmToken,
      },
    });

    console.log("FCM Token Updated Successfully");
    console.log("Database User UID:", existingUser.uid);

    return NextResponse.json({
      success: true,
      message: "FCM Token Updated Successfully",
    });
  } catch (error) {
    console.error("UPDATE FCM ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal Server Error",
      },
      { status: 500 }
    );
  }
}