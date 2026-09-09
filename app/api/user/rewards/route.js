import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ success: false, message: "email required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const rewards = await prisma.tournamentReward.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        tournament: {
          select: { title: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      rewards,
    });
  } catch (error) {
    console.error("Rewards error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}