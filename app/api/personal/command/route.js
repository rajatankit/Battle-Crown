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
// SHARED APPROVAL DETECTION
//
// Same logic used for both the normal LLM-driven tool chain and the
// tournament wizard's final creation call - a bridge response either
// carries requires_approval=true, or a VERIFICATION_REQUIRED:<level>:
// <requestId> message (the format core/agent_controller.py sends),
// or a looser "approve"/"approval" text match as a fallback.
// ============================================
function detectApproval(result) {
  const msg = String(result?.message || result?.detail || "");
  const verificationMatch = msg.match(/^VERIFICATION_REQUIRED:([a-zA-Z+]+):(.+)$/i);

  const needsApprove =
    result?.requires_approval === true ||
    Boolean(verificationMatch) ||
    msg.toLowerCase().includes("approve") ||
    msg.toLowerCase().includes("approval");

  return { needsApprove, msg, verificationMatch };
}

// Builds the exact requires_approval response shape the frontend's
// extractApprovalRequest() in app/personal/page.js expects.
function approvalRequiredResponse({ result, msg, verificationMatch, agentId, completed = [], remainingSteps = null }) {
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
      agent_id: agentId,
      message:
        risk === "high"
          ? "High risk action. Tap approve to confirm, Boss."
          : "This needs your approval, Boss. Tap approve to confirm.",
      completed_steps: completed,
      remaining_steps: remainingSteps,
    },
  });
}

