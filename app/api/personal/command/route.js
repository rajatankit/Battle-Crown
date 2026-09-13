import { NextResponse } from "next/server";
import { requirePersonalOwner } from "../../../lib/personal-owner";
import { cortexDispatch } from "../../../lib/cortex/client";
import { askCortexLLM } from "../../../lib/cortex/llm";
import { saveMemory, getMemoriesWithIds, deleteMemoryById } from "../../../lib/cortex/memory";
import { logCortexError } from "../../../lib/cortex/errorLogger";
import { prisma } from "../../../lib/prisma";
import { messaging } from "../../../lib/firebase-admin";
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
import { askCortexRaw, generateImage } from "../../../lib/cortex/llm";
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
import { getDbSchemaContext } from "../../../lib/cortex/schemaContext";
import { runSafeQuery } from "../../../lib/cortex/dbQuery";
import { runWriteQuery } from "../../../lib/cortex/dbQuery";
import {
  getDbWriteDraft,
  startDbWriteDraft,
  updateDbWriteDraft,
  resetDbWriteDraft,
  isDbWriteIntent,
  isAffirmativeWrite,
  isNegativeWrite,
  isStrongConfirmWrite,
} from "../../../lib/cortex/dbWriteWizard";
import {
  getNotifyDraft,
  startNotifyDraft,
  updateNotifyDraft,
  resetNotifyDraft,
  isNotifyJoinersIntent,
  isCancelWordNotify,
} from "../../../lib/cortex/notificationWizard";
import {
  getPendingDraft,
  startPendingDraft,
  updatePendingDraft,
  resetPendingDraft,
  isCancelWordPending,
  isAffirmativePending,
  isBanIntent,
  isWalletAdjustIntent,
  isRescheduleIntent,
} from "../../../lib/cortex/pendingActionWizard";
import {
  isGrievanceIntent,
  isRevenueReportIntent,
  isPosterIntent,
  isMatchUpdateIntent,
} from "../../../lib/cortex/adminActions";

import { getCortexContext, setLastTournament, setLastPlayer, hasPronounReference, resolvePronouns, getRecentConversation, setLastList, hasOrdinalReference, resolveOrdinalReference } from "../../../lib/cortex/context";
import { findTournamentByTitleFuzzy, findUserByIdentifierFuzzy } from "../../../lib/cortex/fuzzyMatch";
import { normalizeCommonTypos } from "../../../lib/cortex/textNormalize";

function chatResponse(message, agent = "CORTEX") {
  return NextResponse.json({
    success: true,
    result: { success: true, agent, message },
  });
}

// ============================================
// CONFIDENCE-BASED CONFIRMATION
// ============================================
const RISKY_ACTIONS = new Set([
  "ARIA:delete_tournament",
  "ARIA:update_tournament",
  "SENTINEL:security_action",
]);
const LOW_CONFIDENCE_THRESHOLD = 0.6;

function findLowConfidenceRiskyStep(steps) {
  for (const step of steps) {
    const key = `${step.agent_id}:${step.action}`;
    const confidence = typeof step.confidence === "number" ? step.confidence : 1;
    if (RISKY_ACTIONS.has(key) && confidence < LOW_CONFIDENCE_THRESHOLD) {
      return step;
    }
  }
  return null;
}

function describeStepForConfirmation(step) {
  const paramsText = Object.entries(step.params || {})
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  return `${step.agent_id}:${step.action}${paramsText ? ` (${paramsText})` : ""}`;
}

// Uses the LLM to figure out WHICH existing memory the Boss is
// referring to when he asks to forget something spoken in natural
// language, then deletes just that one row.
async function forgetMatchingMemories(forgetTexts) {
  if (!Array.isArray(forgetTexts) || forgetTexts.length === 0) return [];

  const existing = await getMemoriesWithIds();
  if (existing.length === 0) return [];

  const forgotten = [];

  for (const forgetText of forgetTexts) {
    const listing = existing.map((m) => `${m.id}: ${m.fact}`).join("\n");

    const prompt = `Yahan Boss ke saved memories hain (id: fact):
${listing}

Boss ne kaha: "${forgetText}" — isse bhulwane ko bola.

Sabse zyada match karti memory ka SIRF ID number return karo, kuch aur nahi.
Koi bhi match na ho to "NONE" likho.`;

    try {
      const raw = await askCortexRaw(prompt);
      const idMatch = raw.trim().match(/^\d+/);
      if (idMatch) {
        const id = parseInt(idMatch[0], 10);
        const target = existing.find((m) => m.id === id);
        if (target) {
          const ok = await deleteMemoryById(id);
          if (ok) forgotten.push(target.fact);
        }
      }
    } catch (err) {
      console.error("Failed to match/forget Cortex memory:", err);
    }
  }

  return forgotten;
}

// ============================================
// SHARED APPROVAL DETECTION
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

