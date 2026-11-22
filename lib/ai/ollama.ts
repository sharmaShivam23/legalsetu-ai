// ==========================================================
// LegalSetu — local model via Ollama (opt-in, manual only)
// ----------------------------------------------------------
// Runs a model on THIS computer: free and unlimited, but only as fast
// as the machine. On a laptop CPU it is minutes per long answer, so it
// is never part of "Auto" or the fallback chain — a silent switch to it
// would freeze the laptop mid-demo. Pick "Local (Ollama)" to use it.
//
// It also cannot work on Vercel: Vercel's servers cannot run Ollama and
// cannot reach a model running on your own laptop.
//
// Uses Ollama's native /api/chat rather than its OpenAI-compatible
// endpoint, because only the native API accepts `num_ctx`. Ollama's
// default context window is far smaller than LegalSetu's RAG prompt,
// and it truncates silently instead of erroring.
//
// .env:
//   OLLAMA_BASE_URL=http://localhost:11434   (enables it)
//   OLLAMA_CHAT_MODEL=gemma3:1b              (any model you have pulled)
// ==========================================================

import { getSelectedOllamaModel } from "./mode";
import type {
  AIProvider,
  EmbeddingResult,
  LLMCompletionOptions,
  LLMStreamChunk,
  OCRResult,
  TranscriptionResult,
  TranslationResult,
} from "./provider";

const NUM_CTX = Number(process.env.OLLAMA_NUM_CTX) || 8192;
/** A CPU can take minutes on a long answer; give it room, but not forever. */
const REQUEST_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 5 * 60 * 1000;

export function ollamaBaseUrl(): string | null {
  const url = process.env.OLLAMA_BASE_URL?.trim();
  return url ? url.replace(/\/$/, "") : null;
}

/** Keep the model in memory between requests so a demo never pays a cold start. */
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE?.trim() || "30m";

export function ollamaModel(): string {
  // The model picked in the Ollama-mode toggle wins over the .env default.
  return getSelectedOllamaModel() || process.env.OLLAMA_CHAT_MODEL?.trim() || "gemma3:1b";
}

/** Models pulled on this machine, or null when the server is unreachable. */
export async function listOllamaModels(): Promise<string[] | null> {
  const base = ollamaBaseUrl();
  if (!base) return null;
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const json = (await res.json()) as { models?: { name: string }[] };
    return (json.models ?? []).map((m) => m.name);
  } catch {
    return null;
  }
}

/** Loads the model into memory (empty prompt) so the first answer is fast. */
export async function warmUpOllama(model: string = ollamaModel()): Promise<void> {
  const base = ollamaBaseUrl();
  if (!base) return;
  try {
    await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: "", keep_alive: KEEP_ALIVE, stream: false }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Best effort — the first real request will load it instead.
  }
}

export class OllamaProvider implements AIProvider {
  name = "ollama";
  isDemo = false;

  private body(options: LLMCompletionOptions, stream: boolean) {
    return JSON.stringify({
      model: ollamaModel(),
      messages: options.messages,
      stream,
      keep_alive: KEEP_ALIVE,
      options: {
        num_ctx: NUM_CTX,
        num_predict: options.maxTokens ?? 1000,
        temperature: options.temperature ?? 0.2,
      },
    });
  }

  private async post(options: LLMCompletionOptions, stream: boolean): Promise<Response> {
    const base = ollamaBaseUrl();
    if (!base) throw new Error("Ollama is not enabled: set OLLAMA_BASE_URL in .env");
    let res: Response;
    try {
      res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: this.body(options, stream),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new Error(`Ollama is not running at ${base} (start the Ollama app): ${String(err).slice(0, 80)}`);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        res.status === 404
          ? `Ollama model "${ollamaModel()}" is not downloaded — run: ollama pull ${ollamaModel()}`
          : `Ollama error ${res.status}: ${detail.slice(0, 160)}`
      );
    }
    return res;
  }

  async complete(options: LLMCompletionOptions): Promise<string> {
    const res = await this.post(options, false);
    const json = (await res.json()) as { message?: { content?: string } };
    return json.message?.content ?? "";
  }

  async *streamComplete(options: LLMCompletionOptions): AsyncGenerator<LLMStreamChunk> {
    const res = await this.post(options, true);
    if (!res.body) throw new Error("Ollama returned no stream");

    // Newline-delimited JSON: one object per token batch.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const chunk = JSON.parse(line) as { message?: { content?: string }; done?: boolean; error?: string };
        if (chunk.error) throw new Error(`Ollama: ${chunk.error}`);
        const delta = chunk.message?.content ?? "";
        if (delta) yield { delta, done: false };
      }
    }
    yield { delta: "", done: true };
  }

  async embed(_text: string): Promise<EmbeddingResult> {
    throw new Error("Embeddings come from Gemini; the local model is used for chat only.");
  }

  async embedBatch(_texts: string[]): Promise<EmbeddingResult[]> {
    throw new Error("Embeddings come from Gemini; the local model is used for chat only.");
  }

  async transcribe(_audio: Buffer, _mimeType: string, _language?: string): Promise<TranscriptionResult> {
    throw new Error("Speech-to-text uses Sarvam; the local model is chat only.");
  }

  async translate(text: string, targetLanguage: string, sourceLanguage = "auto"): Promise<TranslationResult> {
    const out = await this.complete({
      messages: [
        { role: "system", content: "You are a precise translator. Return only the translated text." },
        { role: "user", content: `Translate to ${targetLanguage}:\n\n${text}` },
      ],
      temperature: 0,
    });
    return { text: out.trim(), sourceLanguage, targetLanguage };
  }

  async ocr(_image: Buffer, _mimeType: string): Promise<OCRResult> {
    throw new Error("OCR is not available on the local model.");
  }
}
