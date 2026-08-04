import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { calculateLevelFromMatches, sumProtectionPointsBetween } from "../../../../lib/levelConfig";

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// GET /api/cron/decay-xp
// Ye route roz ek baar chalna chahiye (Vercel Cron / any scheduler se).
// Jo bhi player 2 din se koi tournament join nahi kiya, uski 5 matches ki XP
// kat jaati hai. Agar isse uska level girta hai, to us level ke protection
// points bhi kat jaate hain.
export async function GET(req) {
  // Simple secret check taaki koi bhi random request se XP na kaat sake
  const secret = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET_KEY) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  const inactiveUsers = await prisma.user.findMany({
    where: {
      lastMatchAt: { lt: twoDaysAgo },
      matchesPlayed: { gt: 0 },
    },
  });

  let decayedCount = 0;

  for (const user of inactiveUsers) {
    const newMatchesPlayed = Math.max(0, user.matchesPlayed - 5);
    const newLevel = calculateLevelFromMatches(newMatchesPlayed);
    const protectionPointsLost =
      newLevel < user.level ? sumProtectionPointsBetween(newLevel, user.level) : 0;
    const newProtectionPoints = Math.max(0, user.protectionPoints - protectionPointsLost);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        matchesPlayed: newMatchesPlayed,
        level: newLevel,
        protectionPoints: newProtectionPoints,
        lastMatchAt: new Date(), // timer reset — agla decay 2 din baad hi check hoga
      },
    });

    decayedCount++;
  }

  return NextResponse.json({
    success: true,
    message: `${decayedCount} inactive player(s) ki XP decay ho gayi.`,
  });
}