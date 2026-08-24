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

  transcribe(
    audio: Buffer,
    mimeType: string
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

function hasGeminiApiKeys(): boolean {
  return Boolean(
    process.env.GEMINI_API_KEY_1?.trim() ||
    process.env.GEMINI_API_KEY_2?.trim() ||
    process.env.GEMINI_API_KEY_3?.trim()
  );
}

function hasGrokApiKey(): boolean {
  return Boolean(process.env.GROK_API_KEY?.trim());
}

export async function getAIProvider(): Promise<AIProvider> {
  const providerName = process.env.AI_PROVIDER ?? "mock";

  if (
    providerName === "gemini" &&
    hasGeminiApiKeys()
  ) {
    const { GeminiProvider } = await import("./gemini");
    return new GeminiProvider();
  }

  if (
    providerName === "grok" &&
    hasGrokApiKey()
  ) {
    const { GeminiProvider } = await import("./gemini");
    return new GeminiProvider();
  }

  if (
    providerName === "openai" &&
    process.env.OPENAI_API_KEY
  ) {
    const { OpenAIProvider } = await import("./openai");
    return new OpenAIProvider();
  }

  const { MockProvider } = await import("./mock");
  return new MockProvider();
}