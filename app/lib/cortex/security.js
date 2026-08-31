import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot-reloads in dev, same
// pattern most Next.js + Prisma projects already use elsewhere
// in this codebase.
const prisma = globalThis.__cortexSecurityPrisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__cortexSecurityPrisma = prisma;
}

// This app has exactly one owner, so we keep exactly one
// CortexSecurity row, addressed by a fixed id.
const SINGLETON_ID = "cortex-security-singleton";

export async function getSecurityRow() {
  let row = await prisma.cortexSecurity.findUnique({
    where: { id: SINGLETON_ID },
  });

  if (!row) {
    row = await prisma.cortexSecurity.create({
      data: { id: SINGLETON_ID },
    });
  }

  return row;
}

export async function updateSecurityRow(data) {
  // Ensure the row exists first (idempotent).
  await getSecurityRow();

  return prisma.cortexSecurity.update({
    where: { id: SINGLETON_ID },
    data,
  });
}

// ============================================================
// Maps the CORTEX Python backend's `required_verification`
// string (set in agent_controller.py based on RiskLevel) to an
// ordered list of verification steps the frontend must
// complete before the approval is forwarded.
//
// WebAuthn cannot force "fingerprint only" vs "face only" — the
// device/OS decides which biometric modality to use. So instead
// of trying to distinguish them, higher risk gets MORE
// confirmations (extra biometric prompt + a custom pattern),
// which is a reasonable real-world equivalent.
// ============================================================
export function stepsForVerification(requiredVerification) {
  if (requiredVerification === "fingerprint+face") {
    // HIGH risk
    return ["biometric", "biometric", "pattern"];
  }

  if (requiredVerification === "fingerprint") {
    // MEDIUM risk
    return ["biometric"];
  }

  // Fallback — still require at least one biometric confirmation
  // rather than silently allowing the action through.
  return ["biometric"];
}