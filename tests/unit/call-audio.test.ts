import { describe, it, expect } from "vitest";
import {
  pcm16ToMulaw,
  mulawToPcm16,
  resamplePcm16,
  parseWav,
  buildWav,
  toFrames,
  rms,
  FRAME_SAMPLES,
} from "@/lib/calls/audio";
import { Endpointer } from "@/lib/calls/endpoint";

/** 16-bit PCM sine wave. */
function tone(freq: number, ms: number, rate = 8000, amp = 0.4): Buffer {
  const n = Math.floor((rate * ms) / 1000);
  const b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * amp * 32767), i * 2);
  return b;
}
const silence = (ms: number) => Buffer.alloc(((8000 * ms) / 1000) * 2);

describe("μ-law (G.711)", () => {
  it("matches the standard reference values", () => {
    // Known G.711 μ-law codes: silence is 0xFF, and the extremes are 0x00 / 0x80.
    const enc = (v: number) => {
      const b = Buffer.alloc(2);
      b.writeInt16LE(v, 0);
      return pcm16ToMulaw(b)[0];
    };
    expect(enc(0)).toBe(0xff);
    expect(enc(32767)).toBe(0x80);
    expect(enc(-32768)).toBe(0x00);
  });

  it("round-trips speech with low error", () => {
    const original = tone(440, 200);
    const back = mulawToPcm16(pcm16ToMulaw(original));
    expect(back.length).toBe(original.length);
    let maxErr = 0;
    for (let i = 0; i < original.length / 2; i++) {
      maxErr = Math.max(maxErr, Math.abs(original.readInt16LE(i * 2) - back.readInt16LE(i * 2)));
    }
    // μ-law quantisation error is proportional to level; well under 4% of full scale.
    expect(maxErr).toBeLessThan(1300);
  });

  it("decodes every possible byte without throwing, symmetric about zero", () => {
    const all = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    const pcm = mulawToPcm16(all);
    expect(pcm.length).toBe(512);
    expect(pcm.readInt16LE(0xff * 2)).toBe(0);
    expect(pcm.readInt16LE(0x7f * 2)).toBe(0);
  });
});

describe("resampling", () => {
  it("keeps duration and pitch when going 24 kHz -> 8 kHz", () => {
    const out = resamplePcm16(tone(440, 500, 24000), 24000, 8000);
    expect(out.length / 2).toBe(4000);
    // Zero crossings of a 440 Hz tone over 0.5 s: about 440.
    let crossings = 0;
    for (let i = 1; i < out.length / 2; i++) {
      if (out.readInt16LE((i - 1) * 2) < 0 !== out.readInt16LE(i * 2) < 0) crossings++;
    }
    expect(crossings).toBeGreaterThan(420);
    expect(crossings).toBeLessThan(460);
  });

  it("handles a non-integer ratio (22.05 kHz)", () => {
    const out = resamplePcm16(tone(300, 1000, 22050), 22050, 8000);
    expect(Math.abs(out.length / 2 - 8000)).toBeLessThanOrEqual(1);
  });

  it("returns the input untouched at equal rates", () => {
    const input = tone(200, 20);
    expect(resamplePcm16(input, 8000, 8000)).toBe(input);
  });
});

describe("WAV", () => {
  it("round-trips through build and parse", () => {
    const pcm = tone(500, 100);
    const parsed = parseWav(buildWav(pcm, 8000));
    expect(parsed.sampleRate).toBe(8000);
    expect(parsed.pcm.equals(pcm)).toBe(true);
  });

  it("tolerates a streaming header with a zero data length", () => {
    const wav = buildWav(tone(500, 100), 16000);
    wav.writeUInt32LE(0, 40);
    expect(parseWav(wav).pcm.length).toBe(wav.length - 44);
  });

  it("rejects non-WAV input", () => {
    expect(() => parseWav(Buffer.from("not audio"))).toThrow();
  });

  it("splits into 20 ms frames", () => {
    const frames = toFrames(Buffer.alloc(FRAME_SAMPLES * 5 + 40));
    expect(frames).toHaveLength(6);
    expect(frames[5].length).toBe(40);
  });
});

describe("rms", () => {
  it("is 0 for silence and ~0.28 for a 0.4-amplitude sine", () => {
    expect(rms(silence(20))).toBe(0);
    expect(rms(tone(440, 100))).toBeCloseTo(0.4 / Math.SQRT2, 2);
  });
});

/** Feeds audio to an endpointer in 20 ms frames and collects events. */
function run(ep: Endpointer, audio: Buffer) {
  const events: ReturnType<Endpointer["push"]> = [];
  for (let i = 0; i + 320 <= audio.length; i += 320) events.push(...ep.push(audio.subarray(i, i + 320)));
  return events;
}

describe("Endpointer", () => {
  it("emits one utterance after speech followed by a pause", () => {
    const ep = new Endpointer();
    const events = run(ep, Buffer.concat([silence(400), tone(300, 1200), silence(900)]));
    expect(events.map((e) => e.type)).toEqual(["speech-start", "utterance"]);
    const utt = events[1] as Extract<(typeof events)[number], { type: "utterance" }>;
    // ~1.2 s of speech plus pre-roll and a short tail — not the whole 900 ms pause.
    expect(utt.durationMs).toBeGreaterThan(1200);
    expect(utt.durationMs).toBeLessThan(1900);
  });

  it("does not split an utterance at a short mid-sentence pause", () => {
    const ep = new Endpointer();
    const events = run(ep, Buffer.concat([silence(200), tone(300, 800), silence(300), tone(300, 800), silence(900)]));
    expect(events.filter((e) => e.type === "utterance")).toHaveLength(1);
  });

  it("ignores a click or cough that is too short to be speech", () => {
    const ep = new Endpointer();
    const events = run(ep, Buffer.concat([silence(300), tone(300, 100), silence(1000)]));
    expect(events.some((e) => e.type === "utterance")).toBe(false);
  });

  it("adapts to a noisy line instead of treating hiss as speech", () => {
    const ep = new Endpointer();
    const noise = Buffer.alloc(320 * 100);
    for (let i = 0; i < noise.length / 2; i++) noise.writeInt16LE(Math.round((Math.random() - 0.5) * 0.02 * 32767), i * 2);
    expect(run(ep, noise).some((e) => e.type === "speech-start")).toBe(false);
    // Real speech on top of that noise is still detected.
    expect(run(ep, Buffer.concat([tone(300, 800), silence(900)])).some((e) => e.type === "utterance")).toBe(true);
  });

  it("caps an endless utterance instead of buffering forever", () => {
    const ep = new Endpointer();
    const events = run(ep, tone(300, 27000));
    expect(events.some((e) => e.type === "utterance")).toBe(true);
  });

  it("needs sustained speech to interrupt while the assistant is talking", () => {
    const ep = new Endpointer();
    ep.setPlayback(true);
    // A brief 100 ms burst (a cough, line crackle) must NOT trigger a barge-in…
    expect(run(ep, Buffer.concat([silence(200), tone(300, 100), silence(400)])).some((e) => e.type === "speech-start")).toBe(false);
    // …but a real interruption does.
    expect(run(ep, tone(300, 600)).some((e) => e.type === "speech-start")).toBe(true);
  });

  it("reports its hangover so latency can be measured from end of speech", () => {
    expect(new Endpointer().hangoverMs).toBe(520);
  });
});
