import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Explicitly environment variable pass kar rahe hain taaki undefined ka error na aaye
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req) {
  try {
    const { messages } = await req.json();
    const latestMessage = messages[messages.length - 1].content;

    const systemInstruction = `
      You are an AI customer support assistant for a gaming tournament platform (Free Fire & BGMI/PUBG custom matches and tournaments).
      Be helpful, polite, and short in responses.
      - Tournaments require users to join slots.
      - Room ID and password are given 10 minutes before match start time in the app dashboard.
      - Wallet deposits/withdrawals are handled securely.
      Answer player queries based on these rules.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-flash-lite-latest',
      contents: [
        { role: 'user', parts: [{ text: systemInstruction + "\n\nUser Question: " + latestMessage }] }
      ],
    });

    const reply = response.text || "Mujhe samajh nahi aaya, kripya dobara puchein.";

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Gemini Error:", error);
    return NextResponse.json({ reply: "Server par kuch issue hai, kripya thodi der baad try karein." }, { status: 500 });
  }
}