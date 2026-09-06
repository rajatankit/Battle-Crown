import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { notifyTargetedUsers } from "../../../lib/notifications/notifyUsers";
import { getJoinedUserIds } from "../../../lib/notifications/getTournamentPlayers";

const ADMIN_USER_ID = process.env.ADMIN_USER_ID ? parseInt(process.env.ADMIN_USER_ID, 10) : null;

export async function GET(req) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    const now = Date.now();
    const windowStart = new Date(now + 55 * 60 * 1000);
    const windowEnd = new Date(now + 65 * 60 * 1000);

    const due = await prisma.tournament.findMany({
      where: {
        reminderSent: false,
        startTime: { gte: windowStart, lte: windowEnd },
      },
    });

    for (const t of due) {
      if (!t.firestoreId) continue;

      const userIds = await getJoinedUserIds(t.firestoreId);
      const players = await prisma.matchHistory.findMany({
        where: { tournamentId: t.firestoreId },
        distinct: ["userId"],
        select: { ign: true },
      });

      const names = players.map((p) => p.ign).filter(Boolean).join(", ") || "Koi nahi";
      const message = `${t.title} 1 ghante mein shuru hoga. ${userIds.length} players joined: ${names}`;

      if (ADMIN_USER_ID) {
        await notifyTargetedUsers({
          userIds: [ADMIN_USER_ID],
          title: `Reminder: ${t.title}`,
          message,
          type: "reminder",
        });
      }

      await prisma.tournament.update({ where: { id: t.id }, data: { reminderSent: true } });
    }

    return NextResponse.json({ success: true, remindersSent: due.length });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}