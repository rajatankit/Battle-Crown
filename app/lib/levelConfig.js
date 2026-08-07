// ============================================================
// LEVEL CONFIG — single source of truth for level progression
// Import this everywhere (dashboard, admin panel, backend) so
// the formula never goes out of sync between files.
// ============================================================

// Highest level a player can reach
export const MAX_PLAYER_LEVEL = 50;

// Total matches required (cumulative) to REACH a given level.
// Formula: (level - 1)^2
// This makes early levels fast (1, 3, 5, 7 match gaps) and
// later levels progressively harder (quadratic growth).
export function getRequiredMatchesForLevel(level) {
  if (level <= 1) return 0;
  return Math.pow(level - 1, 2);
}

// Alias — some files import this under a different name.
export const getTotalMatchesForLevel = getRequiredMatchesForLevel;

// Given a total matchesPlayed count, figure out what level the
// player should currently be at.
export function getLevelFromMatches(matchesPlayed) {
  let level = 1;
  while (matchesPlayed >= getRequiredMatchesForLevel(level + 1) && level < MAX_PLAYER_LEVEL) {
    level++;
  }
  return level;
}

// Alias — page.js and route.js call this name to recompute level
// from matchesPlayed.
export const calculateLevelFromMatches = getLevelFromMatches;

// Sums up Protection Points earned for every level milestone (multiple
// of 5) crossed between oldLevel (exclusive) and newLevel (inclusive).
// e.g. oldLevel=4, newLevel=5  -> level 5 crossed -> +1 point (5/5)
//      oldLevel=9, newLevel=10 -> level 10 crossed -> +2 points (10/5)
export function sumProtectionPointsBetween(oldLevel, newLevel) {
  let total = 0;
  for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
    if (lvl % 5 === 0) {
      total += lvl / 5;
    }
  }
  return total;
}

// Badges / tier names shown at each milestone level
export const levelBadgesMap = [
  { level: 1, name: "Rookie Bronze", badge: "🥉" },
  { level: 5, name: "Iron Vanguard", badge: "🛡️" },
  { level: 10, name: "Silver Striker", badge: "🥈" },
  { level: 15, name: "Gold Gladiator", badge: "🥇" },
  { level: 20, name: "Platinum Elite", badge: "💠" },
  { level: 25, name: "Diamond Predator", badge: "💎" },
  { level: 30, name: "Crown Master", badge: "👑" },
  { level: 35, name: "Ace Conqueror", badge: "⚡" },
  { level: 40, name: "Legendary Titan", badge: "🌟" },
  { level: 45, name: "Master Immortal", badge: "🔥" },
  { level: 50, name: "Mythic Supreme", badge: "🏆" },
];

// Crown rewards given when a level milestone is unlocked
// (used by /api/user/level-rewards on the backend)
export const LEVEL_CROWN_REWARDS = {
  1: 5,
  5: 10,
  10: 15,
  15: 20,
  20: 50,   // Bumper
  25: 30,
  30: 40,
  35: 50,
  40: 100,  // Bumper
  45: 80,
  50: 200,  // Bumper
};