// lib/ai/models.ts

export type ModelCategory = "DEFAULT" | "OPENAI" | "ANTHROPIC" | "GOOGLE" | "GROQ" | "CEREBRAS" | "OPENROUTER" | "OPENCODE";
export type ModelCapability = "Fast" | "Balanced" | "Reasoning";

export interface AIModel {
  id: string; // Internal ID used by LegalSetu (e.g., "gemini-default", "openrouter-nemotron")
  provider: string; // The provider abstraction (e.g., "gemini", "openrouter")
  category: ModelCategory;
  name: string; // UI Name
  capability: ModelCapability;
  getApiId: () => string; // The actual model string to pass to the API, from env
}

export const AI_MODELS: AIModel[] = [
  // Google / Default
  {
    id: "gemini-default",
    provider: "gemini",
    category: "DEFAULT",
    name: "Gemini Pro",
    capability: "Balanced",
    getApiId: () => process.env.GEMINI_CHAT_MODEL || "gemini-1.5-pro",
  },
  {
    id: "gemini-flash",
    provider: "gemini",
    category: "GOOGLE",
    name: "Gemini Flash",
    capability: "Fast",
    // gemini-1.5-flash is retired (404). The -lite-latest alias responds
    // fast and draws on a separate daily quota from gemini-flash-latest,
    // so picking Flash also relieves the default model's free-tier cap.
    getApiId: () => process.env.GEMINI_FLASH_MODEL || "gemini-flash-lite-latest",
  },
  // OpenAI
  {
    id: "openai-default",
    provider: "openai",
    category: "OPENAI",
    name: "OpenAI",
    capability: "Balanced",
    getApiId: () => process.env.OPENAI_CHAT_MODEL || "gpt-4o",
  },
  // Anthropic
  {
    id: "anthropic-default",
    provider: "anthropic",
    category: "ANTHROPIC",
    name: "Claude",
    capability: "Balanced",
    getApiId: () => process.env.ANTHROPIC_CHAT_MODEL || "claude-opus-5-5",
  },
  // Groq
  {
    id: "groq-default",
    provider: "groq",
    category: "GROQ",
    name: "Groq",
    capability: "Fast",
    getApiId: () => process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b",
  },
  // Cerebras — OpenAI-compatible, ~2000 tok/s, 1M free tokens/day.
  // Second in the chain rather than first: the free tier allows only
  // about 5 requests/minute, which Groq's limits comfortably beat for
  // interactive chat, so this is the fast reserve once Groq's daily
  // token budget is spent.
  {
    id: "cerebras-default",
    provider: "cerebras",
    category: "CEREBRAS",
    name: "Cerebras",
    capability: "Fast",
    getApiId: () => process.env.CEREBRAS_CHAT_MODEL || "gpt-oss-120b",
  },
  // OpenRouter - IDs must match openrouter.ai/api/v1/models exactly,
  // including the ":free" suffix; the previous values were not real IDs
  // and every request 400'd.
  {
    id: "openrouter-nemotron",
    provider: "openrouter",
    category: "OPENROUTER",
    // Nemotron Ultra (550B) took ~2 minutes to answer a one-word prompt,
    // past the chat route's 60s limit, so the selector offers Super.
    name: "Nemotron Super",
    capability: "Reasoning",
    getApiId: () => process.env.OPENROUTER_NEMOTRON_MODEL || "nvidia/nemotron-3-super-120b-a12b:free",
  },
  {
    id: "openrouter-gemma",
    provider: "openrouter",
    category: "OPENROUTER",
    name: "Gemma 4 26B",
    capability: "Balanced",
    getApiId: () => process.env.OPENROUTER_GEMMA_MODEL || "google/gemma-4-26b-a4b-it:free",
  },
  {
    id: "openrouter-ling",
    provider: "openrouter",
    category: "OPENROUTER",
    name: "Ling 3 Flash",
    capability: "Fast",
    getApiId: () => process.env.OPENROUTER_LING_MODEL || "inclusionai/ling-3.0-flash-vl:free",
  },
  // OpenCode
  {
    id: "opencode-nemotron",
    provider: "opencode",
    category: "OPENCODE",
    name: "Nemotron Ultra",
    capability: "Reasoning",
    getApiId: () => process.env.OPENCODE_NEMOTRON_MODEL || "nemotron-3-ultra-free",
  },
  {
    id: "opencode-mimo",
    provider: "opencode",
    category: "OPENCODE",
    name: "MiMo V2.5",
    capability: "Fast",
    getApiId: () => process.env.OPENCODE_MIMO_MODEL || "mimo-v2.5-free",
  }
];

/**
 * Returns the model definition for the given ID.
 * Defaults to "gemini-default" if not found.
 */
export const DEFAULT_MODEL_ID = "groq-default";

export function getModelById(id?: string | null): AIModel {
  if (!id || id === "auto") {
    // "auto" mode will be handled by the fallback mechanism,
    // but initially it returns the default.
    return AI_MODELS.find(m => m.id === DEFAULT_MODEL_ID)!;
  }
  return AI_MODELS.find(m => m.id === id) || AI_MODELS.find(m => m.id === DEFAULT_MODEL_ID)!;
}

/**
 * Gets a list of fallback models for Auto mode.
 * Priority: Groq -> Cerebras -> Gemini -> OpenRouter Gemma -> OpenAI -> Claude -> OpenCode MiMo
 *
 * Ordered by measured time-to-first-token on THIS project's free-tier
 * accounts, fastest first, not by model prestige. The previous order put
 * Gemini first and Groq fourth, so every single request paid for a
 * Gemini 403, an OpenAI 429 and an Anthropic 400 — about 23 seconds of
 * doomed round-trips — before reaching the one provider that actually
 * answers. See the "AI provider failed" chain in dev-server.log.
 *
 * Providers with no credit or a blocked project sit at the BACK. They
 * cost nothing there (hasKeysForProvider skips unset keys entirely, and
 * lib/ai/llm.ts benches permanent failures for 15 minutes), and they
 * resume their place automatically if the account is ever topped up.
 */
export function getAutoFallbackSequence(): AIModel[] {
  const sequenceIds = [
    "groq-default",
    "cerebras-default",
    "gemini-default",
    "openrouter-gemma",
    "openai-default",
    "anthropic-default",
    "opencode-mimo"
  ];
  return sequenceIds.map(id => getModelById(id));
}
