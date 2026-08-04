import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req) {
  try {
    const { email, amount, order_id } = await req.json();

    if (!email || !amount) {
      return NextResponse.json({ success: false, message: "Email and amount are required" }, { status: 400 });
    }

    // Prisma se user ka depositWallet update kar rahe hain
    const updatedUser = await prisma.user.update({
      where: { email: email },
      data: {
        depositWallet: {
          increment: Number(amount),
        },
      },
    });

    return NextResponse.json({
      success: true,
      depositWallet: updatedUser.depositWallet,
      message: "Deposit wallet updated successfully",
    });

  } catch (error) {
    console.error("Database Update Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}