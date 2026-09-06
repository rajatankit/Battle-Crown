import Meyda from "meyda";
import { convertToPcm16k, bufferToInt16Array } from "../audio/convertToPcm";

const FRAME_SIZE = 1024;
const HOP_SIZE = 512;
const VERIFY_THRESHOLD = 0.9; // 0-1, jitna zyada utna strict

Meyda.sampleRate = 16000;
Meyda.bufferSize = FRAME_SIZE;

function int16ToFloat32(int16Array) {
  const float32 = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32[i] = int16Array[i] / 32768;
  }
  return float32;
}

function extractMfccVector(floatSamples) {
  const mfccFrames = [];

  for (let i = 0; i + FRAME_SIZE <= floatSamples.length; i += HOP_SIZE) {
    const frame = floatSamples.slice(i, i + FRAME_SIZE);
    const mfcc = Meyda.extract("mfcc", frame);
    if (mfcc) mfccFrames.push(mfcc);
  }

  if (mfccFrames.length === 0) return null;

  const numCoeffs = mfccFrames[0].length;
  const mean = new Array(numCoeffs).fill(0);

  for (const frame of mfccFrames) {
    for (let j = 0; j < numCoeffs; j++) mean[j] += frame[j];
  }
  for (let j = 0; j < numCoeffs; j++) mean[j] /= mfccFrames.length;

  return mean;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// audioBuffersRaw = array of raw webm audio buffers (3+ recommended)
export async function enrollVoiceProfile(audioBuffersRaw) {
  const vectors = [];

  for (const raw of audioBuffersRaw) {
    const pcmBuffer = await convertToPcm16k(raw);
    const samples = bufferToInt16Array(pcmBuffer);
    const floatSamples = int16ToFloat32(samples);
    const vec = extractMfccVector(floatSamples);
    if (vec) vectors.push(vec);
  }

  if (vectors.length === 0) {
    throw new Error(
      "Voice samples se features nikal nahi paye. Zyada der bolke dobara try karo."
    );
  }

  const numCoeffs = vectors[0].length;
  const avgProfile = new Array(numCoeffs).fill(0);

  for (const vec of vectors) {
    for (let j = 0; j < numCoeffs; j++) avgProfile[j] += vec[j];
  }
  for (let j = 0; j < numCoeffs; j++) avgProfile[j] /= vectors.length;

  return JSON.stringify(avgProfile);
}

// storedProfileJson = string from DB, audioBufferRaw = fresh sample to check
export async function verifyVoice(audioBufferRaw, storedProfileJson) {
  const storedProfile = JSON.parse(storedProfileJson);

  const pcmBuffer = await convertToPcm16k(audioBufferRaw);
  const samples = bufferToInt16Array(pcmBuffer);
  const floatSamples = int16ToFloat32(samples);
  const vec = extractMfccVector(floatSamples);

  if (!vec) return { score: 0, verified: false };

  const score = cosineSimilarity(vec, storedProfile);
  return { score, verified: score >= VERIFY_THRESHOLD };
}