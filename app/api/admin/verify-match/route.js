import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { db } from "../../../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { logCortexError } from "../../../lib/cortex/errorLogger";

export async function POST(req) {
  try {
    // =========================================================
    // ADMIN AUTH
    // =========================================================

    const adminKey = req.headers.get("x-admin-key");

    if (!adminKey || adminKey !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    // =========================================================
    // REQUEST BODY
    // =========================================================

    const body = await req.json();

    const {
      matchId,
      kills,
      rank,
      action,
    } = body;

    if (!matchId || !action) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing matchId or action",
        },
        { status: 400 }
      );
    }

    const parsedMatchId = Number(matchId);

    if (!Number.isInteger(parsedMatchId) || parsedMatchId <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid matchId",
        },
        { status: 400 }
      );
    }

    // =========================================================
    // FIND MATCH
    // =========================================================

    const match = await prisma.matchHistory.findUnique({
      where: {
        id: parsedMatchId,
      },
      include: {
        user: true,
      },
    });

    if (!match) {
      return NextResponse.json(
        {
          success: false,
          error: "Match not found",
        },
        { status: 404 }
      );
    }

    // =========================================================
    // PREVENT DUPLICATE PROCESSING
    // =========================================================

    if (
      match.status === "Approved" ||
      match.status === "Rejected"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Match already ${match.status}`,
        },
        { status: 400 }
      );
    }

    // =========================================================
    // REJECT
    // =========================================================

    if (action === "REJECT") {
      const rejected = await prisma.matchHistory.updateMany({
        where: {
          id: parsedMatchId,
          status: {
            notIn: ["Approved", "Rejected"],
          },
        },
        data: {
          status: "Rejected",
        },
      });

      if (rejected.count === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Match was already processed.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Match rejected successfully",
      });
    }

    // =========================================================
    // VALIDATE ACTION
    // =========================================================

    if (action !== "APPROVE") {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid action",
        },
        { status: 400 }
      );
    }

    // =========================================================
    // GET TOURNAMENT FROM FIREBASE
    // =========================================================

    if (!match.tournamentId) {
      return NextResponse.json(
        {
          success: false,
          error: "Tournament ID missing from match.",
        },
        { status: 400 }
      );
    }

    const tournamentRef = doc(
      db,
      "tournaments",
      String(match.tournamentId)
    );

    const tournamentSnap = await getDoc(tournamentRef);

    if (!tournamentSnap.exists()) {
      return NextResponse.json(
        {
          success: false,
          error: "Tournament not found in Firebase.",
        },
        { status: 404 }
      );
    }

    const tournament = tournamentSnap.data();

    // =========================================================
    // GET JOINED COUNT
    // =========================================================

    const joinedCount = Number(
      tournament.joinedCount || 0
    );

    if (joinedCount <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Tournament has no joined players.",
        },
        { status: 400 }
      );
    }

    // =========================================================
    // ENTRY FEE
    // =========================================================

    const entryFee = Number(match.entryFee || 0);

    if (!Number.isFinite(entryFee) || entryFee <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid entry fee.",
        },
        { status: 400 }
      );
    }

    // =========================================================
    // TOTAL ENTRY COLLECTION
    // =========================================================

    const totalCollection =
      joinedCount * entryFee;

    // =========================================================
    // PRIZE STRUCTURE
    // =========================================================

    const firstPrize =
      totalCollection * 0.20;

    const secondPrize =
      totalCollection * 0.10;

    const thirdPrize =
      totalCollection * 0.05;

    // =========================================================
    // FINAL KILLS / RANK
    // =========================================================

    const finalKills = Math.max(
      0,
      Number(kills) || 0
    );

    const finalRank = Math.max(
      0,
      Number(rank) || 0
    );

    // =========================================================
    // RANK PRIZE
    // =========================================================

    let rankPrize = 0;

    if (finalRank === 1) {
      rankPrize = firstPrize;
    } else if (finalRank === 2) {
      rankPrize = secondPrize;
    } else if (finalRank === 3) {
      rankPrize = thirdPrize;
    }

    // =========================================================
    // PER KILL REWARD
    // =========================================================

    const killReward = Number(
      tournament.killReward ?? 5
    );

    const killPrize =
      finalKills * killReward;

    // =========================================================
    // TOTAL PRIZE
    // =========================================================

    const totalPrize =
      rankPrize + killPrize;

    const finalPrize =
      Math.round(totalPrize * 100) / 100;

    // =========================================================
    // APPROVE + WALLET TRANSACTION
    // =========================================================

    const result = await prisma.$transaction(
      async (tx) => {
        const updatedMatch =
          await tx.matchHistory.updateMany({
            where: {
              id: parsedMatchId,
              status: {
                notIn: ["Approved", "Rejected"],
              },
            },
            data: {
              status: "Approved",
              kills: finalKills,
              rank: finalRank,
              prizeWon: finalPrize,
            },
          });

        if (updatedMatch.count === 0) {
          throw new Error(
            "MATCH_ALREADY_PROCESSED"
          );
        }

        const updatedUser =
          await tx.user.update({
            where: {
              id: match.userId,
            },
            data: {
              winningsWallet: {
                increment: finalPrize,
              },

              lastMatchAt: new Date(),
            },
          });

        const walletTransaction =
          await tx.walletTransaction.create({
            data: {
              userId: match.userId,
              amount: finalPrize,
              type: "MATCH_WIN",
              description:
                `Tournament reward - ${match.tournamentName}`,
              matchId: match.id,
            },
          });

        return {
          updatedUser,
          walletTransaction,
        };
      }
    );

    // =========================================================
    // SUCCESS RESPONSE
    // =========================================================

    return NextResponse.json({
      success: true,

      message:
        `Approved! ₹${finalPrize} added to winnings wallet.`,

      matchId: match.id,

      joinedCount,

      entryFee,

      totalCollection,

      rank: finalRank,

      kills: finalKills,

      firstPrize:
        Math.round(firstPrize * 100) / 100,

      secondPrize:
        Math.round(secondPrize * 100) / 100,

      thirdPrize:
        Math.round(thirdPrize * 100) / 100,

      rankPrize:
        Math.round(rankPrize * 100) / 100,

      killReward,

      killPrize:
        Math.round(killPrize * 100) / 100,

      totalPrize: finalPrize,

      winningsWallet:
        result.updatedUser.winningsWallet,
    });

  } catch (error) {
    console.error(
      "VERIFY MATCH ERROR:",
      error
    );

    if (
      error.message ===
      "MATCH_ALREADY_PROCESSED"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Match was already processed.",
        },
        { status: 400 }
      );
    }

    await logCortexError("admin/verify-match", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error.message ||
          "Something went wrong.",
      },
      { status: 500 }
    );
  }
}