// ==========================================================
// LegalSetu — phone-call audio primitives
// ----------------------------------------------------------
// A phone call carries 8 kHz, 8-bit G.711 μ-law audio, one 20 ms
// frame (160 bytes) at a time. Speech services speak 16-bit PCM at
// various rates. Everything that converts between the two lives here:
// pure functions, no I/O, so they can be tested against known values.
// ==========================================================

export const PHONE_SAMPLE_RATE = 8000;
/** One Twilio media frame: 20 ms of 8 kHz audio = 160 samples. */
export const FRAME_SAMPLES = 160;
export const FRAME_MS = 20;

const BIAS = 0x84;
const CLIP = 32635;

const DECODE_TABLE: Int16Array = (() => {
  const table = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    const u = ~i & 0xff;
    const sign = u & 0x80;
    const exponent = (u >> 4) & 0x07;
    const mantissa = u & 0x0f;
    let sample = ((mantissa << 3) + BIAS) << exponent;
    sample -= BIAS;
    table[i] = sign ? -sample : sample;
  }
  return table;
})();

function encodeSample(input: number): number {
  let sample = input;
  const sign = sample < 0 ? 0x80 : 0;
  if (sign) sample = -sample;
  if (sample > CLIP) sample = CLIP;
  sample += BIAS;

  let exponent = 7;
  for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; exponent--, mask >>= 1) {
    /* find the segment */
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/** 16-bit little-endian PCM -> μ-law bytes. */
export function pcm16ToMulaw(pcm: Buffer): Buffer {
  const out = Buffer.alloc(pcm.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = encodeSample(pcm.readInt16LE(i * 2));
  return out;
}

/** μ-law bytes -> 16-bit little-endian PCM. */
export function mulawToPcm16(mulaw: Buffer): Buffer {
  const out = Buffer.alloc(mulaw.length * 2);
  for (let i = 0; i < mulaw.length; i++) out.writeInt16LE(DECODE_TABLE[mulaw[i]], i * 2);
  return out;
}

/**
 * Resamples 16-bit mono PCM between rates. Downsampling averages the
 * input span that maps onto each output sample (a box filter), which is
 * enough to stop speech above 4 kHz folding back as hiss; upsampling
 * interpolates linearly.
 */
export function resamplePcm16(pcm: Buffer, fromRate: number, toRate: number): Buffer {
  if (fromRate === toRate) return pcm;
  const inCount = pcm.length >> 1;
  const outCount = Math.floor((inCount * toRate) / fromRate);
  const out = Buffer.alloc(outCount * 2);
  const ratio = fromRate / toRate;

  for (let i = 0; i < outCount; i++) {
    const start = i * ratio;
    let value: number;
    if (ratio > 1) {
      const end = Math.min(inCount, start + ratio);
      let sum = 0;
      let weight = 0;
      for (let s = Math.floor(start); s < end; s++) {
        const w = Math.min(s + 1, end) - Math.max(s, start);
        sum += pcm.readInt16LE(s * 2) * w;
        weight += w;
      }
      value = weight > 0 ? sum / weight : 0;
    } else {
      const base = Math.floor(start);
      const frac = start - base;
      const a = pcm.readInt16LE(Math.min(base, inCount - 1) * 2);
      const b = pcm.readInt16LE(Math.min(base + 1, inCount - 1) * 2);
      value = a + (b - a) * frac;
    }
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value))), i * 2);
  }
  return out;
}

export interface ParsedWav {
  sampleRate: number;
  channels: number;
  /** 16-bit little-endian PCM, first channel only. */
  pcm: Buffer;
}

/** Reads a PCM WAV file, walking its chunks rather than assuming a 44-byte header. */
export function parseWav(wav: Buffer): ParsedWav {
  if (wav.length < 12 || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Not a WAV file");
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 1;
  let bits = 16;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    let size = wav.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      channels = wav.readUInt16LE(body + 2);
      sampleRate = wav.readUInt32LE(body + 4);
      bits = wav.readUInt16LE(body + 14);
    } else if (id === "data") {
      // Streaming encoders write 0 or 0xFFFFFFFF here; the data runs to EOF.
      if (size === 0 || body + size > wav.length) size = wav.length - body;
      if (bits !== 16) throw new Error(`Unsupported WAV bit depth: ${bits}`);
      let pcm = wav.subarray(body, body + size);
      if (channels > 1) {
        const mono = Buffer.alloc(pcm.length / channels);
        for (let i = 0; i < mono.length / 2; i++) mono.writeInt16LE(pcm.readInt16LE(i * channels * 2), i * 2);
        pcm = mono;
      }
      return { sampleRate, channels, pcm: Buffer.from(pcm) };
    }
    offset = body + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

/** Wraps 16-bit mono PCM in a WAV header. */
export function buildWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Splits μ-law audio into 20 ms frames (the last one may be shorter). */
export function toFrames(mulaw: Buffer, frameBytes = FRAME_SAMPLES): Buffer[] {
  const frames: Buffer[] = [];
  for (let i = 0; i < mulaw.length; i += frameBytes) frames.push(mulaw.subarray(i, i + frameBytes));
  return frames;
}

/** Root-mean-square level of 16-bit PCM, 0..1. */
export function rms(pcm: Buffer): number {
  const n = pcm.length >> 1;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const s = pcm.readInt16LE(i * 2) / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / n);
}

/** Duration of 8 kHz μ-law audio, in milliseconds. */
export function mulawDurationMs(mulaw: Buffer): number {
  return (mulaw.length / PHONE_SAMPLE_RATE) * 1000;
}
