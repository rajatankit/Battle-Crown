// app/api/user/match-history/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma"; 

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ success: false, error: "email is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const matches = await prisma.matchHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        tournament: { select: { id: true, title: true, game: true, map: true } },
        entryPayments: { select: { amount: true, status: true }, take: 1 },
        tournamentReward: { select: { amount: true, status: true, reason: true } },
      },
    });

    const mapped = matches.map((m) => ({
      id: m.id,
      dbMatchId: m.id,
      tournamentName: m.tournament?.title || "Tournament",
      mapName: m.map || m.tournament?.map || "-",
      gameType: m.game || m.tournament?.game || "-",
      joinTime: m.createdAt,
      entryFeePaid: m.entryPayments[0]?.amount ?? 0,
      paymentStatus: m.entryPayments[0]?.status ?? "UNKNOWN",
      screenshotUrl: m.screenshotUrl,
      resultStatus: m.resultStatus, // UNVERIFIED | ADMIN_REVIEW | VERIFIED | REJECTED
      rewardAmount: m.tournamentReward?.amount ?? 0,
      rewardStatus: m.tournamentReward?.status ?? "NO_REWARD",
      rewardReason: m.tournamentReward?.reason ?? null,
    }));

    return NextResponse.json({ success: true, matches: mapped });
  } catch (error) {
    console.error("Match history fetch error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}