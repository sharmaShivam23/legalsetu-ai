// lib/ai/models.ts

export type ModelCategory = "DEFAULT" | "OPENAI" | "ANTHROPIC" | "GOOGLE" | "GROQ" | "OPENROUTER" | "OPENCODE";
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
    getApiId: () => process.env.ANTHROPIC_CHAT_MODEL || "claude-3-5-sonnet-20241022",
  },
  // Groq
  {
    id: "groq-default",
    provider: "groq",
    category: "GROQ",
    name: "Groq",
    capability: "Fast",
    getApiId: () => process.env.GROQ_CHAT_MODEL || "llama3-70b-8192",
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
export function getModelById(id?: string | null): AIModel {
  if (!id || id === "auto") {
    // "auto" mode will be handled by the fallback mechanism, 
    // but initially it returns the default.
    return AI_MODELS.find(m => m.id === "gemini-default")!;
  }
  return AI_MODELS.find(m => m.id === id) || AI_MODELS.find(m => m.id === "gemini-default")!;
}

/**
 * Gets a list of fallback models for Auto mode.
 * Priority: Gemini Default -> OpenAI -> Claude -> Groq -> OpenRouter Gemma -> OpenCode MiMo
 */
export function getAutoFallbackSequence(): AIModel[] {
  const sequenceIds = [
    "gemini-default",
    "openai-default",
    "anthropic-default",
    "groq-default",
    "openrouter-gemma",
    "opencode-mimo"
  ];
  return sequenceIds.map(id => getModelById(id));
}
