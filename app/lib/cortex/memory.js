import { prisma } from "../prisma";

const MAX_MEMORIES_IN_CONTEXT = 40;

export async function getMemories() {
  const memories = await prisma.cortexMemory.findMany({
    orderBy: { createdAt: "desc" },
    take: MAX_MEMORIES_IN_CONTEXT,
  });
  return memories.map((m) => m.fact);
}

export async function saveMemory(fact) {
  const trimmed = String(fact || "").trim();
  if (!trimmed) return null;

  return prisma.cortexMemory.create({
    data: { fact: trimmed.slice(0, 500) },
  });
}