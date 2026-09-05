import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

function toSSML(text) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const withPauses = escaped
    .replace(/,/g, ',<break time="200ms"/>')
    .replace(/([.!?])/g, '$1<break time="350ms"/>');

  return `<speak version="1.0" xml:lang="hi-IN">
    <voice name="hi-IN-SwaraNeural">
      <prosody rate="3%" pitch="0%">${withPauses}</prosody>
    </voice>
  </speak>`;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get("text");

  if (!text?.trim()) {
    return new Response("No text", { status: 400 });
  }

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(
      "hi-IN-SwaraNeural",
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
    );

    const { audioStream } = tts.toStream(toSSML(text));

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
    return new Response("TTS failed", { status: 500 });
  }
}