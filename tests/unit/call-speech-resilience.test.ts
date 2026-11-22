// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The speech layer must stay usable when a provider is slow, unreachable or
 * out of credit. These tests stub the two speech-to-text providers' network
 * calls and check how createSpeech().transcribe behaves.
 */

const sarvamTranscribe = vi.fn();
vi.mock("@/lib/voice/sarvam", () => ({
  sarvamTranscribe: (...a: unknown[]) => sarvamTranscribe(...a),
  sarvamSpeak: vi.fn(),
  resolveTtsLanguage: () => ({ code: "hi-IN", exact: true }),
  isSarvamConfigured: () => true,
}));
vi.mock("@/lib/logging/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const groqFetch = vi.fn();

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  sarvamTranscribe.mockReset();
  groqFetch.mockReset();
  process.env.GROQ_API_KEY_1 = "g1";
  process.env.CALL_STT_PROVIDER = "auto";
  process.env.CALL_STT_HEDGE_MS = "2500";
  vi.stubGlobal("fetch", (...args: unknown[]) => groqFetch(...args));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const groqOk = (text: string) =>
  Promise.resolve(new Response(JSON.stringify({ text, segments: [{ no_speech_prob: 0, avg_logprob: -0.1 }] }), { status: 200 }));
const pcm = Buffer.alloc(3200);

describe("speech-to-text resilience", () => {
  it("uses the first provider when it answers quickly, and never starts the second", async () => {
    sarvamTranscribe.mockResolvedValue({ transcript: "from sarvam", languageCode: "hi-IN", confidence: 0.9 });
    const { createSpeech, resetSpeechHealth } = await import("@/lib/calls/speech");
    resetSpeechHealth();
    const r = await createSpeech().transcribe(pcm, "hi");
    expect(r.text).toBe("from sarvam");
    expect(groqFetch).not.toHaveBeenCalled();
  });

  it("starts the second provider after the hedge delay and takes whichever answers first", async () => {
    sarvamTranscribe.mockReturnValue(new Promise(() => {})); // stalls forever
    groqFetch.mockImplementation(() => groqOk("from groq"));
    const { createSpeech, resetSpeechHealth } = await import("@/lib/calls/speech");
    resetSpeechHealth();
    const pending = createSpeech().transcribe(pcm, "hi");
    await vi.advanceTimersByTimeAsync(2400);
    expect(groqFetch).not.toHaveBeenCalled(); // not before the hedge delay
    await vi.advanceTimersByTimeAsync(300);
    expect((await pending).text).toBe("from groq");
  });

  it("fails over at once when the first provider errors, without waiting out the hedge", async () => {
    sarvamTranscribe.mockRejectedValue(new Error("SARVAM_HTTP_402"));
    groqFetch.mockImplementation(() => groqOk("from groq"));
    const { createSpeech, resetSpeechHealth } = await import("@/lib/calls/speech");
    resetSpeechHealth();
    const pending = createSpeech().transcribe(pcm, "hi");
    await vi.advanceTimersByTimeAsync(10); // far less than 2500 ms
    expect((await pending).text).toBe("from groq");
  });

  it("remembers a credit failure so the next utterance skips that provider entirely", async () => {
    sarvamTranscribe.mockRejectedValue(new Error("SARVAM_HTTP_402"));
    groqFetch.mockImplementation(() => groqOk("from groq"));
    const { createSpeech, resetSpeechHealth } = await import("@/lib/calls/speech");
    resetSpeechHealth();
    const speech = createSpeech();
    await speech.transcribe(pcm, "hi");
    expect(sarvamTranscribe).toHaveBeenCalledTimes(1);
    await speech.transcribe(pcm, "hi");
    expect(sarvamTranscribe).toHaveBeenCalledTimes(1); // not tried again
  });

  it("sets a provider aside after a timeout, so it is not retried on every utterance", async () => {
    sarvamTranscribe.mockRejectedValue(new Error("SARVAM_UNREACHABLE"));
    groqFetch.mockImplementation(() => groqOk("from groq"));
    const { createSpeech, resetSpeechHealth } = await import("@/lib/calls/speech");
    resetSpeechHealth();
    const speech = createSpeech();
    await speech.transcribe(pcm, "hi");
    await speech.transcribe(pcm, "hi");
    expect(sarvamTranscribe).toHaveBeenCalledTimes(1);
    // …but only for a while: a provider that recovers is used again.
    await vi.advanceTimersByTimeAsync(50_000);
    await speech.transcribe(pcm, "hi");
    expect(sarvamTranscribe).toHaveBeenCalledTimes(2);
  });

  it("reports the error when every provider fails", async () => {
    sarvamTranscribe.mockRejectedValue(new Error("SARVAM_HTTP_402"));
    groqFetch.mockImplementation(() => Promise.resolve(new Response("{}", { status: 500 })));
    const { createSpeech, resetSpeechHealth } = await import("@/lib/calls/speech");
    resetSpeechHealth();
    await expect(createSpeech().transcribe(pcm, "hi")).rejects.toThrow();
  });

  it("discards Whisper's invented 'Thanks for watching' on a silent clip", async () => {
    sarvamTranscribe.mockRejectedValue(new Error("SARVAM_HTTP_402"));
    groqFetch.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ text: "Thanks for watching!", segments: [{ no_speech_prob: 0.9, avg_logprob: -1.2 }] }), { status: 200 }))
    );
    const { createSpeech, resetSpeechHealth } = await import("@/lib/calls/speech");
    resetSpeechHealth();
    expect((await createSpeech().transcribe(pcm, "en")).text).toBe("");
  });
});
