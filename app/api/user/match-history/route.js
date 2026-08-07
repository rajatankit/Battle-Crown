import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// GET /api/user/match-history?email=xxx
// Returns the user's 5 most recent matches, in the shape the dashboard's
// matchHistory state expects.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ success: false, error: "email is required" }, { status: 400 });
    }

    const matches = await prisma.matchHistory.findMany({
      where: { email },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const mapped = matches.map((m) => ({
      id: m.id,
      dbMatchId: m.id,
      tournamentName: m.tournamentName,
      mapName: m.mapName,
      gameType: m.gameType,
      playerLevel: m.playerLevel,
      joinTime: m.createdAt,
      entryPaid: `₹${m.entryFee}`,
      screenshotUrl: m.screenshotUrl,
    }));

    return NextResponse.json({ success: true, matches: mapped });
  } catch (error) {
    console.error("Match history fetch error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}