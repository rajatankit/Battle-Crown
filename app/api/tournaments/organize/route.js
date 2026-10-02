import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getVerifiedUid } from "@/app/lib/auth";

const FREE_PLAN = {
  name: "free",
  monthlyTournamentLimit: 0,
  crownOrganizeCost: null,
};

export async function POST(req) {
  try {
    // 1. Auth
    const uid = await getVerifiedUid(req);
    if (!uid) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { uid } });
    if (!user) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    if (user.banned) {
      return NextResponse.json({ success: false, message: "Account is banned" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { path, title, game, map, mode, maxSlots, startTime } = body;

    if (!["subscription", "crowns"].includes(path)) {
      return NextResponse.json(
        { success: false, message: "path must be 'subscription' or 'crowns'" },
        { status: 400 }
      );
    }
    if (!title || !game) {
      return NextResponse.json(
        { success: false, message: "title and game are required" },
        { status: 400 }
      );
    }

    // 2. Resolve active plan — SERVER-SIDE, never trust the client
    const now = new Date();
    const activeSub = await prisma.userSubscription.findFirst({
      where: { userId: user.id, status: "active", expiresAt: { gt: now } },
      orderBy: { expiresAt: "desc" },
      include: { plan: true },
    });
    const plan = activeSub ? activeSub.plan : FREE_PLAN;

    if (plan.name === "free") {
      return NextResponse.json(
        { success: false, message: "Upgrade your plan to organize tournaments", redirectTo: "pricing" },
        { status: 403 }
      );
    }

    const tournamentData = {
      title,
      game,
      map: map || null,
      mode: mode || null,
      maxSlots: maxSlots || 100,
      startTime: startTime ? new Date(startTime) : null,
      status: "upcoming",
      organizerType: "User",
      createdByUserId: user.id,
      // Organizer-created tournaments don't carry a crown payout by
      // default — admin/organizer can edit these via the tournament
      // edit route afterwards if they want to fund kill/placement rewards.
      firstPrizeCrowns: 0,
      secondPrizeCrowns: 0,
      thirdPrizeCrowns: 0,
      killRewardCrowns: 0,
      joinRewardCrowns: 1,
    };

    // =========================
    // PATH 1 — SUBSCRIPTION LIMIT
    // =========================
    if (path === "subscription") {
      if (plan.monthlyTournamentLimit === 0) {
        return NextResponse.json(
          { success: false, message: `Your plan (${plan.name}) does not include tournament organizing` },
          { status: 403 }
        );
      }

      if (plan.monthlyTournamentLimit !== -1) {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const organizedThisMonth = await prisma.tournament.count({
          where: {
            createdByUserId: user.id,
            organizerType: "User",
            createdAt: { gte: monthStart, lt: monthEnd },
          },
        });

        if (organizedThisMonth >= plan.monthlyTournamentLimit) {
          return NextResponse.json(
            {
              success: false,
              message: `Monthly organize limit reached (${organizedThisMonth}/${plan.monthlyTournamentLimit})`,
            },
            { status: 403 }
          );
        }
      }

      const tournament = await prisma.tournament.create({ data: tournamentData });

      return NextResponse.json({
        success: true,
        message: "Tournament created via subscription",
        tournament,
      });
    }

    // =========================
    // PATH 2 — CROWN SPEND (atomic)
    // =========================
    if (plan.crownOrganizeCost === null) {
      return NextResponse.json(
        { success: false, message: `Crown-organize is not available on your plan (${plan.name})` },
        { status: 403 }
      );
    }

    const cost = plan.crownOrganizeCost;

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.crownWallet.findUnique({ where: { userId: user.id } });
      const balance = wallet?.balance || 0;

      if (balance < cost) {
        throw new Error("INSUFFICIENT_CROWNS");
      }

      const tournament = await tx.tournament.create({ data: tournamentData });

      await tx.crownTransaction.create({
        data: {
          walletId: wallet.id,
          amount: -cost,
          type: "spent_organize_tournament",
          reason: `Organize: ${title}`,
          tournamentId: tournament.id,
        },
      });

      const updatedWallet = await tx.crownWallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: cost } },
      });

      return { tournament, balance: updatedWallet.balance };
    });

    return NextResponse.json({
      success: true,
      message: `Tournament created! -${cost} crowns`,
      tournament: result.tournament,
      crownBalance: result.balance,
    });
  } catch (error) {
    if (error.message === "INSUFFICIENT_CROWNS") {
      return NextResponse.json(
        { success: false, message: "Not enough crowns to organize a tournament" },
        { status: 400 }
      );
    }
    console.error("Organize tournament error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}