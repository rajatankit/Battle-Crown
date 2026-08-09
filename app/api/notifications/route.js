import { NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { getVerifiedUid } from "../../lib/verify-auth";
import { messaging } from "../../lib/firebase-admin";

// =====================================================
// GET /api/notifications
// Returns personal + global notifications
// =====================================================
export async function GET(request) {
  try {
    const uid = await getVerifiedUid(request);

    if (!uid) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const [personal, global] = await Promise.all([
      prisma.notification.findMany({
        where: {
          type: "PERSONAL",
          userId: uid,
        },
        orderBy: {
          createdAt: "desc",
        },
      }),

      prisma.notification.findMany({
        where: {
          type: "GLOBAL",
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 100,
      }),
    ]);

    const personalFormatted = personal.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      isRead: Boolean(n.read),
      createdAt: n.createdAt,
    }));

    const globalFormatted = global.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,

      isRead:
        Array.isArray(n.readBy) &&
        n.readBy.includes(uid),

      createdAt: n.createdAt,
    }));

    const combined = [
      ...personalFormatted,
      ...globalFormatted,
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
    );

    const unreadCount = combined.filter(
      (n) => !n.isRead
    ).length;

    return NextResponse.json({
      success: true,
      notifications: combined,
      unreadCount,
    });
  } catch (error) {
    console.error(
      "GET NOTIFICATIONS ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Failed to load notifications",
      },
      { status: 500 }
    );
  }
}


// =====================================================
// POST /api/notifications
// Sends GLOBAL notification to all users with FCM token
// =====================================================
export async function POST(request) {
  try {
    // -----------------------------------------------
    // ADMIN AUTHORIZATION
    // -----------------------------------------------
    const secret = request.headers.get("x-admin-secret");

    if (
      !process.env.ADMIN_BROADCAST_SECRET ||
      secret !== process.env.ADMIN_BROADCAST_SECRET
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    // -----------------------------------------------
    // READ REQUEST BODY
    // -----------------------------------------------
    const body = await request.json();

    const title = body?.title?.trim();
    const message = body?.message?.trim();

    if (!title || !message) {
      return NextResponse.json(
        {
          success: false,
          error: "Title and message are required",
        },
        { status: 400 }
      );
    }

    // -----------------------------------------------
    // SAVE GLOBAL NOTIFICATION IN DATABASE
    // -----------------------------------------------
    const globalNotification =
      await prisma.notification.create({
        data: {
          type: "GLOBAL",
          title,
          message,
        },
      });

    // -----------------------------------------------
    // GET ALL USERS WITH FCM TOKEN
    // -----------------------------------------------
    const users = await prisma.user.findMany({
      where: {
        fcmToken: {
          not: null,
        },
      },
      select: {
        id: true,
        fcmToken: true,
      },
    });

    // -----------------------------------------------
    // REMOVE DUPLICATE TOKENS
    // -----------------------------------------------
    const tokenToUserId = new Map();

    for (const user of users) {
      if (user.fcmToken) {
        tokenToUserId.set(
          user.fcmToken,
          user.id
        );
      }
    }

    const uniqueTokens = [
      ...tokenToUserId.keys(),
    ];

    let successCount = 0;
    let failureCount = 0;

    const invalidTokens = [];

    // -----------------------------------------------
    // SEND FCM IN CHUNKS OF 500
    // -----------------------------------------------
    if (uniqueTokens.length > 0) {
      const chunkSize = 500;

      for (
        let i = 0;
        i < uniqueTokens.length;
        i += chunkSize
      ) {
        const tokenChunk =
          uniqueTokens.slice(
            i,
            i + chunkSize
          );

        const response =
          await messaging.sendEachForMulticast({
            tokens: tokenChunk,

            notification: {
              title,
              body: message,
            },

            webpush: {
              notification: {
                title,
                body: message,
                icon: "/icon-192.png",
              },

              fcmOptions: {
                link: "/dashboard",
              },
            },
          });

        successCount +=
          response.successCount;

        failureCount +=
          response.failureCount;

        // -----------------------------------------
        // FIND INVALID TOKENS
        // -----------------------------------------
        response.responses.forEach(
          (res, idx) => {
            if (!res.success) {
              const errorCode =
                res.error?.code || "";

              if (
                errorCode ===
                  "messaging/invalid-registration-token" ||
                errorCode ===
                  "messaging/registration-token-not-registered"
              ) {
                invalidTokens.push(
                  tokenChunk[idx]
                );
              }
            }
          }
        );
      }

      // -------------------------------------------
      // CLEAN INVALID FCM TOKENS
      // -------------------------------------------
      if (invalidTokens.length > 0) {
        const userIdsToClear =
          invalidTokens
            .map((token) =>
              tokenToUserId.get(token)
            )
            .filter(Boolean);

        if (
          userIdsToClear.length > 0
        ) {
          await prisma.user.updateMany({
            where: {
              id: {
                in: userIdsToClear,
              },
            },

            data: {
              fcmToken: null,
            },
          });
        }
      }
    }

    // -----------------------------------------------
    // LOG
    // -----------------------------------------------
    console.log(
      "GLOBAL NOTIFICATION SENT"
    );

    console.log(
      "Total tokens:",
      uniqueTokens.length
    );

    console.log(
      "Success:",
      successCount
    );

    console.log(
      "Failed:",
      failureCount
    );

    console.log(
      "Invalid tokens cleaned:",
      invalidTokens.length
    );

    // -----------------------------------------------
    // RESPONSE
    // -----------------------------------------------
    return NextResponse.json({
      success: true,
      message:
        "Notification broadcast completed",

      notificationId:
        globalNotification.id,

      totalUsers:
        uniqueTokens.length,

      successCount,

      failureCount,

      cleanedUpTokens:
        invalidTokens.length,
    });
  } catch (error) {
    console.error(
      "SEND GLOBAL NOTIFICATION ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Failed to send notification",
      },
      { status: 500 }
    );
  }
}


// =====================================================
// PATCH /api/notifications
// Marks a notification as read
// =====================================================
export async function PATCH(request) {
  try {
    const uid = await getVerifiedUid(request);

    if (!uid) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const notificationId =
      body?.notificationId;

    if (!notificationId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "notificationId is required",
        },
        { status: 400 }
      );
    }

    const notification =
      await prisma.notification.findUnique({
        where: {
          id: notificationId,
        },
      });

    if (!notification) {
      return NextResponse.json(
        {
          success: false,
          error: "Notification not found",
        },
        { status: 404 }
      );
    }

    // -----------------------------------------------
    // PERSONAL NOTIFICATION
    // -----------------------------------------------
    if (
      notification.type ===
      "PERSONAL"
    ) {
      if (
        notification.userId !== uid
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Forbidden",
          },
          { status: 403 }
        );
      }

      await prisma.notification.update({
        where: {
          id: notificationId,
        },

        data: {
          read: true,
        },
      });
    }

    // -----------------------------------------------
    // GLOBAL NOTIFICATION
    // -----------------------------------------------
    else if (
      notification.type ===
      "GLOBAL"
    ) {
      const currentReadBy =
        Array.isArray(
          notification.readBy
        )
          ? notification.readBy
          : [];

      if (
        !currentReadBy.includes(uid)
      ) {
        await prisma.notification.update({
          where: {
            id: notificationId,
          },

          data: {
            readBy: {
              push: uid,
            },
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "MARK READ ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Failed to mark notification as read",
      },
      { status: 500 }
    );
  }
}