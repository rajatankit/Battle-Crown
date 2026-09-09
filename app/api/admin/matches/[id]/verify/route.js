import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";

export async function POST(req, { params }) {
  try {
    // 1. Admin auth
    const adminKey = req.headers.get("x-admin-key");
    if (!adminKey || adminKey !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const matchId = Number(params.id);
    if (!Number.isInteger(matchId) || matchId <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid matchId" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { action, kills, placement } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, error: "Missing action" },
        { status: 400 }
      );
    }

    // 2. Match fetch karo
    const existingMatch = await prisma.matchHistory.findUnique({
      where: { id: matchId },
      include: { tournament: true },
    });

    if (!existingMatch) {
      return NextResponse.json(
        { success: false, error: "Match not found" },
        { status: 404 }
      );
    }

    if (["VERIFIED", "REJECTED"].includes(existingMatch.resultStatus)) {
      return NextResponse.json(
        { success: false, error: `Match already ${existingMatch.resultStatus}` },
        { status: 400 }
      );
    }

    // =========================
    // REJECT
    // =========================
    if (action === "REJECT") {
      const rejected = await prisma.matchHistory.updateMany({
        where: {
          id: matchId,
          resultStatus: { notIn: ["VERIFIED", "REJECTED"] },
        },
        data: { resultStatus: "REJECTED" },
      });

      if (rejected.count === 0) {
        return NextResponse.json(
          { success: false, error: "Match was already processed." },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Match rejected successfully",
      });
    }

    if (action !== "APPROVE") {
      return NextResponse.json(
        { success: false, error: "Invalid action" },
        { status: 400 }
      );
    }

    if (!existingMatch.tournamentId) {
      return NextResponse.json(
        { success: false, error: "Tournament ID missing from match." },
        { status: 400 }
      );
    }

    const finalKills = Math.max(0, Number(kills) || 0);
    const finalPlacement = Math.max(0, Number(placement) || 0);

    // =========================
    // APPROVE + REWARD (transaction)
    // =========================
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.matchHistory.updateMany({
        where: {
          id: matchId,
          resultStatus: { notIn: ["VERIFIED", "REJECTED"] },
        },
        data: {
          resultStatus: "VERIFIED",
          kills: finalKills,
          placement: finalPlacement,
        },
      });

      if (updated.count === 0) {
        throw new Error("MATCH_ALREADY_PROCESSED");
      }

      const match = await tx.matchHistory.findUnique({
        where: { id: matchId },
        include: { tournament: true },
      });

      // Prize calculation
      let amount = 0;
      let reason = "";

      if (match.placement === 1) {
        amount = match.tournament.firstPrize || 0;
        reason = "1st Place";
      } else if (match.placement === 2) {
        amount = match.tournament.secondPrize || 0;
        reason = "2nd Place";
      } else if (match.placement === 3) {
        amount = match.tournament.thirdPrize || 0;
        reason = "3rd Place";
      }

      if (match.kills > 0 && match.tournament.killReward) {
        amount += match.kills * match.tournament.killReward;
        reason += reason
          ? ` + Per Kill x${match.kills}`
          : `Per Kill x${match.kills}`;
      }

      amount = Math.round(amount * 100) / 100;

      let reward = null;

      if (amount > 0) {
        reward = await tx.tournamentReward.create({
          data: {
            userId: match.userId,
            tournamentId: match.tournamentId,
            matchHistoryId: match.id,
            amount,
            reason,
            status: "PENDING_PAYOUT",
            verifiedByAdminId: adminKey,
            verifiedAt: new Date(),
          },
        });
      }

      await tx.user.update({
        where: { id: match.userId },
        data: {
          matchesPlayed: { increment: 1 },
          lastMatchAt: new Date(),
        },
      });

      return { match, reward };
    });

    return NextResponse.json({
      success: true,
      message: result.reward
        ? `Approved! ₹${result.reward.amount} reward created (pending payout).`
        : "Approved! No reward applicable for this result.",
      matchId: result.match.id,
      placement: result.match.placement,
      kills: result.match.kills,
      reward: result.reward,
    });
  } catch (error) {
    console.error("VERIFY MATCH ERROR:", error);

    if (error.message === "MATCH_ALREADY_PROCESSED") {
      return NextResponse.json(
        { success: false, error: "Match was already processed." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: error.message || "Something went wrong." },
      { status: 500 }
    );
  }
}