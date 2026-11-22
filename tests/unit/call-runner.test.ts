import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CallRunner, type Transport } from "@/lib/calls/runner";
import { pcm16ToMulaw, toFrames } from "@/lib/calls/audio";
import { phrasesFor } from "@/lib/calls/phrases";
import type { SpeechPort } from "@/lib/calls/speech";
import type { ChatEvent, ChatPort, EventsPort, TurnMetric } from "@/lib/calls/chat-client";

// ---------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------

function tonePcm(ms: number): Buffer {
  const n = (8000 * ms) / 1000;
  const b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 300 * i) / 8000) * 0.4 * 32767), i * 2);
  return b;
}
const TONE = (ms: number) => toFrames(pcm16ToMulaw(tonePcm(ms)));
const QUIET = (ms: number) => toFrames(Buffer.alloc((8000 * ms) / 1000, 0xff));

class FakeLine implements Transport {
  frames = 0;
  marks: string[] = [];
  clears = 0;
  closed = false;
  sendFrame() {
    this.frames++;
  }
  mark(name: string) {
    this.marks.push(name);
  }
  clear() {
    this.clears++;
  }
  close() {
    this.closed = true;
  }
}

interface Harness {
  runner: CallRunner;
  line: FakeLine;
  spoken: string[]; // every text sent for synthesis, in order
  asked: string[]; // every transcript sent to the AI
  turns: TurnMetric[];
  events: { started: number; ended: { durationSec: number; reason: string }[] };
  setStt(texts: (string | Error)[]): void;
  setChat(script: (text: string) => AsyncGenerator<ChatEvent>): void;
  /** Feed caller audio, advancing the clock 20 ms per frame. */
  hear(frames: Buffer[]): Promise<void>;
  /** Echo every mark the line has been asked for, as Twilio does when playback finishes. */
  finishPlayback(): void;
  /** How many frames the line was sent. */
  sentFrames(): number;
}

const clip = (text: string) => Buffer.alloc(Math.max(160, text.length * 80), 0xff);

function build(opts: { sttDelayMs?: number; language?: string; maxCallMs?: number } = {}): Harness {
  const line = new FakeLine();
  const spoken: string[] = [];
  const asked: string[] = [];
  const turns: TurnMetric[] = [];
  const events = { started: 0, ended: [] as { durationSec: number; reason: string }[] };
  let stt: (string | Error)[] = [];
  let chatScript: (text: string) => AsyncGenerator<ChatEvent> = async function* () {
    yield { type: "token", delta: "OK." };
    yield { type: "done" };
  };

  const speech: SpeechPort = {
    async transcribe() {
      if (opts.sttDelayMs) await new Promise((r) => setTimeout(r, opts.sttDelayMs));
      const next = stt.shift();
      if (next instanceof Error) throw next;
      return { text: next ?? "", languageCode: "hi-IN", provider: "fake", ms: 5 };
    },
    async synthesize(text) {
      spoken.push(text);
      return { mulaw: clip(text), provider: "fake", ms: 5 };
    },
    async phrase(text) {
      spoken.push(text);
      return { mulaw: clip(text), provider: "fake", ms: 0 };
    },
  };
  const chat: ChatPort = {
    turn: (text, signal) => {
      asked.push(text);
      return (async function* () {
        for await (const ev of chatScript(text)) {
          if (signal.aborted) return;
          yield ev;
        }
      })();
    },
  };
  const evPort: EventsPort = {
    async started() {
      events.started++;
    },
    async turn(m) {
      turns.push(m);
    },
    async ended(info) {
      events.ended.push(info);
    },
  };

  const runner = new CallRunner({
    language: opts.language ?? "en",
    transport: line,
    speech,
    chat,
    events: evPort,
    maxCallMs: opts.maxCallMs,
    prewarm: false,
  });

  return {
    runner,
    line,
    spoken,
    asked,
    turns,
    events,
    setStt: (t) => (stt = [...t]),
    setChat: (s) => (chatScript = s),
    async hear(frames) {
      for (const f of frames) {
        runner.onAudio(f);
        await vi.advanceTimersByTimeAsync(20);
      }
    },
    finishPlayback() {
      for (const m of line.marks.splice(0)) runner.onMark(m);
    },
    sentFrames: () => line.frames,
  };
}

