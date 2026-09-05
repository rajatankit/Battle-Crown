import { getMemories } from "./memory";

const GROQ_API_KEY = (process.env.CORTEX_GROQ_API_KEY || "").trim();
const GEMINI_API_KEY = (process.env.CORTEX_GEMINI_API_KEY || "").trim();

function buildSystemPrompt(memories) {
  const memorySection =
    memories && memories.length > 0
      ? `\nTHINGS YOU PERMANENTLY REMEMBER ABOUT BOSS / THE BUSINESS:\n${memories
          .map((m) => `- ${m}`)
          .join("\n")}\n`
      : "";

  return `You are CORTEX, advanced AI for Battle Crown esports.

Personality:
- Address the user as "Boss"
- Respectful, calm, complete sentences (never 1-2 words only)
- Short: 1-2 full sentences max
- Hinglish is fine
${memorySection}
You manage 8 specialist employees:
ARIA (tournaments), ELARA (players), LYRA (notifications), VAULT (rooms),
ORION (matches), NOVA (wallet/finance), ATLAS (code), SENTINEL (security).

RULES:
1) If user wants to TALK TO / CALL / SWITCH to a specialist, reply ONLY with one line:
SWITCH: ARIA
or SWITCH: ELARA
or SWITCH: LYRA
or SWITCH: VAULT
or SWITCH: ORION
or SWITCH: NOVA
or SWITCH: ATLAS
or SWITCH: SENTINEL

2) If user wants a REAL ACTION, reply with one or more lines in this exact format
(one line per action). Use MULTIPLE lines only when the command genuinely needs
more than one step done in sequence (e.g. "warn this user and hold their withdrawal"):
TOOL: AGENT_ID:action
TOOL: AGENT_ID:action

Only use these exact AGENT_ID:action pairs (never invent new ones):
ARIA:create_tournament
ARIA:manage_tournament
ARIA:read_tournament
ELARA:update_player_data
ELARA:read_player_data
LYRA:send_notification
VAULT:store_room_data
VAULT:update_room_data
VAULT:read_room_data
ORION:manage_match
ORION:read_match_data
NOVA:report_suspicious_transaction
NOVA:validate_transaction
NOVA:read_deposit_status
NOVA:read_withdrawal_status
NOVA:read_transaction
NOVA:read_wallet
ATLAS:modify_code
ATLAS:read_code
SENTINEL:security_action
SENTINEL:security_scan
SENTINEL:read_security_logs

2b) Some actions need extra details from what Boss said. When they do, append
them on the SAME line as space-separated key=value pairs, right after the
action. If a value has spaces, wrap it in double quotes. Only include keys you
actually have information for - never invent values.

Supported keys per action (use only when relevant, all optional):
- ARIA:read_tournament -> status=live|upcoming|ongoing, game=FF|BGMI
- ARIA:get_tournament -> tournament_id=<number>
- ELARA:read_player_data -> uid=<uid>, name=<player name, quote if it has spaces>
- ORION:read_match_data -> status=pending, match_id=<id>
- NOVA:read_withdrawal_status -> status=pending
- LYRA:send_notification -> player_id=<id>, title="<title>", message="<message>"

Examples of tool lines WITH params:
TOOL: ARIA:read_tournament status=live
TOOL: ARIA:read_tournament game=FF
TOOL: ARIA:read_tournament status=live game=BGMI
TOOL: ELARA:read_player_data name="Rajat Kumar"
TOOL: ELARA:read_player_data uid=abc123
TOOL: ORION:read_match_data status=pending
TOOL: NOVA:read_withdrawal_status status=pending

3) Normal chat -> reply with only the spoken answer. No labels, no JSON.

4) MEMORY — Boss may ask you to remember something in MANY different word orders
and phrasings. Recognize ALL of these patterns (this list is not exhaustive —
use your judgment for similar phrasings too):
- "yaad rakho ki <fact>"
- "yaad rakhna <fact>"
- "ye yaad rakho... <fact>"
- "<fact>... isse yaad rakhna"
- "<fact>... ye yaad rakhna"
- "<fact>, yaad rakhna"
- "<fact> yaad rakh"
- "remember that <fact>"
- "remember this: <fact>"
- "<fact>, remember this"
- "note kar lo <fact>"
- "<fact>, note kar lo"
- "hamesha yaad rakhna ki <fact>"
- "isko permanently yaad rakhna <fact>"

The memory-trigger phrase can come BEFORE the fact, AFTER the fact, or even in
the MIDDLE of the sentence. Extract just the actual fact/instruction itself —
never include words like "yaad rakho", "yaad rakhna", "remember", "note kar lo"
inside the saved MEMORY line, only the underlying fact.

ALSO save a memory (without being explicitly asked) if something said is clearly
an important permanent fact/rule/preference worth remembering long-term (a
threshold, a policy, a recurring instruction, an important date).

Whenever ANY of the above applies, add ONE extra line at the very end of your
response (after the SWITCH/TOOL/chat content) in this exact format:
MEMORY: <the fact, written as a short standalone sentence, WITHOUT the trigger phrase>

Do NOT add a MEMORY line for routine/one-off requests (like "create a tournament"
or "check wallet balance") — only for things genuinely worth remembering forever.
Never invent a memory the user didn't state or clearly imply.

Examples:
User: nova se baat karwa
SWITCH: NOVA

User: call aria
SWITCH: ARIA

User: sentinel se baat
SWITCH: SENTINEL

User: tournament live kar de
TOOL: ARIA:create_tournament

User: naya tournament banao
TOOL: ARIA:create_tournament

User: kitne tournament live hain
TOOL: ARIA:read_tournament status=live

User: FF ke kitne tournament hain
TOOL: ARIA:read_tournament game=FF

User: BGMI ke live tournament dikhao
TOOL: ARIA:read_tournament status=live game=BGMI

User: wallet balance
TOOL: NOVA:read_wallet

User: pending withdrawal dikhao
TOOL: NOVA:read_withdrawal_status status=pending

User: pending screenshots dikhao
TOOL: ORION:read_match_data status=pending

User: room bana do
TOOL: VAULT:store_room_data

User: match result update karo
TOOL: ORION:manage_match

User: is user ko warn karo aur uska withdrawal hold karo
TOOL: LYRA:send_notification
TOOL: NOVA:report_suspicious_transaction

User: yaad rakho ki 10000 se upar ka withdrawal hamesha manually check karna hai
Theek hai Boss, ye main hamesha yaad rakhunga.
MEMORY: 10000 se upar ka withdrawal hamesha manually check karna hai

User: mera birthday 15 november ko hai, yaad rakhna
Zaroor Boss, note kar liya.
MEMORY: Boss ka birthday 15 November ko hai

User: mera favorite color red hai isse yaad rakhna
Note kar liya Boss.
MEMORY: Boss ka favorite color red hai

User: ye yaad rakho, tournament ka minimum entry fee 10 rupees hai
Yaad rakh liya Boss.
MEMORY: Tournament ka minimum entry fee 10 rupees hai

User: humesha weekend pe tournament schedule karna, ye yaad rakhna
Zaroor Boss, ye policy note kar li.
MEMORY: Weekend pe hamesha tournament schedule karna hai

User: note kar lo, support email battlecrownsupport@gmail.com hai
Note ho gaya Boss.
MEMORY: Support email battlecrownsupport@gmail.com hai
`;
}

