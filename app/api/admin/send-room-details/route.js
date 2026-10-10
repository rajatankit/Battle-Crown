import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function POST(req) {
  try {
    const { tournamentId, roomId, roomPassword } = await req.json();

    if (!tournamentId || !roomId || !roomPassword) {
      return NextResponse.json(
        {
          success: false,
          message: "Missing required fields",
        },
        { status: 400 }
      );
    }

    // `tournamentId` here is the Firestore document ID (a string,
    // e.g. "001") — the admin page reads tournaments from Firestore,
    // not Postgres. MatchHistory.tournamentId in Postgres is an Int
    // foreign key to Tournament.id, NOT the Firestore ID. So we
    // first resolve the Firestore ID to the matching Postgres
    // Tournament row (via its `firestoreId` field) and use *that*
    // row's numeric `id` for the actual query below.
    const tournament = await prisma.tournament.findUnique({
      where: { firestoreId: String(tournamentId) },
      select: { id: true },
    });

    if (!tournament) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Tournament not found in database (no matching firestoreId). Make sure this tournament was synced to Postgres.",
        },
        { status: 404 }
      );
    }

    // Get all players who joined this tournament
    const players = await prisma.matchHistory.findMany({
      where: {
        tournamentId: tournament.id,
      },
      select: {
        userId: true,
      },
    });

    if (players.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No players found",
      });
    }

    // Remove duplicate user IDs
    const uniqueUserIds = [
      ...new Set(players.map((player) => player.userId)),
    ];

    let notificationCount = 0;
    let skippedCount = 0;

    // Send notification only once per user
    for (const userId of uniqueUserIds) {
      const user = await prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          uid: true,
        },
      });

      if (!user?.uid) continue;

      const title = "🎮 Room Details Released";
      const message = `Room ID: ${roomId}\nPassword: ${roomPassword}`;

      // Prevent duplicate notification
      // if the same room details were already sent
      const existingNotification =
        await prisma.notification.findFirst({
          where: {
            type: "PERSONAL",
            userId: user.uid,
            title,
            message,
          },
          select: {
            id: true,
          },
        });

      if (existingNotification) {
        skippedCount++;
        continue;
      }

      await prisma.notification.create({
        data: {
          type: "PERSONAL",
          userId: user.uid,
          title,
          message,
        },
      });

      notificationCount++;
    }

    return NextResponse.json({
      success: true,
      message: "Room details notifications processed successfully",
      notificationCount,
      skippedCount,
    });
  } catch (error) {
    console.error("SEND ROOM DETAILS ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Failed to send room details",
      },
      {
        status: 500,
      }
    );
  }
}