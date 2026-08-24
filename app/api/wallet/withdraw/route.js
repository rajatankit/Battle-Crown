import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request) {
  try {
    const adminKey = request.headers.get("x-admin-key");

    if (adminKey !== process.env.NEXT_PUBLIC_ADMIN_SECRET_KEY) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const requests = await prisma.withdrawalRequest.findMany({
      where: {
        status: "Pending",
      },
      include: {
        user: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      requests,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email, amount } = body;

    if (!email || !amount) {
      return NextResponse.json(
        { success: false, error: "Email and amount are required" },
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: email },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if ((user.winningsWallet || 0) < amount) {
      return NextResponse.json(
        { success: false, error: "Insufficient winning balance!" },
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

   const result = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { email: email },
        data: {
          winningsWallet: user.winningsWallet - amount,
        },
      });

      await tx.walletTransaction.create({
        data: {
          userId: user.id,
          amount: -Number(amount),
          type: "Withdrawal",
          description: "Winnings Withdrawal - Pending Verification",
        },
      });

      const withdrawalRequest = await tx.withdrawalRequest.create({
        data: {
          userId: user.id,
          amount: amount,
          upiId: user.upiId || body.upiId || "",
          status: "Pending",
        },
      });

      return { updatedUser, withdrawalRequest };
    });

    return NextResponse.json(
      {
        success: true,
        message: "Withdrawal request submitted successfully",
        winningsWallet: result.updatedUser.winningsWallet,
      },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("WITHDRAW API ERROR:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}