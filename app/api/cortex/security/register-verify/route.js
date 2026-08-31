import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { requirePersonalOwner } from "../../../../lib/personal-owner";
import { getSecurityRow, updateSecurityRow } from "../../../../lib/cortex/security";

const RP_ID = process.env.CORTEX_RP_ID;
const ORIGIN = process.env.CORTEX_ORIGIN; // e.g. "https://battle-crown.vercel.app"

export async function POST(request) {
  const { response } = await requirePersonalOwner(request);
  if (response) return response;

  if (!RP_ID || !ORIGIN) {
    return NextResponse.json(
      { success: false, error: "CORTEX_RP_ID / CORTEX_ORIGIN not configured." },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const security = await getSecurityRow();

  if (!security.webauthnChallenge) {
    return NextResponse.json(
      { success: false, error: "No pending registration challenge. Start again." },
      { status: 400 }
    );
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: security.webauthnChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Verification failed." },
      { status: 400 }
    );
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json(
      { success: false, error: "Registration could not be verified." },
      { status: 400 }
    );
  }

  const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

  await updateSecurityRow({
    webauthnCredId: Buffer.from(credentialID).toString("base64url"),
    webauthnPublicKey: Buffer.from(credentialPublicKey).toString("base64url"),
    webauthnCounter: counter,
    webauthnChallenge: null,
  });

  return NextResponse.json({ success: true });
}
