import { prisma } from "../prisma";
import { messaging } from "../firebase-admin";

// Targeted personal notifications: userIds = Prisma User.id (Int, from matchHistory)
// Internally maps to Firebase uid, jo bell system expect karta hai.
export async function notifyTargetedUsers({ userIds, title, message }) {
  if (!userIds || userIds.length === 0) return { count: 0 };

  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, uid: { not: null } },
    select: { id: true, uid: true, fcmToken: true },
  });

  let count = 0;

  for (const user of users) {
    await prisma.notification.create({
      data: {
        type: "PERSONAL",
        userId: user.uid, // Firebase uid — isi se bell fetch karta hai
        title,
        message,
      },
    });
    count++;

    if (user.fcmToken) {
      try {
        await messaging.send({
          token: user.fcmToken,
          notification: { title, body: message },
          webpush: {
            notification: { title, body: message, icon: "/icon-192.png" },
            fcmOptions: { link: "/dashboard" },
          },
        });
      } catch (err) {
        console.error(`Push failed for user ${user.id}:`, err.message);
        if (
          err.code === "messaging/invalid-registration-token" ||
          err.code === "messaging/registration-token-not-registered"
        ) {
          await prisma.user.update({ where: { id: user.id }, data: { fcmToken: null } });
        }
      }
    }
  }

  return { count };
}

// Global broadcast — bell ke GLOBAL type se match karta hai
export async function notifyGlobal({ title, message }) {
  const globalNotification = await prisma.notification.create({
    data: { type: "GLOBAL", title, message },
  });

  const users = await prisma.user.findMany({
    where: { fcmToken: { not: null } },
    select: { id: true, fcmToken: true },
  });

  const tokenToUserId = new Map();
  for (const u of users) if (u.fcmToken) tokenToUserId.set(u.fcmToken, u.id);
  const uniqueTokens = [...tokenToUserId.keys()];

  let successCount = 0;
  const invalidTokens = [];

  if (uniqueTokens.length > 0) {
    const chunkSize = 500;
    for (let i = 0; i < uniqueTokens.length; i += chunkSize) {
      const chunk = uniqueTokens.slice(i, i + chunkSize);
      const response = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title, body: message },
        webpush: {
          notification: { title, body: message, icon: "/icon-192.png" },
          fcmOptions: { link: "/dashboard" },
        },
      });
      successCount += response.successCount;
      response.responses.forEach((res, idx) => {
        if (!res.success) {
          const code = res.error?.code || "";
          if (
            code === "messaging/invalid-registration-token" ||
            code === "messaging/registration-token-not-registered"
          ) {
            invalidTokens.push(chunk[idx]);
          }
        }
      });
    }

    if (invalidTokens.length > 0) {
      const ids = invalidTokens.map((t) => tokenToUserId.get(t)).filter(Boolean);
      await prisma.user.updateMany({ where: { id: { in: ids } }, data: { fcmToken: null } });
    }
  }

  return { count: uniqueTokens.length, notificationId: globalNotification.id };
}