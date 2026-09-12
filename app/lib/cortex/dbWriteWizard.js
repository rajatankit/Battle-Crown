import { prisma } from "../prisma";

export async function getDbWriteDraft() {
  return prisma.dbWriteDraft.findUnique({ where: { id: 1 } });
}

export async function startDbWriteDraft(request, generatedSql) {
  return prisma.dbWriteDraft.upsert({
    where: { id: 1 },
    create: { id: 1, active: true, stage: "confirm1", request, generatedSql },
    update: { active: true, stage: "confirm1", request, generatedSql },
  });
}

export async function updateDbWriteDraft(fields) {
  return prisma.dbWriteDraft.update({ where: { id: 1 }, data: fields });
}

export async function resetDbWriteDraft() {
  return prisma.dbWriteDraft.upsert({
    where: { id: 1 },
    create: { id: 1, active: false, stage: "idle" },
    update: { active: false, stage: "idle", request: null, generatedSql: null },
  });
}

export function isDbWriteIntent(text) {
  const t = text.toLowerCase();
  const hasVerb = /\b(update karo|badal do|change karo|set karo|edit karo)\b/.test(t);
  const hasTarget = /\b(database|db|field|column|record|row)\b/.test(t);
  return hasVerb && hasTarget;
}

export function isAffirmativeWrite(text) {
  return /\b(haan|han|ha|yes|confirm)\b/.test(text.toLowerCase());
}

export function isNegativeWrite(text) {
  return /\b(nahi|nako|no|cancel)\b/.test(text.toLowerCase());
}

export function isStrongConfirmWrite(text) {
  return /\bhaan pakka update karo\b/i.test(text.trim());
}