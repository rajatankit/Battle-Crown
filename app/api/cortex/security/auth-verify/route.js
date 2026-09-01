import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { requirePersonalOwner } from "../../../../lib/personal-owner";
import { getSecurityRow, updateSecurityRow } from "../../../../lib/cortex/security";

const RP_ID = process.env.CORTEX_RP_ID;
const ORIGIN = process.env.CORTEX_ORIGIN;

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

  if (!security.webauthnChallenge || !security.webauthnCredId || !security.webauthnPublicKey) {
    return NextResponse.json(
      { success: false, error: "No pending verification. Start again." },
      { status: 400 }
    );
  }

  let verification;
  try {
   verification = await verifyAuthenticationResponse({
  response: body,
  expectedChallenge: security.webauthnChallenge,
  expectedOrigin: ORIGIN,
  expectedRPID: RP_ID,
  credential: {
    id: security.webauthnCredId,
    publicKey: Buffer.from(security.webauthnPublicKey, "base64url"),
    counter: security.webauthnCounter,
  },
});
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Verification failed." },
      { status: 400 }
    );
  }

  if (!verification.verified) {
    return NextResponse.json(
      { success: false, error: "Biometric verification failed." },
      { status: 400 }
    );
  }

  await updateSecurityRow({
    webauthnChallenge: null,
    webauthnCounter: verification.authenticationInfo.newCounter,
  });

  return NextResponse.json({ success: true });
}
