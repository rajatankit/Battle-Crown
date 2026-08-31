import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { requirePersonalOwner } from "../../../../lib/personal-owner";
import { getSecurityRow, updateSecurityRow } from "../../../../lib/cortex/security";

const RP_ID = process.env.CORTEX_RP_ID;

export async function GET(request) {
  const { response } = await requirePersonalOwner(request);
  if (response) return response;

  if (!RP_ID) {
    return NextResponse.json(
      { success: false, error: "CORTEX_RP_ID is not configured." },
      { status: 500 }
    );
  }

  const security = await getSecurityRow();

  if (!security.webauthnCredId) {
    return NextResponse.json(
      { success: false, error: "Biometric not set up yet. Run setup first." },
      { status: 400 }
    );
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "required",
    allowCredentials: [{ id: security.webauthnCredId, type: "public-key" }],
  });

  await updateSecurityRow({ webauthnChallenge: options.challenge });

  return NextResponse.json(options);
}
