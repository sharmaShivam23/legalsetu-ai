/**
 * Google Gemini Provider Adapter
 * ------------------------------------------------------------
 * Real integration used when AI_PROVIDER=gemini and
 * GEMINI_API_KEY is set. Implements the same AIProvider
 * interface as the mock/OpenAI providers so the rest of the
 * app is completely agnostic to which one is active.
 *
 * NOTE: Gemini does not currently expose a dedicated
 * speech-to-text endpoint the way Whisper does, so transcribe()
 * uses Gemini's multimodal audio-understanding capability
 * (gemini-1.5-flash / gemini-1.5-pro accept inline audio).
 * OCR similarly uses Gemini's vision/multimodal input.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
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

function toGeminiHistory(messages: ChatMessage[]) {
  // Gemini has no "system" role in chat history; system messages are
  // merged into a single systemInstruction, and the remaining
  // user/assistant turns are mapped to Gemini's user/model roles.
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const turns = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  return { systemInstruction: systemParts || undefined, turns };
}

export class GeminiProvider implements AIProvider {
  name = "gemini";
  isDemo = false;
  private client: GoogleGenerativeAI;
  private chatModel: string;
  private embeddingModel: string;

  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set");
    }
    this.client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.chatModel = process.env.GEMINI_CHAT_MODEL ?? "gemini-1.5-flash";
    this.embeddingModel = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
  }

  async complete(options: LLMCompletionOptions): Promise<string> {
    const { systemInstruction, turns } = toGeminiHistory(options.messages);
    const model = this.client.getGenerativeModel({
      model: this.chatModel,
      systemInstruction,
    });

    const lastTurn = turns[turns.length - 1];
    const history = turns.slice(0, -1);

    const chat = model.startChat({
      history,
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens ?? 1000,
      },
    });

    const result = await chat.sendMessage(lastTurn?.parts[0]?.text ?? "");
    return result.response.text();
  }

  async *streamComplete(
    options: LLMCompletionOptions
  ): AsyncGenerator<LLMStreamChunk> {
    const { systemInstruction, turns } = toGeminiHistory(options.messages);
    const model = this.client.getGenerativeModel({
      model: this.chatModel,
      systemInstruction,
    });

    const lastTurn = turns[turns.length - 1];
    const history = turns.slice(0, -1);

    const chat = model.startChat({
      history,
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens ?? 1000,
      },
    });

    const result = await chat.sendMessageStream(lastTurn?.parts[0]?.text ?? "");

    for await (const chunk of result.stream) {
      const delta = chunk.text();
      if (delta) yield { delta, done: false };
    }
    yield { delta: "", done: true };
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const model = this.client.getGenerativeModel({ model: this.embeddingModel });
    // Match the fixed pgvector(1536) column defined in prisma/schema.prisma.
    // gemini-embedding-001 defaults to 3072 dims, so we must explicitly
    // truncate the output to 1536 or every insert/query will fail with a
    // dimension mismatch against the database column.
    const result = await model.embedContent({
      content: { role: "user", parts: [{ text }] },
      outputDimensionality: 1536,
    } as Parameters<typeof model.embedContent>[0]);
    const embedding = result.embedding.values;
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
    const model = this.client.getGenerativeModel({ model: this.chatModel });
    const result = await model.generateContent([
      { text: "Transcribe this audio exactly as spoken. Return only the transcription text." },
      { inlineData: { data: audio.toString("base64"), mimeType } },
    ]);
    return { text: result.response.text() };
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
    const model = this.client.getGenerativeModel({ model: this.chatModel });
    const result = await model.generateContent([
      { text: "Extract all text from this document image exactly as written. Return only the extracted text." },
      { inlineData: { data: image.toString("base64"), mimeType } },
    ]);
    return { text: result.response.text() };
  }
}