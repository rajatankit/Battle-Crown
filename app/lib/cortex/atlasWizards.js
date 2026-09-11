import { prisma } from "../prisma";

export async function getAtlasDraft() {
  return prisma.atlasDraft.findUnique({ where: { id: 1 } });
}

export async function startAtlasDraft(request) {
  return prisma.atlasDraft.upsert({
    where: { id: 1 },
    create: { id: 1, active: true, stage: "options", request },
    update: {
      active: true,
      stage: "options",
      request,
      path: null,
      optionsJson: null,
      selectedOption: null,
      generatedCode: null,
    },
  });
}

export async function updateAtlasDraft(fields) {
  return prisma.atlasDraft.update({ where: { id: 1 }, data: fields });
}

export async function resetAtlasDraft() {
  return prisma.atlasDraft.upsert({
    where: { id: 1 },
    create: { id: 1, active: false, stage: "idle" },
    update: {
      active: false,
      stage: "idle",
      request: null,
      path: null,
      optionsJson: null,
      selectedOption: null,
      generatedCode: null,
    },
  });
}

export function isAtlasFixIntent(command) {
  const t = command.toLowerCase();
  return /\b(bug|error|fix karo|implement karo|feature add karo|code likho|atlas se)\b/.test(t);
}

export function extractFilenameFromText(text) {
  const match = text.match(/\b[\w-]+\.(py|js|jsx|ts|tsx)\b/i);
  return match ? match[0] : null;
}

export function isCancelWordAtlas(text) {
  return /\b(cancel|ruk jao|chhodo|band karo)\b/.test(text.toLowerCase());
}

export function isAffirmativeAtlas(text) {
  return /\b(haan|han|ha|yes|confirm|kar do|commit karo)\b/.test(text.toLowerCase());
}

export function isNegativeAtlas(text) {
  return /\b(nahi|nako|no|cancel)\b/.test(text.toLowerCase());
}