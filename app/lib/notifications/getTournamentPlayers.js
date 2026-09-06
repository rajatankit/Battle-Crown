import { prisma } from "../prisma";

export async function getJoinedUserIds(tournamentId) {
  const entries = await prisma.matchHistory.findMany({
    where: { tournamentId },
    select: { userId: true },
    distinct: ["userId"],
  });
  return entries.map((e) => e.userId);
}