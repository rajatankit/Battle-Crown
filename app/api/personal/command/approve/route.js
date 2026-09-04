import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../../lib/personal-owner";
import { cortexApprove, cortexDispatch } from "../../../../lib/cortex/client";
import { logCortexError } from "../../../../lib/cortex/errorLogger";
import {
  getDraft,
  resetDraft,
} from "../../../../lib/cortex/tournamentWizard";

export async function POST(request) {
  const { uid, response } = await requirePersonalOwner(request);
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

  // Security gate
  if (!verified) {
    return NextResponse.json(
      { success: false, error: "Verification not completed." },
      { status: 403 }
    );
  }

  try {
    // 1. Approval mark karo
    const result = await cortexApprove({ requestId, agentId });

    // 2. Check if tournament draft is still active
    const draft = await getDraft();

    if (draft && draft.active && draft.stage === "final_confirm") {
      try {
        const createResult = await cortexDispatch({
          agentId: "ARIA",
          action: "create_tournament",
          task: "create_tournament_wizard",
          context: {
            source: "personal_voice",
            uid,
            approved: true,
            title: draft.title,
            game: draft.game,
            mode: draft.mode,
            entry_fee: draft.entryFee,
            capacity: draft.maxSlots,
            start_time: draft.startTime,
            kill_reward: draft.killReward,
            first_prize: draft.firstPrize,
            second_prize: draft.secondPrize,
            third_prize: draft.thirdPrize,
          },
        });

        await resetDraft();

        if (createResult?.status === "created" || createResult?.success) {
          return NextResponse.json({
            success: true,
            result: {
              success: true,
              agent: "ARIA",
              message: `Tournament ban gaya, Boss — "${draft.title}" live ho gaya.`,
              tournament_created: true,
            },
          });
        }

        return NextResponse.json({
          success: true,
          result: {
            success: false,
            agent: "ARIA",
            message: `Approval ho gaya, lekin tournament create nahi hua: ${
              createResult?.message || "unknown error"
            }`,
          },
        });
      } catch (createErr) {
        await resetDraft();
        await logCortexError("personal/command/approve:create_tournament", createErr);

        return NextResponse.json({
          success: true,
          result: {
            success: false,
            agent: "ARIA",
            message:
              "Approval ho gaya, lekin tournament create karte waqt error aaya.",
          },
        });
      }
    }

    // Normal approval (tournament wizard nahi tha)
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