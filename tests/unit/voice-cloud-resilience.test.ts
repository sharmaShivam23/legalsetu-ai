import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Voice on the API-key path when providers misbehave:
//  - Groq Whisper writing spoken Hindi in Urdu script
//  - Sarvam out of credit: the cloud voice must fail fast, once
// ---------------------------------------------------------------------------

vi.mock("@/lib/ai/key-pool", () => ({
  getKeysForProvider: vi.fn(() => ["k1"]),
  withKeyRotation: vi.fn(async (_prefix: string, fn: (key: string) => Promise<unknown>) => fn("k1")),
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const confident = [{ no_speech_prob: 0.01, avg_logprob: -0.2 }];

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  delete (globalThis as any).__legalsetuSarvam;
});

describe("groqTranscribe — Hindi heard as Urdu", () => {
  it("re-reads the clip as Hindi when Whisper answers in Urdu script", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ text: "میرے مکان مالک", language: "urdu", segments: confident }))
      .mockResolvedValueOnce(json({ text: "मेरे मकान मालिक", language: "hindi", segments: confident }));
    vi.stubGlobal("fetch", fetchMock);
    const { groqTranscribe } = await import("@/lib/voice/groq-stt");

    const r = await groqTranscribe(Buffer.from("a"), "audio/webm", "en");
    expect(r).toEqual({ transcript: "मेरे मकान मालिक", languageCode: "hi-IN", confidence: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(((fetchMock.mock.calls[1] as any)[1].body as FormData).get("language")).toBe("hi");
  });

  it("keeps Urdu when the user chose Urdu", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ text: "میرے مکان مالک", language: "urdu", segments: confident }));
    vi.stubGlobal("fetch", fetchMock);
    const { groqTranscribe } = await import("@/lib/voice/groq-stt");

    const r = await groqTranscribe(Buffer.from("a"), "audio/webm", "ur");
    expect(r.languageCode).toBe("ur-IN");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Sarvam out of credit", () => {
  beforeEach(() => {
    vi.stubEnv("SARVAM_API_KEY_1", "s1");
    vi.stubEnv("SARVAM_API_KEY_2", "s2");
  });

  it("reports the cloud voice unavailable, and then stops calling Sarvam", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ error: { message: "No credits available." } }, 402));
    vi.stubGlobal("fetch", fetchMock);
    const sarvam = await import("@/lib/voice/sarvam");

    expect(await sarvam.sarvamTtsAvailable()).toBe(false);
    const callsAfterProbe = fetchMock.mock.calls.length;
    expect(callsAfterProbe).toBe(2); // each key tried once
    expect(sarvam.sarvamOutOfCredit()).toBe(true);

    // Every later check is answered without touching the network.
    expect(await sarvam.sarvamTtsAvailable()).toBe(false);
    await expect(sarvam.sarvamSpeak("नमस्ते", "hi-IN")).rejects.toThrow(/SARVAM_HTTP_402/);
    expect(fetchMock.mock.calls.length).toBe(callsAfterProbe);
  });

  it("shares the out-of-credit state across separately bundled route modules", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => json({}, 402)));
    const first = await import("@/lib/voice/sarvam");
    await first.sarvamTtsAvailable();

    vi.resetModules(); // a second route bundle gets its own module instance
    const second = await import("@/lib/voice/sarvam");
    expect(second.sarvamOutOfCredit()).toBe(true);
  });

  it("remembers a working voice so the probe is not repeated per conversation", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ audios: [Buffer.from("wav").toString("base64")] }));
    vi.stubGlobal("fetch", fetchMock);
    const sarvam = await import("@/lib/voice/sarvam");

    expect(await sarvam.sarvamTtsAvailable()).toBe(true);
    expect(await sarvam.sarvamTtsAvailable()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
