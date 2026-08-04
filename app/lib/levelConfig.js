// ============================================================
// LEVEL / XP SYSTEM — single source of truth
// ------------------------------------------------------------
// Imported by BOTH the backend API routes (Prisma) and the
// dashboard UI (Firestore/display), so a player's level can
// never drift between what the database says and what the
// screen shows.
//
// Only one data point was confirmed: going from level 5 -> 6
// takes 15 matches. Everything else follows the same pattern
// (harder every 5-level bracket). If you get more confirmed
// numbers, only getMatchesRequiredForLevel needs to change —
// every other function derives from it automatically.
// ============================================================

export const MAX_PLAYER_LEVEL = 50;

// Matches needed to go from (targetLevel - 1) to targetLevel.
export function getMatchesRequiredForLevel(targetLevel) {
  if (targetLevel <= 1) return 0;
  const bracket = Math.ceil(targetLevel / 5); // levels 2-5 => bracket1, 6-10 => bracket2 ...
  return 5 * (bracket + 1); // bracket1:10, bracket2:15 (confirmed anchor), bracket3:20 ...
}

// Cumulative lifetime matches needed to REACH a given level.
export function getTotalMatchesForLevel(targetLevel) {
  let total = 0;
  for (let lvl = 2; lvl <= targetLevel; lvl++) total += getMatchesRequiredForLevel(lvl);
  return total;
}

// Given a lifetime match count, what level the player should be at.
export function calculateLevelFromMatches(totalMatches, maxLevel = MAX_PLAYER_LEVEL) {
  let level = 1;
  for (let lvl = 2; lvl <= maxLevel; lvl++) {
    if (totalMatches >= getTotalMatchesForLevel(lvl)) level = lvl;
    else break;
  }
  return level;
}

// Protection points awarded for reaching a given level.
// Pattern: +1 point every 5-level bracket, starting at 2.
export function getProtectionPointsForLevel(level) {
  const bracket = Math.ceil(level / 5);
  return bracket + 1;
}

// Sum of protection points earned crossing from lowLevel (exclusive)
// to highLevel (inclusive) — used when a single action jumps several levels.
export function sumProtectionPointsBetween(lowLevel, highLevel) {
  let sum = 0;
  for (let lvl = lowLevel + 1; lvl <= highLevel; lvl++) {
    sum += getProtectionPointsForLevel(lvl);
  }
  return sum;
}