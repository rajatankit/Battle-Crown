import { prisma } from "../prisma";

// Levenshtein distance — small bounded inputs (titles/names), O(n*m) is fine.
function levenshtein(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - dist / maxLen;
}

// Finds a tournament by title tolerating typos/STT errors ("Fire Strom" ->
// "Fire Storm"). Tries exact contains-match first (fast); falls back to
// in-memory fuzzy comparison only if that fails.
export async function findTournamentByTitleFuzzy(title, { statusIn } = {}) {
  if (!title || !title.trim()) return null;

  const exact = await prisma.tournament.findFirst({
    where: {
      title: { contains: title, mode: "insensitive" },
      ...(statusIn ? { status: { in: statusIn } } : {}),
    },
  });
  if (exact) return exact;

  const candidates = await prisma.tournament.findMany({
    where: statusIn ? { status: { in: statusIn } } : undefined,
    take: 200,
  });

  let best = null;
  let bestScore = 0;
  for (const t of candidates) {
    const score = similarity(title, t.title);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  // Require a high match so an unrelated tournament never gets picked silently.
  return bestScore >= 0.6 ? best : null;
}

export async function findUserByIdentifierFuzzy(identifier) {
  if (!identifier || !identifier.trim()) return null;

  const exact = await prisma.user.findFirst({
    where: {
      OR: [
        { name: { contains: identifier, mode: "insensitive" } },
        { uid: identifier },
        { bgmiIgn: { contains: identifier, mode: "insensitive" } },
        { ffIgn: { contains: identifier, mode: "insensitive" } },
        { email: { contains: identifier, mode: "insensitive" } },
      ],
    },
  });
  if (exact) return exact;

  const candidates = await prisma.user.findMany({ take: 300 });
  let best = null;
  let bestScore = 0;
  for (const u of candidates) {
    for (const field of [u.name, u.bgmiIgn, u.ffIgn]) {
      if (!field) continue;
      const score = similarity(identifier, field);
      if (score > bestScore) {
        bestScore = score;
        best = u;
      }
    }
  }
  return bestScore >= 0.65 ? best : null;
}