// ============================================
// SPOKEN REPLY FORMATTING FOR READ/QUERY ACTIONS
//
// Tool execution always reports success generically ("Tool 'X'
// executed successfully.") - the actual data the tool fetched lives
// in result.data. This turns that raw data into something worth
// saying out loud, per action. Returns null if there's nothing
// specific to format (falls back to the generic message elsewhere).
// ============================================
function formatToolReply(step, result) {
  const data = result?.data;
  if (!data || typeof data !== "object") return null;

  if (step.action === "read_tournament") {
    if (Array.isArray(data.tournaments)) {
      const list = data.tournaments;
      if (list.length === 0) {
        return "Boss, is criteria mein koi tournament nahi mila.";
      }
      const ffCount = list.filter((t) =>
        /free\s*fire|^ff$/i.test(String(t.game || ""))
      ).length;
      const bgmiCount = list.filter((t) =>
        /bgmi/i.test(String(t.game || ""))
      ).length;
      const preview = list
        .slice(0, 5)
        .map((t) => `"${t.title}" (${t.game}, ${t.status})`)
        .join(", ");
      const more = list.length > 5 ? " aur baaki." : ".";
      return `Boss, ${list.length} tournament mile — FF: ${ffCount}, BGMI: ${bgmiCount}. ${preview}${more}`;
    }
    if (data.tournament) {
      const t = data.tournament;
      return `Boss, "${t.title}" — ${t.game}, status ${t.status}, ${t.joined_count ?? 0}/${t.max_slots ?? "?"} players.`;
    }
    if (data.status === "not_found") return "Boss, wo tournament nahi mila.";
  }

  if (step.action === "read_player_data") {
    if (data.player) {
      const p = data.player;
      return `Boss, ${p.name || "player"} ki UID ${p.uid} hai, email ${p.email}, level ${p.level}, crowns ${p.crowns}.`;
    }
    if (Array.isArray(data.players)) {
      if (data.players.length === 0) return "Boss, is naam se koi player nahi mila.";
      const list = data.players
        .map((p) => `${p.name} (UID: ${p.uid})`)
        .join(", ");
      return `Boss, ${data.players.length} player mile: ${list}.`;
    }
    if (data.status === "not_found") return "Boss, wo player nahi mila.";
  }

  if (step.action === "read_withdrawal_status") {
    if (Array.isArray(data.withdrawals)) {
      const list = data.withdrawals;
      if (list.length === 0) return "Boss, koi pending withdrawal nahi hai abhi.";
      const preview = list
        .slice(0, 5)
        .map((w) => `${w.user_name || w.user_email || "unknown"} - ₹${w.amount}`)
        .join(", ");
      const more = list.length > 5 ? " aur baaki." : ".";
      return `Boss, ${list.length} pending withdrawal hain: ${preview}${more}`;
    }
  }

  if (step.action === "read_match_data") {
    if (Array.isArray(data.matches)) {
      const list = data.matches;
      if (list.length === 0) return "Boss, koi pending screenshot nahi hai abhi.";
      const preview = list
        .slice(0, 5)
        .map((m) => `${m.ign || m.uid || "player"} - "${m.tournament}"`)
        .join(", ");
      const more = list.length > 5 ? " aur baaki." : ".";
      return `Boss, ${list.length} pending screenshot verification hain: ${preview}${more}`;
    }
  }

  if (step.action === "update_tournament") {
    if (data.status === "not_found") return "Boss, wo tournament nahi mila update karne ke liye.";
    if (data.status === "updated") {
      const t = data.data || {};
      return `Boss, "${t.title}" update kar diya.`;
    }
  }

  if (step.action === "delete_tournament") {
    if (data.status === "not_found") return "Boss, wo tournament nahi mila delete karne ke liye.";
    if (data.status === "deleted") {
      const t = data.data || {};
      return `Boss, "${t.title}" tournament delete kar diya.`;
    }
  }

  if (step.action === "read_security_logs") {
    if (Array.isArray(data.alerts)) {
      const list = data.alerts;
      if (list.length === 0) return "Boss, koi alert nahi hai, sab clean hai.";
      const preview = list
        .slice(0, 5)
        .map((a) => `${a.severity} - ${a.title}`)
        .join(", ");
      const more = list.length > 5 ? " aur baaki." : ".";
      return `Boss, ${list.length} alert hain: ${preview}${more}`;
    }
  }

  if (step.action === "security_scan") {
    if (typeof data.unacknowledged_total === "number") {
      if (data.clean) return "Boss, sab clean hai, koi pending alert nahi.";
      return `Boss, ${data.unacknowledged_total} unacknowledged alert hain — High: ${data.high}, Medium: ${data.medium}, Low: ${data.low}.`;
    }
  }

  return null;
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

    // Create the actual tournament via the existing bridge action.
    // Field names here MUST match what core/tools/tournament_tools.py's
    // create_tournament() reads from context (camelCase: entryFee,
    // maxSlots, firstPrize, secondPrize, thirdPrize, killReward, date).
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
          entryFee: draft.entryFee,
          maxSlots: draft.maxSlots,
          date: draft.startTime,
          killReward: draft.killReward,
          firstPrize: draft.firstPrize,
          secondPrize: draft.secondPrize,
          thirdPrize: draft.thirdPrize,
        },
      });

      // ---- Check whether this needs biometric approval BEFORE
      // treating anything else as success/failure. create_tournament
      // is HIGH risk, so this will normally be true on first dispatch. ----
      const { needsApprove, msg, verificationMatch } = detectApproval(result);

      if (needsApprove) {
        // The bridge has already stored our full context (title, game,
        // fees, prizes, etc.) against this request_id on the Python
        // side - approve_and_execute() will use that stored context
        // directly, so we don't need to keep the draft around or send
        // remaining_steps to resume anything. Safe to reset now.
        await resetDraft();
        return approvalRequiredResponse({
          result,
          msg,
          verificationMatch,
          agentId: "ARIA",
        });
      }

      await resetDraft();

      if (result?.status === "created" || result?.success) {
        return chatResponse(
          `Tournament ban gaya, Boss — "${draft.title}" live ho gaya.`,
          "ARIA"
        );
      }

      return chatResponse(
        `Boss, tournament banane mein dikkat aayi: ${result?.message || "unknown error"}.`,
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
    // All fields filled already — shouldn't normally happen, move to duplicate check.
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

  // All fields collected — run duplicate check.
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
    await updateDraft({ stage: "duplicate_confirm", duplicateTournamentId: existing.id });
    return chatResponse(
      `Boss, isi time pe already ek ${draft.game} tournament hai — "${existing.title}". Phir bhi banana hai?`,
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
// SINGLE-STEP DISPATCH (now passes through any
// LLM-extracted params, e.g. status/game/uid/name)
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
      ...(step.params && typeof step.params === "object" ? step.params : {}),
    },
  });

  const { needsApprove, msg, verificationMatch } = detectApproval(result);

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
        steps = [{ agent_id: llm.agent_id, action: llm.action, params: llm.params }];
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
        return approvalRequiredResponse({
          result,
          msg,
          verificationMatch,
          agentId: result?.agent || result?.agent_id || step.agent_id,
          completed,
          remainingSteps: steps.slice(i),
        });
      }

      let stepMessage =
        formatToolReply(step, result) ||
        result?.data?.message ||
        result?.message ||
        "Done, Boss.";

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