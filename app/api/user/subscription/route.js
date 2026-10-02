import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getVerifiedUid } from "@/app/lib/auth";

function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const FREE_PLAN = {
  name: "free",
  dailyAiQueryLimit: 5,
  monthlyTournamentLimit: 0,
  crownOrganizeCost: null,
};

export async function GET(req) {
  try {
    const uid = await getVerifiedUid(req);
    if (!uid) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { uid } });
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const now = new Date();

    const activeSub = await prisma.userSubscription.findFirst({
      where: { userId: user.id, status: "active", expiresAt: { gt: now } },
      orderBy: { expiresAt: "desc" },
      include: { plan: true },
    });

    // Today's AI usage count
    const usageLog = await prisma.aiUsageLog.findUnique({
      where: { userId_date: { userId: user.id, date: todayDateOnly() } },
    });

    // This calendar month's organize count (subscription path only)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const organizedThisMonth = await prisma.tournament.count({
      where: {
        createdByUserId: user.id,
        organizerType: "User",
        createdAt: { gte: monthStart, lt: monthEnd },
      },
    });

    const wallet = await prisma.crownWallet.findUnique({ where: { userId: user.id } });

    const plan = activeSub ? activeSub.plan : FREE_PLAN;

    return NextResponse.json({
      success: true,
      plan: {
        name: plan.name,
        billingCycle: activeSub?.billingCycle || null,
        expiresAt: activeSub?.expiresAt || null,
        status: activeSub ? "active" : "free",
      },
      usage: {
        aiQueriesToday: usageLog?.count || 0,
        aiQueryLimit: plan.dailyAiQueryLimit,
        organizedThisMonth,
        organizeLimit: plan.monthlyTournamentLimit,
      },
      crownOrganizeCost: plan.crownOrganizeCost,
      crownBalance: wallet?.balance || 0,
    });
  } catch (error) {
    console.error("GET user subscription error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}