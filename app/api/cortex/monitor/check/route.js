import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { messaging } from "../../../lib/firebase-admin";

const OWNER_UID = process.env.PERSONAL_ASSISTANT_OWNER_UID || "";
const CRON_SECRET = process.env.CORTEX_CRON_SECRET || "";

const MEDIUM_AMOUNT = 3000;
const HIGH_AMOUNT = 10000;
const SUSPICIOUS_WITHDRAWAL_COUNT_24H = 3;

async function getOwnerFcmToken() {
  if (!OWNER_UID) return null;
  const owner = await prisma.user.findUnique({ where: { uid: OWNER_UID } });
  return owner?.fcmToken || null;
}

async function sendPush(token, title, body) {
  if (!token) return;
  try {
    await messaging.send({
      token,
      notification: { title, body },
    });
  } catch (err) {
    console.error("Push notification failed:", err instanceof Error ? err.message : err);
  }
}

function classifyAmount(amount) {
  if (amount >= HIGH_AMOUNT) return "high";
  if (amount >= MEDIUM_AMOUNT) return "medium";
  return "low";
}

export async function GET(request) {
  const providedSecret = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret");
  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    let state = await prisma.monitorState.findUnique({ where: { id: 1 } });
    if (!state) {
      state = await prisma.monitorState.create({
        data: { id: 1, lastCheckedAt: new Date(now.getTime() - 5 * 60 * 1000) },
      });
    }
    const since = state.lastCheckedAt;

    const ownerToken = await getOwnerFcmToken();
    const createdAlerts = [];

    // ---- 1. New deposits ----
    const deposits = await prisma.walletTransaction.findMany({
      where: { type: "Deposit", createdAt: { gt: since, lte: now } },
      include: { user: true },
    });
    for (const tx of deposits) {
      const severity = classifyAmount(Math.abs(tx.amount || 0));
      const title = `Deposit: ₹${tx.amount}`;
      const message = `${tx.user?.name || tx.user?.email || "User"} ne ₹${tx.amount} deposit kiya.`;
      const alert = await prisma.alert.create({
        data: { type: "deposit", severity, title, message, refId: String(tx.id) },
      });
      createdAlerts.push(alert);
    }

    // ---- 2. New withdrawal requests ----
    const withdrawals = await prisma.withdrawalRequest.findMany({
      where: { createdAt: { gt: since, lte: now } },
      include: { user: true },
    });
    for (const wr of withdrawals) {
      let severity = classifyAmount(wr.amount || 0);

      const recentCount = await prisma.withdrawalRequest.count({
        where: {
          userId: wr.userId,
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      });
      if (recentCount >= SUSPICIOUS_WITHDRAWAL_COUNT_24H) {
        severity = "high";
      }

      const title = `Withdrawal: ₹${wr.amount}`;
      const message =
        recentCount >= SUSPICIOUS_WITHDRAWAL_COUNT_24H
          ? `⚠️ ${wr.user?.name || wr.user?.email || "User"} ne 24h mein ${recentCount} withdrawal requests bheji hain (₹${wr.amount} latest). Check kar Boss.`
          : `${wr.user?.name || wr.user?.email || "User"} ne ₹${wr.amount} withdrawal maanga (UPI: ${wr.upiId}).`;

      const alert = await prisma.alert.create({
        data: { type: "withdrawal", severity, title, message, refId: String(wr.id) },
      });
      createdAlerts.push(alert);
    }

    // ---- 3. New user registrations ----
    const newUsers = await prisma.user.findMany({
      where: { createdAt: { gt: since, lte: now } },
    });
    for (const u of newUsers) {
      const alert = await prisma.alert.create({
        data: {
          type: "new_user",
          severity: "low",
          title: "New user registered",
          message: `${u.name || u.email} ne account banaya.`,
          refId: String(u.id),
        },
      });
      createdAlerts.push(alert);
    }

    // ---- 4. Tournament reminders (30 min before start) ----
    const soon = new Date(now.getTime() + 30 * 60 * 1000);
    const upcomingTournaments = await prisma.tournament.findMany({
      where: {
        reminderSent: false,
        startTime: { gt: now, lte: soon },
      },
    });
    for (const t of upcomingTournaments) {
      const alert = await prisma.alert.create({
        data: {
          type: "tournament",
          severity: "medium",
          title: `Tournament starting soon: ${t.title}`,
          message: `${t.title} (${t.game}) 30 min mein start hone wala hai.`,
          refId: String(t.id),
        },
      });
      await prisma.tournament.update({
        where: { id: t.id },
        data: { reminderSent: true },
      });
      createdAlerts.push(alert);
    }

    // ---- Send notifications for everything just created ----
    for (const alert of createdAlerts) {
      await sendPush(ownerToken, `[${alert.severity.toUpperCase()}] ${alert.title}`, alert.message);
      await prisma.alert.update({ where: { id: alert.id }, data: { notified: true } });
    }

    await prisma.monitorState.update({
      where: { id: 1 },
      data: { lastCheckedAt: now },
    });

    return NextResponse.json({
      success: true,
      checkedSince: since,
      checkedUntil: now,
      alertsCreated: createdAlerts.length,
    });
  } catch (err) {
    console.error("Monitor check failed:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Monitor check failed." },
      { status: 500 }
    );
  }
}