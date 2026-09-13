import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Verifies the second half of the failover chain: once the chosen
 * provider fails before producing any text, the chat layer must hand the
 * request to the next working provider rather than showing the user an
 * error — and must say which provider actually answered.
 *
 * The providers are stubbed so this proves the wiring without spending
 * real quota.
 */

const getAIProvider = vi.fn();
const getFallbackChatProviders = vi.fn();

vi.mock("@/lib/ai/provider", () => ({
  getAIProvider: (...args: any[]) => getAIProvider(...args),
  getFallbackChatProviders: (...args: any[]) => getFallbackChatProviders(...args),
}));

vi.mock("@/lib/logging/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function provider(name: string, behaviour: { deltas?: string[]; throwAfter?: number; error?: string }) {
  const error = behaviour.error ?? "429 quota exhausted";
  return {
    name,
    isDemo: false,
    complete: vi.fn(async () => {
      if (behaviour.throwAfter === 0) throw new Error(error);
      return (behaviour.deltas ?? []).join("");
    }),
    async *streamComplete() {
      const deltas = behaviour.deltas ?? [];
      for (let i = 0; i < deltas.length; i++) {
        if (behaviour.throwAfter === i) throw new Error(error);
        yield { delta: deltas[i], done: false };
      }
      if (behaviour.throwAfter === deltas.length) throw new Error(error);
      yield { delta: "", done: true };
    },
  } as any;
}

async function collect(stream: AsyncGenerator<any>) {
  let text = "";
  let servedBy: string | undefined;
  for await (const chunk of stream) {
    if (chunk.servedBy) servedBy = chunk.servedBy;
    if (chunk.delta) text += chunk.delta;
  }
  return { text, servedBy };
}

describe("chat failover between providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("falls through to the fallback provider when the primary is exhausted", async () => {
    getAIProvider.mockResolvedValue(provider("gemini", { deltas: [], throwAfter: 0 }));
    getFallbackChatProviders.mockResolvedValue([provider("groq", { deltas: ["Groq ", "answered."] })]);

    const { streamCompletion } = await import("@/lib/ai/llm");
    const { text, servedBy } = await collect(streamCompletion([{ role: "user", content: "hi" }]));

    expect(text).toBe("Groq answered.");
    expect(servedBy).toBe("groq");
    expect(getFallbackChatProviders).toHaveBeenCalledWith("gemini");
  });

  it("keeps going past a fallback that is also down (e.g. out of credits)", async () => {
    getAIProvider.mockResolvedValue(provider("anthropic", { deltas: [], throwAfter: 0, error: "credit balance is too low" }));
    getFallbackChatProviders.mockResolvedValue([
      provider("openai", { deltas: [], throwAfter: 0, error: "429 You have no credits remaining" }),
      provider("groq", { deltas: ["Answered by Groq."] }),
    ]);

    const { streamCompletion } = await import("@/lib/ai/llm");
    const { text, servedBy } = await collect(streamCompletion([{ role: "user", content: "hi" }]));

    expect(text).toBe("Answered by Groq.");
    expect(servedBy).toBe("groq");
  });

  it("does NOT switch providers once tokens have already reached the user", async () => {
    // Failing halfway through would otherwise splice two different
    // answers together in the same message.
    getAIProvider.mockResolvedValue(provider("gemini", { deltas: ["Half an ", "answer"], throwAfter: 2 }));
    getFallbackChatProviders.mockResolvedValue([provider("groq", { deltas: ["A completely different answer"] })]);

    const { streamCompletion } = await import("@/lib/ai/llm");

    await expect(collect(streamCompletion([{ role: "user", content: "hi" }]))).rejects.toThrow(/quota/);
    expect(getFallbackChatProviders).not.toHaveBeenCalled();
  });

  it("surfaces the original error when no fallback provider is configured", async () => {
    getAIProvider.mockResolvedValue(provider("gemini", { deltas: [], throwAfter: 0 }));
    getFallbackChatProviders.mockResolvedValue([]);

    const { streamCompletion } = await import("@/lib/ai/llm");

    await expect(collect(streamCompletion([{ role: "user", content: "hi" }]))).rejects.toThrow(/quota/);
  });

  it("stops retrying a provider that is out of credits on the next request", async () => {
    const openai = provider("openai", { throwAfter: 0, error: "429 You have no credits remaining" });
    getAIProvider.mockResolvedValue(provider("gemini", { throwAfter: 0 }));
    getFallbackChatProviders.mockResolvedValue([openai, provider("groq", { deltas: ["ok"] })]);

    const { generateCompletion } = await import("@/lib/ai/llm");
    await generateCompletion([{ role: "user", content: "hi" }]);
    await generateCompletion([{ role: "user", content: "again" }]);

    expect(openai.complete).toHaveBeenCalledTimes(1);
  });

  it("applies the same failover to non-streaming completions", async () => {
    getAIProvider.mockResolvedValue(provider("gemini", { throwAfter: 0 }));
    getFallbackChatProviders.mockResolvedValue([
      provider("openai", { throwAfter: 0, error: "429 You have no credits remaining" }),
      provider("groq", { deltas: ["fallback result"] }),
    ]);

    const { generateCompletion } = await import("@/lib/ai/llm");
    await expect(generateCompletion([{ role: "user", content: "hi" }])).resolves.toBe("fallback result");
  });
});