async function updateContextFromResult(step, result) {
  try {
    const data = result?.data;
    if (!data) return;

    if (step.action === "read_tournament" && data.tournament) {
      await setLastTournament({
        pk: data.tournament.id,
        title: data.tournament.title,
        firestoreId: null,
      });
    }

    if (step.action === "read_tournament" && Array.isArray(data.tournaments)) {
      await setLastList("tournament", data.tournaments.map((t) => ({ id: t.id, label: t.title })));
    }

    if (step.action === "read_player_data" && data.player) {
      await setLastPlayer({ id: data.player.id, name: data.player.name });
    }

    if (step.action === "read_player_data" && Array.isArray(data.players)) {
      await setLastList("player", data.players.map((p) => ({ id: p.id, label: p.name || p.uid })));
    }

    if (step.action === "read_withdrawal_status" && Array.isArray(data.withdrawals)) {
      await setLastList(
        "withdrawal",
        data.withdrawals.map((w) => ({ id: w.id, label: `${w.user_name || w.user_email || "player"} - ₹${w.amount}` }))
      );
    }

    if (step.action === "read_match_data" && Array.isArray(data.matches)) {
      await setLastList(
        "match",
        data.matches.map((m) => ({ id: m.id, label: `${m.ign || m.uid || "player"} - ${m.tournament}` }))
      );
    }

    if (step.action === "read_security_logs" && Array.isArray(data.alerts)) {
      await setLastList("alert", data.alerts.map((a) => ({ id: a.id, label: `${a.severity} - ${a.title}` })));
    }
  } catch {
    // context update is best-effort, never block the main response
  }
}

function looksLikeDataQuestion(text) {
  const t = text.toLowerCase();
  return /\b(kitne|kitna|kaun|kya|list|dikhao|status|kab|players?|tournament|wallet|balance|withdrawal|transaction|history|join|score|record)\b/.test(t);
}

async function tryDatabaseFallback(command, uid) {
  let historyBlock = "";
  try {
    const recent = await getRecentConversation(uid, { limit: 10, sinceMinutes: 20 });
    if (recent.length > 0) {
      historyBlock = `\nRecent conversation (for context on follow-up questions like "uska", "poori list", "aur batao"):\n${recent
        .map((l) => `${l.role === "user" ? "Boss" : "CORTEX"}: ${l.message}`)
        .join("\n")}\n`;
    }
  } catch (err) {
    console.error("Failed to load recent conversation for DB fallback:", err);
  }

  const sqlPrompt = `${getDbSchemaContext()}
${historyBlock}
Boss ka current sawaal: "${command}"

Agar ye sawaal pichli baat ka follow-up hai (jaise "uska poori list do", "aur kitne baaki hai"), to conversation history se pata karo kis player/tournament/topic ki baat ho rahi hai, aur usi ke context mein query likho.

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
${historyBlock}
Boss ne ab poocha: "${command}"
Database result: ${resultsJson}
Isse chhota natural jawaab do (1-4 sentences, agar list hai to items clearly gino). Khaali result ho to bolo koi data nahi mila.`;

    const answer = await askCortexRaw(answerPrompt);
    return answer.trim();
  } catch (err) {
    console.error("DB fallback failed:", err);
    return null;
  }
}

