import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Pehle user ko dhoondo
    const user = await prisma.user.findUnique({
      where: { email: email },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

  // Current crowns ko strictly integer mein convert karo
    const currentCrowns = parseInt(user.crowns || 0, 10);

    // Minimum 20 crowns requirement check
    if (currentCrowns < 20) {
      return NextResponse.json(
        { success: false, error: "You need at least 20 Crowns to redeem!" },
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Explicitly integer subtraction ensure karo
    const crownsToDeduct = 20;
    const depositMoneyToAdd = 10;
    const remainingCrowns = Number(currentCrowns) - Number(crownsToDeduct); // 1001 - 20 = 981

    // 3. Database update karo
    const updatedUser = await prisma.user.update({
      where: { email: email },
      data: {
        crowns: remainingCrowns,
        depositWallet: (user.depositWallet || 0) + depositMoneyToAdd,
      },
    });

    await prisma.walletTransaction.create({
      data: {
        userId: user.id,
        amount: depositMoneyToAdd,
        type: "Crown Redeem",
        description: `${crownsToDeduct} Crowns redeemed for ₹${depositMoneyToAdd}`,
      },
    });
    
    return NextResponse.json(
      {
        success: true,
        message: "Crowns redeemed successfully!",
        crowns: updatedUser.crowns,
        depositWallet: updatedUser.depositWallet,
      },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("REDEEM API ERROR:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal Server Error" },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}