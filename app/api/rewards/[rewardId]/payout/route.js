import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { logCortexError } from "../../../../lib/cortex/errorLogger";

const prisma = new PrismaClient();

export async function POST(req, { params }) {
  try {
    const resolvedParams = await Promise.resolve(params);
    const rewardId = parseInt(resolvedParams.rewardId);

    if (isNaN(rewardId)) {
      return NextResponse.json({ success: false, error: "Invalid reward ID" }, { status: 400 });
    }

    const body = await req.json();
    const { upiId, email } = body;

    if (!upiId || upiId.trim().length < 5) {
      return NextResponse.json(
        { success: false, error: "Valid UPI ID is required" },
        { status: 400 }
      );
    }

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }

    // User nikaalo
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    // Reward check
    const reward = await prisma.tournamentReward.findUnique({
      where: { id: rewardId },
    });

    if (!reward) {
      return NextResponse.json(
        { success: false, error: "Reward not found" },
        { status: 404 }
      );
    }

    if (reward.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 }
      );
    }

    if (reward.status !== "PENDING_PAYOUT") {
      return NextResponse.json(
        { success: false, error: "This reward is already processed" },
        { status: 400 }
      );
    }

    // Already withdrawal request check
    const existing = await prisma.withdrawalRequest.findUnique({
      where: { tournamentRewardId: rewardId },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: "Withdrawal already requested for this reward" },
        { status: 400 }
      );
    }

    // Create withdrawal request
    const withdrawal = await prisma.withdrawalRequest.create({
      data: {
        userId: user.id,
        tournamentRewardId: rewardId,
        amount: reward.amount,
        upiId: upiId.trim(),
        status: "Pending",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Withdrawal request submitted successfully",
      withdrawal,
    });
  } catch (error) {
    console.error("Payout error:", error);
    await logCortexError("rewards/payout", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}