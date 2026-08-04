import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

    const updatedUser = await prisma.user.update({
      where: { email: email },
      data: {
        winningsWallet: user.winningsWallet - amount,
      },
    });

    // withdrawal request create 
    const withdrawalRequest = await prisma.withdrawalRequest.create({
      data: {
        userId: user.id,
        amount: amount,
        upiId: user.upiId || body.upiId || "",
        status: "Pending",
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Withdrawal request submitted successfully",
        winningsWallet: updatedUser.winningsWallet,
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