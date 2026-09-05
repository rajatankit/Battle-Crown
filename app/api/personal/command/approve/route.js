import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../../lib/personal-owner";
import { cortexApprove } from "../../../../lib/cortex/client";
import { logCortexError } from "../../../../lib/cortex/errorLogger";
import { getDraft, resetDraft } from "../../../../lib/cortex/tournamentWizard";

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
    // Approving here is the ONLY execution step needed. The Python
    // bridge's /approve endpoint (called via cortexApprove) already
    // runs the actual tool - including create_tournament - using the
    // exact context that was stored when the original /dispatch call
    // returned VERIFICATION_REQUIRED (title, game, fees, prizes, etc).
    //
    // Do NOT re-dispatch create_tournament here: create_tournament is
    // HIGH risk, so a second dispatch call would itself come back
    // asking for approval again (a second VERIFICATION_REQUIRED),
    // which is the exact loop this used to cause.
    const result = await cortexApprove({ requestId, agentId });

    // If a tournament wizard draft is still sitting around at this
    // point, clear it now that the real creation has already
    // happened via the approval above - it's just leftover state.
    try {
      const draft = await getDraft();
      if (draft && draft.active) {
        await resetDraft();
      }
    } catch {
      // Non-fatal - draft cleanup failing shouldn't fail the approval.
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error(error);
    await logCortexError("personal/command/approve", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Approval failed.",
      },
      { status: 502 }
    );
  }
}