async function handleDbWriteTurn(draft, command) {
  if (isNegativeWrite(command) || /\bcancel\b/i.test(command)) {
    await resetDbWriteDraft();
    return chatResponse("Theek hai Boss, cancel kar diya.", "CORTEX");
  }

  if (draft.stage === "confirm1") {
    if (!isAffirmativeWrite(command)) {
      return chatResponse('Boss, "haan" ya "cancel" boliye.', "CORTEX");
    }
    await updateDbWriteDraft({ stage: "confirm2" });
    return chatResponse(
      'Boss, ye undo nahi hoga. Pakka karna hai? Exactly bolo: "haan pakka update karo"',
      "CORTEX"
    );
  }

  if (draft.stage === "confirm2") {
    if (!isStrongConfirmWrite(command)) {
      return chatResponse(
        'Boss, exact phrase boliye: "haan pakka update karo", ya "cancel" boliye.',
        "CORTEX"
      );
    }

    try {
      const count = await runWriteQuery(draft.generatedSql);
      await resetDbWriteDraft();
      return chatResponse(`Ho gaya Boss, ${count} row(s) update hui.`, "CORTEX");
    } catch (err) {
      await resetDbWriteDraft();
      return chatResponse(`Boss, update fail ho gaya: ${err.message}`, "CORTEX");
    }
  }

  await resetDbWriteDraft();
  return chatResponse("Boss, kuch gadbad ho gayi.", "CORTEX");
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

      const { needsApprove, msg, verificationMatch } = detectApproval(result);

      if (needsApprove) {
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
      const request = draft.request;
      await resetAtlasDraft();

      if (result?.status === "committed" || result?.success) {
        if (result?.commit_sha) {
          await prisma.atlasCommitLog.create({
            data: {
              path: committedPath,
              commitSha: result.commit_sha,
              previousContent: result.previous_content || null,
              request,
              status: "pending",
            },
          });
        }
        return chatResponse(
          `Ho gaya Boss, ${committedPath} commit ho gaya. Build check kar raha hoon, result batadunga.`,
          "ATLAS"
        );
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
// ROOM-DETAILS NOTIFICATION WIZARD
// ============================================

async function extractTournamentTitleFromText(command) {
  const prompt = `Extract ONLY the tournament name mentioned in this sentence.
Reply with just the name, no quotes, no extra words, no explanation.
If broken Hinglish grammar surrounds it, still pull out just the name.

Sentence: "${command}"`;

  const raw = await askCortexRaw(prompt);
  return raw.replace(/["'.]/g, "").trim();
}

async function sendRoomDetailsPush(tokens, tournamentTitle, roomId, roomPassword) {
  if (!tokens.length) return { successCount: 0, failureCount: 0 };

  const chunks = [];
  for (let i = 0; i < tokens.length; i += 500) {
    chunks.push(tokens.slice(i, i + 500));
  }

  let successCount = 0;
  let failureCount = 0;

  for (const chunk of chunks) {
    try {
      const res = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: {
          title: `Room Details — ${tournamentTitle}`,
          body: `Room ID: ${roomId} | Password: ${roomPassword}`,
        },
      });
      successCount += res.successCount;
      failureCount += res.failureCount;
    } catch (err) {
      failureCount += chunk.length;
    }
  }

  return { successCount, failureCount };
}

async function handleNotifyStart(command) {
  const title = await extractTournamentTitleFromText(command);

  if (!title) {
    return chatResponse(
      "Boss, kaunsa tournament? Naam clearly boliye.",
      "LYRA"
    );
  }

  await startNotifyDraft(title);
  return chatResponse("Room ID kya hogi Boss?", "LYRA");
}

async function handleNotifyTurn(draft, command) {
  if (isCancelWordNotify(command)) {
    await resetNotifyDraft();
    return chatResponse("Theek hai Boss, cancel kar diya.", "LYRA");
  }

  if (draft.stage === "await_room_id") {
    const roomId = command.trim();
    if (!roomId) {
      return chatResponse("Boss, room ID boliye.", "LYRA");
    }
    await updateNotifyDraft({ roomId, stage: "await_password" });
    return chatResponse("Password kya hoga Boss?", "LYRA");
  }

  if (draft.stage === "await_password") {
    const roomPassword = command.trim();
    if (!roomPassword) {
      return chatResponse("Boss, password boliye.", "LYRA");
    }

    try {
      const tournament = await findTournamentByTitleFuzzy(draft.tournamentTitle);

      if (!tournament) {
        await resetNotifyDraft();
        return chatResponse(
          `Boss, "${draft.tournamentTitle}" naam ka tournament nahi mila.`,
          "LYRA"
        );
      }

      await prisma.tournament.update({
        where: { id: tournament.id },
        data: { roomId, roomPassword },
      });

      const payments = await prisma.entryPayment.findMany({
        where: { tournamentId: tournament.id, status: "PAID" },
        include: { user: true },
        distinct: ["userId"],
      });

      const users = payments.map((p) => p.user).filter(Boolean);

      if (users.length === 0) {
        await resetNotifyDraft();
        return chatResponse(
          `Boss, "${tournament.title}" mein abhi tak koi player join nahi hua.`,
          "LYRA"
        );
      }

      await prisma.notification.createMany({
        data: users.map((u) => ({
          type: "room_details",
          userId: u.uid || String(u.id),
          title: `Room Details — ${tournament.title}`,
          message: `Room ID: ${roomId} | Password: ${roomPassword}`,
        })),
      });

      const tokens = users.map((u) => u.fcmToken).filter(Boolean);
      const { successCount } = await sendRoomDetailsPush(
        tokens,
        tournament.title,
        roomId,
        roomPassword
      );

      await resetNotifyDraft();

      return chatResponse(
        `Boss, ${users.length} player ne "${tournament.title}" join kiya tha, sabko notification bhej di hai${
          tokens.length ? ` (${successCount}/${tokens.length} device tak push pahunchi)` : ""
        }.`,
        "LYRA"
      );
    } catch (err) {
      await resetNotifyDraft();
      await logCortexError("personal/command:notify_joiners", err);
      return chatResponse(
        "Boss, notification bhejte waqt error aaya. Dobara try kariye.",
        "LYRA"
      );
    }
  }

  await resetNotifyDraft();
  return chatResponse("Boss, kuch gadbad ho gayi, dobara try karo.", "LYRA");
}

// ============================================
// BAN / SUSPEND PLAYER
// ============================================

async function findUserByIdentifier(identifier) {
  return findUserByIdentifierFuzzy(identifier);
}

async function handleBanStart(command) {
  const raw = await askCortexRaw(`Extract player-ban details from this sentence as JSON only, no markdown, no explanation:
{"player": "<name or uid mentioned, or null>", "reason": "<reason if mentioned, else null>"}
Sentence: "${command}"`);

  let parsed = {};
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    // fall through with empty parsed
  }

  const identifier = parsed.player?.trim();
  if (!identifier) {
    return chatResponse("Boss, kaunsa player? Naam ya UID boliye.", "SENTINEL");
  }

  const user = await findUserByIdentifier(identifier);
  if (!user) {
    return chatResponse(`Boss, "${identifier}" naam ka player nahi mila.`, "SENTINEL");
  }

  if (user.banned) {
    return chatResponse(`Boss, "${user.name || user.email}" already banned hai.`, "SENTINEL");
  }

  const payload = {
    userId: user.id,
    userName: user.name || user.email,
    reason: parsed.reason?.trim() || null,
  };

  if (!payload.reason) {
    await startPendingDraft("ban_player", payload, "await_reason");
    return chatResponse(`Boss, "${payload.userName}" ko ban karne ki wajah kya hai?`, "SENTINEL");
  }

  await startPendingDraft("ban_player", payload, "confirm1");
  return chatResponse(
    `Boss, pakka "${payload.userName}" ko ban karna hai? Wajah: ${payload.reason}. "haan" boliye confirm karne ke liye.`,
    "SENTINEL"
  );
}

async function handleBanTurn(draft, command) {
  const payload = draft.payload || {};

  if (draft.stage === "await_reason") {
    const reason = command.trim();
    if (!reason) return chatResponse("Boss, wajah boliye.", "SENTINEL");

    await updatePendingDraft({ payload: { ...payload, reason }, stage: "confirm1" });
    return chatResponse(
      `Boss, pakka "${payload.userName}" ko ban karna hai? Wajah: ${reason}. "haan" boliye.`,
      "SENTINEL"
    );
  }

  if (draft.stage === "confirm1") {
    if (!isAffirmativePending(command)) {
      return chatResponse('Boss, "haan" ya "cancel" boliye.', "SENTINEL");
    }

    try {
      await prisma.user.update({
        where: { id: payload.userId },
        data: { banned: true, banReason: payload.reason, bannedAt: new Date() },
      });
      await resetPendingDraft();
      return chatResponse(`Ho gaya Boss, "${payload.userName}" ban kar diya.`, "SENTINEL");
    } catch (err) {
      await resetPendingDraft();
      await logCortexError("personal/command:ban_player", err);
      return chatResponse("Boss, ban karte waqt error aaya.", "SENTINEL");
    }
  }

  await resetPendingDraft();
  return chatResponse("Boss, kuch gadbad ho gayi.", "SENTINEL");
}

// ============================================
// WALLET MANUAL ADJUSTMENT
// ============================================

async function handleWalletAdjustStart(command) {
  const raw = await askCortexRaw(`Extract wallet adjustment details from this sentence as JSON only, no markdown:
{"player": "<name or uid, or null>", "amount": <number, positive to add, negative to deduct, or null if not mentioned>, "reason": "<reason if mentioned, else null>"}
Sentence: "${command}"`);

  let parsed = {};
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    // fall through
  }

  const identifier = parsed.player?.trim();
  if (!identifier) {
    return chatResponse("Boss, kis player ka wallet? Naam boliye.", "NOVA");
  }

  const user = await findUserByIdentifier(identifier);
  if (!user) {
    return chatResponse(`Boss, "${identifier}" naam ka player nahi mila.`, "NOVA");
  }

  const payload = {
    userId: user.id,
    userName: user.name || user.email,
    amount: typeof parsed.amount === "number" ? parsed.amount : null,
    reason: parsed.reason?.trim() || null,
  };

  if (payload.amount === null) {
    await startPendingDraft("wallet_adjust", payload, "await_amount");
    return chatResponse(
      `Boss, kitna amount adjust karna hai "${payload.userName}" ke wallet mein? Add ke liye positive number, deduct ke liye negative bolo.`,
      "NOVA"
    );
  }

  if (!payload.reason) {
    await startPendingDraft("wallet_adjust", payload, "await_reason");
    return chatResponse("Boss, iski wajah kya hai?", "NOVA");
  }

  await startPendingDraft("wallet_adjust", payload, "confirm1");
  return chatResponse(
    `Boss, "${payload.userName}" ke wallet mein ₹${payload.amount} ${
      payload.amount >= 0 ? "add" : "deduct"
    } karna hai — wajah: ${payload.reason}. Pakka? "haan" boliye.`,
    "NOVA"
  );
}

async function handleWalletTurn(draft, command) {
  const payload = draft.payload || {};

  if (draft.stage === "await_amount") {
    const amount = parseFloat(command.replace(/[^\d.\-]/g, ""));
    if (Number.isNaN(amount)) {
      return chatResponse("Boss, sirf number boliye, jaise 500 ya -200.", "NOVA");
    }

    const updated = { ...payload, amount };
    if (!payload.reason) {
      await updatePendingDraft({ payload: updated, stage: "await_reason" });
      return chatResponse("Boss, iski wajah kya hai?", "NOVA");
    }

    await updatePendingDraft({ payload: updated, stage: "confirm1" });
    return chatResponse(
      `Boss, "${payload.userName}" ke wallet mein ₹${amount} ${
        amount >= 0 ? "add" : "deduct"
      } karna hai — wajah: ${payload.reason}. Pakka? "haan" boliye.`,
      "NOVA"
    );
  }

  if (draft.stage === "await_reason") {
    const reason = command.trim();
    if (!reason) return chatResponse("Boss, wajah boliye.", "NOVA");

    await updatePendingDraft({ payload: { ...payload, reason }, stage: "confirm1" });
    return chatResponse(
      `Boss, "${payload.userName}" ke wallet mein ₹${payload.amount} ${
        payload.amount >= 0 ? "add" : "deduct"
      } karna hai — wajah: ${reason}. Pakka? "haan" boliye.`,
      "NOVA"
    );
  }

  if (draft.stage === "confirm1") {
    if (!isAffirmativePending(command)) {
      return chatResponse('Boss, "haan" ya "cancel" boliye.', "NOVA");
    }
    await updatePendingDraft({ stage: "confirm2" });
    return chatResponse(
      'Boss, ye financial change hai, undo nahi hoga. Pakka? Exactly bolo: "haan pakka adjust karo"',
      "NOVA"
    );
  }

  if (draft.stage === "confirm2") {
    if (!/haan pakka adjust karo/i.test(command)) {
      return chatResponse(
        'Boss, exact phrase boliye: "haan pakka adjust karo", ya "cancel" boliye.',
        "NOVA"
      );
    }

    try {
      await prisma.walletAdjustment.create({
        data: { userId: payload.userId, amount: payload.amount, reason: payload.reason },
      });
      await resetPendingDraft();
      return chatResponse(
        `Ho gaya Boss, "${payload.userName}" ke wallet mein ₹${payload.amount} adjust kar diya.`,
        "NOVA"
      );
    } catch (err) {
      await resetPendingDraft();
      await logCortexError("personal/command:wallet_adjust", err);
      return chatResponse("Boss, adjust karte waqt error aaya.", "NOVA");
    }
  }

  await resetPendingDraft();
  return chatResponse("Boss, kuch gadbad ho gayi.", "NOVA");
}

// ============================================
// RESCHEDULE TOURNAMENT
// ============================================

async function handleRescheduleStart(command) {
  const title = await extractTournamentTitleFromText(command);
  if (!title) {
    return chatResponse("Boss, kaunsa tournament reschedule karna hai?", "ARIA");
  }

  const tournament = await findTournamentByTitleFuzzy(title);

  if (!tournament) {
    return chatResponse(`Boss, "${title}" naam ka tournament nahi mila.`, "ARIA");
  }

  await startPendingDraft(
    "reschedule_tournament",
    { tournamentId: tournament.id, tournamentTitle: tournament.title },
    "await_datetime"
  );

  return chatResponse(`Boss, "${tournament.title}" ka naya date aur time kya hoga?`, "ARIA");
}

// ============================================
// MATCH RESULT UPDATE (before/after confirm + high-risk approval)
// ============================================

async function findMatchByIdentifier(command) {
  const raw = await askCortexRaw(`Extract match-identifying details from this sentence as JSON only, no markdown:
{"tournament": "<tournament name if mentioned, else null>", "player": "<player name/ign/uid if mentioned, else null>"}
Sentence: "${command}"`);

  let parsed = {};
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return null;
  }

  if (!parsed.tournament && !parsed.player) return null;

  const where = {};
  if (parsed.tournament) {
    where.tournament = { title: { contains: parsed.tournament, mode: "insensitive" } };
  }
  if (parsed.player) {
    where.OR = [
      { ign: { contains: parsed.player, mode: "insensitive" } },
      { uid: { contains: parsed.player, mode: "insensitive" } },
    ];
  }

  return prisma.matchHistory.findFirst({
    where,
    include: { tournament: true },
    orderBy: { createdAt: "desc" },
  });
}

