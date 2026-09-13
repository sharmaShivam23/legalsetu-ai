import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * The failover chain is the thing standing between a live demo and a
 * dead assistant when a free-tier quota runs out, and it is exactly
 * the kind of code that is never exercised until the moment it
 * matters. These tests drive it with simulated 429s so the behaviour
 * is proven without burning real quota.
 */

const ORIGINAL_ENV = { ...process.env };

async function freshModule() {
  // The key pool benches exhausted keys in module-level state, so each
  // test needs its own instance to stay independent.
  vi.resetModules();
  return import("@/lib/ai/gemini-keys");
}

function quotaError(): Error {
  return new Error('{"error":{"code":429,"message":"RESOURCE_EXHAUSTED"}}');
}

describe("Gemini key pool", () => {
  beforeEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("GEMINI_API_KEY")) delete process.env[k];
    }
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("collects keys in priority order and removes duplicates", async () => {
    process.env.GEMINI_API_KEY = "key-a";
    process.env.GEMINI_API_KEY_1 = "key-a"; // same as the base key
    process.env.GEMINI_API_KEY_2 = "key-b";
    process.env.GEMINI_API_KEY_3 = "key-c";

    const { getGeminiKeys } = await freshModule();
    expect(getGeminiKeys()).toEqual(["key-a", "key-b", "key-c"]);
  });

  it("recognises quota rejections but not ordinary failures", async () => {
    const { isQuotaError } = await freshModule();

    expect(isQuotaError(quotaError())).toBe(true);
    expect(isQuotaError(new Error("RESOURCE_EXHAUSTED"))).toBe(true);
    expect(isQuotaError(new Error("You exceeded your current quota"))).toBe(true);
    expect(isQuotaError(new Error("Rate limit reached for model"))).toBe(true);

    expect(isQuotaError(new Error("model not found"))).toBe(false);
    expect(isQuotaError(new Error("invalid argument"))).toBe(false);
  });

  it("moves to the next key when one is exhausted", async () => {
    process.env.GEMINI_API_KEY = "key-1";
    process.env.GEMINI_API_KEY_2 = "key-2";
    process.env.GEMINI_API_KEY_3 = "key-3";

    const { withKeyRotation } = await freshModule();
    const tried: string[] = [];

    const result = await withKeyRotation(async (apiKey) => {
      tried.push(apiKey);
      if (apiKey !== "key-3") throw quotaError();
      return "answered";
    });

    expect(result).toBe("answered");
    expect(tried).toEqual(["key-1", "key-2", "key-3"]);
  });

  it("throws once every key is exhausted, so the caller can fall back to Groq", async () => {
    process.env.GEMINI_API_KEY = "key-1";
    process.env.GEMINI_API_KEY_2 = "key-2";

    const { withKeyRotation } = await freshModule();
    const tried: string[] = [];

    await expect(
      withKeyRotation(async (apiKey) => {
        tried.push(apiKey);
        throw quotaError();
      })
    ).rejects.toThrow();

    // Every key must have been attempted before giving up.
    expect(tried).toEqual(["key-1", "key-2"]);
  });

  it("does NOT burn other keys on a non-quota error", async () => {
    process.env.GEMINI_API_KEY = "key-1";
    process.env.GEMINI_API_KEY_2 = "key-2";
    process.env.GEMINI_API_KEY_3 = "key-3";

    const { withKeyRotation } = await freshModule();
    const tried: string[] = [];

    await expect(
      withKeyRotation(async (apiKey) => {
        tried.push(apiKey);
        throw new Error("400 invalid request");
      })
    ).rejects.toThrow(/invalid request/);

    // A malformed request would fail identically on every key —
    // rotating would just waste all of them and hide the real bug.
    expect(tried).toEqual(["key-1"]);
  });

  it("benches an exhausted key so the next call starts on a working one", async () => {
    process.env.GEMINI_API_KEY = "key-1";
    process.env.GEMINI_API_KEY_2 = "key-2";

    const { withKeyRotation, availableGeminiKeys } = await freshModule();

    await withKeyRotation(async (apiKey) => {
      if (apiKey === "key-1") throw quotaError();
      return "ok";
    });

    // key-1 reported exhaustion, so it should no longer be offered first.
    expect(availableGeminiKeys()).toEqual(["key-2"]);
  });

  it("retries every key rather than failing outright once all are benched", async () => {
    process.env.GEMINI_API_KEY = "key-1";

    const { withKeyRotation, availableGeminiKeys } = await freshModule();

    await expect(
      withKeyRotation(async () => {
        throw quotaError();
      })
    ).rejects.toThrow();

    // The cooldown is a guess about Google's reset schedule, not a
    // fact, so an all-benched pool still offers everything again.
    expect(availableGeminiKeys()).toEqual(["key-1"]);
  });
});
