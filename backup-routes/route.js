import { NextResponse } from "next/server";
import crypto from "crypto";
import { requirePersonalOwner } from "../../../../../lib/personal-owner";
import { updateSecurityRow } from "../../../lib/cortex/security";

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

  // Pattern is a "-" joined list of dot indices, e.g. "0-1-2-5-8".
  const dots = pattern.split("-").filter(Boolean);

  if (dots.length < 4) {
    return NextResponse.json(
      { success: false, error: "Pattern must connect at least 4 points." },
      { status: 400 }
    );
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPattern(pattern, salt);

  await updateSecurityRow({ patternHash: hash, patternSalt: salt });

  return NextResponse.json({ success: true });
}