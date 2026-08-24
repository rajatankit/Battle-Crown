import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { messaging } from "../../../lib/firebase-admin";

function authorized(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : "";

  return (
    !!process.env.BATTLE_CROWN_BRIDGE_TOKEN &&
    token === process.env.BATTLE_CROWN_BRIDGE_TOKEN
  );
}

export async function POST(request) {
  try {
    if (!authorized(request)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid CORTEX bridge token.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const action = body?.action;
    const context = body?.context || {};

    if (!action) {
      return NextResponse.json(
        {
          success: false,
          error: "action is required",
        },
        { status: 400 }
      );
    }

    // =====================================================
    // SEND PERSONAL NOTIFICATION
    // =====================================================

    if (action === "send_personal_notification") {
      const playerId = context.player_id;
      const title = context.title || "Battle Crown";
      const message = context.message;

      if (!playerId || !message) {
        return NextResponse.json(
          {
            success: false,
            error: "player_id and message are required",
          },
          { status: 400 }
        );
      }

      const numericPlayerId = Number(playerId);
      const isNumericPlayerId =
        Number.isInteger(numericPlayerId) && String(playerId).trim() !== "";

      const user = await prisma.user.findFirst({
        where: isNumericPlayerId
          ? {
              OR: [
                { uid: playerId },
                { id: numericPlayerId },
              ],
            }
          : {
              uid: playerId,
            },
      });

      if (!user) {
        return NextResponse.json(
          {
            success: false,
            error: "Player not found",
          },
          { status: 404 }
        );
      }

      const notification = await prisma.notification.create({
        data: {
          type: "PERSONAL",
          userId: user.uid,
          title,
          message,
        },
      });

      let pushSent = false;

      if (user.fcmToken) {
        try {
          await messaging.send({
            token: user.fcmToken,
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

          pushSent = true;
        } catch (error) {
          console.error(
            "CORTEX personal push failed:",
            error?.message
          );

          if (
            error?.code ===
              "messaging/invalid-registration-token" ||
            error?.code ===
              "messaging/registration-token-not-registered"
          ) {
            await prisma.user.update({
              where: { uid: user.uid },
              data: { fcmToken: null },
            });
          }
        }
      }

      return NextResponse.json({
        success: true,
        action,
        notification,
        pushSent,
      });
    }

    // =====================================================
    // READ NOTIFICATION LOGS
    // =====================================================

    if (action === "read_notification_logs") {
      const playerId = context.player_id;
      const notificationId = context.notification_id;

      let notifications;

      if (notificationId) {
        notifications = await prisma.notification.findMany({
          where: {
            id: notificationId,
          },
          orderBy: {
            createdAt: "desc",
          },
        });
      } else if (playerId) {
        const numericPlayerId = Number(playerId);
      const isNumericPlayerId =
        Number.isInteger(numericPlayerId) && String(playerId).trim() !== "";

      const user = await prisma.user.findFirst({
        where: isNumericPlayerId
          ? {
              OR: [
                { uid: playerId },
                { id: numericPlayerId },
              ],
            }
          : {
              uid: playerId,
            },
      });

        notifications = user
          ? await prisma.notification.findMany({
              where: {
                OR: [
                  {
                    type: "PERSONAL",
                    userId: user.uid,
                  },
                  {
                    type: "GLOBAL",
                  },
                ],
              },
              orderBy: {
                createdAt: "desc",
              },
              take: 100,
            })
          : [];
      } else {
        notifications = await prisma.notification.findMany({
          orderBy: {
            createdAt: "desc",
          },
          take: 100,
        });
      }

      return NextResponse.json({
        success: true,
        action,
        count: notifications.length,
        notifications,
      });
    }

    // =====================================================
    // MANAGE NOTIFICATIONS
    // =====================================================

    if (action === "manage_notifications") {
      const notificationId = context.notification_id;
      const updates = context.updates;

      if (!notificationId) {
        return NextResponse.json(
          {
            success: false,
            error: "notification_id is required",
          },
          { status: 400 }
        );
      }

      if (!updates || typeof updates !== "object") {
        return NextResponse.json(
          {
            success: false,
            error: "updates must be an object",
          },
          { status: 400 }
        );
      }

      const notification =
        await prisma.notification.update({
          where: {
            id: notificationId,
          },
          data: {
            ...(updates.title !== undefined
              ? { title: updates.title }
              : {}),
            ...(updates.message !== undefined
              ? { message: updates.message }
              : {}),
          },
        });

      return NextResponse.json({
        success: true,
        action,
        notification,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: `Unsupported notification action: ${action}`,
      },
      { status: 400 }
    );

  } catch (error) {
    console.error(
      "CORTEX NOTIFICATION BRIDGE ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "CORTEX notification bridge failed",
      },
      { status: 500 }
    );
  }
}
