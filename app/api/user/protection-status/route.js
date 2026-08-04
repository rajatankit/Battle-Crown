import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = global;
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

const MAX_PROTECTION_POINTS = 5;
const INACTIVE_DAYS_PER_POINT = 2;

// GET /api/user/protection-status?email=xxx
// Calculates protection points in real-time based on lastMatchAt.
// No cron job needed — it's always computed fresh from the current time.
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

    // Use lastMatchAt if available, otherwise fall back to account creation date
    const referenceDate = user.lastMatchAt || user.createdAt;
    const now = new Date();

    const daysSinceLastMatch = Math.floor(
      (now.getTime() - new Date(referenceDate).getTime()) / (1000 * 60 * 60 * 24)
    );

    const pointsUsed = Math.floor(daysSinceLastMatch / INACTIVE_DAYS_PER_POINT);
    const protectionPoints = Math.max(0, MAX_PROTECTION_POINTS - pointsUsed);

    return NextResponse.json({
      success: true,
      protectionPoints,
      maxProtectionPoints: MAX_PROTECTION_POINTS,
      daysSinceLastMatch,
      lastMatchAt: user.lastMatchAt,
      isProtectionActive: protectionPoints > 0,
    });
  } catch (error) {
    console.error("Protection status error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}