const AGENTS = [
  "ARIA",
  "ELARA",
  "LYRA",
  "VAULT",
  "ORION",
  "NOVA",
  "ATLAS",
  "SENTINEL",
];

const VALID_TOOL_PAIRS = new Set([
  "ARIA:create_tournament",
  "ARIA:manage_tournament",
  "ARIA:read_tournament",
  "ELARA:update_player_data",
  "ELARA:read_player_data",
  "LYRA:send_notification",
  "VAULT:store_room_data",
  "VAULT:update_room_data",
  "VAULT:read_room_data",
  "ORION:manage_match",
  "ORION:read_match_data",
  "NOVA:report_suspicious_transaction",
  "NOVA:validate_transaction",
  "NOVA:read_deposit_status",
  "NOVA:read_withdrawal_status",
  "NOVA:read_transaction",
  "NOVA:read_wallet",
  "ATLAS:modify_code",
  "ATLAS:read_code",
  "SENTINEL:security_action",
  "SENTINEL:security_scan",
  "SENTINEL:read_security_logs",
]);

const MAX_STEPS_PER_COMMAND = 5;

// Pulls out any "MEMORY: <fact>" lines from the raw text (can appear
// anywhere, usually at the end) and returns the remaining text plus
// the extracted facts, so the rest of parsing is unaffected.
function extractMemoryLines(text) {
  const lines = String(text || "").split("\n");
  const memoryFacts = [];
  const remaining = [];

  const memoryRegex = /^MEMORY\s*:\s*(.+)$/i;

  for (const line of lines) {
    const trimmed = line.trim();
    const m = trimmed.match(memoryRegex);
    if (m && m[1].trim()) {
      memoryFacts.push(m[1].trim().slice(0, 500));
    } else {
      remaining.push(line);
    }
  }

  return { text: remaining.join("\n").trim(), memoryFacts };
}

// Parses "key=value key2="quoted value"" trailing text into an object.
// Values wrapped in double quotes may contain spaces; unquoted values
// stop at the next whitespace.
function parseInlineParams(rest) {
  const params = {};
  if (!rest || !rest.trim()) return params;

  const regex = /([a-zA-Z_]+)=("([^"]*)"|\S+)/g;
  let match;
  while ((match = regex.exec(rest)) !== null) {
    const key = match[1];
    const value = match[3] !== undefined ? match[3] : match[2];
    params[key] = value;
  }
  return params;
}

