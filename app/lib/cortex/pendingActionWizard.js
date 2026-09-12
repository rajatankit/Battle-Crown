import { prisma } from "../prisma";

const DRAFT_ID = 1;

// ============================================================
// STATE
// ============================================================

export async function getPendingDraft() {
  return prisma.pendingActionDraft.findUnique({ where: { id: DRAFT_ID } });
}

export async function startPendingDraft(kind, payload = {}, stage = "confirm1") {
  return prisma.pendingActionDraft.upsert({
    where: { id: DRAFT_ID },
    update: { active: true, kind, stage, payload },
    create: { id: DRAFT_ID, active: true, kind, stage, payload },
  });
}

export async function updatePendingDraft(fields) {
  return prisma.pendingActionDraft.update({
    where: { id: DRAFT_ID },
    data: fields,
  });
}

export async function resetPendingDraft() {
  return prisma.pendingActionDraft.upsert({
    where: { id: DRAFT_ID },
    update: { active: false, kind: null, stage: "confirm1", payload: null },
    create: { id: DRAFT_ID, active: false },
  });
}

// ============================================================
// GENERIC WORD DETECTION
// ============================================================

export function isCancelWordPending(text) {
  const t = String(text || "").toLowerCase().trim();
  return /^(cancel|rok do|band karo|nahi karna|stop)$/.test(t);
}

export function isAffirmativePending(text) {
  const t = String(text || "").toLowerCase().trim();
  return /^(haan|ha|yes|theek hai|ok|kar do|confirm)$/.test(t);
}

// ============================================================
// INTENT DETECTORS
//
// Deliberately broad keyword-combination checks (not exact
// phrases) — same style as the other wizards, since voice
// transcription rarely comes out grammatically clean.
// ============================================================

export function isBanIntent(text) {
  const t = String(text || "").toLowerCase();
  return (
    /\b(ban|suspend|block)\b/.test(t) &&
    /\b(player|user|uska|iska|isko|usko)\b/.test(t)
  );
}

export function isWalletAdjustIntent(text) {
  const t = String(text || "").toLowerCase();
  const mentionsWallet = /wallet|balance|paise|amount/.test(t);
  const mentionsAdjust =
    /adjust|add\s*kar|jod|ghata|deduct|credit|debit|manually|manual/.test(t);
  return mentionsWallet && mentionsAdjust;
}

export function isRescheduleIntent(text) {
  const t = String(text || "").toLowerCase();
  const mentionsTime =
    /reschedule|time\s*badal|date\s*badal|naya\s*time|naya\s*date|shift\s*kar|postpone/.test(
      t
    );
  const mentionsEvent = /tournament|match/.test(t);
  return mentionsTime && mentionsEvent;
}