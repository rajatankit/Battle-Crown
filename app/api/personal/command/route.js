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
import { askCortexRaw } from "../../../lib/cortex/llm";
import {
  getAtlasDraft,
  startAtlasDraft,
  updateAtlasDraft,
  resetAtlasDraft,
  isAtlasFixIntent,
  extractFilenameFromText,
  isCancelWordAtlas,
  isAffirmativeAtlas,
  isNegativeAtlas,
} from "../../../lib/cortex/atlasWizard";
import { DB_SCHEMA_CONTEXT } from "../../../lib/cortex/schemaContext";
import { runSafeQuery } from "../../../lib/cortex/dbQuery";

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
      return `Boss, ${p.name || "player"} ki UID ${p.uid} hai, email ${p.email}, level ${p.level}.`;
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

function looksLikeDataQuestion(text) {
  const t = text.toLowerCase();
  return /\b(kitne|kitna|kaun|kya|list|dikhao|status|kab|players?|tournament|wallet|balance|withdrawal|transaction|history|join|score|record)\b/.test(t);
}

async function tryDatabaseFallback(command) {
  const sqlPrompt = `${DB_SCHEMA_CONTEXT}

Boss ka sawaal: "${command}"

Is sawaal ka jawaab dene ke liye ek single PostgreSQL SELECT query likho. Rules:
- Sirf SELECT query, kuch aur nahi
- Har table/column naam double quotes mein likho (case-sensitive hai)
- LIMIT 50 se zyada mat maango
- Sirf raw SQL do, koi explanation, koi markdown, koi extra text nahi`;

  try {
    const rawSql = await askCortexRaw(sqlPrompt);
    const sql = rawSql.replace(/```sql|```/gi, "").trim();
    const rows = await runSafeQuery(sql);

    const resultsJson = JSON.stringify(rows, (key, value) =>
      typeof value === "bigint" ? value.toString() : value
    ).slice(0, 4000);

    const answerPrompt = `Tum CORTEX ho, Hinglish mein baat karte ho, "Boss" bolte ho.
Boss ne poocha: "${command}"
Database result: ${resultsJson}
Isse chhota natural jawaab do (1-3 sentences). Khaali result ho to bolo koi data nahi mila.`;

    const answer = await askCortexRaw(answerPrompt);
    return answer.trim();
  } catch (err) {
    console.error("DB fallback failed:", err);
    return null;
  }
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
// ATLAS ENGINEERING WIZARD
// ============================================

async function generateOptions(request) {
  const prompt = `Tum ek senior software engineer ho jo Battle Crown esports platform (Next.js + Prisma + Python backend) pe kaam karte ho.

User ka problem/request: "${request}"

2-3 alag-alag solution approaches suggest karo is problem ke liye. Har approach:
- title: chhota naam (4-6 words)
- description: 1-2 sentence mein kya karega

Sirf ek JSON array return karo, kuch aur text nahi:
[{"title": "...", "description": "..."}]`;

  const raw = await askCortexRaw(prompt);
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

async function generateCode({ request, chosenOption, fileContent, path }) {
  const prompt = `Tum ek senior software engineer ho. Chosen approach: "${chosenOption}"

Original request: "${request}"

${
  fileContent
    ? `Current file (${path}):\n\`\`\`\n${fileContent}\n\`\`\``
    : `File abhi khaali/naya hai: ${path}`
}

Is file ka COMPLETE updated content likho jo ye approach implement kare. Sirf raw code do - koi explanation, koi markdown backticks nahi, seedha file content jo save hoga.`;

  const raw = await askCortexRaw(prompt);
  return raw.replace(/^```[\w]*\n?/, "").replace(/```$/, "").trim();
}

async function proceedToCodeGen(draft, chosen, idx) {
  let fileContent = null;
  try {
    const readResult = await cortexDispatch({
      agentId: "ATLAS",
      action: "read_code",
      task: "atlas_read_before_edit",
      context: { repo: "battlecrown", path: draft.path },
    });
    if (readResult?.status === "ok") fileContent = readResult.content;
  } catch {
    // file naya ho sakta hai, read fail hona normal hai
  }

  const code = await generateCode({
    request: draft.request,
    chosenOption: `${chosen.title}: ${chosen.description}`,
    fileContent,
    path: draft.path,
  });

  if (!code) {
    await resetAtlasDraft();
    return chatResponse("Boss, code generate nahi ho paya. Dobara try karo.", "ATLAS");
  }

  await updateAtlasDraft({
    stage: "preview",
    path: draft.path,
    selectedOption: idx,
    generatedCode: code,
  });

  const preview = code.length > 400 ? code.slice(0, 400) + "\n...(truncated)" : code;

  return NextResponse.json({
    success: true,
    result: {
      success: true,
      agent: "ATLAS",
      message: `Boss, "${chosen.title}" implement kar raha hoon ${draft.path} mein. Confirm karu commit karne ke liye?`,
      code_preview: preview,
    },
  });
}

async function handleAtlasTurn(draft, command) {
  if (isCancelWordAtlas(command)) {
    await resetAtlasDraft();
    return chatResponse("Theek hai Boss, cancel kar diya.", "ATLAS");
  }

  if (draft.stage === "options") {
    const idx = parseInt(command.match(/\d+/)?.[0] || "", 10) - 1;
    const options = draft.optionsJson || [];
    if (Number.isNaN(idx) || idx < 0 || idx >= options.length) {
      return chatResponse("Boss, sahi number boliye jo list mein dikha.", "ATLAS");
    }

    const chosen = options[idx];
    const existingPath = draft.path || extractFilenameFromText(draft.request || "");

    if (!existingPath) {
      await updateAtlasDraft({ stage: "await_path", selectedOption: idx });
      return chatResponse(
        `"${chosen.title}" chuna. Boss, kis file mein change karna hai? Filename boliye.`,
        "ATLAS"
      );
    }

    return await proceedToCodeGen({ ...draft, path: existingPath }, chosen, idx);
  }

  if (draft.stage === "await_path") {
    const path = command.trim();
    const options = draft.optionsJson || [];
    const chosen = options[draft.selectedOption];
    if (!chosen) {
      await resetAtlasDraft();
      return chatResponse("Boss, kuch gadbad ho gayi, dobara try karo.", "ATLAS");
    }
    return await proceedToCodeGen({ ...draft, path }, chosen, draft.selectedOption);
  }

  if (draft.stage === "preview") {
    if (isNegativeAtlas(command)) {
      await resetAtlasDraft();
      return chatResponse("Theek hai Boss, cancel kar diya.", "ATLAS");
    }
    if (!isAffirmativeAtlas(command)) {
      return chatResponse('Boss, "haan" boliye commit karne ke liye, ya "cancel" boliye.', "ATLAS");
    }

    try {
      const result = await cortexDispatch({
        agentId: "ATLAS",
        action: "commit_code",
        task: "atlas_commit",
        context: {
          path: draft.path,
          code: draft.generatedCode,
          message: `CORTEX/ATLAS: ${draft.request}`,
        },
      });

      const { needsApprove, msg, verificationMatch } = detectApproval(result);
      if (needsApprove) {
        await resetAtlasDraft();
        return approvalRequiredResponse({ result, msg, verificationMatch, agentId: "ATLAS" });
      }

      const committedPath = draft.path;
      await resetAtlasDraft();

      if (result?.status === "committed" || result?.success) {
        return chatResponse(`Ho gaya Boss, ${committedPath} commit ho gaya. GitHub pe check kar lo.`, "ATLAS");
      }
      return chatResponse(`Boss, commit fail ho gaya: ${result?.message || "unknown error"}`, "ATLAS");
    } catch (err) {
      await resetAtlasDraft();
      await logCortexError("personal/command:atlas_commit", err);
      return chatResponse("Boss, commit karte waqt error aaya.", "ATLAS");
    }
  }

  await resetAtlasDraft();
  return chatResponse("Boss, kuch gadbad ho gayi, dobara try karo.", "ATLAS");
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

      const atlasDraft = await getAtlasDraft();
      if (atlasDraft && atlasDraft.active) {
        return await handleAtlasTurn(atlasDraft, command);
      }

      if (command && isTournamentCreateIntent(command)) {
        return await handleWizardStart();
      }

      if (command && isAtlasFixIntent(command)) {
        const options = await generateOptions(command);
        if (!options || options.length === 0) {
          return chatResponse("Boss, options generate nahi ho paye. Dobara bolo, thoda clearly.", "ATLAS");
        }
        await startAtlasDraft(command);
        await updateAtlasDraft({ optionsJson: options });
        const listing = options.map((o, i) => `${i + 1}: ${o.title} — ${o.description}`).join(" | ");
        return chatResponse(`Boss, ${options.length} options hain — ${listing}. Number boliye.`, "ATLAS");
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
        if (looksLikeDataQuestion(command)) {
          const dbAnswer = await tryDatabaseFallback(command);
          if (dbAnswer) {
            return NextResponse.json({
              success: true,
              result: { success: true, agent: "CORTEX", message: dbAnswer },
            });
          }
        }

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