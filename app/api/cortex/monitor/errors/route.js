import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { messaging } from "../../../../lib/firebase-admin";

const OWNER_UID = process.env.PERSONAL_ASSISTANT_OWNER_UID || "";
const CRON_SECRET = process.env.CORTEX_CRON_SECRET || "";

async function getOwnerFcmToken() {
  if (!OWNER_UID) return null;
  const owner = await prisma.user.findUnique({ where: { uid: OWNER_UID } });
  return owner?.fcmToken || null;
}

async function sendPush(token, title, body) {
  if (!token) return;
  try {
    await messaging.send({ token, notification: { title, body } });
  } catch (err) {
    console.error("Push notification failed:", err instanceof Error ? err.message : err);
  }
}

export async function GET(request) {
  const providedSecret = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret");
  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const newErrors = await prisma.errorLog.findMany({
      where: { alerted: false },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    if (newErrors.length === 0) {
      return NextResponse.json({ success: true, alertsCreated: 0 });
    }

    const ownerToken = await getOwnerFcmToken();
    const createdAlerts = [];

    for (const errLog of newErrors) {
      const alert = await prisma.alert.create({
        data: {
          type: "error",
          severity: "high",
          title: `Server error: ${errLog.route}`,
          message: errLog.message.slice(0, 200),
          refId: String(errLog.id),
        },
      });
      createdAlerts.push(alert);

      await sendPush(ownerToken, `[ERROR] ${errLog.route}`, errLog.message.slice(0, 150));

      await prisma.alert.update({ where: { id: alert.id }, data: { notified: true } });
      await prisma.errorLog.update({ where: { id: errLog.id }, data: { alerted: true } });
    }

    return NextResponse.json({ success: true, alertsCreated: createdAlerts.length });
  } catch (err) {
    console.error("Error monitor failed:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error monitor failed." },
      { status: 500 }
    );
  }
}