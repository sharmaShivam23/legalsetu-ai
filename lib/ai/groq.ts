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
import { AI_SDK_CLIENT_OPTIONS, isQuotaError } from "./errors";

/**
 * Groq's free tier rejects any request whose prompt + max_tokens exceeds
 * the model's tokens-per-minute cap (8k for gpt-oss-120b) with "Request
 * too large" — before generating anything. Case reports asked for 5000
 * output tokens on top of a ~4k-token RAG prompt, so EVERY report failed
 * on Groq and fell through to a slower provider. Clamp to what fits.
 */
const GROQ_TPM_LIMIT = Number(process.env.GROQ_TPM_LIMIT) || 8000;

function fitMaxTokens(messages: { content: string }[], requested: number): number {
  // English runs ~4.4 chars/token on this tokenizer; Indian scripts far
  // fewer. A flat 3.5 over-counted a real 4,975-token Case prompt as
  // 6,310, throwing away ~1,300 tokens of answer — enough to cut the
  // report off before "Legal basis".
  const text = messages.map((m) => m.content).join("");
  const nonAscii = text.replace(/[\x00-\x7F]/g, "").length;
  const promptTokens = Math.ceil((text.length - nonAscii) / 4.2 + nonAscii / 2);
  const room = GROQ_TPM_LIMIT - promptTokens - 300;
  // Trim rather than refuse. Refusing big requests (so a "better" provider
  // could write the full report) left the user with an error whenever every
  // other provider was down or out of credit — on free tiers, most of the
  // time. A slightly shorter answer beats no answer.
  return Math.max(800, Math.min(requested, room));
}

/**
 * Same-provider overflow. Every Groq model has its OWN free quota (1,000
 * requests/day per key each), so once the main model is spent for the day
 * a sibling still answers, instead of the chain falling through to
 * providers with no credit. qwen3 was tested and left out: it drifted into
 * Korean partway through a Hindi reply.
 */
export const GROQ_OVERFLOW_MODELS = (process.env.GROQ_OVERFLOW_MODELS ?? "openai/gpt-oss-20b")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

/** gpt-oss models think before answering, out of the same token budget.
 *  "low" keeps answers fast and stops thinking from eating the reply. */
function reasoningOptions(model: string) {
  return model.includes("gpt-oss") ? { reasoning_effort: "low" as const } : {};
}

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
    return new OpenAI({ apiKey, baseURL: GROQ_BASE_URL, ...AI_SDK_CLIENT_OPTIONS });
  }

  /**
   * Key rotation on the main model, then on each overflow model once every
   * key has hit a quota on the one before. Rotation is scoped per model: a
   * key that has spent gpt-oss-120b's daily budget is still good for 20b.
   */
  private async withModels<T>(run: (apiKey: string, model: string) => Promise<T>): Promise<T> {
    const models = [this.chatModel, ...GROQ_OVERFLOW_MODELS.filter((m) => m !== this.chatModel)];
    let lastErr: unknown;
    for (const model of models) {
      try {
        return await withKeyRotation("GROQ_API_KEY", (apiKey) => run(apiKey, model), model);
      } catch (err) {
        lastErr = err;
        if (!isQuotaError(err)) throw err;
      }
    }
    throw lastErr;
  }

  private wantsJson(messages: { content: string }[]): boolean {
    return messages.some((m) => m.content.includes("Return ONLY valid JSON"));
  }

  async complete(options: LLMCompletionOptions): Promise<string> {
    const res = await this.withModels((apiKey, model) =>
      this.getClient(apiKey).chat.completions.create({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: fitMaxTokens(options.messages, options.maxTokens ?? 1000),
        ...reasoningOptions(model),
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
    const stream = await this.withModels((apiKey, model) =>
      this.getClient(apiKey).chat.completions.create({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: fitMaxTokens(options.messages, options.maxTokens ?? 1000),
        ...reasoningOptions(model),
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
