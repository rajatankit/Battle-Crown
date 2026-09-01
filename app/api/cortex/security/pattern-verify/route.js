import { NextResponse } from "next/server";
import crypto from "crypto";
import { requirePersonalOwner } from "../../../../lib/personal-owner";
import { getSecurityRow } from "../../../../lib/cortex/security";
import { logCortexError } from "../../../../lib/cortex/errorLogger";

function hashPattern(pattern, salt) {
  return crypto.createHash("sha256").update(salt + pattern).digest("hex");
}

export async function POST(request) {
  const { response } = await requirePersonalOwner(request);
  if (response) return response;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  try {
    const pattern = typeof body?.pattern === "string" ? body.pattern.trim() : "";

    const security = await getSecurityRow();

    if (!security.patternHash || !security.patternSalt) {
      return NextResponse.json(
        { success: false, error: "Pattern lock not set up yet." },
        { status: 400 }
      );
    }

    const hash = hashPattern(pattern, security.patternSalt);
    const verified = hash === security.patternHash;

    if (!verified) {
      return NextResponse.json(
        { success: false, error: "Pattern incorrect." },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    await logCortexError("cortex/security/pattern-verify", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Verification failed." },
      { status: 500 }
    );
  }
}