async function handleMatchUpdateStart(command) {
  const match = await findMatchByIdentifier(command);

  if (!match) {
    return chatResponse(
      "Boss, kaunsa match? Tournament ka naam ya player ka naam/IGN boliye.",
      "ORION"
    );
  }

  await startPendingDraft(
    "update_match_result",
    {
      matchId: match.id,
      tournamentTitle: match.tournament?.title || "unknown",
      playerLabel: match.ign || match.uid || "player",
      current: {
        kills: match.kills,
        placement: match.placement,
        resultStatus: match.resultStatus,
      },
      changes: {},
    },
    "await_changes"
  );

  return chatResponse(
    `Boss, "${match.tournament?.title}" mein "${match.ign || match.uid}" ka current record — Kills: ${match.kills}, Placement: ${match.placement ?? "N/A"}, Status: ${match.resultStatus}. Kya update karna hai?`,
    "ORION"
  );
}

async function handleMatchUpdateTurn(draft, command) {
  const payload = draft.payload || {};

  if (draft.stage === "await_changes") {
    const raw = await askCortexRaw(`Boss said this about updating a match result: "${command}"
Extract ONLY the fields being changed as JSON, no markdown:
{"kills": <number or null>, "placement": <number or null>, "resultStatus": "VERIFIED" or "REJECTED" or "ADMIN_REVIEW" or null}
Only include a field if Boss actually mentioned changing it — use null for anything not mentioned.`);

    let changes = {};
    try {
      changes = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      return chatResponse("Boss, samajh nahi aaya kya update karna hai, dobara boliye.", "ORION");
    }

    const cleaned = {};
    for (const [k, v] of Object.entries(changes)) {
      if (v !== null && v !== undefined) cleaned[k] = v;
    }

    if (Object.keys(cleaned).length === 0) {
      return chatResponse("Boss, kya badalna hai clearly boliye — kills, placement, ya status.", "ORION");
    }

    const before = payload.current;
    const after = { ...before, ...cleaned };

    await updatePendingDraft({ payload: { ...payload, changes: cleaned }, stage: "confirm1" });

    return chatResponse(
      `Boss, "${payload.playerLabel}" ka record — Pehle: Kills ${before.kills}, Placement ${before.placement ?? "N/A"}, Status ${before.resultStatus}. Ab: Kills ${after.kills}, Placement ${after.placement ?? "N/A"}, Status ${after.resultStatus}. Confirm karu? "haan" boliye.`,
      "ORION"
    );
  }

  if (draft.stage === "confirm1") {
    if (!isAffirmativePending(command)) {
      return chatResponse('Boss, "haan" ya "cancel" boliye.', "ORION");
    }

    // High-risk — route through the same approval flow other risky
    // actions use, instead of writing directly.
    try {
      const result = await cortexDispatch({
        agentId: "ORION",
        action: "manage_match",
        task: "update_match_result",
        context: {
          source: "personal_voice",
          match_id: payload.matchId,
          ...payload.changes,
          risk: "high",
        },
      });

      const { needsApprove, msg, verificationMatch } = detectApproval(result);
      if (needsApprove) {
        await resetPendingDraft();
        return approvalRequiredResponse({ result, msg, verificationMatch, agentId: "ORION" });
      }

      await resetPendingDraft();

      if (result?.success || result?.status === "updated") {
        return chatResponse(`Ho gaya Boss, "${payload.playerLabel}" ka record update kar diya.`, "ORION");
      }
      return chatResponse(`Boss, update fail ho gaya: ${result?.message || "unknown error"}`, "ORION");
    } catch (err) {
      await resetPendingDraft();
      await logCortexError("personal/command:match_update", err);
      return chatResponse("Boss, match update karte waqt error aaya.", "ORION");
    }
  }

  await resetPendingDraft();
  return chatResponse("Boss, kuch gadbad ho gayi.", "ORION");
}

