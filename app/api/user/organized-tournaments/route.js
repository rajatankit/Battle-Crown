import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getVerifiedUid } from "@/app/lib/auth";

export async function GET(req, { params }) {
  try {
    const uid = await getVerifiedUid(req);
    if (!uid) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { uid } });
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const resolvedParams = await Promise.resolve(params);
    const tournamentId = Number(resolvedParams.id);
    if (!Number.isInteger(tournamentId) || tournamentId <= 0) {
      return NextResponse.json({ success: false, message: "Invalid tournament id" }, { status: 400 });
    }

    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      return NextResponse.json({ success: false, message: "Tournament not found" }, { status: 404 });
    }

    // OWNERSHIP GATE — organizer can only see results for their own
    // tournaments, never someone else's.
    if (tournament.organizerType !== "User" || tournament.createdByUserId !== user.id) {
      return NextResponse.json(
        { success: false, message: "You do not have access to this tournament" },
        { status: 403 }
      );
    }

    const matches = await prisma.matchHistory.findMany({
      where: { tournamentId },
      orderBy: [{ placement: "asc" }, { kills: "desc" }],
      select: {
        id: true,
        userId: true,
        ign: true,
        uid: true,
        kills: true,
        placement: true,
        resultStatus: true,
        screenshotUrl: true,
        user: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, tournamentId, results: matches });
  } catch (error) {
    console.error("Organizer results view error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}