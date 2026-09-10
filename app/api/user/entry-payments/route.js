// app/api/user/entry-payments/route.js
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ success: false, message: "email required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const entries = await prisma.entryPayment.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        tournament: {
          select: { id: true, title: true, game: true, startTime: true },
        },
        match: {
          select: {
            id: true,
            resultStatus: true,
            screenshotUrl: true,
            placement: true,
            kills: true,
          },
        },
      },
    });

    const matchIds = entries.map((e) => e.match?.id).filter(Boolean);

    const rewards = matchIds.length
      ? await prisma.tournamentReward.findMany({
          where: { matchHistoryId: { in: matchIds } },
        })
      : [];

    const rewardMap = Object.fromEntries(rewards.map((r) => [r.matchHistoryId, r]));

    const history = entries.map((e) => {
      const reward = e.match ? rewardMap[e.match.id] : null;
      return {
        tournamentId: e.tournament.id,
        tournamentName: e.tournament.title,
        game: e.tournament.game,
        startTime: e.tournament.startTime,
        entryFeePaid: e.amount,
        paymentStatus: e.status,
        resultStatus: e.match?.resultStatus ?? "NOT_SUBMITTED",
        screenshotUrl: e.match?.screenshotUrl ?? null,
        matchId: e.match?.id ?? null,
        placement: e.match?.placement ?? null,
        kills: e.match?.kills ?? 0,
        rewardAmount: reward?.amount ?? 0,
        rewardStatus: reward ? reward.status : "NO_REWARD",
        rewardReason: reward?.reason ?? null,
      };
    });

    return NextResponse.json({ success: true, payments: history });
  } catch (error) {
    console.error("Tournament history fetch error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}