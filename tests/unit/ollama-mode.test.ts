import { describe, it, expect, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getAIProvider, getFallbackChatProviders } from "@/lib/ai/provider";
import { isOllamaMode, setOllamaMode, getSelectedOllamaModel } from "@/lib/ai/mode";
import { ollamaModel } from "@/lib/ai/ollama";

vi.mock("@/lib/ai/key-pool", () => ({
  withKeyRotation: vi.fn(),
  getAvailableKeys: vi.fn().mockResolvedValue(["mock-key"]),
}));

const FILE = path.join(process.cwd(), ".ollama-mode.json");

describe("Ollama mode", () => {
  afterAll(() => {
    setOllamaMode(false, null);
    try {
      fs.unlinkSync(FILE);
    } catch {
      // already gone
    }
  });

  it("forces the local provider whatever model was requested", async () => {
    setOllamaMode(true);
    expect(isOllamaMode()).toBe(true);
    expect((await getAIProvider("groq-default")).name).toBe("ollama");
    expect((await getAIProvider("auto")).name).toBe("ollama");
    expect((await getAIProvider()).name).toBe("ollama");
  });

  it("never offers cloud fallbacks", async () => {
    setOllamaMode(true);
    expect(await getFallbackChatProviders("ollama")).toEqual([]);
  });

  it("uses the model picked in the UI over the .env default", () => {
    setOllamaMode(true, "gemma3:4b");
    expect(getSelectedOllamaModel()).toBe("gemma3:4b");
    expect(ollamaModel()).toBe("gemma3:4b");
  });

  it("goes back to normal routing when switched off", async () => {
    setOllamaMode(false);
    expect(isOllamaMode()).toBe(false);
    expect((await getAIProvider("groq-default")).name).not.toBe("ollama");
    expect((await getFallbackChatProviders("groq")).length).toBeGreaterThan(0);
    // Loads every cloud adapter module for the first time, which is slow.
  }, 30000);
});
