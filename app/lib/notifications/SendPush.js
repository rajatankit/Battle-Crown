import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "../prisma";

export async function sendPushToUsers(userIds, title, body, data = {}) {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, fcmToken: { not: null } },
    select: { fcmToken: true },
  });

  const tokens = users.map((u) => u.fcmToken).filter(Boolean);
  if (tokens.length === 0) return;

  try {
    await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data,
    });
  } catch (err) {
    console.error("Push send failed:", err.message);
  }
}