/** A complete, polite utterance followed by the pause that ends it. */
const utterance = (ms = 1200) => [...QUIET(200), ...TONE(ms), ...QUIET(700)];

const tokens = (...parts: string[]) =>
  async function* (): AsyncGenerator<ChatEvent> {
    for (const p of parts) yield { type: "token", delta: p };
    yield { type: "done" };
  };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe("CallRunner: opening the call", () => {
  it("greets the caller with the disclosure and reports the call as started", async () => {
    const h = build();
    await h.runner.start();
    expect(h.events.started).toBe(1);
    expect(h.spoken).toContain(phrasesFor("en").greeting);
    expect(h.sentFrames()).toBeGreaterThan(0);
    expect(h.line.marks.length).toBeGreaterThan(0);
    // The greeting itself must say what the caller needs to know.
    expect(phrasesFor("en").greeting).toMatch(/not a lawyer/i);
    expect(phrasesFor("en").greeting).toMatch(/saved/i);
  });

  it("greets in the caller's language", async () => {
    const h = build({ language: "hi" });
    await h.runner.start();
    expect(h.spoken).toContain(phrasesFor("hi").greeting);
  });
});

describe("CallRunner: a normal turn", () => {
  it("transcribes the caller, asks the AI, and speaks the answer clause by clause", async () => {
    const h = build();
    h.setStt(["my landlord has not returned my deposit"]);
    h.setChat(tokens("I understand, ", "that is stressful. ", "When did you move out? ", "Please tell me the date."));
    await h.runner.start();
    h.finishPlayback();

    const before = h.sentFrames();
    await h.hear(utterance());
    await vi.advanceTimersByTimeAsync(500);

    expect(h.asked).toEqual(["my landlord has not returned my deposit"]);
    const clauses = h.spoken.filter((s) => s !== phrasesFor("en").greeting && !phrasesFor("en").acks.includes(s));
    // The reply is spoken in pieces, in order, never as one block after it finished.
    expect(clauses.length).toBeGreaterThanOrEqual(2);
    expect(clauses.join(" ").replace(/\s+/g, " ")).toBe("I understand, that is stressful. When did you move out? Please tell me the date.");
    expect(h.sentFrames()).toBeGreaterThan(before);
  });

  it("reports timings for each turn", async () => {
    const h = build();
    h.setStt(["hello there"]);
    h.setChat(tokens("Hello. How can I help you today?"));
    await h.runner.start();
    h.finishPlayback();
    await h.hear(utterance());
    await vi.advanceTimersByTimeAsync(500);
    h.finishPlayback();
    await vi.advanceTimersByTimeAsync(10);

    expect(h.turns).toHaveLength(1);
    const t = h.turns[0];
    expect(t.n).toBe(1);
    expect(t.sttProvider).toBe("fake");
    expect(t.firstAudioMs).not.toBeNull();
    // Measured from when the caller stopped speaking, so it includes the endpointing pause.
    expect(t.firstAudioMs!).toBeGreaterThanOrEqual(0);
    expect(t.interrupted).toBe(false);
  });

  it("does not speak the markdown, tables or flowchart of a written answer", async () => {
    const h = build();
    h.setStt(["what are my rights"]);
    h.setChat(tokens("## Answer\n", "You can file a complaint. ", "| a | b |\n|---|---|\n| 1 | 2 |\n", "```mermaid\nflowchart TD\n```\n", "Keep your receipts."));
    await h.runner.start();
    h.finishPlayback();
    await h.hear(utterance());
    await vi.advanceTimersByTimeAsync(500);
    const spokenText = h.spoken.join(" ");
    expect(spokenText).not.toMatch(/[#|`]/);
    expect(spokenText).not.toContain("flowchart");
    expect(spokenText).toContain("You can file a complaint.");
  });
});

describe("CallRunner: sounding alive while the AI thinks", () => {
  it("plays an acknowledgement when the answer is slow", async () => {
    const h = build();
    h.setStt(["my phone was stolen"]);
    h.setChat(async function* () {
      await new Promise((r) => setTimeout(r, 4000));
      yield { type: "token", delta: "I am sorry to hear that. Where did it happen?" };
      yield { type: "done" };
    });
    await h.runner.start();
    h.finishPlayback();
    await h.hear(utterance());

    await vi.advanceTimersByTimeAsync(1500);
    expect(h.spoken.some((s) => phrasesFor("en").acks.includes(s))).toBe(true);

    await vi.advanceTimersByTimeAsync(4000);
    // The answer is spoken after the acknowledgement, in clauses.
    expect(h.spoken.join(" ")).toContain("I am sorry to hear that. Where did it happen?");
    h.finishPlayback();
    await vi.advanceTimersByTimeAsync(10);
    expect(h.turns[0].fillerPlayed).toBe(true);
  });

  it("stays quiet (no filler) when the answer arrives promptly", async () => {
    const h = build();
    h.setStt(["my phone was stolen"]);
    h.setChat(tokens("I am sorry to hear that. Where did it happen?"));
    await h.runner.start();
    h.finishPlayback();
    await h.hear(utterance());
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.spoken.some((s) => phrasesFor("en").acks.includes(s))).toBe(false);
  });
});

describe("CallRunner: interruptions", () => {
  it("stops talking and discards buffered audio when the caller speaks over it", async () => {
    const h = build();
    h.setStt(["tell me about my rights", "never mind, one more thing"]);
    h.setChat(tokens("Here is a very long explanation of your rights. ", "There are many parts to it. ", "First, you have the right to a lawyer."));
    await h.runner.start();
    h.finishPlayback();
    await h.hear(utterance());
    await vi.advanceTimersByTimeAsync(300);
    // The assistant is now playing (marks outstanding). The caller talks over it.
    expect(h.line.marks.length).toBeGreaterThan(0);
    const clearsBefore = h.line.clears;
    await h.hear(TONE(600));
    expect(h.line.clears).toBeGreaterThan(clearsBefore);
  });

  it("ignores a brief noise while the assistant is talking", async () => {
    const h = build();
    h.setStt(["tell me about my rights"]);
    h.setChat(tokens("Here is a long explanation of your rights. ", "There are several parts to it."));
    await h.runner.start();
    h.finishPlayback();
    await h.hear(utterance());
    await vi.advanceTimersByTimeAsync(300);
    const clearsBefore = h.line.clears;
    await h.hear([...TONE(100), ...QUIET(300)]); // a cough, not an interruption
    expect(h.line.clears).toBe(clearsBefore);
  });

  it("joins a thought the caller paused in the middle of (no half-sentences lost)", async () => {
    const h = build({ sttDelayMs: 900 });
    h.setStt(["my landlord", "has not returned my deposit"]);
    h.setChat(tokens("I see. When did you move out?"));
    await h.runner.start();
    h.finishPlayback();
    // First half, then a pause long enough to count as "finished"…
    await h.hear(utterance(900));
    // …but they carry on while the first half is still being transcribed.
    await h.hear([...TONE(1000), ...QUIET(700)]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(h.asked).toEqual(["my landlord has not returned my deposit"]);
  });
});

describe("CallRunner: not answering half a sentence", () => {
  it("does not ask the AI at the short pause, only once the caller has really finished", async () => {
    const h = build();
    h.setStt(["my landlord has not returned my deposit"]);
    h.setChat(tokens("I see. When did you move out?"));
    await h.runner.start();
    h.finishPlayback();
    // Speech, then silence: the endpointer fires at ~520 ms but the question is held.
    await h.hear([...QUIET(200), ...TONE(1200), ...QUIET(600)]);
    expect(h.asked).toHaveLength(0);
    await h.hear(QUIET(500));
    expect(h.asked).toHaveLength(1);
  });

  it("asks the AI ONCE, with the whole sentence, when the caller pauses mid-thought", async () => {
    const h = build();
    h.setStt(["my landlord", "has not returned my deposit"]);
    h.setChat(tokens("I see. When did you move out?"));
    await h.runner.start();
    h.finishPlayback();
    // First half, a ~700 ms pause (long enough to look finished)…
    await h.hear([...QUIET(200), ...TONE(900), ...QUIET(700)]);
    // …then the rest arrives before the AI has been asked.
    await h.hear([...TONE(1000), ...QUIET(1300)]);
    await vi.advanceTimersByTimeAsync(500);

    // Never a request for the half-sentence — that would be saved and answered.
    expect(h.asked).toEqual(["my landlord has not returned my deposit"]);
  });

  it("treats speech after a REAL pause as a new turn, not a correction of the last", async () => {
    const h = build();
    h.setStt(["my landlord has not returned my deposit", "it was fifty thousand rupees"]);
    h.setChat(tokens("I see. How much was it?"));
    await h.runner.start();
    h.finishPlayback();
    await h.hear([...QUIET(200), ...TONE(1200), ...QUIET(1500)]);
    await vi.advanceTimersByTimeAsync(300);
    expect(h.asked).toEqual(["my landlord has not returned my deposit"]);
    h.finishPlayback();
    await h.hear([...QUIET(500), ...TONE(1000), ...QUIET(1500)]);
    await vi.advanceTimersByTimeAsync(300);
    // Two separate questions: the first was already asked and cannot be taken back.
    expect(h.asked).toEqual(["my landlord has not returned my deposit", "it was fifty thousand rupees"]);
  });
});

describe("CallRunner: when the caller cannot be heard", () => {
  it("asks them to repeat, and gives up politely after three failures", async () => {
    const h = build();
    h.setStt(["", "", ""]);
    await h.runner.start();
    h.finishPlayback();

    for (let i = 0; i < 3; i++) {
      await h.hear(utterance());
      await vi.advanceTimersByTimeAsync(200);
      h.finishPlayback();
      await vi.advanceTimersByTimeAsync(10);
    }
    expect(h.spoken.filter((s) => s === phrasesFor("en").retry)).toHaveLength(2);
    expect(h.spoken).toContain(phrasesFor("en").goodbye);
    h.finishPlayback();
    await vi.advanceTimersByTimeAsync(10);
    expect(h.line.closed).toBe(true);
    expect(h.asked).toHaveLength(0);
  });

  it("recovers from a speech-to-text failure instead of going silent", async () => {
    const h = build();
    h.setStt([new Error("provider down")]);
    await h.runner.start();
    h.finishPlayback();
    await h.hear(utterance());
    await vi.advanceTimersByTimeAsync(200);
    expect(h.spoken).toContain(phrasesFor("en").techError);
    expect(h.line.closed).toBe(false);
  });

  it("apologises if the AI itself fails", async () => {
    const h = build();
    h.setStt(["my phone was stolen"]);
    h.setChat(async function* () {
      yield { type: "error", message: "all providers down" };
    });
    await h.runner.start();
    h.finishPlayback();
    await h.hear(utterance());
    await vi.advanceTimersByTimeAsync(500);
    expect(h.spoken).toContain(phrasesFor("en").techError);
  });
});

describe("CallRunner: quiet lines", () => {
  it("prompts twice, then says goodbye and hangs up", async () => {
    const h = build();
    await h.runner.start();
    h.finishPlayback();

    await vi.advanceTimersByTimeAsync(14_500);
    expect(h.spoken.filter((s) => s === phrasesFor("en").silence)).toHaveLength(1);
    h.finishPlayback();
    await vi.advanceTimersByTimeAsync(12_500);
    expect(h.spoken.filter((s) => s === phrasesFor("en").silence)).toHaveLength(2);
    h.finishPlayback();
    await vi.advanceTimersByTimeAsync(10_500);
    expect(h.spoken).toContain(phrasesFor("en").goodbye);
    h.finishPlayback();
    await vi.advanceTimersByTimeAsync(10);
    expect(h.line.closed).toBe(true);
  });

  it("does not prompt while the caller is mid-sentence", async () => {
    const h = build();
    await h.runner.start();
    h.finishPlayback();
    await vi.advanceTimersByTimeAsync(13_000);
    await h.hear(TONE(3000)); // speaking through the point where the prompt would fire
    expect(h.spoken.filter((s) => s === phrasesFor("en").silence)).toHaveLength(0);
  });
});

describe("CallRunner: long answers on a phone", () => {
  const sentence = (n: number) => `Sentence number ${n} is here and it carries a fair number of words. `;

  it("cuts an over-long answer short and says the rest is in the history", async () => {
    const h = build();
    h.setStt(["what are my rights"]);
    let produced = 0;
    h.setChat(async function* () {
      for (let n = 1; n <= 40; n++) {
        produced = n;
        yield { type: "token", delta: sentence(n) };
        await new Promise((r) => setTimeout(r, 30));
      }
      yield { type: "done" };
    });
    await h.runner.start();
    h.finishPlayback();
    await h.hear(utterance());
    await vi.advanceTimersByTimeAsync(4000);

    const answerClauses = h.spoken.filter((s) => s.startsWith("Sentence number"));
    const spokenChars = answerClauses.join(" ").length;
    expect(spokenChars).toBeLessThanOrEqual(420);
    expect(spokenChars).toBeGreaterThan(250); // a useful amount was still said
    // …followed by where to find the rest.
    expect(h.spoken[h.spoken.length - 1]).toBe(phrasesFor("en").fullSaved);
    // And the app was not read from for the whole 40 sentences.
    expect(produced).toBeLessThan(40);
  });

  it("leaves an ordinary short answer completely alone", async () => {
    const h = build();
    h.setStt(["my phone was stolen"]);
    h.setChat(tokens("I am sorry to hear that. ", "Where did it happen?"));
    await h.runner.start();
    h.finishPlayback();
    await h.hear(utterance());
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.spoken).not.toContain(phrasesFor("en").fullSaved);
    expect(h.spoken.join(" ")).toContain("Where did it happen?");
  });

  it("has the 'saved in your history' phrase in every supported language", () => {
    for (const code of ["en", "hi", "ta", "te", "bn", "mr", "gu", "kn", "ml", "pa", "mai", "as", "ur"]) {
      expect(phrasesFor(code).fullSaved.length).toBeGreaterThan(10);
    }
  });
});

describe("CallRunner: safety and limits", () => {
  it("says the emergency message BEFORE the legal answer", async () => {
    const h = build();
    h.setStt(["he is beating me right now"]);
    h.setChat(tokens("I am very sorry. Are you in a safe place?"));
    await h.runner.start();
    h.finishPlayback();
    await h.hear(utterance());
    await vi.advanceTimersByTimeAsync(500);

    const emergencyAt = h.spoken.indexOf(phrasesFor("en").emergency);
    const answerAt = h.spoken.indexOf("I am very sorry.");
    expect(emergencyAt).toBeGreaterThan(-1);
    expect(answerAt).toBeGreaterThan(emergencyAt);
  });

  it("ends a call that reaches the time limit", async () => {
    const h = build({ maxCallMs: 60_000 });
    await h.runner.start();
    h.finishPlayback();
    await vi.advanceTimersByTimeAsync(61_000);
    expect(h.spoken).toContain(phrasesFor("en").timeLimit);
    h.finishPlayback();
    await vi.advanceTimersByTimeAsync(10);
    expect(h.line.closed).toBe(true);
  });

  it("hangs up anyway if the farewell's playback is never confirmed", async () => {
    const h = build({ maxCallMs: 60_000 });
    await h.runner.start();
    h.finishPlayback();
    await vi.advanceTimersByTimeAsync(61_000);
    // Twilio never echoes the mark…
    await vi.advanceTimersByTimeAsync(16_000);
    expect(h.line.closed).toBe(true);
  });

  it("records the call ending exactly once, with its length", async () => {
    const h = build();
    await h.runner.start();
    await vi.advanceTimersByTimeAsync(5000);
    await h.runner.stop("caller-hung-up");
    await h.runner.stop("again");
    expect(h.events.ended).toHaveLength(1);
    expect(h.events.ended[0]).toEqual({ durationSec: 5, reason: "caller-hung-up" });
  });

  it("ignores audio that arrives after the call has ended", async () => {
    const h = build();
    h.setStt(["hello"]);
    await h.runner.start();
    await h.runner.stop("done");
    await h.hear(utterance());
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.asked).toHaveLength(0);
  });
});
