import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { logCortexError } from "../../../lib/cortex/errorLogger";

const prisma = new PrismaClient();

export async function POST(req) {
  try {
    const { email, amount, order_id } = await req.json();

    if (!email || !amount) {
      return NextResponse.json({ success: false, message: "Email and amount are required" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { email },
        data: { depositWallet: { increment: Number(amount) } },
      });

      await tx.walletTransaction.create({
        data: {
          userId: updatedUser.id,
          amount: Number(amount),
          type: "Deposit",
          description: "Wallet Deposit via Cashfree",
        },
      });

      return updatedUser;
    });
    return NextResponse.json({
      success: true,
      depositWallet: result.depositWallet,
      message: "Deposit wallet updated successfully",
    });

  } catch (error) {
    console.error("Database Update Error:", error);
    await logCortexError("wallet/verify-deposit", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}