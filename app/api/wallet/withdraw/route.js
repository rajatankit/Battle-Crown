import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { adminAuth } from "../../../lib/firebase-admin";
import { MIN_WITHDRAW_AMOUNT } from "../../../lib/walletConfig";

export async function GET(request) {
  try {
    const adminKey = request.headers.get("x-admin-key");
    if (adminKey !== process.env.ADMIN_SECRET_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const requests = await prisma.withdrawalRequest.findMany({
      where: { status: "Pending" },
      include: { user: true, tournamentReward: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, requests });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!idToken) {
      return NextResponse.json({ success: false, error: "Missing auth token" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(idToken);
    } catch (err) {
      return NextResponse.json({ success: false, error: "Invalid or expired token" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { tournamentRewardId, upiId } = body;

    if (!tournamentRewardId || !upiId) {
      return NextResponse.json(
        { success: false, error: "tournamentRewardId aur upiId zaroori hai" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { uid: decoded.uid } });
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const reward = await prisma.tournamentReward.findUnique({
      where: { id: Number(tournamentRewardId) },
      include: { withdrawalRequest: true },
    });

    if (!reward || reward.userId !== user.id) {
      return NextResponse.json({ success: false, error: "Reward not found" }, { status: 404 });
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

    await prisma.user.update({ where: { id: user.id }, data: { upiId } });

    return NextResponse.json({
      success: true,
      message: "Withdrawal request submit ho gayi! Admin approval ka wait karo.",
      requestId: withdrawalRequest.id,
    });
  } catch (error) {
    console.error("Withdrawal request error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}