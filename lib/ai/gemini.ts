/**
 * Google Gemini Provider Adapter
 * ------------------------------------------------------------
 * Real integration used when AI_PROVIDER=gemini and
 * GEMINI_API_KEY is set. Implements the same AIProvider
 * interface as the mock/OpenAI providers so the rest of the
 * app is completely agnostic to which one is active.
 *
 * Uses @google/genai (the current, actively-maintained Google Gen AI
 * SDK). The older @google/generative-ai package is deprecated by
 * Google in favor of this one — see
 * https://github.com/google-gemini/deprecated-generative-ai-js
 *
 * NOTE: Gemini does not currently expose a dedicated
 * speech-to-text endpoint the way Whisper does, so transcribe()
 * uses Gemini's multimodal audio-understanding capability.
 * OCR similarly uses Gemini's vision/multimodal input.
 */

import { GoogleGenAI } from "@google/genai";
import { languageName } from "@/lib/i18n/languages";
import { withKeyRotation } from "./key-pool";
import { isQuotaError } from "./errors";
import { getModelById, AIModel } from "./models";
import type {
  AIProvider,
  ChatMessage,
  EmbeddingResult,
  LLMCompletionOptions,
  LLMStreamChunk,
  OCRResult,
  TranscriptionResult,
  TranslationResult,
} from "./provider";

function toGeminiContents(messages: ChatMessage[]) {
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  return { systemInstruction: systemParts || undefined, contents };
}

function wantsJsonResponse(messages: ChatMessage[]): boolean {
  const combined = messages.map((m) => m.content).join("\n");
  return combined.includes("Return ONLY valid JSON");
}

export class GeminiProvider implements AIProvider {
  name = "gemini";
  isDemo = false;
  private chatModel: string;
  private embeddingModel: string;

  constructor(modelId?: string) {
    const model = getModelById(modelId);
    this.chatModel = model.getApiId();
    this.embeddingModel = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
  }

  /**
   * Runs a chat-model call with key rotation, then — if every key has used
   * up the chosen model's daily quota — once more on a lighter Gemini
   * model. Free-tier quotas are per model, so Flash-Lite usually still has
   * room when Flash is spent, and staying on Gemini is faster than walking
   * the cross-provider fallback chain.
   */
  private async withChatModels<T>(run: (apiKey: string, model: string) => Promise<T>): Promise<T> {
    try {
      return await withKeyRotation("GEMINI_API_KEY", (apiKey) => run(apiKey, this.chatModel), this.chatModel);
    } catch (err) {
      const lighter = process.env.GEMINI_OVERFLOW_MODEL?.trim() || "gemini-flash-lite-latest";
      if (!isQuotaError(err) || lighter === this.chatModel) throw err;
      return withKeyRotation("GEMINI_API_KEY", (apiKey) => run(apiKey, lighter), lighter);
    }
  }

  async complete(options: LLMCompletionOptions): Promise<string> {
    const { systemInstruction, contents } = toGeminiContents(options.messages);
    const jsonMode = wantsJsonResponse(options.messages);

    const response = await this.withChatModels((apiKey, model) =>
      new GoogleGenAI({ apiKey }).models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          temperature: options.temperature ?? 0.2,
          maxOutputTokens: options.maxTokens ?? 1000,
          ...(jsonMode ? { responseMimeType: "application/json" } : {}),
        },
      })
    );

    return response.text ?? "";
  }

  async *streamComplete(
    options: LLMCompletionOptions
  ): AsyncGenerator<LLMStreamChunk> {
    const { systemInstruction, contents } = toGeminiContents(options.messages);
    const jsonMode = wantsJsonResponse(options.messages);

    // Rotation happens at stream-OPEN time. A quota rejection arrives
    // when the stream is requested, before any token exists, so an
    // exhausted key falls through to the next one with nothing shown
    // to the user yet. Once the stream is open and producing tokens we
    // deliberately stop rotating: switching keys mid-answer would
    // restart generation and splice two different replies together.
    const stream = await this.withChatModels((apiKey, model) =>
      new GoogleGenAI({ apiKey }).models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction,
          temperature: options.temperature ?? 0.2,
          maxOutputTokens: options.maxTokens ?? 1000,
          ...(jsonMode ? { responseMimeType: "application/json" } : {}),
        },
      })
    );

    for await (const chunk of stream) {
      const delta = chunk.text ?? "";
      if (delta) yield { delta, done: false };
    }
    yield { delta: "", done: true };
  }

  async embed(text: string): Promise<EmbeddingResult> {
    // Match the fixed pgvector(1536) column defined in prisma/schema.prisma.
    // gemini-embedding-001 defaults to 3072 dims, so we must explicitly
    // truncate the output to 1536 or every insert/query will fail with a
    // dimension mismatch against the database column.
    // Embeddings are the highest-volume call and the first to hit a
    // daily quota, so this is the call that most needs key rotation.
    const response = await withKeyRotation(
      "GEMINI_API_KEY",
      (apiKey) =>
        new GoogleGenAI({ apiKey }).models.embedContent({
          model: this.embeddingModel,
          contents: text,
          config: { outputDimensionality: 1536 },
        }),
      this.embeddingModel
    );
    const embedding = response.embeddings?.[0]?.values ?? [];
    return { embedding, dimensions: embedding.length };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    // Gemini's SDK embeds one document at a time; run in parallel.
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  async transcribe(
    audio: Buffer,
    mimeType: string,
    language?: string
  ): Promise<TranscriptionResult> {
    // Naming the expected language markedly improves accuracy for
    // Indian languages, and stops the model translating to English.
    const languageHint = language
      ? ` The speaker is talking in ${languageName(language)}. Transcribe in ${languageName(language)} using its native script, and do NOT translate.`
      : "";

    const response = await this.withChatModels((apiKey, model) =>
      new GoogleGenAI({ apiKey }).models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { text: `Transcribe this audio exactly as spoken. Return only the transcription text.${languageHint}` },
              { inlineData: { data: audio.toString("base64"), mimeType } },
            ],
          },
        ],
      })
    );
    return { text: response.text ?? "", language };
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
          content: `Translate to ${targetLanguage}:\n\n${text}`,
        },
      ],
      temperature: 0,
    });
    return { text: completion.trim(), sourceLanguage, targetLanguage };
  }

  async ocr(image: Buffer, mimeType: string): Promise<OCRResult> {
    const response = await this.withChatModels((apiKey, model) =>
      new GoogleGenAI({ apiKey }).models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { text: "Extract all text from this document image exactly as written. Return only the extracted text." },
              { inlineData: { data: image.toString("base64"), mimeType } },
            ],
          },
        ],
      })
    );
    return { text: response.text ?? "" };
  }
}