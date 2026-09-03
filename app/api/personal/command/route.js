import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../lib/personal-owner";
import { cortexDispatch } from "../../../lib/cortex/client";
import { askCortexLLM } from "../../../lib/cortex/llm";
import { saveMemory } from "../../../lib/cortex/memory";
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

      // Save any facts CORTEX decided are worth remembering permanently.
      if (Array.isArray(llm.memoryFacts) && llm.memoryFacts.length > 0) {
        for (const fact of llm.memoryFacts) {
          try {
            await saveMemory(fact);
          } catch (err) {
            console.error("Failed to save Cortex memory:", err);
          }
        }
      }

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
            completed_steps: completed,
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