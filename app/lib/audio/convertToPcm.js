import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { PassThrough } from "stream";

ffmpeg.setFfmpegPath(ffmpegPath);

export function convertToPcm16k(inputBuffer) {
  return new Promise((resolve, reject) => {
    const input = new PassThrough();
    input.end(inputBuffer);

    const chunks = [];
    const output = new PassThrough();
    output.on("data", (chunk) => chunks.push(chunk));
    output.on("end", () => resolve(Buffer.concat(chunks)));
    output.on("error", reject);

    ffmpeg(input)
      .inputFormat("webm")
      .audioChannels(1)
      .audioFrequency(16000)
      .format("s16le")
      .on("error", reject)
      .pipe(output, { end: true });
  });
}

export function bufferToInt16Array(buffer) {
  const samples = new Int16Array(buffer.length / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = buffer.readInt16LE(i * 2);
  }
  return samples;
}