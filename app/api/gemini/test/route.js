import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function GET() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: "Reply only with: Battle Crown AI Connected",
    });

    return Response.json({
      success: true,
      message: response.text,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error.message,
    });
  }
}