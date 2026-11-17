/** Minimal WAV helpers: every voice provider's output is normalised to 16-bit PCM WAV. */

export function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Parse a WAV into raw PCM + format. Tolerates streamed files whose size fields are
 * 0xFFFFFFFF by trusting the actual buffer length instead.
 */
export function parseWav(buf: Buffer) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("Not a WAV file");
  let off = 12;
  let sampleRate = 24000;
  let channels = 1;
  let bits = 16;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(off + 10);
      sampleRate = buf.readUInt32LE(off + 12);
      bits = buf.readUInt16LE(off + 22);
    } else if (id === "data") {
      const end = size === 0xffffffff || off + 8 + size > buf.length ? buf.length : off + 8 + size;
      return { pcm: buf.subarray(off + 8, end), sampleRate, channels, bits };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

export function normaliseWav(buf: Buffer) {
  const { pcm, sampleRate, channels, bits } = parseWav(buf);
  if (bits !== 16) throw new Error(`Unsupported WAV bit depth ${bits}`);
  return { wav: pcmToWav(pcm, sampleRate, channels), seconds: pcm.length / (sampleRate * channels * 2) };
}