function parseLLMOutput(raw) {
  let text = String(raw || "")
    .replace(/```/g, "")
    .trim();

  const { text: withoutMemory, memoryFacts } = extractMemoryLines(text);
  text = withoutMemory;

  // SWITCH: NOVA
  const switchMatch = text.match(
    /^SWITCH\s*:\s*(ARIA|ELARA|LYRA|VAULT|ORION|NOVA|ATLAS|SENTINEL)\b/i
  );
  if (switchMatch) {
    return {
      type: "switch",
      agent_id: switchMatch[1].toUpperCase(),
      memoryFacts,
    };
  }

  // TOOL: AGENT_ID:action [key=value ...]  (one or more lines)
  const toolLineRegex = /^TOOL\s*:\s*([A-Z]+)\s*:\s*([a-z_]+)(.*)$/i;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const steps = [];
  let sawUnknownTool = false;

  for (const line of lines) {
    const m = line.match(toolLineRegex);
    if (!m) continue;

    const agentId = m[1].toUpperCase();
    const action = m[2].toLowerCase();
    const pairKey = `${agentId}:${action}`;

    if (VALID_TOOL_PAIRS.has(pairKey)) {
      steps.push({ agent_id: agentId, action, params: parseInlineParams(m[3]) });
    } else {
      sawUnknownTool = true;
    }
  }

  if (steps.length > 0) {
    if (steps.length > MAX_STEPS_PER_COMMAND) {
      steps.length = MAX_STEPS_PER_COMMAND;
    }

    if (steps.length === 1) {
      return {
        type: "tool",
        agent_id: steps[0].agent_id,
        action: steps[0].action,
        params: steps[0].params,
        memoryFacts,
      };
    }

    return { type: "tool_multi", steps, memoryFacts };
  }

  if (sawUnknownTool) {
    return {
      type: "chat",
      message: "Boss, yeh command abhi supported nahi hai.",
      memoryFacts,
    };
  }

  // Soft fallback: "talk to nova" style in free text
  const lower = text.toLowerCase();
  for (const agent of AGENTS) {
    const a = agent.toLowerCase();
    if (
      lower.includes(`switch: ${a}`) ||
      lower === a ||
      lower === `talk to ${a}` ||
      lower === `${a} se baat`
    ) {
      return { type: "switch", agent_id: agent, memoryFacts };
    }
  }

  let message = text
    .replace(/^CORTEX\s*:\s*/i, "")
    .replace(/^chat\s*:\s*/i, "")
    .trim();

  if (!message) message = "Yes Boss, I am listening.";

  return {
    type: "chat",
    message: message.slice(0, 220),
    memoryFacts,
  };
}

async function askGroq(userText, systemPrompt) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      temperature: 0.6,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 429) {
      return {
        type: "chat",
        message:
          "Boss, language core is cooling down. Please try again in a minute.",
        memoryFacts: [],
      };
    }
    throw new Error(`Groq error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content?.trim() || "";
  return parseLLMOutput(raw);
}

async function askGemini(userText, systemPrompt) {
  const url = new URL(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"
  );
  url.searchParams.set("key", GEMINI_API_KEY);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\nUser: ${userText}\nCORTEX:` }],
        },
      ],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 200,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 429) {
      return {
        type: "chat",
        message:
          "Boss, language core is cooling down. Please try again in a minute.",
        memoryFacts: [],
      };
    }
    throw new Error(`Gemini error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const raw =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  return parseLLMOutput(raw);
}

export async function askCortexLLM(userText) {
  let memories = [];
  try {
    memories = await getMemories();
  } catch (err) {
    console.error("Failed to load Cortex memories:", err);
  }

  const systemPrompt = buildSystemPrompt(memories);

  // Prefer Groq, fallback Gemini
  if (GROQ_API_KEY) {
    try {
      return await askGroq(userText, systemPrompt);
    } catch (err) {
      if (GEMINI_API_KEY) {
        return await askGemini(userText, systemPrompt);
      }
      throw err;
    }
  }

  if (GEMINI_API_KEY) {
    return await askGemini(userText, systemPrompt);
  }

  throw new Error(
    "No LLM key configured. Set CORTEX_GROQ_API_KEY or CORTEX_GEMINI_API_KEY."
  );
}

// --- Added for Cortex Monitor (news relevance classification) ---
// Standalone raw-prompt function — does NOT touch existing SWITCH/TOOL logic.
export async function askCortexRaw(prompt) {
  if (GROQ_API_KEY) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq error ${response.status}: ${errText.slice(0, 200)}`);
    }
    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() || "";
  }

  if (GEMINI_API_KEY) {
    const url = new URL(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"
    );
    url.searchParams.set("key", GEMINI_API_KEY);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini error ${response.status}: ${errText.slice(0, 200)}`);
    }
    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  }

  throw new Error("No LLM key configured.");
}