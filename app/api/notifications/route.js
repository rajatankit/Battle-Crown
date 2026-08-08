import { NextResponse } from "next/server";
import { prisma } from "../../lib/prisma";
import { getVerifiedUid } from "../../lib/verify-auth";

// GET /api/notifications
// Returns personal + global notifications for the logged-in user.
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

      // Safe handling if readBy is missing/invalid
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


// PATCH /api/notifications
// Marks a notification as read.
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


    // PERSONAL notification
    if (notification.type === "PERSONAL") {

      // User can only mark their own notification as read.
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
    }


    // GLOBAL notification
    else if (notification.type === "GLOBAL") {

      const currentReadBy =
        Array.isArray(notification.readBy)
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
          error?.message ||
          "Failed to mark notification as read",
      },
      { status: 500 }
    );
  }
}