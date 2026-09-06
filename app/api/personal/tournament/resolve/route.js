import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getJoinedUserIds } from "../../../../lib/notifications/getTournamentPlayers";

function normalizeGameHint(text) {
  const t = text.toLowerCase();
  if (/bgmi|pubg/.test(t)) return "BGMI";
  if (/ff|free\s*fire|freefire/.test(t)) return "Free Fire";
  return null;
}

function parseTimeHint(text) {
  const t = text.toLowerCase();
  const match = t.match(/(\d{1,2})\s*(baje|bje)?/);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  if (hour < 1 || hour > 12) return null;

  const isPM = /shaam|dopahar|raat|pm/.test(t);
  const isAM = /subah|savere|am/.test(t);

  if (isPM && hour !== 12) hour += 12;
  if (!isPM && !isAM && hour < 8) hour += 12;

  return hour;
}

export async function POST(req) {
  try {
    const { spokenText, exactTitle } = await req.json();
    let tournament = null;

    if (exactTitle?.trim()) {
      tournament = await prisma.tournament.findFirst({
        where: { title: { contains: exactTitle.trim(), mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!tournament) {
      const gameHint = normalizeGameHint(spokenText || "");
      const hourHint = parseTimeHint(spokenText || "");

      if (!gameHint && !hourHint) {
        return NextResponse.json({ success: false, error: "Tournament identify nahi ho paya" }, { status: 404 });
      }

      const candidates = await prisma.tournament.findMany({
        where: {
          status: { not: "completed" },
          ...(gameHint ? { game: { contains: gameHint, mode: "insensitive" } } : {}),
        },
      });

      const filtered = candidates.filter((t) => {
        if (!t.startTime) return false;
        if (!hourHint) return true;
        return new Date(t.startTime).getHours() === hourHint;
      });

      if (filtered.length === 0) {
        return NextResponse.json({ success: false, error: "Koi matching tournament nahi mila" }, { status: 404 });
      }

      filtered.sort(
        (a, b) => Math.abs(new Date(a.startTime) - Date.now()) - Math.abs(new Date(b.startTime) - Date.now())
      );
      tournament = filtered[0];
    }

    if (!tournament.firestoreId) {
      return NextResponse.json({ success: false, error: "Ye tournament players se linked nahi hai" }, { status: 400 });
    }

    const players = await getJoinedUserIds(tournament.firestoreId);

    return NextResponse.json({
      success: true,
      tournamentPk: tournament.id,
      tournamentId: tournament.firestoreId,
      title: tournament.title,
      playerCount: players.length,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}