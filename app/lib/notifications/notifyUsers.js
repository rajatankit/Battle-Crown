import { prisma } from "../prisma";
import { sendPushToUsers } from "../sendPush";

// Targeted: room details ya personal message — har user ki apni row
export async function notifyTargetedUsers({ userIds, title, message, type }) {
  if (!userIds || userIds.length === 0) return { count: 0 };

  await prisma.notification.createMany({
    data: userIds.map((id) => ({
      userId: String(id),
      title,
      message,
      type,
    })),
  });

  await sendPushToUsers(userIds, title, message, { type });
  return { count: userIds.length };
}

// Global: ek hi row (userId: null), readBy array se track hoga kisne padha
export async function notifyGlobal({ title, message }) {
  await prisma.notification.create({
    data: { userId: null, title, message, type: "global" },
  });

  const allUsers = await prisma.user.findMany({ select: { id: true } });
  await sendPushToUsers(allUsers.map((u) => u.id), title, message, { type: "global" });
  return { count: allUsers.length };
}