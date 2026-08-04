import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Level -> Crown reward map (bumper levels give bigger rewards)
const LEVEL_REWARDS = {
  1: 5,
  5: 10,
  10: 15,
  15: 20,
  20: 50,  // Bumper
  25: 30,
  30: 40,
  35: 50,
  40: 100, // Bumper
  45: 80,
  50: 200, // Bumper
};

// GET /api/user/level-rewards?email=xxx
// Called when the Level & Badges popup opens.
// Checks user's current level against LEVEL_REWARDS and grants
// crowns for any milestone reached but not yet claimed.
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

    const alreadyClaimed = user.claimedLevelRewards || [];
    const newlyUnlocked = [];
    let crownsToAdd = 0;

    for (const [levelStr, crownAmount] of Object.entries(LEVEL_REWARDS)) {
      const level = parseInt(levelStr);
      if (user.level >= level && !alreadyClaimed.includes(level)) {
        newlyUnlocked.push({ level, crownAmount });
        crownsToAdd += crownAmount;
      }
    }

    let updatedUser = user;

    if (newlyUnlocked.length > 0) {
      const newClaimedList = [
        ...alreadyClaimed,
        ...newlyUnlocked.map((r) => r.level),
      ];

      updatedUser = await prisma.user.update({
        where: { email },
        data: {
          crowns: { increment: crownsToAdd },
          claimedLevelRewards: newClaimedList,
        },
      });
    }

    return NextResponse.json({
      success: true,
      currentLevel: updatedUser.level,
      totalCrowns: updatedUser.crowns,
      newlyUnlocked, // e.g. [{level: 20, crownAmount: 50}] - show a popup for these
      levelRewardsMap: LEVEL_REWARDS,
      claimedLevelRewards: updatedUser.claimedLevelRewards,
    });
  } catch (error) {
    console.error("Level rewards check error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}