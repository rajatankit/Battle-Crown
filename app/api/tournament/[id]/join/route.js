import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getVerifiedUid } from "@/app/lib/auth";
import { logCortexError } from "@/app/lib/cortex/errorLogger";

export async function POST(req, { params }) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const idParam = resolvedParams?.id;

    if (!idParam) {
      return NextResponse.json(
        { success: false, message: "Tournament ID is required" },
        { status: 400 }
      );
    }

    // 1. Auth
    const uid = await getVerifiedUid(req);
    if (!uid) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { ign, uid: gameUid } = body;

    // 2. User lookup
    const user = await prisma.user.findUnique({ where: { uid } });
    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    if (user.banned) {
      return NextResponse.json(
        { success: false, message: "Account is banned" },
        { status: 403 }
      );
    }

    // 3. Tournament resolve — numeric id YA firestoreId dono support
    let tournament = null;
    const numericId = parseInt(idParam, 10);

    if (!isNaN(numericId) && String(numericId) === String(idParam).trim()) {
      tournament = await prisma.tournament.findUnique({ where: { id: numericId } });
    }
    if (!tournament) {
      tournament = await prisma.tournament.findUnique({
        where: { firestoreId: String(idParam) },
      });
    }
    if (!tournament) {
      return NextResponse.json(
        { success: false, message: "Tournament not found" },
        { status: 404 }
      );
    }

    const tournamentId = tournament.id;

    // 4. Status & slots check
    if (tournament.status !== "upcoming") {
      return NextResponse.json(
        { success: false, message: "Registration closed" },
        { status: 400 }
      );
    }

    if (tournament.joinedCount >= tournament.maxSlots) {
      return NextResponse.json(
        { success: false, message: "Tournament is full" },
        { status: 400 }
      );
    }

    // 5. Already joined check
    const alreadyJoined = await prisma.matchHistory.findFirst({
      where: { userId: user.id, tournamentId },
    });

    if (alreadyJoined) {
      return NextResponse.json(
        { success: false, message: "Already joined this tournament" },
        { status: 400 }
      );
    }

    // 6. Optional game profile update (transaction ke bahar — faster)
    if (ign || gameUid) {
      const game = (tournament.game || "").toLowerCase();
      const isFreeFire = game.includes("free");
      await prisma.user.update({
        where: { id: user.id },
        data: isFreeFire
          ? { ffIgn: ign || user.ffIgn, ffUid: gameUid || user.ffUid }
          : { bgmiIgn: ign || user.bgmiIgn, bgmiUid: gameUid || user.bgmiUid },
      });
    }

    // 7. ATOMIC: join + crown bonus (timeout badhaya)
    const joinReward = tournament.joinRewardCrowns ?? 1;

    const result = await prisma.$transaction(
      async (tx) => {
        // Create match history
        const match = await tx.matchHistory.create({
          data: {
            userId: user.id,
            tournamentId,
            game: tournament.game,
            map: tournament.map,
            mode: tournament.mode,
            ign: ign || null,
            uid: gameUid || null,
            resultStatus: "UNVERIFIED",
          },
        });

        // Increment joined count
        const updatedTournament = await tx.tournament.update({
          where: { id: tournamentId },
          data: { joinedCount: { increment: 1 } },
        });

        let crownsEarned = 0;

        if (joinReward > 0) {
          // Ensure wallet exists
          const wallet = await tx.crownWallet.upsert({
            where: { userId: user.id },
            create: { userId: user.id, balance: 0 },
            update: {},
          });

          // Credit crowns
          await tx.crownWallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: joinReward } },
          });

          // Log transaction
          await tx.crownTransaction.create({
            data: {
              walletId: wallet.id,
              amount: joinReward,
              type: "earned_match",
              reason: "Join Bonus",
              tournamentId,
            },
          });

          // Log reward
          await tx.crownReward.create({
            data: {
              userId: user.id,
              tournamentId,
              matchHistoryId: match.id,
              amount: joinReward,
              reason: "Join Bonus",
            },
          });

          crownsEarned = joinReward;
        }

        return {
          match,
          tournament: updatedTournament,
          crownsEarned,
        };
      },
      {
        maxWait: 10000, // 10s wait to acquire
        timeout: 15000, // 15s to finish (pehle 5s tha → timeout aa raha tha)
      }
    );

    return NextResponse.json({
      success: true,
      message: `Joined! +${result.crownsEarned} crowns`,
      matchId: result.match.id,
      joinedCount: result.tournament.joinedCount,
      crownsEarned: result.crownsEarned,
    });
  } catch (error) {
    console.error("Join Tournament Error:", error);
    await logCortexError("tournaments/[id]/join", error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}