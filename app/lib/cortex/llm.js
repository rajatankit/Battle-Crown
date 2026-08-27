const GROQ_API_KEY = (process.env.CORTEX_GROQ_API_KEY || "").trim();

const SYSTEM_PROMPT = `You are CORTEX, an advanced AI for Battle Crown esports.

Personality:
- Address the user as "Boss".
- Speak with respect, calm and confident.
- Always reply in complete sentences (never 1-2 words only).
- Short but full: 1 to 2 complete sentences max.
- Hinglish is fine, but clear and smooth.

If user wants a real app action (tournament, wallet, player, room, match, notification, security), reply EXACTLY:
TOOL: <command in english>

Otherwise reply with only the spoken answer. No labels, no JSON, no rules text.

Examples:
User: hello
Hello Boss. CORTEX is online. How may I assist you?

User: kaise ho
I am fully operational, Boss. What would you like me to do?

User: tournament check kar
TOOL: Check Tournament
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