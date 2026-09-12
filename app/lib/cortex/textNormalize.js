// Small, bounded set of common STT/typo corrections for CORTEX's own
// vocabulary words. NOT a general spellchecker — only fixes high-frequency
// errors we've actually seen. Reviewed and small, not the core intelligence.
const TYPO_MAP = [
  [/\btornament\b/gi, "tournament"],
  [/\btourna\s*ment\b/gi, "tournament"],
  [/\btournment\b/gi, "tournament"],
  [/\btournamnet\b/gi, "tournament"],
  [/\bnotif\b/gi, "notification"],
  [/\bnotificaton\b/gi, "notification"],
  [/\bwithdrawl\b/gi, "withdrawal"],
  [/\bwithdrawel\b/gi, "withdrawal"],
  [/\bplayr\b/gi, "player"],
  [/\bpalyer\b/gi, "player"],
  [/\bscreensht\b/gi, "screenshot"],
  [/\bscreenshoot\b/gi, "screenshot"],
];

export function normalizeCommonTypos(text) {
  let out = String(text || "");
  for (const [pattern, replacement] of TYPO_MAP) {
    out = out.replace(pattern, replacement);
  }
  return out;
}