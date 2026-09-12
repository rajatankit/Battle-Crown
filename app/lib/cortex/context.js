import { prisma } from "../prisma";
import { extractOrdinalIndex } from "./numberNormalize";

export async function getCortexContext() {
  return prisma.cortexContext.findUnique({ where: { id: 1 } });
}

export async function setLastTournament({ pk, title, firestoreId }) {
  return prisma.cortexContext.upsert({
    where: { id: 1 },
    create: { id: 1, lastTournamentPk: pk, lastTournamentTitle: title, lastFirestoreId: firestoreId },
    update: { lastTournamentPk: pk, lastTournamentTitle: title, lastFirestoreId: firestoreId },
  });
}

export async function setLastPlayer({ id, name }) {
  return prisma.cortexContext.upsert({
    where: { id: 1 },
    create: { id: 1, lastPlayerId: id, lastPlayerName: name },
    update: { lastPlayerId: id, lastPlayerName: name },
  });
}

// NEW — stores the last list Cortex showed the user (tournaments, players,
// withdrawals, matches, alerts), so ordinal references ("dusra wala") can
// be resolved against it.
export async function setLastList(type, items) {
  const payload = { type, items, at: new Date().toISOString() };
  return prisma.cortexContext.upsert({
    where: { id: 1 },
    create: { id: 1, lastListJson: payload },
    update: { lastListJson: payload },
  });
}

const PRONOUN_REGEX = /\b(usko|isko|uske|iske|wahi|vahi|us tournament|is tournament|wo tournament|us player|is player|wo player)\b/i;

export function hasPronounReference(text) {
  return PRONOUN_REGEX.test(text);
}

export function resolvePronouns(text, context) {
  if (!context) return text;

  let resolved = text;

  if (context.lastTournamentTitle) {
    resolved = resolved.replace(
      /\b(usko|uske|wahi|vahi|us tournament|is tournament|wo tournament)\b/gi,
      `"${context.lastTournamentTitle}" tournament`
    );
  }

  if (context.lastPlayerName) {
    resolved = resolved.replace(
      /\b(us player|is player|wo player)\b/gi,
      `player "${context.lastPlayerName}"`
    );
  }

  return resolved;
}

// NEW — "dusra wala", "pehla wala", "last wala" style references.
const ORDINAL_REGEX = /\b(pehla|pehli|dusra|dusri|teesra|teesri|chautha|chauthi|paanchwa|paanchvi|first|second|third|fourth|fifth|last|aakhri|akhri|upar wala|neeche wala|sabse neeche)\s*(wala|waali)?\b/i;

export function hasOrdinalReference(text) {
  return ORDINAL_REGEX.test(text || "");
}

// Resolves "dusra wala" etc against the last list Cortex showed, replacing
// the ordinal phrase with the actual item's label so downstream parsing
// (LLM/SQL) gets an unambiguous name.
export function resolveOrdinalReference(text, context) {
  if (!context?.lastListJson) return { resolved: text, matched: null };

  const list = context.lastListJson;
  const items = Array.isArray(list.items) ? list.items : [];
  if (items.length === 0) return { resolved: text, matched: null };

  const idx = extractOrdinalIndex(text);
  if (idx === null) return { resolved: text, matched: null };

  const item = idx === "last" ? items[items.length - 1] : items[idx - 1];
  if (!item) return { resolved: text, matched: null };

  const resolved = text.replace(ORDINAL_REGEX, `"${item.label}"`);
  return { resolved, matched: item };
}

// Recent conversation for DB-analytics follow-ups (already added earlier).
export async function getRecentConversation(uid, { limit = 15, sinceMinutes = 45 } = {}) {
  const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
  const logs = await prisma.conversationLog.findMany({
    where: { userId: uid, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return logs.reverse();
}