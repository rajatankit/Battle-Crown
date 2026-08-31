import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../../lib/personal-owner";
import { cortexApprove } from "../../../../lib/cortex/client";

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

  const requestId =
    typeof body?.request_id === "string" ? body.request_id.trim() : "";
  const agentId =
    typeof body?.agent_id === "string" ? body.agent_id.trim() : "";
  const verified = body?.verified === true;

  if (!requestId || !agentId) {
    return NextResponse.json(
      { success: false, error: "request_id and agent_id are required." },
      { status: 400 }
    );
  }

  // Security gate: VerificationModal on the frontend only sets
  // verified=true after every required WebAuthn / pattern step
  // has succeeded against /api/cortex/security/*. This is a
  // belt-and-braces server-side check so a raw API call without
  // completing verification is rejected here too.
  if (!verified) {
    return NextResponse.json(
      { success: false, error: "Verification not completed." },
      { status: 403 }
    );
  }

  try {
    const result = await cortexApprove({ requestId, agentId });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Approval failed.",
      },
      { status: 502 }
    );
  }
}
