import { NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { messaging } from "../../lib/firebase-admin";

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
    const { title, message } = body;

    if (!title || !message) {
      return NextResponse.json(
        { success: false, error: "Title and message are required" },
        { status: 400 }
      );
    }

    // 1) Save ONE global notification record — shown to everyone in the inbox
    const globalNotification = await prisma.notification.create({
      data: {
        type: "GLOBAL",
        title,
        message,
      },
    });

    // 2) Send push notifications to everyone with a token
    const users = await prisma.user.findMany({
      where: { fcmToken: { not: null } },
      select: { id: true, fcmToken: true },
    });

    const tokenToUserId = new Map();
    for (const user of users) {
      if (user.fcmToken) tokenToUserId.set(user.fcmToken, user.id);
    }

    const uniqueTokens = [...tokenToUserId.keys()];

    let successCount = 0;
    let failureCount = 0;
    const invalidTokens = [];

    if (uniqueTokens.length > 0) {
      const chunkSize = 500;

      for (let i = 0; i < uniqueTokens.length; i += chunkSize) {
        const tokenChunk = uniqueTokens.slice(i, i + chunkSize);

        const response = await messaging.sendEachForMulticast({
          tokens: tokenChunk,
          notification: { title, body: message },
          webpush: {
            notification: { title, body: message, icon: "/icon-192.png" },
            fcmOptions: { link: "/dashboard" },
          },
        });

        successCount += response.successCount;
        failureCount += response.failureCount;

        response.responses.forEach((res, idx) => {
          if (!res.success) {
            const errorCode = res.error?.code || "";
            if (
              errorCode === "messaging/invalid-registration-token" ||
              errorCode === "messaging/registration-token-not-registered"
            ) {
              invalidTokens.push(tokenChunk[idx]);
            }
          }
        });
      }

      if (invalidTokens.length > 0) {
        const userIdsToClear = invalidTokens
          .map((t) => tokenToUserId.get(t))
          .filter(Boolean);

        await prisma.user.updateMany({
          where: { id: { in: userIdsToClear } },
          data: { fcmToken: null },
        });
      }
    }

    console.log("Notification sent");
    console.log("Success:", successCount);
    console.log("Failed:", failureCount);
    console.log("Invalid tokens cleaned up:", invalidTokens.length);

    return NextResponse.json({
      success: true,
      message: "Notification broadcast completed",
      notificationId: globalNotification.id,
      totalUsers: uniqueTokens.length,
      successCount,
      failureCount,
      cleanedUpTokens: invalidTokens.length,
    });
  } catch (error) {
    console.error("SEND NOTIFICATION ERROR:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to send notification" },
      { status: 500 }
    );
  }
}