async function handleRescheduleTurn(draft, command) {
  const payload = draft.payload || {};

  if (draft.stage === "await_datetime") {
    const raw = await askCortexRaw(`Convert this into an ISO 8601 datetime (assume Asia/Kolkata timezone if none given, assume year ${new Date().getFullYear()} if none given). Reply with ONLY the ISO datetime string, nothing else, no explanation.
Sentence: "${command}"`);

    const parsedDate = new Date(raw.trim());
    if (Number.isNaN(parsedDate.getTime())) {
      return chatResponse("Boss, date/time samajh nahi aaya, dobara clearly boliye.", "ARIA");
    }

    await updatePendingDraft({
      payload: { ...payload, newStartTime: parsedDate.toISOString() },
      stage: "confirm1",
    });

    const displayTime = parsedDate.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    });

    return chatResponse(
      `Boss, "${payload.tournamentTitle}" ko ${displayTime} pe reschedule karna hai. Pakka? "haan" boliye.`,
      "ARIA"
    );
  }

  if (draft.stage === "confirm1") {
    if (!isAffirmativePending(command)) {
      return chatResponse('Boss, "haan" ya "cancel" boliye.', "ARIA");
    }

    try {
      await prisma.tournament.update({
        where: { id: payload.tournamentId },
        data: { startTime: new Date(payload.newStartTime), reminderSent: false },
      });
      await resetPendingDraft();
      return chatResponse(`Ho gaya Boss, "${payload.tournamentTitle}" reschedule kar diya.`, "ARIA");
    } catch (err) {
      await resetPendingDraft();
      await logCortexError("personal/command:reschedule", err);
      return chatResponse("Boss, reschedule karte waqt error aaya.", "ARIA");
    }
  }

  await resetPendingDraft();
  return chatResponse("Boss, kuch gadbad ho gayi.", "ARIA");
}

