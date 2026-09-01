import { NextResponse } from "next/server";
import crypto from "crypto";
import { requirePersonalOwner } from "../../../../lib/personal-owner";
import { updateSecurityRow } from "../../../../lib/cortex/security";
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

  const pattern = typeof body?.pattern === "string" ? body.pattern.trim() : "";

  const dots = pattern.split("-").filter(Boolean);

  if (dots.length < 4) {
    return NextResponse.json(
      { success: false, error: "Pattern must connect at least 4 points." },
      { status: 400 }
    );
  }

  try {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = hashPattern(pattern, salt);

    await updateSecurityRow({ patternHash: hash, patternSalt: salt });

    return NextResponse.json({ success: true });
  } catch (err) {
    await logCortexError("cortex/security/pattern-set", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to save pattern." },
      { status: 500 }
    );
  }
}