import { NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";

// TEMPORARY DIAGNOSTIC VERSION
// Firebase authentication is intentionally removed from GET
// to determine whether firebase-admin is causing the Vercel crash.

export async function GET(request) {
  try {
    const uid = "TEST_UID";

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
      isRead: n.read,
      createdAt: n.createdAt,
    }));

    const globalFormatted = global.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      isRead: Array.isArray(n.readBy)
        ? n.readBy.includes(uid)
        : false,
      createdAt: n.createdAt,
    }));

    const combined = [
      ...personalFormatted,
      ...globalFormatted,
    ].sort(
      (a, b) =>
        new Date(b.createdAt) - new Date(a.createdAt)
    );

    const unreadCount = combined.filter(
      (n) => !n.isRead
    ).length;

    return NextResponse.json({
      success: true,
      diagnostic: true,
      notifications: combined,
      unreadCount,
    });
  } catch (error) {
    console.error(
      "GET NOTIFICATIONS DIAGNOSTIC ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}

// PATCH /api/notifications
// Firebase authentication remains here for testing PATCH separately.

export async function PATCH(request) {
  try {
    const { getVerifiedUid } =
      await import("../../lib/verify-auth");

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
    const { notificationId } = body;

    if (!notificationId) {
      return NextResponse.json(
        {
          success: false,
          error: "notificationId is required",
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

    if (notification.type === "PERSONAL") {
      if (notification.userId !== uid) {
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
    } else {
      const currentReadBy = Array.isArray(
        notification.readBy
      )
        ? notification.readBy
        : [];

      if (!currentReadBy.includes(uid)) {
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
          error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}