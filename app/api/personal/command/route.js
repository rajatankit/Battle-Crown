import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../lib/personal-owner";
import { cortexDispatch } from "../../../lib/cortex/client";
import { askCortexLLM } from "../../../lib/cortex/llm";
import { logCortexError } from "../../../lib/cortex/errorLogger";

// Runs a single dispatch step and figures out whether it needs approval.
// Shared by both the single-tool path and the multi-step chain below so the
// approval logic (message parsing, risk detection) stays in exactly one place.
async function runStep({ step, command, uid, approved, approvalMethod, riskHint }) {
  const result = await cortexDispatch({
    agentId: step.agent_id,
    action: step.action,
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

  // Backend sends "VERIFICATION_REQUIRED:<level>:<requestId>" as the
  // message itself when approval is needed — catch that exact format
  // instead of relying on the word "approve" being present somewhere
  // in the text (which this format does not contain).
  const verificationMatch = msg.match(/^VERIFICATION_REQUIRED:([a-zA-Z+]+):(.+)$/i);

  const needsApprove =
    result?.requires_approval === true ||
    Boolean(verificationMatch) ||
    msg.toLowerCase().includes("approve") ||
    msg.toLowerCase().includes("approval");

  return { result, needsApprove, msg, verificationMatch };
}

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

  // If the client is resuming a paused multi-step chain, it sends back the
  // exact steps we returned earlier instead of free text. When present, we
  // skip the LLM entirely and go straight into the chain runner below.
  const resumingSteps = Array.isArray(body?.remaining_steps)
    ? body.remaining_steps.filter(
        (s) => s && typeof s.agent_id === "string" && typeof s.action === "string"
      )
    : null;

  if (!command && !resumingSteps) {
    return NextResponse.json(
      { success: false, error: "command is required." },
      { status: 400 }
    );
  }

  try {
    let steps;

    if (resumingSteps && resumingSteps.length > 0) {
      steps = resumingSteps;
    } else {
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
      // 3) SINGLE TOOL / WORK — same shape as the
      // original single-step behavior
      // ============================================
      if (llm.type === "tool") {
        steps = [{ agent_id: llm.agent_id, action: llm.action }];
      } else if (llm.type === "tool_multi") {
        steps = llm.steps;
      } else {
        steps = [];
      }
    }

    // ============================================
    // 4) SEQUENTIAL CHAIN RUNNER
    //
    // Runs steps in order. Low-risk steps execute immediately.
    // The moment a step needs approval, we stop right there —
    // everything already run stays done (no rollback), and
    // everything not yet run is handed back to the client as
    // remaining_steps so it can resume after approval.
    // ============================================
    const completed = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      const { result, needsApprove, msg, verificationMatch } = await runStep({
        step,
        command: command || "(resumed chain)",
        uid,
        approved,
        approvalMethod,
        riskHint,
      });

      if (needsApprove && !approved) {
        // Prefer the level/requestId embedded in the backend's own
        // VERIFICATION_REQUIRED message; fall back to structured
        // fields or a risk-based guess if that format isn't present.
        const level = verificationMatch
          ? verificationMatch[1].toLowerCase()
          : msg.toLowerCase().includes("high")
          ? "fingerprint+face"
          : "fingerprint";

        const risk = result?.risk || (level === "fingerprint+face" ? "high" : "medium");

        const requestId =
          result?.request_id ||
          result?.data?.request_id ||
          (verificationMatch ? verificationMatch[2] : null);

        return NextResponse.json({
          success: false,
          requires_approval: true,
          risk,
          error: "approval_required",
          result: {
            requires_approval: true,
            risk,
            required_verification: level,
            request_id: requestId,
            agent_id: result?.agent || result?.agent_id || step.agent_id,
            message:
              risk === "high"
                ? "High risk action. Tap approve to confirm, Boss."
                : "This needs your approval, Boss. Tap approve to confirm.",
            // Steps already executed before this one (for audit / UI display).
            completed_steps: completed,
            // Steps from this point onward (this one included) — send these
            // back unchanged once approved to resume the chain.
            remaining_steps: steps.slice(i),
          },
        });
      }

      let stepMessage = result?.message || result?.data?.message || "Done, Boss.";

      if (
        typeof stepMessage === "string" &&
        (stepMessage.includes("Intent identified") ||
          stepMessage.includes("Unable to identify") ||
          stepMessage.toLowerCase().includes("not register"))
      ) {
        stepMessage = result?.success
          ? "Done, Boss."
          : "That command is not available yet, Boss.";
      }

      completed.push({
        agent_id: step.agent_id,
        action: step.action,
        message: stepMessage,
        success: result?.success !== false,
      });
    }

    if (completed.length === 0) {
      return NextResponse.json({
        success: true,
        result: {
          success: true,
          agent: "CORTEX",
          message: "That command is not available yet, Boss.",
        },
      });
    }

    // Build one combined message. Single-step stays exactly as before;
    // multi-step summarizes each completed action on its own line.
    let combinedMessage;
    if (completed.length === 1) {
      combinedMessage = completed[0].message;
    } else {
      combinedMessage = completed
        .map((s, idx) => `${idx + 1}. ${s.agent_id}: ${s.message}`)
        .join("\n");
    }

    if (typeof combinedMessage === "string" && combinedMessage.length > 320) {
      combinedMessage = combinedMessage.slice(0, 310) + "...";
    }

    return NextResponse.json({
      success: true,
      result: {
        success: true,
        agent: completed.length === 1 ? completed[0].agent_id : "CORTEX",
        message: combinedMessage,
        steps: completed,
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