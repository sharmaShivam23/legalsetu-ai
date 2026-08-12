/**
 * OpenAI Provider Adapter
 * ------------------------------------------------------------
 * Real integration used when AI_PROVIDER=openai and
 * OPENAI_API_KEY is set. Implements the same AIProvider
 * interface as the mock provider so the rest of the app is
 * completely agnostic to which one is active.
 *
 * NOTE: Speech-to-text, translation and OCR here use OpenAI's
 * relevant endpoints where available; for languages/services
 * OpenAI doesn't directly cover (e.g. some Indic ASR), swap in
 * a dedicated provider file (e.g. lib/ai/bhashini.ts) following
 * the same AIProvider contract.
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

export class OpenAIProvider implements AIProvider {
  name = "openai";
  isDemo = false;
  private client: OpenAI;
  private chatModel: string;
  private embeddingModel: string;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.chatModel = process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
    this.embeddingModel =
      process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  }

  async complete(options: LLMCompletionOptions): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: this.chatModel,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 1000,
    });
    return res.choices[0]?.message?.content ?? "";
  }

  async *streamComplete(
    options: LLMCompletionOptions
  ): AsyncGenerator<LLMStreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: this.chatModel,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 1000,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) yield { delta, done: false };
    }
    yield { delta: "", done: true };
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const res = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: text,
    });
    const embedding = res.data[0].embedding;
    return { embedding, dimensions: embedding.length };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const res = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: texts,
    });
    return res.data.map((d) => ({ embedding: d.embedding, dimensions: d.embedding.length }));
  }

  async transcribe(
    audio: Buffer,
    mimeType: string
  ): Promise<TranscriptionResult> {
    const file = new File([audio], "audio.webm", { type: mimeType });
    const res = await this.client.audio.transcriptions.create({
      file,
      model: "whisper-1",
    });
    return { text: res.text };
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
    const base64 = image.toString("base64");
    const res = await this.client.chat.completions.create({
      model: this.chatModel,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all text from this document image exactly as written. Return only the extracted text.",
            },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
    });
    return { text: res.choices[0]?.message?.content ?? "" };
  }
}
