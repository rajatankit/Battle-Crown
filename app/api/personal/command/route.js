import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../lib/personal-owner";
import { cortexDispatch } from "../../../lib/cortex/client";
import { askCortexLLM } from "../../../lib/cortex/llm";
import { logCortexError } from "../../../lib/cortex/errorLogger";

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

  const command =
    typeof body?.command === "string" ? body.command.trim() : "";
    const approved = body?.approved === true;
  const approvalMethod =
    typeof body?.approval_method === "string" ? body.approval_method : null;
  const riskHint = typeof body?.risk === "string" ? body.risk : null;

  if (!command) {
    return NextResponse.json(
      { success: false, error: "command is required." },
      { status: 400 }
    );
  }

  try {
    const llm = await askCortexLLM(command);

    // ============================================
    // 1) SPECIALIST SWITCH (all 8) — NO tool call
    // ============================================
    if (llm.type === "switch") {
      return NextResponse.json({
        success: true,
        result: {
          success: true,
          agent: llm.agent_id,
          message: `${llm.agent_id} is now online, Boss. You may give commands.`,
          switched_to: llm.agent_id,
        },
      });
    }

    // ============================================
    // 2) NORMAL CHAT
    // ============================================
    if (llm.type === "chat") {
      return NextResponse.json({
        success: true,
        result: {
          success: true,
          agent: "CORTEX",
          message: String(llm.message || "Yes Boss, I am listening."),
        },
      });
    }

    // ============================================
    // 3) REAL TOOL / WORK → CORTEX bridge
    //
    // llm.agent_id / llm.action come from the structured
    // "TOOL: AGENT_ID:action" output produced by askCortexLLM.
    // Passing these directly lets the Python backend route
    // through orchestrator.dispatch() instead of falling back
    // to free-text IntentEngine matching (which does not
    // understand English LLM phrasing).
    // ============================================
    const result = await cortexDispatch({
      agentId: llm.agent_id,
      action: llm.action,
      task: command,
      context: {
        source: "personal_voice",
        uid,
        approved,
        approval_method: approvalMethod,
        risk: riskHint,
      },
    });

    const msg = String(result?.message || result?.detail || "");
    const needsApprove =
      result?.requires_approval === true ||
      msg.toLowerCase().includes("approve") ||
      msg.toLowerCase().includes("approval");

    if (needsApprove && !approved) {
      const risk =
        result?.risk ||
        (msg.toLowerCase().includes("high") ? "high" : "medium");

      return NextResponse.json({
        success: false,
        requires_approval: true,
        risk,
        error: "approval_required",
        result: {
          requires_approval: true,
          risk,
          request_id: result?.request_id || result?.data?.request_id || null,
          agent_id: result?.agent || result?.agent_id || null,
          message:
            risk === "high"
              ? "High risk action. Tap approve to confirm, Boss."
              : "This needs your approval, Boss. Tap approve to confirm.",
        },
      });
    }

    let message =
      result?.message ||
      result?.data?.message ||
      "Done, Boss.";

    if (
      typeof message === "string" &&
      (message.includes("Intent identified") ||
        message.includes("Unable to identify") ||
        message.toLowerCase().includes("not register"))
    ) {
      message = result?.success
        ? "Done, Boss."
        : "That command is not available yet, Boss.";
    }

    if (typeof message === "string" && message.length > 160) {
      message = message.slice(0, 150) + "...";
    }

    return NextResponse.json({
      success: true,
      result: {
        ...result,
        message,
      },
    });
  } catch (error) {
    console.error("Personal command failed:", error);
    await logCortexError("personal/command", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "CORTEX dispatch failed.",
      },
      { status: 502 }
    );
  }
}