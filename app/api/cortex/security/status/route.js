import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../../lib/personal-owner";
import { getSecurityRow } from "../../../../lib/cortex/security";

export async function GET(request) {
  const { response } = await requirePersonalOwner(request);
  if (response) return response;

  const security = await getSecurityRow();

  const biometricReady = Boolean(
    security.webauthnCredId && security.webauthnPublicKey
  );
  const patternReady = Boolean(
    security.patternHash && security.patternSalt
  );
  const voiceReady = Boolean(security.voiceProfile);

  return NextResponse.json({
    success: true,
    biometricReady,
    patternReady,
    voiceReady,
    ready: biometricReady && patternReady && voiceReady,
  });
}