import { OpenAIProvider } from "./openai";
import type { LLMCompletionOptions, LLMStreamChunk } from "./provider";

// Mistral La Plateforme's OpenAI-compatible endpoint. The free
// "Experiment" plan needs no payment card — only a one-time phone
// verification — which is why it is the backup provider behind Groq.
// Note: on that plan, requests may be used to train Mistral's models.
const MISTRAL_BASE_URL = "https://api.mistral.ai/v1";

/**
 * Mistral is stricter than OpenAI about message order: instructions must
 * be ONE system message at the start. The RAG prompt sends two (rules,
 * then retrieved sources), so they are merged before every request.
 */
function mergeSystemMessages(options: LLMCompletionOptions): LLMCompletionOptions {
  const system = options.messages.filter((m) => m.role === "system").map((m) => m.content);
  const rest = options.messages.filter((m) => m.role !== "system");
  return {
    ...options,
    messages: system.length ? [{ role: "system", content: system.join("\n\n") }, ...rest] : rest,
  };
}

export class MistralProvider extends OpenAIProvider {
  constructor(modelId?: string) {
    super(modelId, "mistral", MISTRAL_BASE_URL, "MISTRAL_API_KEY");
  }

  complete(options: LLMCompletionOptions): Promise<string> {
    return super.complete(mergeSystemMessages(options));
  }

  streamComplete(options: LLMCompletionOptions): AsyncGenerator<LLMStreamChunk> {
    return super.streamComplete(mergeSystemMessages(options));
  }
}
