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
  // Gemini has no "system" role in contents; system messages are merged
  // into a single systemInstruction, and the remaining user/assistant
  // turns are mapped to Gemini's user/model roles.
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

// Detects analysis-style prompts that explicitly ask for strict JSON output
// (see app/api/documents/[id]/analyze/route.ts's SYSTEM_PROMPT/buildUserPrompt).
// When true, we ask Gemini for a native JSON response instead of relying on
// the model to follow "return only JSON" as a plain-text instruction, which
// is a much more reliable way to get parseable output.
function wantsJsonResponse(messages: ChatMessage[]): boolean {
  const combined = messages.map((m) => m.content).join("\n");
  return combined.includes("Return ONLY valid JSON");
}

export class GeminiProvider implements AIProvider {
  name = "gemini";
  isDemo = false;
  private client: GoogleGenAI;
  private chatModel: string;
  private embeddingModel: string;

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    // gemini-2.5-flash is the current stable fast model as of this writing.
    // Override via GEMINI_CHAT_MODEL if you want a different one (e.g. a
    // newer preview model), without touching this file.
    this.chatModel = process.env.GEMINI_CHAT_MODEL ?? "gemini-2.5-flash";
    this.embeddingModel = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
  }

  async complete(options: LLMCompletionOptions): Promise<string> {
    const { systemInstruction, contents } = toGeminiContents(options.messages);
    const jsonMode = wantsJsonResponse(options.messages);

    const response = await this.client.models.generateContent({
      model: this.chatModel,
      contents,
      config: {
        systemInstruction,
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens ?? 1000,
        ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    });

    return response.text ?? "";
  }

  async *streamComplete(
    options: LLMCompletionOptions
  ): AsyncGenerator<LLMStreamChunk> {
    const { systemInstruction, contents } = toGeminiContents(options.messages);
    const jsonMode = wantsJsonResponse(options.messages);

    const stream = await this.client.models.generateContentStream({
      model: this.chatModel,
      contents,
      config: {
        systemInstruction,
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens ?? 1000,
        ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    });

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
    const response = await this.client.models.embedContent({
      model: this.embeddingModel,
      contents: text,
      config: { outputDimensionality: 1536 },
    });
    const embedding = response.embeddings?.[0]?.values ?? [];
    return { embedding, dimensions: embedding.length };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    // Gemini's SDK embeds one document at a time; run in parallel.
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  async transcribe(
    audio: Buffer,
    mimeType: string
  ): Promise<TranscriptionResult> {
    const response = await this.client.models.generateContent({
      model: this.chatModel,
      contents: [
        {
          role: "user",
          parts: [
            { text: "Transcribe this audio exactly as spoken. Return only the transcription text." },
            { inlineData: { data: audio.toString("base64"), mimeType } },
          ],
        },
      ],
    });
    return { text: response.text ?? "" };
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
    const response = await this.client.models.generateContent({
      model: this.chatModel,
      contents: [
        {
          role: "user",
          parts: [
            { text: "Extract all text from this document image exactly as written. Return only the extracted text." },
            { inlineData: { data: image.toString("base64"), mimeType } },
          ],
        },
      ],
    });
    return { text: response.text ?? "" };
  }
}