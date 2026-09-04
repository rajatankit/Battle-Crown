import { prisma } from "../prisma";

export const FIELD_ORDER = [
  "title",
  "game",
  "mode",
  "entryFee",
  "maxSlots",
  "startTime",
  "killReward",
  "firstPrize",
  "secondPrize",
  "thirdPrize",
];

const FIELD_QUESTIONS = {
  title: "Tournament ka title kya rakhein, Boss?",
  game: "Kaunsa game — BGMI ya Free Fire?",
  mode: "Mode kya hoga — Solo, Duo, ya Squad?",
  entryFee: "Entry fee kitni rakhein, Boss?",
  maxSlots: "Max kitne slots honge?",
  startTime: "Tournament kab start hoga? Date aur time bataiye, jaise '31 August 8 PM'.",
  killReward: "Per-kill reward kitna rakhein?",
  firstPrize: "First prize kitna hoga?",
  secondPrize: "Second prize kitna hoga?",
  thirdPrize: "Third prize kitna hoga?",
};

export function getFieldQuestion(field) {
  return FIELD_QUESTIONS[field] || `Boss, ${field} bataiye.`;
}

// --------------------------------------------------
// INTENT DETECTION
// --------------------------------------------------

export function isTournamentCreateIntent(text) {
  const t = String(text || "").toLowerCase();
  const hasTournamentWord = /tournament/.test(t);
  const hasCreateWord =
    /\bbana+\s*(do|de|ye|o)?\b|\bbnao\b|\bbanwao\b|create|\bnew\b|\bnaya\b|shuru kar/.test(
      t
    );
  return hasTournamentWord && hasCreateWord;
}

export function isAffirmative(text) {
  const t = String(text || "").toLowerCase().trim();
  return /^(haan|han|yes|ok|okay|theek hai|thik hai|confirm|bana do|kar do|proceed|sahi hai)/.test(
    t
  );
}

export function isNegative(text) {
  const t = String(text || "").toLowerCase().trim();
  return /^(nahi|nhi|no|cancel|mat|rehne do|band karo|stop)/.test(t);
}

export function isCancelWord(text) {
  const t = String(text || "").toLowerCase().trim();
  return /cancel|band karo|rehne do|stop karo|band kar do/.test(t);
}

// --------------------------------------------------
// FIELD PARSERS
// --------------------------------------------------

function parseTitle(raw) {
  const value = String(raw || "").trim();
  if (!value) return { ok: false, message: "Title samajh nahi aaya, dobara boliye." };
  return { ok: true, value: value.slice(0, 120) };
}

function parseGame(raw) {
  const t = String(raw || "").toLowerCase();
  if (/bgmi|pubg/.test(t)) return { ok: true, value: "BGMI" };
  if (/free\s*fire|\bff\b/.test(t)) return { ok: true, value: "Free Fire" };
  return {
    ok: false,
    message: "Boss, BGMI ya Free Fire mein se boliye kaunsa game hai.",
  };
}

function parseMode(raw) {
  const t = String(raw || "").toLowerCase();
  if (/solo/.test(t)) return { ok: true, value: "Solo" };
  if (/duo/.test(t)) return { ok: true, value: "Duo" };
  if (/squad/.test(t)) return { ok: true, value: "Squad" };
  return {
    ok: false,
    message: "Boss, Solo, Duo, ya Squad mein se boliye.",
  };
}

function parseNumber(raw, label) {
  const match = String(raw || "").match(/[\d.]+/);
  if (!match) {
    return { ok: false, message: `${label} samajh nahi aaya, sirf number boliye.` };
  }
  const num = parseFloat(match[0]);
  if (!Number.isFinite(num) || num < 0) {
    return { ok: false, message: `${label} ke liye valid number boliye.` };
  }
  return { ok: true, value: num };
}

