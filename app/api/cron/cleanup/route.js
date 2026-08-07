import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function GET() {
  try {
    const now = new Date();

    // 2 hours old tournaments delete
    const tournamentDeleteTime = new Date(
      now.getTime() - 2 * 60 * 60 * 1000
    );

    const deletedTournaments = await prisma.tournament.deleteMany({
      where: {
        startTime: {
          lte: tournamentDeleteTime,
        },
      },
    });

    // 24 hours old notifications delete
    const notificationDeleteTime = new Date(
      now.getTime() - 24 * 60 * 60 * 1000
    );

    const deletedNotifications = await prisma.notification.deleteMany({
      where: {
        createdAt: {
          lte: notificationDeleteTime,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Cleanup completed",
      tournamentsDeleted: deletedTournaments.count,
      notificationsDeleted: deletedNotifications.count,
    });

  } catch (error) {
    console.error("Cleanup error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}