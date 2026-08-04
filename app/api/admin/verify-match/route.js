import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";

export async function POST(req) {
  try {
    // Admin check — example agar tum session/cookie use karte ho
    const adminKey = req.headers.get("x-admin-key");
    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    // ... baaki code same

    const { matchId, kills, totalRoomEntryFee, rank, action } = body;

    // 1. Basic validation
    if (!matchId || !action) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (matchId or action)" },
        { status: 400 }
      );
    }

    const parsedMatchId = Number(matchId);
    if (isNaN(parsedMatchId)) {
      return NextResponse.json(
        { success: false, error: "Invalid matchId format" },
        { status: 400 }
      );
    }

    // 2. Match record find karo
    const match = await prisma.matchHistory.findUnique({
      where: { id: parsedMatchId },
    });

    if (!match) {
      return NextResponse.json(
        { success: false, error: "Match record not found" },
        { status: 404 }
      );
    }

    // Prevent duplicate payouts
    if (match.status === "Approved" || match.status === "Rejected") {
      return NextResponse.json(
        { success: false, error: `Match is already ${match.status.toLowerCase()}` },
        { status: 400 }
      );
    }

    // 3. REJECT ACTION
    if (action === "REJECT") {
      await prisma.matchHistory.update({
        where: { id: parsedMatchId },
        data: { status: "Rejected" },
      });
      return NextResponse.json({ success: true, message: "Match proof rejected successfully." });
    }

    // 4. APPROVE ACTION (Prize Pool & Per-Kill Calculation)
    if (action === "APPROVE") {
      const parsedKills = parseInt(kills) || 0;
      const roomFee = parseFloat(totalRoomEntryFee) || 0;
      const parsedRank = parseInt(rank) || 0;

      // Prize Pool Rules:
      // 1st Prize = 20% of total room entry fee
      // 2nd Prize = 10% of total room entry fee
      // 3rd Prize = 5% of total room entry fee
      let rankPercentage = 0;
      if (parsedRank === 1) rankPercentage = 0.20;
      else if (parsedRank === 2) rankPercentage = 0.10;
      else if (parsedRank === 3) rankPercentage = 0.05;

      const rankPrize = roomFee * rankPercentage;
      const killPrize = parsedKills * 5; // Fixed ₹5 per kill
      const totalPrizeWon = rankPrize + killPrize;

      // Database Transaction (Match Update + User Wallet Increment)
      await prisma.$transaction([
        prisma.matchHistory.update({
          where: { id: parsedMatchId },
          data: {
            status: "Approved",
            kills: parsedKills,
            prizeWon: totalPrizeWon,
          },
        }),
        prisma.user.update({
          where: { id: match.userId },
          data: {
            winningsWallet: {
              increment: totalPrizeWon,
            },
            lastMatchAt: new Date(),
          },
        }),
      ]);

      return NextResponse.json({ 
        success: true, 
        message: `Match approved! ₹${totalPrizeWon} added to user wallet (Rank: ₹${rankPrize}, Kills: ₹${killPrize}).` 
      });
    }

    return NextResponse.json({ success: false, error: "Invalid action type" }, { status: 400 });

  } catch (error) {
    console.error("Admin verification failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}