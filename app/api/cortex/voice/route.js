import { NextResponse } from "next/server";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const VOICE_ID = "cgSgspJ2msm6clMCkdW9"; // Jessica (free tier compatible)

export async function POST(request) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json({ error: "Voice not configured" }, { status: 500 });
    }

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: text.slice(0, 500),
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("ElevenLabs error:", errText);
      return NextResponse.json({ error: "TTS failed" }, { status: 502 });
    }

    const audioBuffer = await res.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch (error) {
    console.error("Voice route error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}