// ============================================
// GENERIC PENDING-ACTION DISPATCH
// ============================================

async function handlePendingTurn(draft, command, uid) {
  if (isCancelWordPending(command)) {
    await resetPendingDraft();
    return chatResponse("Theek hai Boss, cancel kar diya.", "CORTEX");
  }

  if (draft.kind === "confirm_tool") {
    if (!isAffirmativePending(command)) {
      await resetPendingDraft();
      return chatResponse("Theek hai Boss, dobara sahi tarike se boliye.", "CORTEX");
    }
    const payload = draft.payload || {};
    const steps = Array.isArray(payload.steps) ? payload.steps : [];
    await resetPendingDraft();
    if (steps.length === 0) {
      return chatResponse("Boss, kuch gadbad ho gayi, dobara try karo.", "CORTEX");
    }
    return await executeSteps(steps, {
      command: payload.command || command,
      uid,
      approved: false,
      approvalMethod: null,
      riskHint: null,
    });
  }

  if (draft.kind === "ban_player") return handleBanTurn(draft, command);
  if (draft.kind === "wallet_adjust") return handleWalletTurn(draft, command);
  if (draft.kind === "reschedule_tournament") return handleRescheduleTurn(draft, command);
  if (draft.kind === "update_match_result") return handleMatchUpdateTurn(draft, command);

  await resetPendingDraft();
  return chatResponse("Boss, kuch gadbad ho gayi.", "CORTEX");
}

// ============================================
// GRIEVANCE RESOLUTION (single-shot)
// ============================================

