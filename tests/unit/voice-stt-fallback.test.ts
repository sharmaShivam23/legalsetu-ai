import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai/key-pool", () => ({
  getKeysForProvider: vi.fn(() => ["k1"]),
  withKeyRotation: vi.fn(async (_prefix: string, fn: (key: string) => Promise<unknown>) => fn("k1")),
}));

import { groqTranscribe, isGroqSttConfigured, looksLikeNoSpeech } from "@/lib/voice/groq-stt";
import { getKeysForProvider } from "@/lib/ai/key-pool";

const audio = Buffer.from("fake-audio-bytes");

function mockGroq(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("isGroqSttConfigured", () => {
  it("is true when a Groq key exists, false when none", () => {
    expect(isGroqSttConfigured()).toBe(true);
    (getKeysForProvider as any).mockReturnValueOnce([]);
    expect(isGroqSttConfigured()).toBe(false);
  });
});

describe("looksLikeNoSpeech (Whisper hallucinating on silence)", () => {
  it("flags a transcript where every segment is probably silence", () => {
    expect(looksLikeNoSpeech([{ no_speech_prob: 0.9, avg_logprob: -1.2 }])).toBe(true);
  });
  it("keeps a transcript with at least one confident segment", () => {
    expect(looksLikeNoSpeech([{ no_speech_prob: 0.9, avg_logprob: -1.2 }, { no_speech_prob: 0.05, avg_logprob: -0.2 }])).toBe(false);
  });
  it("keeps a transcript when there is no segment information", () => {
    expect(looksLikeNoSpeech(undefined)).toBe(false);
    expect(looksLikeNoSpeech([])).toBe(false);
  });
});

describe("groqTranscribe", () => {
  it("returns the text and maps Whisper's language name to a Sarvam-style code", async () => {
    mockGroq({ text: " मुझे जमानत चाहिए ", language: "hindi", segments: [{ no_speech_prob: 0.01, avg_logprob: -0.2 }] });
    const r = await groqTranscribe(audio, "audio/webm;codecs=opus");
    expect(r).toEqual({ transcript: "मुझे जमानत चाहिए", languageCode: "hi-IN", confidence: null });
  });

  it("sends the audio with a plain content type (codec parameter removed)", async () => {
    const fetchMock = mockGroq({ text: "hello", language: "english" });
    await groqTranscribe(audio, "audio/webm;codecs=opus");
    const call = (fetchMock.mock.calls as unknown as [string, RequestInit][])[0];
    const form = call[1].body as FormData;
    expect((form.get("file") as File).type).toBe("audio/webm");
    expect(form.get("response_format")).toBe("verbose_json");
  });

  it("returns an empty transcript for silence instead of inventing words", async () => {
    mockGroq({ text: " you", language: "english", segments: [{ no_speech_prob: 0.95, avg_logprob: -1.5 }] });
    const r = await groqTranscribe(audio, "audio/wav");
    expect(r.transcript).toBe("");
    expect(r.languageCode).toBeNull();
  });

  it("gives a null language code for a language the app has no code for", async () => {
    mockGroq({ text: "bonjour", language: "french", segments: [{ no_speech_prob: 0.01, avg_logprob: -0.1 }] });
    expect((await groqTranscribe(audio, "audio/wav")).languageCode).toBeNull();
  });

  it("throws on an HTTP error so the key pool can rotate or the caller can report it", async () => {
    mockGroq({ error: { message: "rate limited" } }, 429);
    await expect(groqTranscribe(audio, "audio/wav")).rejects.toThrow(/GROQ_STT_HTTP_429/);
  });
});
