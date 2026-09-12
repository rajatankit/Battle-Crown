import { prisma } from "../prisma";

const DRAFT_ID = 1;

// ============================================================
// STATE
// ============================================================

export async function getNotifyDraft() {
  return prisma.notificationDraft.findUnique({ where: { id: DRAFT_ID } });
}

export async function startNotifyDraft(tournamentTitle) {
  return prisma.notificationDraft.upsert({
    where: { id: DRAFT_ID },
    update: {
      active: true,
      stage: "await_room_id",
      tournamentTitle,
      roomId: null,
      roomPassword: null,
    },
    create: {
      id: DRAFT_ID,
      active: true,
      stage: "await_room_id",
      tournamentTitle,
    },
  });
}

export async function updateNotifyDraft(fields) {
  return prisma.notificationDraft.update({
    where: { id: DRAFT_ID },
    data: fields,
  });
}

export async function resetNotifyDraft() {
  return prisma.notificationDraft.upsert({
    where: { id: DRAFT_ID },
    update: {
      active: false,
      stage: "await_room_id",
      tournamentTitle: null,
      roomId: null,
      roomPassword: null,
    },
    create: { id: DRAFT_ID, active: false },
  });
}

// ============================================================
// INTENT / WORD DETECTION
// ============================================================

// Deliberately broad — broken/scrambled Hinglish voice commands are
// the norm here (see the "kitne player join kiya" screenshots), so
// this checks for the combination of concepts rather than an exact
// phrase.
export function isNotifyJoinersIntent(text) {
  const t = String(text || "").toLowerCase();

  const mentionsRoomCreds = /room\s*id|room\s*password|password/.test(t);
  const mentionsJoiners =
    /join(ed)?|joiner|players?\s*ne\s*join|jitne.*join|sabko|sab\s*ko/.test(t);
  const mentionsSend =
    /bhej|send|notify|notification/.test(t);

  return mentionsRoomCreds && mentionsJoiners && mentionsSend;
}

export function isCancelWordNotify(text) {
  const t = String(text || "").toLowerCase().trim();
  return /^(cancel|rok do|band karo|nahi karna|stop)$/.test(t);
}