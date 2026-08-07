import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { MIN_WITHDRAW_AMOUNT } from "../../../lib/walletConfig";

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function POST(req) {
  try {
    const body = await req.json();
    const { email, amount, upiId } = body;

    if (!email || !amount || !upiId) {
      return NextResponse.json(
        { success: false, error: "Email, amount aur UPI ID zaroori hai" },
        { status: 400 }
      );
    }

    const withdrawAmount = parseFloat(amount);

    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return NextResponse.json({ success: false, error: "Invalid amount" }, { status: 400 });
    }

    if (withdrawAmount < MIN_WITHDRAW_AMOUNT) {
      return NextResponse.json(
        { success: false, error: `Minimum withdrawal amount ₹${MIN_WITHDRAW_AMOUNT} hai` },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (user.winningsWallet < withdrawAmount) {
      return NextResponse.json(
        { success: false, error: "Insufficient winning wallet balance" },
        { status: 400 }
      );
    }

    // Ek time pe sirf ek hi pending request allow karo — clean rehta hai
    const existingPending = await prisma.withdrawalRequest.findFirst({
      where: { userId: user.id, status: "Pending" },
    });
    if (existingPending) {
      return NextResponse.json(
        {
          success: false,
          error: "Aapka pehle se ek withdrawal request pending hai. Uske process hone ka wait karo.",
        },
        { status: 400 }
      );
    }

    // Amount ko turant lock kar do (wallet se minus) + request create karo — dono ek saath (atomic)
    const [updatedUser, withdrawalRequest] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          winningsWallet: { decrement: withdrawAmount },
          upiId: upiId, // agli baar ke liye save kar lete hain
        },
      }),
      prisma.withdrawalRequest.create({
        data: {
          userId: user.id,
          amount: withdrawAmount,
          upiId: upiId,
          status: "Pending",
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Withdrawal request submit ho gayi! Admin approval ka wait karo.",
      winningsWallet: updatedUser.winningsWallet,
      requestId: withdrawalRequest.id,
    });
  } catch (error) {
    console.error("Withdrawal request error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}