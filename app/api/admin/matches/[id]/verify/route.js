import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireAdmin } from "@/app/lib/auth";

export async function POST(req, { params }) {
  try {
    // ==========================================
    // 1. ADMIN AUTH (Firebase token + email allowlist,
    //    replaces the leaked x-admin-key header)
    // ==========================================

    const admin = await requireAdmin(req);
    if (!admin.ok) return admin.response;

    // ==========================================
    // 2. MATCH ID
    // ==========================================

    const resolvedParams = await Promise.resolve(params);
    const matchId = Number(resolvedParams.id);

    if (!Number.isInteger(matchId) || matchId <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid matchId" },
        { status: 400 }
      );
    }

    // ==========================================
    // 3. REQUEST BODY
    // ==========================================

    const body = await req.json();
    const { action, kills, placement } = body;

    if (!action) {
      return NextResponse.json(
        { success: false, error: "Missing action" },
        { status: 400 }
      );
    }

    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json(
        { success: false, error: "Invalid action" },
        { status: 400 }
      );
    }

    // ==========================================
    // 4. FETCH MATCH
    // ==========================================

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

    // ==========================================
    // 5. IDEMPOTENCY CHECK
    // ==========================================

    if (["VERIFIED", "REJECTED"].includes(existingMatch.resultStatus)) {
      return NextResponse.json(
        { success: false, error: `Match already ${existingMatch.resultStatus}` },
        { status: 409 }
      );
    }

    // ==========================================
    // 6. REJECT
    // ==========================================

    if (action === "REJECT") {
      const rejected = await prisma.matchHistory.updateMany({
        where: { id: matchId, resultStatus: { notIn: ["VERIFIED", "REJECTED"] } },
        data: { resultStatus: "REJECTED" },
      });

      if (rejected.count === 0) {
        return NextResponse.json(
          { success: false, error: "Match was already processed." },
          { status: 409 }
        );
      }

      return NextResponse.json({ success: true, message: "Match rejected successfully" });
    }

    // ==========================================
    // 7. APPROVE VALIDATION
    // ==========================================

    if (!existingMatch.tournamentId) {
      return NextResponse.json(
        { success: false, error: "Tournament ID missing from match." },
        { status: 400 }
      );
    }

    if (!existingMatch.userId) {
      return NextResponse.json(
        { success: false, error: "User ID missing from match." },
        { status: 400 }
      );
    }

    const finalKills = Math.max(0, Number(kills) || 0);
    const finalPlacement = Math.max(0, Number(placement) || 0);

    // ==========================================
    // 8. ATOMIC APPROVAL TRANSACTION
    // ==========================================

    const result = await prisma.$transaction(
      async (tx) => {
        const updated = await tx.matchHistory.updateMany({
          where: { id: matchId, resultStatus: { notIn: ["VERIFIED", "REJECTED"] } },
          data: { resultStatus: "VERIFIED", kills: finalKills, placement: finalPlacement },
        });

        if (updated.count === 0) {
          throw new Error("MATCH_ALREADY_PROCESSED");
        }

        const match = await tx.matchHistory.findUnique({
          where: { id: matchId },
          include: { tournament: true },
        });

        if (!match) throw new Error("MATCH_NOT_FOUND_AFTER_UPDATE");
        if (!match.tournament) throw new Error("TOURNAMENT_NOT_FOUND");

        const tournament = match.tournament;
        let totalCrowns = 0;
        const rewardRows = [];

        if (match.placement === 1 && Number(tournament.firstPrizeCrowns) > 0) {
          const amount = Number(tournament.firstPrizeCrowns);
          rewardRows.push({ amount, reason: "1st Place" });
          totalCrowns += amount;
        } else if (match.placement === 2 && Number(tournament.secondPrizeCrowns) > 0) {
          const amount = Number(tournament.secondPrizeCrowns);
          rewardRows.push({ amount, reason: "2nd Place" });
          totalCrowns += amount;
        } else if (match.placement === 3 && Number(tournament.thirdPrizeCrowns) > 0) {
          const amount = Number(tournament.thirdPrizeCrowns);
          rewardRows.push({ amount, reason: "3rd Place" });
          totalCrowns += amount;
        }

        const killReward = Number(tournament.killRewardCrowns) || 0;
        if (match.kills > 0 && killReward > 0) {
          const killCrowns = match.kills * killReward;
          rewardRows.push({ amount: killCrowns, reason: `Per Kill x${match.kills}` });
          totalCrowns += killCrowns;
        }

        let wallet = null;
        const crownRewards = [];

        if (totalCrowns > 0) {
          wallet = await tx.crownWallet.upsert({
            where: { userId: match.userId },
            create: { userId: match.userId, balance: 0 },
            update: {},
          });

          for (const row of rewardRows) {
            await tx.crownTransaction.create({
              data: {
                walletId: wallet.id,
                amount: row.amount,
                type: "earned_match",
                reason: row.reason,
                tournamentId: match.tournamentId,
              },
            });

            const reward = await tx.crownReward.create({
              data: {
                userId: match.userId,
                tournamentId: match.tournamentId,
                matchHistoryId: match.id,
                amount: row.amount,
                reason: row.reason,
              },
            });

            crownRewards.push(reward);
          }

          wallet = await tx.crownWallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: totalCrowns } },
          });
        }

        await tx.user.update({
          where: { id: match.userId },
          data: { matchesPlayed: { increment: 1 }, lastMatchAt: new Date() },
        });

        return { match, totalCrowns, crownRewards, walletBalance: wallet?.balance ?? null };
      },
      { maxWait: 10000, timeout: 30000 }
    );

    // ==========================================
    // 9. SUCCESS RESPONSE
    // ==========================================

    return NextResponse.json({
      success: true,
      message:
        result.totalCrowns > 0
          ? `Approved! +${result.totalCrowns} crowns credited.`
          : "Approved! No crown reward applicable for this result.",
      matchId: result.match.id,
      placement: result.match.placement,
      kills: result.match.kills,
      crownsAwarded: result.totalCrowns,
      crownRewards: result.crownRewards,
      walletBalance: result.walletBalance,
    });
  } catch (error) {
    console.error("VERIFY MATCH ERROR:", error);

    if (error?.message === "MATCH_ALREADY_PROCESSED") {
      return NextResponse.json(
        { success: false, error: "Match was already processed." },
        { status: 409 }
      );
    }
    if (error?.message === "MATCH_NOT_FOUND_AFTER_UPDATE") {
      return NextResponse.json(
        { success: false, error: "Match disappeared during verification." },
        { status: 404 }
      );
    }
    if (error?.message === "TOURNAMENT_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Tournament not found for this match." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: error?.message || "Something went wrong while verifying match." },
      { status: 500 }
    );
  }
}