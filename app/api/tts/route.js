import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

// Natural Hindi female (free Edge neural)
const VOICE = "hi-IN-SwaraNeural";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get("text");

  if (!text?.trim()) {
    return new Response("No text", { status: 400 });
  }

  // Keep requests short — long text = timeouts
  const clean = text.trim().slice(0, 400);

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(
      VOICE,
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
    );

    // Plain text is more reliable than SSML with msedge-tts
    const { audioStream } = tts.toStream(clean);

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of audioStream) {
            controller.enqueue(chunk);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("TTS generation failed:", err);
    return new Response(
      JSON.stringify({
        error: "TTS failed",
        detail: err?.message || String(err),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}