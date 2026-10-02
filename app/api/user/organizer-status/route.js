import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getVerifiedUid } from "@/app/lib/auth";

const FREE_PLAN = {
  name: "free",
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

    const plan = activeSub ? activeSub.plan : FREE_PLAN;

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const organizedThisMonth = await prisma.tournament.count({
      where: {
        createdByUserId: user.id,
        organizerType: "User",
        createdAt: { gte: monthStart, lt: monthEnd },
      },
    });

    const remaining =
      plan.monthlyTournamentLimit === -1
        ? "unlimited"
        : Math.max(0, plan.monthlyTournamentLimit - organizedThisMonth);

    const wallet = await prisma.crownWallet.findUnique({ where: { userId: user.id } });

    return NextResponse.json({
      success: true,
      plan: plan.name,
      canOrganizeViaSubscription: plan.monthlyTournamentLimit !== 0,
      canOrganizeViaCrowns: plan.crownOrganizeCost !== null,
      monthlyLimit: plan.monthlyTournamentLimit,
      organizedThisMonth,
      remainingThisMonth: remaining,
      crownOrganizeCost: plan.crownOrganizeCost,
      crownBalance: wallet?.balance || 0,
    });
  } catch (error) {
    console.error("GET organizer-status error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}