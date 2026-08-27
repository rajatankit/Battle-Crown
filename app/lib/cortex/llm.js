const GEMINI_API_KEY = process.env.CORTEX_GEMINI_API_KEY || "";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const SYSTEM_PROMPT = `Tu CORTEX hai — Battle Crown esports platform ka AI assistant.

Rules:
1. Hamesha SHORT reply de (1-2 lines max).
2. Hinglish mein bol (natural, jaise dost se baat).
3. Agar user sirf baat kar raha hai (hello, kaise ho, thanks, joke, general sawal) → normal reply de.
4. Agar user KOI REAL KAAM maang raha hai (tournament, player, wallet, room, match, notification, security, code) → JSON return kar.

JSON format (sirf tool ke liye):
{"type":"tool","task":"user ka clear English/Hinglish command"}

Examples:
- "hello" → {"type":"chat","message":"Haan bhai, bol kya kaam hai?"}
- "kaise ho" → {"type":"chat","message":"Sab badhiya. Tu bata."}
- "tournament check kar" → {"type":"tool","task":"Check Tournament"}
- "wallet balance batao" → {"type":"tool","task":"Check wallet balance"}
- "FF ka tournament 9 baje live kar de" → {"type":"tool","task":"Create and start Free Fire tournament at 9 PM"}

Sirf JSON ya short chat message return kar. Extra bakwas mat likh.`;

export async function askCortexLLM(userText) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const response = await fetch(`\( {GEMINI_URL}?key= \){GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `${SYSTEM_PROMPT}\n\nUser: ${userText}` }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 150,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini error: ${response.status} ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const raw =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

  if (!raw) {
    return { type: "chat", message: "Kuch samajh nahi aaya bhai." };
  }

  // Try parse JSON tool call
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed?.type === "tool" && parsed?.task) {
      return { type: "tool", task: String(parsed.task).trim() };
    }
    if (parsed?.type === "chat" && parsed?.message) {
      return { type: "chat", message: String(parsed.message).trim() };
    }
  } catch {
    // not JSON → treat as chat
  }

  return { type: "chat", message: raw.slice(0, 200) };
}