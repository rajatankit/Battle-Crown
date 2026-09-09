import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { success: false, error: "email is required" },
        { status: 400 }
      );
    }

    // Pehle user nikaalo
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const matches = await prisma.matchHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        tournament: {
          select: { title: true, game: true, map: true },
        },
      },
    });

    const mapped = matches.map((m) => ({
      id: m.id,
      dbMatchId: m.id,
      tournamentName: m.tournament?.title || "Tournament",
      mapName: m.map || m.tournament?.map || "-",
      gameType: m.game || m.tournament?.game || "-",
      playerLevel: user.level || 1,
      joinTime: m.createdAt,
      entryPaid: "-", // ab EntryPayment se aayega baad mein
      screenshotUrl: m.screenshotUrl,
      resultStatus: m.resultStatus,
    }));

    return NextResponse.json({ success: true, matches: mapped });
  } catch (error) {
    console.error("Match history fetch error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}