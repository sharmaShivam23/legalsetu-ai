/**
 * Cerebras Provider Adapter
 * ------------------------------------------------------------
 * Cerebras runs inference on wafer-scale hardware and is the
 * fastest option in this app's fallback chain by a wide margin
 * (gpt-oss-120b streams at roughly 2,000 tokens/sec, against
 * ~500 on Groq and far less on the hosted-API providers).
 *
 * Its API is OpenAI-compatible, so like lib/ai/groq.ts this
 * reuses the OpenAI SDK with a different baseURL rather than
 * adding another dependency.
 *
 * Free-tier notes that matter for how this is used:
 *  - 1M tokens/day, but only ~5 requests/minute, so Cerebras is
 *    placed BEHIND Groq in the fallback order: Groq's higher RPM
 *    suits interactive chat, and Cerebras is the fast, deep
 *    reserve for when Groq's daily token cap runs out.
 *  - Free-tier context is capped at 8,192 tokens. A long case-mode
 *    prompt can exceed that; the request then fails and the chain
 *    simply moves on, which is why this is a fallback and not the
 *    primary.
 *
 * Capability gaps, stated honestly (same shape as the Groq adapter):
 *  - Chat / translation: fully supported.
 *  - Embeddings, speech-to-text, OCR: not offered. Each throws a
 *    clear error, and the callers already treat that as "use
 *    another provider" rather than failing the user's request.
 */

import OpenAI from "openai";
import type {
  AIProvider,
  EmbeddingResult,
  LLMCompletionOptions,
  LLMStreamChunk,
  OCRResult,
  TranscriptionResult,
  TranslationResult,
} from "./provider";
import { languageName } from "@/lib/i18n/languages";

import { withKeyRotation } from "./key-pool";
import { getModelById } from "./models";
import { AI_SDK_CLIENT_OPTIONS } from "./errors";

const CEREBRAS_BASE_URL = "https://api.cerebras.ai/v1";

export class CerebrasProvider implements AIProvider {
  name = "cerebras";
  isDemo = false;
  private chatModel: string;

  constructor(modelId?: string) {
    const model = getModelById(modelId);
    this.chatModel =
      model.provider === "cerebras"
        ? model.getApiId()
        : (process.env.CEREBRAS_CHAT_MODEL ?? "gpt-oss-120b");
  }

  private getClient(apiKey: string) {
    return new OpenAI({ apiKey, baseURL: CEREBRAS_BASE_URL, ...AI_SDK_CLIENT_OPTIONS });
  }

  private wantsJson(messages: { content: string }[]): boolean {
    return messages.some((m) => m.content.includes("Return ONLY valid JSON"));
  }

  async complete(options: LLMCompletionOptions): Promise<string> {
    const res = await withKeyRotation(
      "CEREBRAS_API_KEY",
      (apiKey) =>
        this.getClient(apiKey).chat.completions.create({
          model: this.chatModel,
          messages: options.messages,
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxTokens ?? 1000,
          // gpt-oss thinks out of the same budget; low keeps replies fast.
          ...(this.chatModel.includes("gpt-oss") ? { reasoning_effort: "low" as const } : {}),
          ...(this.wantsJson(options.messages)
            ? { response_format: { type: "json_object" as const } }
            : {}),
        }),
      this.chatModel
    );
    return res.choices[0]?.message?.content ?? "";
  }

  async *streamComplete(
    options: LLMCompletionOptions
  ): AsyncGenerator<LLMStreamChunk> {
    const stream = await withKeyRotation(
      "CEREBRAS_API_KEY",
      (apiKey) =>
        this.getClient(apiKey).chat.completions.create({
          model: this.chatModel,
          messages: options.messages,
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxTokens ?? 1000,
          // gpt-oss thinks out of the same budget; low keeps replies fast.
          ...(this.chatModel.includes("gpt-oss") ? { reasoning_effort: "low" as const } : {}),
          stream: true,
        }),
      this.chatModel
    );

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) yield { delta, done: false };
    }
    yield { delta: "", done: true };
  }

  async embed(_text: string): Promise<EmbeddingResult> {
    throw new Error(
      "Cerebras does not provide an embeddings endpoint. Set EMBEDDING_PROVIDER=gemini or openai for RAG retrieval."
    );
  }

  async embedBatch(_texts: string[]): Promise<EmbeddingResult[]> {
    throw new Error(
      "Cerebras does not provide an embeddings endpoint. Set EMBEDDING_PROVIDER=gemini or openai for RAG retrieval."
    );
  }

  async transcribe(
    _audio: Buffer,
    _mimeType: string,
    _language?: string
  ): Promise<TranscriptionResult> {
    throw new Error(
      "Cerebras has no speech-to-text endpoint. Voice input uses Sarvam (lib/voice/sarvam.ts) or Groq Whisper."
    );
  }

  async translate(
    text: string,
    targetLanguage: string,
    sourceLanguage = "auto"
  ): Promise<TranslationResult> {
    const completion = await this.complete({
      messages: [
        {
          role: "system",
          content:
            "You are a precise translator. Translate the user's text faithfully. Do not translate proper nouns, legal section numbers, or official act names — keep them exactly as written. Return only the translated text, nothing else.",
        },
        {
          role: "user",
          content: `Translate to ${languageName(targetLanguage)}:\n\n${text}`,
        },
      ],
      temperature: 0,
    });

    return { text: completion.trim(), sourceLanguage, targetLanguage };
  }

  async ocr(_image: Buffer, _mimeType: string): Promise<OCRResult> {
    throw new Error(
      "The configured Cerebras model has no vision input. Document OCR uses Tesseract in the browser instead."
    );
  }
}