async function handleGrievanceCommand(command) {
  const raw = await askCortexRaw(`Extract grievance action details from this sentence as JSON only, no markdown:
{"action": "list" or "resolve", "grievance_id": <number or null>, "resolution": "<resolution text if mentioned, else null>", "status": "RESOLVED" or "ESCALATED" or "REJECTED"}
Default action to "list" if no specific grievance ID is mentioned. Default status to "RESOLVED" if action is "resolve" and no status mentioned.
Sentence: "${command}"`);

  let parsed = {};
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    parsed = { action: "list" };
  }

  if (parsed.action === "resolve" && parsed.grievance_id) {
    try {
      const grievance = await prisma.grievance.update({
        where: { id: Number(parsed.grievance_id) },
        data: {
          status: parsed.status || "RESOLVED",
          resolution: parsed.resolution || "Resolved via CORTEX.",
          resolvedAt: new Date(),
        },
      });
      return chatResponse(
        `Ho gaya Boss, grievance #${grievance.id} "${grievance.status}" mark kar diya.`,
        "ELARA"
      );
    } catch (err) {
      return chatResponse(
        `Boss, grievance #${parsed.grievance_id} nahi mila ya update fail hua.`,
        "ELARA"
      );
    }
  }

  const pending = await prisma.grievance.findMany({
    where: { status: { in: ["OPEN", "IN_REVIEW"] } },
    include: { user: true },
    take: 10,
    orderBy: { raisedAt: "asc" },
  });

  if (pending.length === 0) {
    return chatResponse("Boss, koi pending grievance nahi hai.", "ELARA");
  }

  const preview = pending
    .map((g) => `#${g.id} ${g.user?.name || "player"} - ${g.subject}`)
    .join(", ");

  return chatResponse(`Boss, ${pending.length} pending grievance hain: ${preview}.`, "ELARA");
}

// ============================================
// WEEKLY REVENUE REPORT (single-shot)
// ============================================

async function handleRevenueReportCommand() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [payments, rewards, withdrawals] = await Promise.all([
    prisma.entryPayment.aggregate({
      where: { status: "PAID", createdAt: { gte: weekAgo } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.tournamentReward.aggregate({
      where: { createdAt: { gte: weekAgo } },
      _sum: { amount: true },
    }),
    prisma.withdrawalRequest.aggregate({
      where: { status: "Paid", updatedAt: { gte: weekAgo } },
      _sum: { amount: true },
    }),
  ]);

  const revenue = payments._sum.amount || 0;
  const payouts = rewards._sum.amount || 0;
  const paidOut = withdrawals._sum.amount || 0;
  const net = revenue - paidOut;

  return chatResponse(
    `Boss, is hafte ka report — Revenue: ₹${revenue} (${payments._count} entries), Rewards allocated: ₹${payouts}, Withdrawals paid: ₹${paidOut}, Net cash position: ₹${net}.`,
    "NOVA"
  );
}

// ============================================
// TOURNAMENT POSTER GENERATION (single-shot)
// ============================================

async function handlePosterCommand(command) {
  const title = await extractTournamentTitleFromText(command);
  if (!title) {
    return chatResponse("Boss, kis tournament ka poster banau?", "ARIA");
  }

 const tournament = await findTournamentByTitleFuzzy(title);

  if (!tournament) {
    return chatResponse(`Boss, "${title}" naam ka tournament nahi mila.`, "ARIA");
  }

  try {
    const imageDataUri = await generateImage(
      `Esports tournament poster for "${tournament.title}", game: ${tournament.game}. Bold, high-energy gaming aesthetic, dark background with neon accents, cinematic lighting.`
    );

    if (!imageDataUri) {
      return chatResponse("Boss, poster generate nahi ho paya.", "ARIA");
    }

    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { posterUrl: imageDataUri },
    });

    return chatResponse(`Boss, "${tournament.title}" ka poster ban gaya aur save ho gaya.`, "ARIA");
  } catch (err) {
    await logCortexError("personal/command:poster_gen", err);
    return chatResponse(
      "Boss, poster generate karte waqt error aaya — ho sakta hai image generation billing enable na ho.",
      "ARIA"
    );
  }
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
      ...(step.params && typeof step.params === "object" ? step.params : {}),
    },
  });

  const { needsApprove, msg, verificationMatch } = detectApproval(result);

  return { result, needsApprove, msg, verificationMatch };
}

