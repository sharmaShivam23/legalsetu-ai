import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CallRunner, type Transport } from "@/lib/calls/runner";
import { pcm16ToMulaw, toFrames } from "@/lib/calls/audio";
import type { SpeechPort } from "@/lib/calls/speech";
import type { ChatEvent, ChatPort, EventsPort } from "@/lib/calls/chat-client";

const tone = (ms: number) => {
  const n = (8000 * ms) / 1000;
  const b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 300 * i) / 8000) * 0.4 * 32767), i * 2);
  return toFrames(pcm16ToMulaw(b));
};
const quiet = (ms: number) => toFrames(Buffer.alloc((8000 * ms) / 1000, 0xff));

/** A line that records what was sent and when (by frame count at each moment). */
class Line implements Transport {
  frames = 0;
  flushes = 0;
  marks: string[] = [];
  frameSizes = new Set<number>();
  sendFrame(f: Buffer) {
    this.frames++;
    this.frameSizes.add(f.length);
  }
  flush() {
    this.flushes++;
  }
  mark(n: string) {
    this.marks.push(n);
  }
  clear() {}
  close() {}
}

interface Streamed {
  text: string;
  signal: AbortSignal;
  startedAt: number;
}

function build() {
  const line = new Line();
  const started: Streamed[] = [];
  const release: Record<string, () => void> = {};
  const aborted: string[] = [];

  const speech: SpeechPort = {
    async transcribe() {
      return { text: "my phone was stolen", languageCode: "en", provider: "fake", ms: 1 };
    },
    async synthesize() {
      return { mulaw: Buffer.alloc(1600, 0xff), provider: "fake", ms: 1 };
    },
    async phrase() {
      return { mulaw: Buffer.alloc(1600, 0xff), provider: "fake", ms: 0 };
    },
    synthesizeStream(text, _lang, signal) {
      started.push({ text, signal, startedAt: Date.now() });
      signal.addEventListener("abort", () => aborted.push(text));
      const meta = { provider: "live" };
      async function* chunks() {
        // First chunk straight away, with an AWKWARD size (not a multiple of 160)…
        yield Buffer.alloc(250, 0xff);
        // …then the rest only once released, like audio still being generated.
        await new Promise<void>((r) => (release[text] = r));
        yield Buffer.alloc(710, 0xff);
      }
      return { meta, chunks: chunks() };
    },
  };

  const turns: any[] = [];
  const events: EventsPort = {
    async started() {},
    async turn(m) {
      turns.push(m);
    },
    async ended() {},
  };
  let script: () => AsyncGenerator<ChatEvent> = async function* () {
    yield { type: "token", delta: "First sentence here. " };
    yield { type: "token", delta: "Second sentence here." };
    yield { type: "done" };
  };
  const chat: ChatPort = { turn: () => script() };

  const runner = new CallRunner({ language: "en", transport: line, speech, chat, events, prewarm: false });
  const hear = async (frames: Buffer[]) => {
    for (const f of frames) {
      runner.onAudio(f);
      await vi.advanceTimersByTimeAsync(20);
    }
  };
  return { runner, line, started, release, aborted, turns, hear, setChat: (s: typeof script) => (script = s) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("streamed speech in the call engine", () => {
  it("sends the first sound before the sentence has finished being generated", async () => {
    const h = build();
    await h.runner.start();
    await vi.advanceTimersByTimeAsync(50);
    const afterGreeting = h.line.frames;
    h.line.marks.splice(0).forEach((m) => h.runner.onMark(m));

    await h.hear([...quiet(200), ...tone(1200), ...quiet(1500)]);
    await vi.advanceTimersByTimeAsync(300);

    // The synthesiser has produced only its first chunk — and it is already on the line.
    expect(h.started.length).toBeGreaterThanOrEqual(1);
    expect(h.line.frames).toBeGreaterThan(afterGreeting);
  });

  it("re-frames chunks of any size into whole 20 ms frames", async () => {
    const h = build();
    await h.runner.start();
    h.line.marks.splice(0).forEach((m) => h.runner.onMark(m));
    await h.hear([...quiet(200), ...tone(1200), ...quiet(1500)]);
    await vi.advanceTimersByTimeAsync(300);
    Object.values(h.release).forEach((r) => r());
    await vi.advanceTimersByTimeAsync(500);
    // 250 + 710 bytes is not a whole number of frames; every frame sent must still be exactly 160 bytes.
    expect([...h.line.frameSizes]).toEqual([160]);
  });

  it("starts preparing the next sentence while the current one is still playing", async () => {
    const h = build();
    await h.runner.start();
    h.line.marks.splice(0).forEach((m) => h.runner.onMark(m));
    await h.hear([...quiet(200), ...tone(1200), ...quiet(1500)]);
    await vi.advanceTimersByTimeAsync(300);
    // Sentence one has NOT finished (its second chunk is held), yet both are in flight.
    expect(h.started.map((s) => s.text.trim())).toEqual(["First sentence here.", "Second sentence here."]);
  });

  it("aborts in-flight synthesis when the caller interrupts", async () => {
    const h = build();
    await h.runner.start();
    h.line.marks.splice(0).forEach((m) => h.runner.onMark(m));
    await h.hear([...quiet(200), ...tone(1200), ...quiet(1500)]);
    await vi.advanceTimersByTimeAsync(300);
    expect(h.aborted).toEqual([]);

    await h.hear(tone(700)); // sustained speech over the assistant
    expect(h.aborted.length).toBeGreaterThanOrEqual(1);
  });

  it("flushes after each chunk so audio is not held back until the sentence ends", async () => {
    const h = build();
    await h.runner.start();
    h.line.marks.splice(0).forEach((m) => h.runner.onMark(m));
    const before = h.line.flushes;
    await h.hear([...quiet(200), ...tone(1200), ...quiet(1500)]);
    await vi.advanceTimersByTimeAsync(300);
    expect(h.line.flushes).toBeGreaterThan(before);
  });

  it("records the voice provider and time-to-first-sound in the turn's timings", async () => {
    const h = build();
    await h.runner.start();
    h.line.marks.splice(0).forEach((m) => h.runner.onMark(m));
    await h.hear([...quiet(200), ...tone(1200), ...quiet(1500)]);
    await vi.advanceTimersByTimeAsync(300);
    Object.values(h.release).forEach((r) => r());
    await vi.advanceTimersByTimeAsync(500);
    h.line.marks.splice(0).forEach((m) => h.runner.onMark(m));
    await vi.advanceTimersByTimeAsync(50);
    expect(h.turns[0].ttsProvider).toBe("live");
    expect(h.turns[0].firstAudioMs).not.toBeNull();
  });
});
