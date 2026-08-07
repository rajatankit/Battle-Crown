import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

async function cleanupNotifications() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const result = await prisma.notification.deleteMany({
    where: {
      createdAt: {
        lt: cutoff,
      },
    },
  });

  return result.count;
}

// Vercel Cron ke liye GET
export async function GET(req) {
  try {
    // Cron secret protection
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      const authorization = req.headers.get("authorization");

      if (authorization !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          {
            success: false,
            error: "Unauthorized",
          },
          { status: 401 }
        );
      }
    }

    const deletedCount = await cleanupNotifications();

    return NextResponse.json({
      success: true,
      message: `${deletedCount} old notifications deleted.`,
      deletedCount,
    });
  } catch (error) {
    console.error("Notification cleanup error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Cleanup failed",
      },
      { status: 500 }
    );
  }
}

// Manual testing ke liye DELETE bhi available
export async function DELETE(req) {
  try {
    const adminKey = req.headers.get("x-admin-key");

    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const deletedCount = await cleanupNotifications();

    return NextResponse.json({
      success: true,
      message: `${deletedCount} old notifications deleted.`,
      deletedCount,
    });
  } catch (error) {
    console.error("Notification cleanup error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Cleanup failed",
      },
      { status: 500 }
    );
  }
}