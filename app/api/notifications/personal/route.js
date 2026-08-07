import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { messaging } from "../../../lib/firebase-admin";

// POST /api/notifications/personal
// Protected the same way as broadcast — call this from your own admin
// panel / backend logic (e.g. when assigning a room ID, or replying to a
// withdrawal request), not directly from a random user's browser.
//
// Body: { uid: string, title: string, message: string }
function isAuthorized(request) {
  const secret = request.headers.get("x-admin-secret");
  return (
    !!process.env.ADMIN_BROADCAST_SECRET &&
    secret === process.env.ADMIN_BROADCAST_SECRET
  );
}

export async function POST(request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { uid, title, message } = body;

    if (!uid || !title || !message) {
      return NextResponse.json(
        { success: false, error: "uid, title and message are required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { uid } });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    // 1) Save to DB so it shows up in the in-app inbox
    const notification = await prisma.notification.create({
      data: {
        type: "PERSONAL",
        userId: uid,
        title,
        message,
      },
    });

    // 2) Also send a push notification if the user has a token
    let pushSent = false;
    if (user.fcmToken) {
      try {
        await messaging.send({
          token: user.fcmToken,
          notification: { title, body: message },
          webpush: {
            notification: { title, body: message, icon: "/icon-192.png" },
            fcmOptions: { link: "/dashboard" },
          },
        });
        pushSent = true;
      } catch (err) {
        console.error("Push send failed (DB record still saved):", err.message);
        // If token is dead, clean it up
        if (
          err.code === "messaging/invalid-registration-token" ||
          err.code === "messaging/registration-token-not-registered"
        ) {
          await prisma.user.update({
            where: { uid },
            data: { fcmToken: null },
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      notification,
      pushSent,
    });
  } catch (error) {
    console.error("PERSONAL NOTIFICATION ERROR:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}