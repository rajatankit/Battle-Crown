import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

const CROWN_REWARD_TABLE = [
  { level: 1, crowns: 5 },
  { level: 5, crowns: 10 },
  { level: 10, crowns: 25 },
  { level: 15, crowns: 20 },
  { level: 20, crowns: 50 },
  { level: 25, crowns: 30 },
  { level: 30, crowns: 40 },
  { level: 35, crowns: 50 },
  { level: 40, crowns: 100 },
  { level: 45, crowns: 80 },
  { level: 50, crowns: 200 },
];

export async function POST(req) {
  try {
    const { email, level } = await req.json();

    if (!email || !level) {
      return NextResponse.json(
        { success: false, message: "Email and level are required." },
        { status: 400 }
      );
    }

    const currentLevel = Number(level);

    if (!Number.isInteger(currentLevel) || currentLevel < 1) {
      return NextResponse.json(
        { success: false, message: "Invalid level." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        crowns: true,
        claimedLevelRewards: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found." },
        { status: 404 }
      );
    }

    const claimedLevels = user.claimedLevelRewards || [];

    const rewardsToClaim = CROWN_REWARD_TABLE.filter(
      (reward) =>
        reward.level <= currentLevel &&
        !claimedLevels.includes(reward.level)
    );

    if (rewardsToClaim.length === 0) {
      return NextResponse.json({
        success: true,
        alreadyClaimed: true,
        crowns: user.crowns,
        claimedLevelRewards: claimedLevels,
      });
    }

    const totalReward = rewardsToClaim.reduce(
      (total, reward) => total + reward.crowns,
      0
    );

    const levelsToMark = rewardsToClaim.map((reward) => reward.level);

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        crowns: {
          increment: totalReward,
        },
        claimedLevelRewards: {
          push: levelsToMark,
        },
      },
      select: {
        crowns: true,
        claimedLevelRewards: true,
      },
    });

    return NextResponse.json({
      success: true,
      alreadyClaimed: false,
      reward: totalReward,
      levelsRewarded: levelsToMark,
      crowns: updatedUser.crowns,
      claimedLevelRewards: updatedUser.claimedLevelRewards,
    });
  } catch (error) {
    console.error("Add crowns error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to process crown reward.",
      },
      { status: 500 }
    );
  }
}