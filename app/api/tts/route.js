import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export async function POST(req) {
  const { text } = await req.json();
  if (!text?.trim()) {
    return new Response("No text", { status: 400 });
  }

  const tts = new MsEdgeTTS();
  await tts.setMetadata("hi-IN-SwaraNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const { audioStream } = tts.toStream(text);

  const chunks = [];
  for await (const chunk of audioStream) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  return new Response(buffer, {
    headers: { "Content-Type": "audio/mpeg" },
  });
}