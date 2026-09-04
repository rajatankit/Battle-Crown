import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../lib/personal-owner";
import { cortexDispatch } from "../../../lib/cortex/client";
import { askCortexLLM } from "../../../lib/cortex/llm";
import { saveMemory } from "../../../lib/cortex/memory";
import { logCortexError } from "../../../lib/cortex/errorLogger";
import { prisma } from "../../../lib/prisma";
import {
  getDraft,
  startDraft,
  updateDraft,
  resetDraft,
  nextMissingField,
  getFieldQuestion,
  parseFieldValue,
  buildSummary,
  isTournamentCreateIntent,
  isAffirmative,
  isNegative,
  isCancelWord,
} from "../../../lib/cortex/tournamentWizard";

function chatResponse(message, agent = "CORTEX") {
  return NextResponse.json({
    success: true,
    result: { success: true, agent, message },
  });
}

// ============================================
// TOURNAMENT WIZARD HANDLERS
// ============================================

async function handleWizardStart() {
  await startDraft();
  return chatResponse(getFieldQuestion("title"), "ARIA");
}

async function handleWizardTurn(draft, command, uid) {
  if (isCancelWord(command)) {
    await resetDraft();
    return chatResponse("Tournament creation cancel kar diya, Boss.", "ARIA");
  }

  // ---- Stage: duplicate confirmation ----
  if (draft.stage === "duplicate_confirm") {
    if (isNegative(command)) {
      await resetDraft();
      return chatResponse(
        "Theek hai Boss, tournament nahi banaya. Alag time try kariye.",
        "ARIA"
      );
    }
    if (isAffirmative(command)) {
      await updateDraft({ stage: "final_confirm" });
      return chatResponse(
        `Confirm kar rahe hain — ${buildSummary(draft)}. Sab sahi hai? Bolo "haan" tournament banane ke liye.`,
        "ARIA"
      );
    }
    return chatResponse(
      'Boss, "haan" ya "nahi" mein jawab dijiye — same time pe same game ka tournament already hai, phir bhi banana hai?',
      "ARIA"
    );
  }

  // ---- Stage: final confirmation ----
  if (draft.stage === "final_confirm") {
    if (isNegative(command)) {
      await resetDraft();
      return chatResponse("Theek hai Boss, tournament creation cancel kiya.", "ARIA");
    }
    if (!isAffirmative(command)) {
      return chatResponse(
        `Boss, confirm kijiye — ${buildSummary(draft)}. Bolo "haan" ya "cancel".`,
        "ARIA"
      );
    }

    // Create the actual tournament
    try {
      const result = await cortexDispatch({
        agentId: "ARIA",
        action: "create_tournament",
        task: "create_tournament_wizard",
        context: {
          source: "personal_voice",
          uid,
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

      // ---------- CRITICAL FIX: Check for verification ----------
      const msg = String(result?.message || result?.detail || "");
      const verificationMatch = msg.match(
        /^VERIFICATION_REQUIRED:([a-zA-Z+]+):(.+)$/i
      );

      const needsApprove =
        result?.requires_approval === true ||
        Boolean(verificationMatch) ||
        msg.toLowerCase().includes("approve") ||
        msg.toLowerCase().includes("approval");

      if (needsApprove) {
        // Draft mat reset karo
        const level = verificationMatch
          ? verificationMatch[1].toLowerCase()
          : "fingerprint+face";

        const requestId =
          result?.request_id ||
          result?.data?.request_id ||
          (verificationMatch ? verificationMatch[2] : null);

        return NextResponse.json({
          success: false,
          requires_approval: true,
          risk: "high",
          error: "approval_required",
          result: {
            requires_approval: true,
            risk: "high",
            required_verification: level,
            request_id: requestId,
            agent_id: "ARIA",
            message:
              "High risk action. Tournament create karne se pehle identity verification chahiye, Boss.",
            remaining_steps: [
              {
                agent_id: "ARIA",
                action: "create_tournament",
              },
            ],
          },
        });
      }

      // Verification nahi chahiye tha → ab draft reset karo
      await resetDraft();

      if (result?.status === "created" || result?.success) {
        return chatResponse(
          `Tournament ban gaya, Boss — "${draft.title}" live ho gaya.`,
          "ARIA"
        );
      }

      return chatResponse(
        `Boss, tournament banane mein dikkat aayi: ${
          result?.message || "unknown error"
        }.`,
        "ARIA"
      );
    } catch (err) {
      await resetDraft();
      await logCortexError("personal/command:tournament_wizard", err);
      return chatResponse(
        "Boss, tournament create karte waqt error aaya. Dobara try kariye.",
        "ARIA"
      );
    }
  }

  // ---- Stage: collecting fields ----
  const field = nextMissingField(draft);
  if (!field) {
    return runDuplicateCheck(draft);
  }

  const parsed = parseFieldValue(field, command);
  if (!parsed.ok) {
    return chatResponse(parsed.message, "ARIA");
  }

  const updated = await updateDraft({ [field]: parsed.value });
  const next = nextMissingField(updated);

  if (next) {
    return chatResponse(getFieldQuestion(next), "ARIA");
  }

  return runDuplicateCheck(updated);
}

async function runDuplicateCheck(draft) {
  const existing = await prisma.tournament.findFirst({
    where: {
      game: draft.game,
      startTime: draft.startTime,
      status: { in: ["upcoming", "live"] },
    },
  });

  if (existing) {
    await updateDraft({
      stage: "duplicate_confirm",
      duplicateTournamentId: existing.id,
    });
    return chatResponse(
      `Boss, isi time pe already ek \( {draft.game} tournament hai — " \){existing.title}". Phir bhi banana hai?`,
      "ARIA"
    );
  }

  await updateDraft({ stage: "final_confirm" });
  return chatResponse(
    `Confirm kar rahe hain — ${buildSummary(draft)}. Sab sahi hai? Bolo "haan" tournament banane ke liye.`,
    "ARIA"
  );
}

// ============================================
// SINGLE-STEP DISPATCH
// ============================================

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
    // ============================================
    // 0) TOURNAMENT CREATION WIZARD
    // ============================================
    if (!resumingSteps) {
      const draft = await getDraft();

      if (draft && draft.active) {
        return await handleWizardTurn(draft, command, uid);
      }

      if (command && isTournamentCreateIntent(command)) {
        return await handleWizardStart();
      }
    }

    let steps;

    if (resumingSteps && resumingSteps.length > 0) {
      steps = resumingSteps;
    } else {
      const llm = await askCortexLLM(command);

      if (Array.isArray(llm.memoryFacts) && llm.memoryFacts.length > 0) {
        for (const fact of llm.memoryFacts) {
          try {
            await saveMemory(fact);
          } catch (err) {
            console.error("Failed to save Cortex memory:", err);
          }
        }
      }

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

      if (llm.type === "tool") {
        steps = [{ agent_id: llm.agent_id, action: llm.action }];
      } else if (llm.type === "tool_multi") {
        steps = llm.steps;
      } else {
        steps = [];
      }
    }

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

        const risk =
          result?.risk || (level === "fingerprint+face" ? "high" : "medium");

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