function parseInteger(raw, label) {
  const match = String(raw || "").match(/\d+/);
  if (!match) {
    return { ok: false, message: `${label} samajh nahi aaya, sirf number boliye.` };
  }
  return { ok: true, value: parseInt(match[0], 10) };
}

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function parseDateTime(raw) {
  const t = String(raw || "").toLowerCase().trim();

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let day = now.getDate();

  let dateFound = false;

  if (/\btoday\b|\baaj\b/.test(t)) {
    dateFound = true;
  } else if (/\btomorrow\b|\bkal\b/.test(t)) {
    const tmr = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    year = tmr.getFullYear();
    month = tmr.getMonth() + 1;
    day = tmr.getDate();
    dateFound = true;
  } else {
    const dateMatch = t.match(
      /(\d{1,2})\s*(st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*/i
    );
    if (dateMatch) {
      day = parseInt(dateMatch[1], 10);
      month = MONTHS[dateMatch[3].toLowerCase()] || month;
      dateFound = true;
    } else {
      const numericDate = t.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
      if (numericDate) {
        day = parseInt(numericDate[1], 10);
        month = parseInt(numericDate[2], 10);
        if (numericDate[3]) {
          year = parseInt(numericDate[3], 10);
          if (year < 100) year += 2000;
        }
        dateFound = true;
      }
    }
  }

  let hour = null;
  let minute = 0;

  const timeMatch = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje)?/i);
  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10);
    minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;

    const isPM = /pm/.test(t) || (/shaam|sham|evening|night|raat/.test(t) && hour < 12);
    const isAM = /am/.test(t) || (/subah|morning/.test(t) && hour < 12);

    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
  }

  if (!dateFound || hour === null) {
    return {
      ok: false,
      message:
        "Date/time samajh nahi aaya Boss. Clearly boliye, jaise '31 August 8 PM' ya 'kal shaam 8 baje'.",
    };
  }

  const pad = (n) => String(n).padStart(2, "0");
  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+05:30`;
  const dateObj = new Date(iso);

  if (Number.isNaN(dateObj.getTime())) {
    return { ok: false, message: "Date/time samajh nahi aaya, dobara boliye." };
  }

  return { ok: true, value: dateObj };
}

export function parseFieldValue(field, rawText) {
  switch (field) {
    case "title":
      return parseTitle(rawText);
    case "game":
      return parseGame(rawText);
    case "mode":
      return parseMode(rawText);
    case "entryFee": {
      const parsed = parseNumber(rawText, "Entry fee");
      if (!parsed.ok) return parsed;
      return { ok: true, value: String(parsed.value) };
    }
    case "maxSlots":
      return parseInteger(rawText, "Max slots");
    case "startTime":
      return parseDateTime(rawText);
    case "killReward":
      return parseNumber(rawText, "Kill reward");
    case "firstPrize":
      return parseNumber(rawText, "First prize");
    case "secondPrize":
      return parseNumber(rawText, "Second prize");
    case "thirdPrize":
      return parseNumber(rawText, "Third prize");
    default:
      return { ok: false, message: "Unknown field." };
  }
}

// --------------------------------------------------
// DRAFT STATE (singleton row, id=1)
// --------------------------------------------------

export async function getDraft() {
  return prisma.tournamentDraft.findUnique({ where: { id: 1 } });
}

export async function startDraft() {
  return prisma.tournamentDraft.upsert({
    where: { id: 1 },
    update: {
      active: true,
      stage: "collecting",
      title: null,
      game: null,
      mode: null,
      entryFee: null,
      maxSlots: null,
      startTime: null,
      killReward: null,
      firstPrize: null,
      secondPrize: null,
      thirdPrize: null,
      duplicateTournamentId: null,
    },
    create: { id: 1, active: true, stage: "collecting" },
  });
}

export async function updateDraft(data) {
  return prisma.tournamentDraft.update({ where: { id: 1 }, data });
}

export async function resetDraft() {
  return prisma.tournamentDraft.upsert({
    where: { id: 1 },
    update: { active: false, stage: "collecting" },
    create: { id: 1, active: false },
  });
}

export function nextMissingField(draft) {
  for (const field of FIELD_ORDER) {
    if (draft[field] === null || draft[field] === undefined) {
      return field;
    }
  }
  return null;
}

export function buildSummary(draft) {
  const dateStr = draft.startTime
    ? new Date(draft.startTime).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : "N/A";

  return (
    `Title: ${draft.title}, Game: ${draft.game}, Mode: ${draft.mode}, ` +
    `Entry Fee: ${draft.entryFee}, Slots: ${draft.maxSlots}, Start: ${dateStr}, ` +
    `Kill Reward: ${draft.killReward}, Prizes: ${draft.firstPrize}/${draft.secondPrize}/${draft.thirdPrize}`
  );
}