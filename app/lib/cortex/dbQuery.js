import { prisma } from "../prisma";

export function validateReadOnlySql(sql) {
  const cleaned = sql.trim().replace(/;+\s*$/, "");

  if (!/^select\s/i.test(cleaned)) {
    throw new Error("Sirf SELECT query allowed hai");
  }

  const forbidden = /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create)\b/i;
  if (forbidden.test(cleaned)) {
    throw new Error("Query mein disallowed keyword hai");
  }

  if (/cortexsecurity|personalpasskey/i.test(cleaned)) {
    throw new Error("Ye table access allowed nahi hai");
  }

  return cleaned;
}

function ensureLimit(sql) {
  if (/\blimit\s+\d+/i.test(sql)) return sql;
  return `${sql} LIMIT 50`;
}

export async function runSafeQuery(sql) {
  const validated = validateReadOnlySql(sql);
  const limited = ensureLimit(validated);
  return prisma.$queryRawUnsafe(limited);
}