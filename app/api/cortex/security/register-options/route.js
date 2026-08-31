import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { requirePersonalOwner } from "../../../../lib/personal-owner";
import { getSecurityRow, updateSecurityRow } from "../../../../lib/cortex/security";

const RP_NAME = "CORTEX";
const RP_ID = process.env.CORTEX_RP_ID; // e.g. "battle-crown.vercel.app"

export async function GET(request) {
  const { uid, response } = await requirePersonalOwner(request);
  if (response) return response;

  if (!RP_ID) {
    return NextResponse.json(
      { success: false, error: "CORTEX_RP_ID is not configured." },
      { status: 500 }
    );
  }

  const security = await getSecurityRow();

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(uid || "cortex-owner"),
    userName: "boss",
    attestationType: "none",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred",
    },
    excludeCredentials: security.webauthnCredId
      ? [{ id: security.webauthnCredId, type: "public-key" }]
      : [],
  });

  await updateSecurityRow({ webauthnChallenge: options.challenge });

  return NextResponse.json(options);
}
