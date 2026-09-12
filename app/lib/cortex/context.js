import { prisma } from "../prisma";

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

const PRONOUN_REGEX = /\b(usko|isko|uske|iske|wahi|vahi|us tournament|is tournament|wo tournament|us player|is player|wo player)\b/i;

export function hasPronounReference(text) {
  return PRONOUN_REGEX.test(text);
}

// Replaces pronoun words with the actual last-known name, so the LLM
// (or SQL generator) gets an unambiguous command to work with.
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