async function executeSteps(steps, { command, uid, approved, approvalMethod, riskHint }) {
  const completed = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Only the step being resumed right now (always index 0 of the
    // steps we were given) can legitimately carry the "approved" flag
    // from this call. Any step further down the chain must still ask
    // for its own approval when its turn comes — otherwise one
    // approval would silently wave through every high-risk step
    // that happens to be queued after it.
    const stepApproved = approved && i === 0;

    const { result, needsApprove, msg, verificationMatch } = await runStep({
      step,
      command: command || "(resumed chain)",
      uid,
      approved: stepApproved,
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

    await updateContextFromResult(step, result);

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

  prisma.conversationLog
    .create({ data: { userId: uid, role: "assistant", message: String(combinedMessage) } })
    .catch((err) => console.error("Failed to log assistant turn:", err));

  return NextResponse.json({
    success: true,
    result: {
      success: true,
      agent: completed.length === 1 ? completed[0].agent_id : "CORTEX",
      message: combinedMessage,
      steps: completed,
    },
  });
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

  // Log the incoming command (best-effort, never blocks the request)
  if (command) {
    prisma.conversationLog
      .create({ data: { userId: uid, role: "user", message: command } })
      .catch((err) => console.error("Failed to log user turn:", err));
  }
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
    if (!resumingSteps) {
      const draft = await getDraft();

      if (draft && draft.active) {
        return await handleWizardTurn(draft, command, uid);
      }

      const atlasDraft = await getAtlasDraft();
      if (atlasDraft && atlasDraft.active) {
        return await handleAtlasTurn(atlasDraft, command);
      }

      const dbWriteDraft = await getDbWriteDraft();
      if (dbWriteDraft && dbWriteDraft.active) {
        return await handleDbWriteTurn(dbWriteDraft, command);
      }

      const notifyDraft = await getNotifyDraft();
      if (notifyDraft && notifyDraft.active) {
        return await handleNotifyTurn(notifyDraft, command);
      }

      const pendingDraft = await getPendingDraft();
      if (pendingDraft && pendingDraft.active) {
        return await handlePendingTurn(pendingDraft, command, uid);
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

      if (command && isDbWriteIntent(command)) {
        const sqlPrompt = `${getDbSchemaContext()}

Boss ka command: "${command}"

Is command ko poora karne ke liye ek single PostgreSQL UPDATE query likho. Rules:
- Sirf UPDATE query
- WHERE clause zaroori hai
- Table/column naam double quotes mein
- Sirf raw SQL do, koi explanation, koi markdown nahi`;

        const rawSql = await askCortexRaw(sqlPrompt);
        const sql = rawSql.replace(/```sql|```/gi, "").trim();

        await startDbWriteDraft(command, sql);

        return chatResponse(
          `Boss, ye query chalaunga: ${sql}. Confirm karu? "haan" boliye.`,
          "CORTEX"
        );
      }

      if (command && isNotifyJoinersIntent(command)) {
        return await handleNotifyStart(command);
      }

      if (command && isBanIntent(command)) {
        return await handleBanStart(command);
      }

      if (command && isWalletAdjustIntent(command)) {
        return await handleWalletAdjustStart(command);
      }

      if (command && isRescheduleIntent(command)) {
        return await handleRescheduleStart(command);
      }

      if (command && isMatchUpdateIntent(command)) {
        return await handleMatchUpdateStart(command);
      }

      if (command && isGrievanceIntent(command)) {
        return await handleGrievanceCommand(command);
      }

      if (command && isRevenueReportIntent(command)) {
        return await handleRevenueReportCommand();
      }

      if (command && isPosterIntent(command)) {
        return await handlePosterCommand(command);
      }
    }

    let steps;

    if (resumingSteps && resumingSteps.length > 0) {
      steps = resumingSteps;
    } else {
      let effectiveCommand = normalizeCommonTypos(command);
      if (effectiveCommand && (hasOrdinalReference(effectiveCommand) || hasPronounReference(effectiveCommand))) {
        const ctx = await getCortexContext();
        if (hasOrdinalReference(effectiveCommand)) {
          const { resolved } = resolveOrdinalReference(effectiveCommand, ctx);
          effectiveCommand = resolved;
        }
        if (hasPronounReference(effectiveCommand)) {
          effectiveCommand = resolvePronouns(effectiveCommand, ctx);
        }
      }

      const llm = await askCortexLLM(effectiveCommand);

      if (Array.isArray(llm.memoryFacts) && llm.memoryFacts.length > 0) {
        for (const fact of llm.memoryFacts) {
          try {
            await saveMemory(fact);
          } catch (err) {
            console.error("Failed to save Cortex memory:", err);
          }
        }
      }

      if (Array.isArray(llm.forgetFacts) && llm.forgetFacts.length > 0) {
        try {
          await forgetMatchingMemories(llm.forgetFacts);
        } catch (err) {
          console.error("Failed to forget Cortex memory:", err);
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
          const dbAnswer = await tryDatabaseFallback(command, uid);
          if (dbAnswer) {
            prisma.conversationLog
              .create({ data: { userId: uid, role: "assistant", message: dbAnswer } })
              .catch((err) => console.error("Failed to log assistant turn:", err));
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
        steps = [{ agent_id: llm.agent_id, action: llm.action, params: llm.params, confidence: llm.confidence }];
      } else if (llm.type === "tool_multi") {
        steps = llm.steps;
      } else {
        steps = [];
      }

      // Low-confidence risky action -> confirm before executing, instead of guessing
      if (steps.length > 0) {
        const uncertainStep = findLowConfidenceRiskyStep(steps);
        if (uncertainStep) {
          await startPendingDraft("confirm_tool", { steps, command }, "confirm1");
          return chatResponse(
            `Boss, main samajh raha hoon aap ye chahte ho: ${describeStepForConfirmation(uncertainStep)} — sahi hai? "haan" boliye confirm karne ke liye, ya sahi tarike se dobara boliye.`,
            "CORTEX"
          );
        }
      }
    }

    return await executeSteps(steps, { command, uid, approved, approvalMethod, riskHint });

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