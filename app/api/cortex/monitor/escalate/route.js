import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { messaging } from "../../../../lib/firebase-admin";

const OWNER_UID = process.env.PERSONAL_ASSISTANT_OWNER_UID || "";
const CRON_SECRET = process.env.CORTEX_CRON_SECRET || "";
const MAX_ESCALATIONS = 6; // ~15 min agar har 2-3 min chale

async function getOwnerFcmToken() {
  if (!OWNER_UID) return null;
  const owner = await prisma.user.findUnique({ where: { uid: OWNER_UID } });
  return owner?.fcmToken || null;
}

export async function GET(request) {
  const providedSecret = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret");
  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pending = await prisma.alert.findMany({
      where: {
        severity: "high",
        acknowledged: false,
        escalations: { lt: MAX_ESCALATIONS },
      },
    });

    if (pending.length === 0) {
      return NextResponse.json({ success: true, escalated: 0 });
    }

    const ownerToken = await getOwnerFcmToken();
    let escalated = 0;

    for (const alert of pending) {
      if (!ownerToken) continue;

      try {
        await messaging.send({
          token: ownerToken,
          notification: {
            title: `🚨 URGENT: ${alert.title}`,
            body: alert.message,
          },
          data: {
            severity: "high",
            alertId: String(alert.id),
            link: "/personal",
          },
        });

        await prisma.alert.update({
          where: { id: alert.id },
          data: { escalations: { increment: 1 } },
        });

        escalated++;
      } catch (err) {
        console.error("Escalation push failed:", err instanceof Error ? err.message : err);
      }
    }

    return NextResponse.json({ success: true, escalated });
  } catch (err) {
    console.error("Escalation check failed:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Escalation failed." },
      { status: 500 }
    );
  }
}