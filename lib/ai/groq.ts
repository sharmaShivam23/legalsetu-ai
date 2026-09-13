/**
 * Groq Provider Adapter
 * ------------------------------------------------------------
 * Used when AI_PROVIDER=groq and GROQ_API_KEY is set.
 *
 * Groq exposes an OpenAI-compatible API, so this reuses the
 * OpenAI SDK with a different baseURL rather than pulling in
 * another dependency. It is very fast, which matters here
 * because translating a whole page is one large batch call.
 *
 * Capability notes (honest about the gaps):
 *  - Chat / translation: fully supported.
 *  - Speech-to-text: supported via Whisper, and Whisper handles
 *    Indian languages well.
 *  - Embeddings: NOT offered by Groq. embed() throws a clear
 *    error, and lib/rag/retriever.ts treats that as "no sources
 *    retrieved" rather than failing the request — so answers
 *    stay honest about having no grounding instead of inventing
 *    citations.
 *  - OCR: the text models here have no vision input, so OCR
 *    falls back to Tesseract in the browser (lib/ocr/ocr.ts).
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

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export class GroqProvider implements AIProvider {
  name = "groq";
  isDemo = false;
  private chatModel: string;
  private sttModel: string;

  constructor(modelId?: string) {
    const model = getModelById(modelId);
    this.chatModel = model.provider === "groq" ? model.getApiId() : (process.env.GROQ_CHAT_MODEL ?? "llama3-70b-8192");
    this.sttModel = process.env.GROQ_STT_MODEL ?? "whisper-large-v3";
  }

  private getClient(apiKey: string) {
    return new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  }

  private wantsJson(messages: { content: string }[]): boolean {
    return messages.some((m) => m.content.includes("Return ONLY valid JSON"));
  }

  async complete(options: LLMCompletionOptions): Promise<string> {
    const res = await withKeyRotation("GROQ_API_KEY", (apiKey) => 
      this.getClient(apiKey).chat.completions.create({
        model: this.chatModel,
        messages: options.messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 1000,
        ...(this.wantsJson(options.messages)
          ? { response_format: { type: "json_object" as const } }
          : {}),
      })
    );
    return res.choices[0]?.message?.content ?? "";
  }

  async *streamComplete(
    options: LLMCompletionOptions
  ): AsyncGenerator<LLMStreamChunk> {
    const stream = await withKeyRotation("GROQ_API_KEY", (apiKey) => 
      this.getClient(apiKey).chat.completions.create({
        model: this.chatModel,
        messages: options.messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 1000,
        stream: true,
      })
    );

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) yield { delta, done: false };
    }
    yield { delta: "", done: true };
  }

  async embed(_text: string): Promise<EmbeddingResult> {
    throw new Error(
      "Groq does not provide an embeddings endpoint. Set AI_PROVIDER=gemini or openai for RAG retrieval, or ingest sources with a provider that supports embeddings."
    );
  }

  async embedBatch(_texts: string[]): Promise<EmbeddingResult[]> {
    throw new Error(
      "Groq does not provide an embeddings endpoint. Set AI_PROVIDER=gemini or openai for RAG retrieval."
    );
  }

  async transcribe(
    audio: Buffer,
    mimeType: string,
    language?: string
  ): Promise<TranscriptionResult> {
    // The SDK wants a File-like object; Node 20+ has File built in.
    const extension = mimeType.includes("webm")
      ? "webm"
      : mimeType.includes("mp4") || mimeType.includes("m4a")
        ? "m4a"
        : mimeType.includes("wav")
          ? "wav"
          : "ogg";

    const file = new File([new Uint8Array(audio)], `audio.${extension}`, {
      type: mimeType || "audio/webm",
    });

    const res = await withKeyRotation("GROQ_API_KEY", (apiKey) => 
      this.getClient(apiKey).audio.transcriptions.create({
        file,
        model: this.sttModel,
        ...(language && /^(en|hi|bn|mr|te|ta|gu|ur|kn|ml|pa|as|or)$/.test(language)
          ? { language }
          : {}),
      })
    );

    return { text: res.text ?? "", language };
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
      "The configured Groq model has no vision input. Document OCR uses Tesseract in the browser instead."
    );
  }
}
