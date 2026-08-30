const GROQ_API_KEY = (process.env.CORTEX_GROQ_API_KEY || "").trim();
const GEMINI_API_KEY = (process.env.CORTEX_GEMINI_API_KEY || "").trim();

const SYSTEM_PROMPT = `You are CORTEX, advanced AI for Battle Crown esports.

Personality:
- Address the user as "Boss"
- Respectful, calm, complete sentences (never 1-2 words only)
- Short: 1-2 full sentences max
- Hinglish is fine

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

2) If user wants a REAL ACTION, reply ONLY in this exact format:
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

3) Normal chat -> reply with only the spoken answer. No labels, no JSON.

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

User: wallet balance
TOOL: NOVA:read_wallet

User: room bana do
TOOL: VAULT:store_room_data

User: match result update karo
TOOL: ORION:manage_match

User: kaise ho
I am fully operational, Boss. How may I assist you?
`;

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

function parseLLMOutput(raw) {
  let text = String(raw || "")
    .replace(/```/g, "")
    .trim();

  // SWITCH: NOVA
  const switchMatch = text.match(
    /^SWITCH\s*:\s*(ARIA|ELARA|LYRA|VAULT|ORION|NOVA|ATLAS|SENTINEL)\b/i
  );
  if (switchMatch) {
    return {
      type: "switch",
      agent_id: switchMatch[1].toUpperCase(),
    };
  }

  // TOOL: AGENT_ID:action
  const toolMatch = text.match(
    /^TOOL\s*:\s*([A-Z]+)\s*:\s*([a-z_]+)/i
  );
  if (toolMatch) {
    const agentId = toolMatch[1].toUpperCase();
    const action = toolMatch[2].toLowerCase();
    const pairKey = `${agentId}:${action}`;

    if (VALID_TOOL_PAIRS.has(pairKey)) {
      return {
        type: "tool",
        agent_id: agentId,
        action: action,
      };
    }

    // Model returned an agent/action pair that isn't in our
    // known list. Fall through to chat instead of dispatching
    // something the backend will reject anyway.
    return {
      type: "chat",
      message: "Boss, yeh command abhi supported nahi hai.",
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
      return { type: "switch", agent_id: agent };
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
  };
}

async function askGroq(userText) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userText },
      ],
      temperature: 0.6,
      max_tokens: 150,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 429) {
      return {
        type: "chat",
        message:
          "Boss, language core is cooling down. Please try again in a minute.",
      };
    }
    throw new Error(`Groq error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content?.trim() || "";
  return parseLLMOutput(raw);
}

async function askGemini(userText) {
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
          parts: [{ text: `${SYSTEM_PROMPT}\n\nUser: ${userText}\nCORTEX:` }],
        },
      ],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 150,
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
  // Prefer Groq, fallback Gemini
  if (GROQ_API_KEY) {
    try {
      return await askGroq(userText);
    } catch (err) {
      if (GEMINI_API_KEY) {
        return await askGemini(userText);
      }
      throw err;
    }
  }

  if (GEMINI_API_KEY) {
    return await askGemini(userText);
  }

  throw new Error(
    "No LLM key configured. Set CORTEX_GROQ_API_KEY or CORTEX_GEMINI_API_KEY."
  );
}