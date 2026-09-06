import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { notifyTargetedUsers } from "../../../../lib/notifications/notifyUsers";
import { getJoinedUserIds } from "../../../../lib/notifications/getTournamentPlayers";

export async function POST(req) {
  try {
    const { tournamentPk, tournamentId, tournamentTitle, roomId, roomPassword } = await req.json();

    if (!tournamentId || !roomId || !roomPassword) {
      return NextResponse.json(
        { success: false, error: "tournamentId, roomId aur roomPassword required hain" },
        { status: 400 }
      );
    }

    const userIds = await getJoinedUserIds(tournamentId);

    if (userIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Iss tournament mein abhi tak koi player join nahi hua" },
        { status: 400 }
      );
    }

    if (tournamentPk) {
      await prisma.tournament.update({
        where: { id: tournamentPk },
        data: { roomId, roomPassword },
      });
    }

    const title = `${tournamentTitle || "Tournament"} — Room Details`;
    const message = `Room ID: ${roomId} | Password: ${roomPassword}`;

    const result = await notifyTargetedUsers({ userIds, title, message });

    return NextResponse.json({
      success: true,
      message: `Room details ${result.count} player(s) ko bhej di`,
      sentTo: result.count,
    });
  } catch (err) {
    console.error("Room details notify error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}