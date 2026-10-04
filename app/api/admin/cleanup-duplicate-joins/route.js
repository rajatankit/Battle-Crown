// app/api/admin/cleanup-duplicate-joins/route.js
//
// ONE-TIME USE: removes duplicate match_histories rows (same user +
// same tournament, created while the duplicate-join check was
// disabled for testing), reverses the crown rewards those extra
// joins generated, and clears any FK references so the required
// @@unique([userId, tournamentId]) constraint can be applied via
// `npx prisma db push`.
//
// Runs entirely through the app's own Prisma connection — doesn't
// touch Neon's web SQL editor, so it isn't affected by its separate
// compute usage limit.
//
// DELETE THIS FILE after running it once.

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireAdmin } from "@/app/lib/auth";

export async function POST(req) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Find all matches tied to a tournament, oldest first per user+tournament
      const allMatches = await tx.matchHistory.findMany({
        where: { tournamentId: { not: null } },
        orderBy: { id: "asc" },
        select: { id: true, userId: true, tournamentId: true },
      });

      const seen = new Map(); // "userId-tournamentId" -> first match id kept
      const dupIds = [];

      for (const m of allMatches) {
        const key = `${m.userId}-${m.tournamentId}`;
        if (seen.has(key)) {
          dupIds.push(m.id);
        } else {
          seen.set(key, m.id);
        }
      }

      if (dupIds.length === 0) {
        return { duplicatesRemoved: 0, walletsAdjusted: 0 };
      }

      // 2. Sum crown_rewards tied to these duplicate matches, per user
      const dupRewards = await tx.crownReward.findMany({
        where: { matchHistoryId: { in: dupIds } },
        select: { userId: true, amount: true },
      });

      const perUserTotal = new Map();
      for (const r of dupRewards) {
        perUserTotal.set(r.userId, (perUserTotal.get(r.userId) || 0) + r.amount);
      }

      // 3. Reverse those crowns from each affected wallet
      for (const [userId, total] of perUserTotal.entries()) {
        await tx.crownWallet.updateMany({
          where: { userId },
          data: { balance: { decrement: total } },
        });
      }

      // 4. Remove dependent rows, then the duplicate matches themselves
      await tx.crownReward.deleteMany({ where: { matchHistoryId: { in: dupIds } } });
      await tx.entryPayment.updateMany({
        where: { matchId: { in: dupIds } },
        data: { matchId: null },
      });
      await tx.tournamentReward.deleteMany({ where: { matchHistoryId: { in: dupIds } } });
      await tx.matchHistory.deleteMany({ where: { id: { in: dupIds } } });

      return { duplicatesRemoved: dupIds.length, walletsAdjusted: perUserTotal.size };
    });

    return NextResponse.json({
      success: true,
      message: `Removed ${result.duplicatesRemoved} duplicate join(s), adjusted ${result.walletsAdjusted} wallet(s).`,
      ...result,
    });
  } catch (error) {
    console.error("cleanup-duplicate-joins error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Cleanup failed" },
      { status: 500 }
    );
  }
}