import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const INACTIVE_DAYS_PER_POINT = 2;

// GET /api/user/protection-status?email=xxx
// protectionPoints is now a REAL stored counter (goes up on level-up,
// goes down over time via inactivity). This route lazily checks how
// much time has passed since the last decay and deducts points
// accordingly — no cron job needed.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ success: false, error: "email is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const decayReference = user.lastProtectionDecayAt || user.lastMatchAt || user.createdAt;
    const now = new Date();
    const daysSinceDecay = Math.floor(
      (now.getTime() - new Date(decayReference).getTime()) / (1000 * 60 * 60 * 24)
    );

    const pointsToDeduct = Math.floor(daysSinceDecay / INACTIVE_DAYS_PER_POINT);

    let currentPoints = user.protectionPoints;
    let updatedUser = user;

    if (pointsToDeduct > 0 && user.protectionPoints > 0) {
      const newPoints = Math.max(0, user.protectionPoints - pointsToDeduct);
      // Move the decay reference forward by exactly the periods we consumed,
      // so partial progress toward the next deduction isn't lost.
      const consumedMs = pointsToDeduct * INACTIVE_DAYS_PER_POINT * 24 * 60 * 60 * 1000;
      const newDecayRef = new Date(new Date(decayReference).getTime() + consumedMs);

      updatedUser = await prisma.user.update({
        where: { email },
        data: {
          protectionPoints: newPoints,
          lastProtectionDecayAt: newDecayRef,
        },
      });
      currentPoints = updatedUser.protectionPoints;
    }

    return NextResponse.json({
      success: true,
      protectionPoints: currentPoints,
      isProtectionActive: currentPoints > 0,
    });
  } catch (error) {
    console.error("Protection status error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}