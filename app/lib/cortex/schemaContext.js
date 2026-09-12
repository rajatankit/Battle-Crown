import fs from "fs";
import path from "path";

const SCHEMA_PATH = path.join(process.cwd(), "prisma", "schema.prisma");

const BLOCKED_MODELS = new Set([
  "CortexSecurity",
  "PersonalPasskey",
  "PersonalPasskeyChallenge",
]);

let cachedContext = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min - schema rarely changes at runtime

function parseSchemaModels(schemaText) {
  const modelRegex = /model\s+(\w+)\s*\{([^}]*)\}/g;
  const models = [];
  let match;

  while ((match = modelRegex.exec(schemaText)) !== null) {
    const name = match[1];
    if (BLOCKED_MODELS.has(name)) continue;

    const body = match[2];
    const fieldLines = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"));

    const fields = fieldLines
      .map((line) => {
        const fieldMatch = line.match(/^(\w+)\s+([\w\[\]?]+)/);
        return fieldMatch ? fieldMatch[1] : null;
      })
      .filter(Boolean);

    models.push({ name, fields });
  }

  return models;
}

export function getDbSchemaContext() {
  const now = Date.now();
  if (cachedContext && now - cachedAt < CACHE_TTL_MS) {
    return cachedContext;
  }

  const schemaText = fs.readFileSync(SCHEMA_PATH, "utf-8");
  const models = parseSchemaModels(schemaText);

  const lines = models.map(
    (m) => `"${m.name}": ${m.fields.map((f) => `"${f}"`).join(", ")}`
  );

  cachedContext = `
Battle Crown PostgreSQL database schema (columns case-sensitive - hamesha double quotes mein likho):

${lines.join("\n\n")}

Notes:
- "match_history" model ka DB table naam bhi "match_history" hai (lowercase), baaki models ke table naam unke model naam jaise hi hain (jaise "tournaments" @@map se).
- "match_history"."tournamentId" "tournaments"."firestoreId" se match karta hai, "tournaments"."id" se nahi.
- "Notification"."userId" aur "ConversationLog"."userId" Firebase uid (string) hain, "User"."id" (integer) nahi.
- Security-related tables kabhi query mat karo (already is list mein exclude hain).
`;

  cachedAt = now;
  return cachedContext;
}