// lib/ai/gemini.ts

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

  return {
    systemInstruction: systemParts || undefined,
    contents,
  };
}

function getGeminiApiKeys(): string[] {
  const keys = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY,
  ].filter((key): key is string => Boolean(key?.trim()));

  return [...new Set(keys)];
}

function getGrokApiKey(): string | undefined {
  const key = process.env.GROK_API_KEY?.trim();
  return key || undefined;
}

function getGrokModel(): string {
  return process.env.GROK_MODEL ?? "grok-4.6";
}

function getGeminiChatModel(): string {
  return process.env.GEMINI_CHAT_MODEL ?? "gemini-2.5-flash";
}

function getGeminiEmbeddingModel(): string {
  return process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
}

function wantsJsonResponse(messages: ChatMessage[]): boolean {
  return messages
    .map((message) => message.content)
    .join("\n")
    .includes("Return ONLY valid JSON");
}

function toXaiMessages(messages: ChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

async function getXaiError(response: Response): Promise<string> {
  try {
    const body = await response.text();

    if (body) {
      try {
        const parsed = JSON.parse(body) as {
          error?: {
            message?: string;
          };
          message?: string;
        };

        return (
          parsed.error?.message ??
          parsed.message ??
          body
        );
      } catch {
        return body;
      }
    }
  } catch {
    return "Unable to read xAI error response.";
  }

  return `xAI request failed with status ${response.status}.`;
}

async function generateWithGrok(
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number
): Promise<string> {
  const apiKey = getGrokApiKey();

  if (!apiKey) {
    throw new Error("GROK_API_KEY is not configured.");
  }

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getGrokModel(),
      messages: toXaiMessages(messages),
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(await getXaiError(response));
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  return data.choices?.[0]?.message?.content ?? "";
}

async function* streamWithGrok(
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number
): AsyncGenerator<string> {
  const apiKey = getGrokApiKey();

  if (!apiKey) {
    throw new Error("GROK_API_KEY is not configured.");
  }

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getGrokModel(),
      messages: toXaiMessages(messages),
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(await getXaiError(response));
  }

  if (!response.body) {
    throw new Error("xAI returned an empty streaming response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const lines = event.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data:")) {
            continue;
          }

          const payload = line.slice(5).trim();

          if (!payload || payload === "[DONE]") {
            continue;
          }

          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{
                delta?: {
                  content?: string;
                };
              }>;
            };

            const delta =
              parsed.choices?.[0]?.delta?.content ?? "";

            if (delta) {
              yield delta;
            }
          } catch {
            continue;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export class GeminiProvider implements AIProvider {
  name = "gemini";
  isDemo = false;

  private clients: GoogleGenAI[];
  private chatModel: string;
  private embeddingModel: string;

  constructor() {
    const apiKeys = getGeminiApiKeys();

    if (apiKeys.length === 0) {
      throw new Error(
        "No Gemini API key configured. Set GEMINI_API_KEY_1, GEMINI_API_KEY_2, GEMINI_API_KEY_3, or GEMINI_API_KEY."
      );
    }

    this.clients = apiKeys.map(
      (apiKey) => new GoogleGenAI({ apiKey })
    );

    this.chatModel = getGeminiChatModel();
    this.embeddingModel = getGeminiEmbeddingModel();
  }

  async complete(
    options: LLMCompletionOptions
  ): Promise<string> {
    const { systemInstruction, contents } = toGeminiContents(
      options.messages
    );

    const jsonMode = wantsJsonResponse(options.messages);
    let lastError: unknown;

    for (let i = 0; i < this.clients.length; i++) {
      try {
        const response =
          await this.clients[i].models.generateContent({
            model: this.chatModel,
            contents,
            config: {
              systemInstruction,
              temperature: options.temperature ?? 0.2,
              maxOutputTokens: options.maxTokens ?? 1000,
              ...(jsonMode
                ? { responseMimeType: "application/json" }
                : {}),
            },
          });

        return response.text ?? "";
      } catch (error) {
        lastError = error;

        console.error(
          `Gemini generation failed on key ${i + 1}:`,
          error
        );
      }
    }

    if (getGrokApiKey()) {
      try {
        return await generateWithGrok(
          options.messages,
          options.temperature ?? 0.2,
          options.maxTokens ?? 1000
        );
      } catch (error) {
        lastError = error;
        console.error("Grok fallback failed:", error);
      }
    }

    throw new Error(
      "All configured AI providers are currently unavailable.",
      {
        cause: lastError,
      }
    );
  }

  async *streamComplete(
    options: LLMCompletionOptions
  ): AsyncGenerator<LLMStreamChunk> {
    const { systemInstruction, contents } = toGeminiContents(
      options.messages
    );

    const jsonMode = wantsJsonResponse(options.messages);
    let lastError: unknown;

    for (let i = 0; i < this.clients.length; i++) {
      let emitted = false;

      try {
        const stream =
          await this.clients[i].models.generateContentStream({
            model: this.chatModel,
            contents,
            config: {
              systemInstruction,
              temperature: options.temperature ?? 0.2,
              maxOutputTokens: options.maxTokens ?? 1000,
              ...(jsonMode
                ? { responseMimeType: "application/json" }
                : {}),
            },
          });

        try {
          for await (const chunk of stream) {
            const delta = chunk.text ?? "";

            if (delta) {
              emitted = true;

              yield {
                delta,
                done: false,
              };
            }
          }

          yield {
            delta: "",
            done: true,
          };

          return;
        } catch (error) {
          if (emitted) {
            throw error;
          }

          lastError = error;

          console.warn(
            `Gemini stream failed on key ${i + 1}. Trying the next key.`
          );
        }
      } catch (error) {
        if (emitted) {
          throw error;
        }

        lastError = error;

        console.warn(
          `Gemini request failed on key ${i + 1}. Trying the next key.`
        );
      }
    }

    if (getGrokApiKey()) {
      try {
        let emitted = false;

        for await (const delta of streamWithGrok(
          options.messages,
          options.temperature ?? 0.2,
          options.maxTokens ?? 1000
        )) {
          emitted = true;

          yield {
            delta,
            done: false,
          };
        }

        if (emitted) {
          yield {
            delta: "",
            done: true,
          };
        }

        return;
      } catch (error) {
        lastError = error;
        console.error("Grok streaming fallback failed.");
      }
    }

    throw new Error(
      "All configured AI providers are currently unavailable.",
      {
        cause: lastError,
      }
    );
  }

  async embed(
    text: string
  ): Promise<EmbeddingResult> {
    if (!text.trim()) {
      throw new Error(
        "Cannot generate an embedding for empty text."
      );
    }

    let lastError: unknown;

    for (let i = 0; i < this.clients.length; i++) {
      try {
        const response =
          await this.clients[i].models.embedContent({
            model: this.embeddingModel,
            contents: text,
            config: {
              outputDimensionality: 1536,
            },
          });

        const embedding =
          response.embeddings?.[0]?.values ?? [];

        if (embedding.length !== 1536) {
          throw new Error(
            `Expected 1536 dimensions but received ${embedding.length}.`
          );
        }

        return {
          embedding,
          dimensions: embedding.length,
        };
      } catch (error) {
        lastError = error;

        console.warn(
          `Gemini embedding failed on key ${i + 1}. Trying the next key.`
        );
      }
    }

    throw new Error(
      "Embedding generation failed across all configured Gemini keys.",
      {
        cause: lastError,
      }
    );
  }

  async embedBatch(
    texts: string[]
  ): Promise<EmbeddingResult[]> {
    if (texts.length === 0) {
      return [];
    }

    const results: EmbeddingResult[] = [];

    for (const text of texts) {
      results.push(await this.embed(text));
    }

    return results;
  }

  async transcribe(
    audio: Buffer,
    mimeType: string
  ): Promise<TranscriptionResult> {
    let lastError: unknown;

    for (let i = 0; i < this.clients.length; i++) {
      try {
        const response =
          await this.clients[i].models.generateContent({
            model: this.chatModel,
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: "Transcribe this audio exactly as spoken. Return only the transcription text.",
                  },
                  {
                    inlineData: {
                      data: audio.toString("base64"),
                      mimeType,
                    },
                  },
                ],
              },
            ],
          });

        return {
          text: response.text ?? "",
        };
      } catch (error) {
        lastError = error;

        console.warn(
          `Gemini transcription failed on key ${i + 1}. Trying the next key.`
        );
      }
    }

    throw new Error(
      "Transcription failed across all configured Gemini keys.",
      {
        cause: lastError,
      }
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
          content: `Translate to ${targetLanguage}:\n\n${text}`,
        },
      ],
      temperature: 0,
    });

    return {
      text: completion.trim(),
      sourceLanguage,
      targetLanguage,
    };
  }

  async ocr(
    image: Buffer,
    mimeType: string
  ): Promise<OCRResult> {
    let lastError: unknown;

    for (let i = 0; i < this.clients.length; i++) {
      try {
        const response =
          await this.clients[i].models.generateContent({
            model: this.chatModel,
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: "Extract all text from this document image exactly as written. Return only the extracted text.",
                  },
                  {
                    inlineData: {
                      data: image.toString("base64"),
                      mimeType,
                    },
                  },
                ],
              },
            ],
          });

        return {
          text: response.text ?? "",
        };
      } catch (error) {
        lastError = error;

        console.warn(
          `Gemini OCR failed on key ${i + 1}. Trying the next key.`
        );
      }
    }

    throw new Error(
      "OCR failed across all configured Gemini keys.",
      {
        cause: lastError,
      }
    );
  }
}