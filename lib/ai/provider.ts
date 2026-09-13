// lib/ai/provider.ts

/**
 * AI Provider Abstraction
 * ------------------------------------------------------------
 * The rest of the application NEVER imports Gemini, OpenAI (or
 * any other vendor SDK) directly. Everything goes through this
 * interface, so swapping providers means writing one new adapter
 * file. Default provider: Google Gemini (see lib/ai/gemini.ts).
 * OpenAI remains available as an alternate adapter (lib/ai/openai.ts).
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface LLMStreamChunk {
  delta: string;
  done: boolean;
  /** Set once, before any text, when a fallback provider took over. */
  servedBy?: string;
}

export interface EmbeddingResult {
  embedding: number[];
  dimensions: number;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  confidence?: number;
}

export interface TranslationResult {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface OCRResult {
  text: string;
  confidence?: number;
}

export interface AIProvider {
  name: string;
  isDemo: boolean;

  complete(options: LLMCompletionOptions): Promise<string>;

  streamComplete(
    options: LLMCompletionOptions
  ): AsyncGenerator<LLMStreamChunk>;

  embed(text: string): Promise<EmbeddingResult>;

  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
  /** `language` is an optional hint (e.g. "pa") so the model knows
   *  which language to expect — greatly improves Indian-language
   *  accuracy. Adapters that ignore it still satisfy this interface. */
  transcribe(
    audio: Buffer,
    mimeType: string,
    language?: string
  ): Promise<TranscriptionResult>;
  translate(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<TranslationResult>;

  ocr(
    image: Buffer,
    mimeType: string
  ): Promise<OCRResult>;
}

import { getModelById, getAutoFallbackSequence, AIModel } from "./models";
import { getAvailableKeys } from "./key-pool";

export async function createProviderInstance(model: AIModel): Promise<AIProvider> {
  switch (model.provider) {
    case "gemini": {
      const { GeminiProvider } = await import("./gemini");
      return new GeminiProvider(model.id);
    }
    case "openai": {
      const { OpenAIProvider } = await import("./openai");
      return new OpenAIProvider(model.id);
    }
    case "anthropic": {
      const { AnthropicProvider } = await import("./anthropic");
      return new AnthropicProvider(model.id);
    }
    case "groq": {
      const { GroqProvider } = await import("./groq");
      return new GroqProvider(model.id);
    }
    case "openrouter": {
      const { OpenRouterProvider } = await import("./openrouter");
      return new OpenRouterProvider(model.id);
    }
    case "opencode": {
      const { OpenCodeProvider } = await import("./opencode");
      return new OpenCodeProvider(model.id);
    }
    default: {
      const { MockProvider } = await import("./mock");
      return new MockProvider();
    }
  }
}

async function hasKeysForProvider(providerName: string): Promise<boolean> {
  let prefix = "";
  switch (providerName) {
    case "gemini": prefix = "GEMINI_API_KEY"; break;
    case "openai": prefix = "OPENAI_API_KEY"; break;
    case "anthropic": prefix = "ANTHROPIC_API_KEY"; break;
    case "groq": prefix = "GROQ_API_KEY"; break;
    case "openrouter": prefix = "OPENROUTER_API_KEY"; break;
    case "opencode": prefix = "OPENCODE_API_KEY"; break;
  }
  if (!prefix) return false;
  const keys = await getAvailableKeys(prefix);
  return keys.length > 0;
}

export async function getAIProvider(modelId?: string): Promise<AIProvider> {
  if (modelId === "auto") {
    const sequence = getAutoFallbackSequence();
    for (const fallbackModel of sequence) {
      if (await hasKeysForProvider(fallbackModel.provider)) {
        return createProviderInstance(fallbackModel);
      }
    }
  } else {
    const model = getModelById(modelId);
    if (await hasKeysForProvider(model.provider)) {
      return createProviderInstance(model);
    }
  }

  // Fallback to mock if nothing is configured
  const { MockProvider } = await import("./mock");
  return new MockProvider();
}

/**
 * Fallback to the next model in the sequence if the current one fails.
 * Only used if "auto" mode is implicitly enabled or we need a hard fallback.
 */
export async function getFallbackChatProvider(
  primaryName: string
): Promise<AIProvider | null> {
  const [first] = await getFallbackChatProviders(primaryName);
  return first ?? null;
}

/**
 * Every configured provider other than the one that just failed, in
 * fallback order. Having a key is not the same as having a working
 * account — an out-of-credit OpenAI key still "has keys" — so callers
 * should try each in turn rather than stopping at the first.
 */
export async function getFallbackChatProviders(primaryName: string): Promise<AIProvider[]> {
  const out: AIProvider[] = [];
  const seen = new Set<string>([primaryName]);
  for (const fallbackModel of getAutoFallbackSequence()) {
    if (seen.has(fallbackModel.provider)) continue;
    seen.add(fallbackModel.provider);
    if (await hasKeysForProvider(fallbackModel.provider)) {
      out.push(await createProviderInstance(fallbackModel));
    }
  }
  return out;
}

/**
 * Resolves the provider used for EMBEDDINGS specifically.
 *
 * Chat and embeddings have opposite priorities: chat wants the
 * fastest good model, embeddings must match the 1536-dimension
 * pgvector column the corpus was indexed with. Groq, for example,
 * is far faster for chat but offers no embeddings endpoint at all.
 *
 * So this lets you run a fast chat provider while still doing real
 * vector retrieval:
 *
 *   AI_PROVIDER=groq            # fast answers
 *   EMBEDDING_PROVIDER=gemini   # working RAG
 *
 * Falls back to the main provider when nothing special is set.
 */
export async function getEmbeddingProvider(): Promise<AIProvider> {
  const explicit = process.env.EMBEDDING_PROVIDER;

  if (explicit === "gemini" && await hasKeysForProvider("gemini")) {
    return createProviderInstance(getModelById("gemini-default"));
  }

  if (explicit === "openai" && await hasKeysForProvider("openai")) {
    return createProviderInstance(getModelById("openai-default"));
  }

  // Get the default AI provider if no explicit embedder is set
  const main = await getAIProvider();

  // If the active provider cannot embed (Groq, Anthropic, OpenRouter, OpenCode text-only), fallback to real embedders
  if (main.name === "groq" || main.name === "anthropic" || main.name === "openrouter" || main.name === "opencode") {
    if (await hasKeysForProvider("gemini")) {
      return createProviderInstance(getModelById("gemini-default"));
    }
    if (await hasKeysForProvider("openai")) {
      return createProviderInstance(getModelById("openai-default"));
    }
  }

  return main;
}
