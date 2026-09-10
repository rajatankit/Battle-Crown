import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma"; // apna path adjust karo

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json(
        { success: false, error: "email required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const matches = await prisma.matchHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        tournament: { select: { title: true, game: true, mode: true } },
        entryPayments: { take: 1, orderBy: { createdAt: "desc" } },
        tournamentReward: true,
      },
    });

    const mapped = matches.map((m) => {
      const payment = m.entryPayments?.[0];
      const reward = m.tournamentReward;

      return {
        id: m.id,
        dbMatchId: m.id,
        tournamentName: m.tournament?.title || "Tournament",
        gameType: m.game || m.tournament?.game || "-",
        entryFeePaid: payment?.amount ?? 0,
        paymentStatus: payment?.status ?? "UNKNOWN",
        resultStatus: m.resultStatus || "UNVERIFIED",
        rewardAmount: reward?.amount ?? 0,
        rewardStatus: reward?.status ?? "NO_REWARD",
        screenshotUrl: m.screenshotUrl,
      };
    });

    return NextResponse.json({ success: true, matches: mapped });
  } catch (error) {
    console.error("Match history error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}