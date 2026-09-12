export function isGrievanceIntent(text) {
  const t = String(text || "").toLowerCase();
  return /grievance|complaint|shikayat/.test(t);
}

export function isRevenueReportIntent(text) {
  const t = String(text || "").toLowerCase();
  const mentionsMoney = /revenue|kamai|earning|income/.test(t);
  const mentionsReport = /report|weekly|is hafte|hafte ka|is week|week ka/.test(t);
  return mentionsMoney && mentionsReport;
}

export function isPosterIntent(text) {
  const t = String(text || "").toLowerCase();
  const mentionsVisual = /poster|banner|image|photo|graphic/.test(t);
  const mentionsAction = /tournament|bana|generate|create|design/.test(t);
  return mentionsVisual && mentionsAction;
}