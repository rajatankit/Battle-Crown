import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function POST(req) {
  try {
    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return Response.json({
        success: false,
        error: "Image URL is required",
      });
    }

    // Image download
    const imageRes = await fetch(imageUrl);
    const buffer = Buffer.from(await imageRes.arrayBuffer());

    // Latest Gemini Lite
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
    });

    const result = await model.generateContent([
      `
You are an esports tournament verifier.

Analyze this BGMI/Free Fire result screenshot.

Return ONLY valid JSON.

Format:

{
  "valid": true,
  "game": "BGMI",
  "rank": 1,
  "kills": 8,
  "confidence": 98,
  "reason": "Screenshot looks authentic."
}

If screenshot is fake or unreadable:

{
  "valid": false,
  "reason":"Fake or unreadable screenshot"
}
`,
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: buffer.toString("base64"),
        },
      },
    ]);

    const text = result.response.text();

    // Remove markdown if Gemini wraps JSON
    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    return Response.json({
      success: true,
      ai: parsed,
    });
  } catch (err) {
    console.error(err);

    return Response.json({
      success: false,
      error: err.message,
    });
  }
}