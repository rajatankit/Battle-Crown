// Bounded, finite number-word vocabulary (Hindi/English/Hinglish/Devanagari).
// This is a closed set (numbers), not a general slang dictionary — safe to
// map directly per the "no giant hardcoded dictionary as core intelligence" rule.
const NUMBER_WORDS = {
  0: ["0", "zero", "shunya", "शून्य"],
  1: ["1", "one", "won", "ek", "aek", "eak", "ak", "एक"],
  2: ["2", "two", "do", "doo", "du", "दो"],
  3: ["3", "three", "teen", "tin", "तीन"],
  4: ["4", "four", "char", "chaar", "चार"],
  5: ["5", "five", "paanch", "panch", "पांच"],
  6: ["6", "six", "chhe", "che", "छह"],
  7: ["7", "seven", "saat", "सात"],
  8: ["8", "eight", "aath", "आठ"],
  9: ["9", "nine", "nau", "नौ"],
  10: ["10", "ten", "das", "दस"],
  20: ["20", "twenty", "bees", "बीस"],
  30: ["30", "thirty", "tees", "तीस"],
  40: ["40", "forty", "chalis", "चालीस"],
  50: ["50", "fifty", "pachas", "पचास"],
  100: ["100", "hundred", "sau", "सौ"],
};

const WORD_TO_NUMBER = {};
for (const [num, words] of Object.entries(NUMBER_WORDS)) {
  for (const w of words) WORD_TO_NUMBER[w.toLowerCase()] = Number(num);
}

// Normalizes a single value to a number-string if it's a recognizable
// number-word. Never guesses — returns the input unchanged if unrecognized.
export function normalizeNumberToken(raw) {
  if (raw === null || raw === undefined) return raw;
  const cleaned = String(raw).trim().toLowerCase();
  if (cleaned === "") return raw;
  if (/^\d+(\.\d+)?$/.test(cleaned)) return cleaned;
  if (Object.prototype.hasOwnProperty.call(WORD_TO_NUMBER, cleaned)) {
    return String(WORD_TO_NUMBER[cleaned]);
  }
  return raw;
}

// Ordinal words -> 1-based index, for "dusra wala" style references.
const ORDINAL_WORDS = {
  1: ["pehla", "pehli", "first", "1st", "upar wala", "pehle wala"],
  2: ["dusra", "dusri", "second", "2nd"],
  3: ["teesra", "teesri", "third", "3rd"],
  4: ["chautha", "chauthi", "fourth", "4th"],
  5: ["paanchwa", "paanchvi", "fifth", "5th"],
};
const WORD_TO_ORDINAL = {};
for (const [num, words] of Object.entries(ORDINAL_WORDS)) {
  for (const w of words) WORD_TO_ORDINAL[w] = Number(num);
}

export function extractOrdinalIndex(text) {
  const lower = String(text || "").toLowerCase();
  if (/\b(last|aakhri|akhri|neeche wala|sabse neeche)\b/.test(lower)) {
    return "last";
  }
  for (const [word, idx] of Object.entries(WORD_TO_ORDINAL)) {
    if (lower.includes(word)) return idx;
  }
  return null;
}