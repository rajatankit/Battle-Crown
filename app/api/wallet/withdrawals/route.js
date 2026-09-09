import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { MIN_WITHDRAW_AMOUNT } from "../../../lib/walletConfig";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, tournamentRewardId, upiId } = body;

    if (!email || !tournamentRewardId || !upiId) {
      return NextResponse.json(
        { success: false, error: "email, tournamentRewardId aur upiId zaroori hai" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const reward = await prisma.tournamentReward.findUnique({
      where: { id: Number(tournamentRewardId) },
      include: { withdrawalRequest: true },
    });

    if (!reward || reward.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: "Reward not found" },
        { status: 404 }
      );
    }

    if (reward.status !== "PENDING_PAYOUT") {
      return NextResponse.json(
        { success: false, error: `Ye reward already ${reward.status.toLowerCase()} hai` },
        { status: 400 }
      );
    }

    if (reward.withdrawalRequest) {
      return NextResponse.json(
        { success: false, error: "Iss reward ke liye pehle se withdrawal request hai" },
        { status: 400 }
      );
    }

    if (reward.amount < MIN_WITHDRAW_AMOUNT) {
      return NextResponse.json(
        { success: false, error: `Minimum withdrawal amount ₹${MIN_WITHDRAW_AMOUNT} hai` },
        { status: 400 }
      );
    }

    const withdrawalRequest = await prisma.withdrawalRequest.create({
      data: {
        userId: user.id,
        tournamentRewardId: reward.id,
        amount: reward.amount,
        upiId,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { upiId },
    });

    return NextResponse.json({
      success: true,
      message: "Withdrawal request submit ho gayi! Admin approval ka wait karo.",
      requestId: withdrawalRequest.id,
    });
  } catch (error) {
    console.error("Withdrawal request error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}