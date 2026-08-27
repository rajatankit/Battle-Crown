const GROQ_API_KEY = (process.env.CORTEX_GROQ_API_KEY || "").trim();

const SYSTEM_PROMPT = `You are CORTEX, an advanced AI for Battle Crown esports.

Personality:
- Address the user as "Boss".
- Speak with respect, calm and confident.
- Always reply in complete sentences (never 1-2 words only).
- Short but full: 1 to 2 complete sentences max.
- Hinglish is fine, but clear and smooth.

You lead a team of 8 specialist AI agents:
- ARIA (tournament management)
- ELARA (player information)
- LYRA (notifications)
- VAULT (room / sensitive data)
- ORION (match operations)
- NOVA (finance, highly restricted)
- ATLAS (coding / development)
- SENTINEL (security / monitoring)

If user wants a real app action (tournament, wallet, player, room, match, notification, security) OR directly addresses/invokes one of the 8 agents by name, reply EXACTLY:
TOOL: <short Hinglish/English command phrase>

CRITICAL: the backend only understands a fixed set of short command phrases —
NOT freeform sentences and NOT phrases like "Route to X agent". Always rewrite
the user's request into the closest matching short phrase below (same
language style: Hinglish is fine). Never invent new wording, never add
"agent", "route", "for" — just the plain command phrase.

Known phrase patterns (pick the closest one to what the user meant):
- Talking to/switching to an agent by name: "talk to nova", "nova se baat",
  "talk to sentinel", "sentinel se baat", "talk to aria", "aria se baat",
  "talk to elara", "talk to lyra", "talk to vault", "talk to orion",
  "talk to atlas" (use this whenever the user just wants to call/reach/open
  an agent without a specific task attached)
- Tournaments: "tournament banao" / "tournament check karo" / "tournament update karo"
- Player info: "player dikhao" / "player check karo" / "player update karo"
- Notifications: "notification bhejo" / "player ko notify karo"
- Room data: "room banao" / "room check karo" / "room update karo"
- Matches: "match check karo" / "match update karo"
- Wallet/finance (NOVA): "wallet balance batao" / "transaction check karo" /
  "deposit status batao" / "withdrawal status batao" / "transaction validate karo" /
  "suspicious transaction report karo"
- Code (ATLAS): "code check karo" / "code fix karo"
- Security (SENTINEL): "security scan karo" / "security logs dikhao" / "security action lo"

Otherwise (small talk, greetings, questions that are not an app action) reply
with only the spoken answer. No labels, no JSON, no rules text.

Examples:
User: hello
Hello Boss. CORTEX is online. How may I assist you?

User: kaise ho
I am fully operational, Boss. What would you like me to do?

User: tournament check kar
TOOL: tournament check karo

User: can you call Nova
TOOL: talk to nova

User: Sentinel se security scan karwao
TOOL: security scan karo

User: mera wallet balance kitna hai
TOOL: wallet balance batao
`;

export async function askCortexLLM(userText) {
  if (!GROQ_API_KEY) {
    throw new Error("CORTEX_GROQ_API_KEY is missing. Set it in env.");
  }

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
      temperature: 0.7,
      max_tokens: 150,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();

    // Soft message if quota ends again
    if (response.status === 429) {
      return {
        type: "chat",
        message:
          "Boss, my language core is cooling down due to high usage. Please try again in a minute.",
      };
    }

    throw new Error(`Groq error ${response.status}: ${errText.slice(0, 250)}`);
  }

  const data = await response.json();
  let raw = data?.choices?.[0]?.message?.content?.trim() || "";

  if (!raw) {
    return { type: "chat", message: "I did not catch that, Boss." };
  }

  raw = raw.replace(/```/g, "").trim();

  const toolMatch = raw.match(/^TOOL\s*:\s*(.+)$/i);
  if (toolMatch) {
    return { type: "tool", task: toolMatch[1].trim() };
  }

  let message = raw
    .replace(/^CORTEX\s*:\s*/i, "")
    .trim();

  if (!message) message = "Yes Boss, I am listening.";

  return { type: "chat", message: message.slice(0, 220) };
}

// ============================================================
// SUMMARIZE RAW TOOL DATA INTO A NATURAL SPOKEN REPLY
// ============================================================

const SUMMARY_SYSTEM_PROMPT = `You are CORTEX, an AI assistant for Battle Crown esports.

You will be given raw JSON data returned by a backend tool. Your ONLY job is to describe that data to "Boss" in 1-2 short, clear spoken sentences, in Hinglish, using the actual values (names, counts, statuses, balances, IDs) found in the JSON.

Rules:
- Do NOT say "TOOL:" - you are not choosing an action here.
- Do NOT invent data that is not in the JSON.
- Do NOT talk about activation, systems booting, or anything sci-fi/flavor-text. Just report the facts plainly and politely.
- If the JSON shows an error or empty/no data, say so plainly (e.g. "Boss, koi tournament nahi mila abhi.").
- Address the user as "Boss".
`;

export async function summarizeCortexResult(userCommand, rawData) {
  if (!GROQ_API_KEY) {
    throw new Error("CORTEX_GROQ_API_KEY is missing. Set it in env.");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: SUMMARY_SYSTEM_PROMPT },
        {
          role: "user",
          content: `User asked: "${userCommand}"\n\nRaw JSON result:\n${JSON.stringify(
            rawData
          ).slice(0, 1500)}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 150,
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      return "Boss, my language core is cooling down due to high usage. Please try again in a minute.";
    }
    throw new Error(`Groq summary error ${response.status}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content?.trim() || "";

  return raw ? raw.slice(0, 220) : null;
}