export function parseWavToInt16(buffer) {
  let offset = 12;
  let dataOffset = null;
  let dataLength = null;

  while (offset < buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      dataOffset = offset + 8;
      dataLength = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (dataOffset === null) throw new Error("WAV data chunk nahi mila");

  const samples = new Int16Array(dataLength / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = buffer.readInt16LE(dataOffset + i * 2);
  }
  return samples;
}