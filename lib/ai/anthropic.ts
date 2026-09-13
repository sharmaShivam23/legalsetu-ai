import Anthropic from "@anthropic-ai/sdk";
import { withKeyRotation } from "./key-pool";
import { getModelById } from "./models";
import type {
  AIProvider,
  EmbeddingResult,
  LLMCompletionOptions,
  LLMStreamChunk,
  OCRResult,
  TranscriptionResult,
  TranslationResult,
} from "./provider";

export class AnthropicProvider implements AIProvider {
  name = "anthropic";
  isDemo = false;
  private chatModel: string;

  constructor(modelId?: string) {
    const model = getModelById(modelId);
    this.chatModel = model.provider === "anthropic" ? model.getApiId() : (process.env.ANTHROPIC_CHAT_MODEL ?? "claude-3-5-sonnet-20241022");
  }

  private getClient(apiKey: string) {
    return new Anthropic({ apiKey });
  }

  private convertMessages(messages: LLMCompletionOptions["messages"]) {
    // Separate system messages
    const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
    const formattedMessages = messages.filter(m => m.role !== "system").map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content
    }));
    return { system, formattedMessages };
  }

  async complete(options: LLMCompletionOptions): Promise<string> {
    const { system, formattedMessages } = this.convertMessages(options.messages);

    const res = await withKeyRotation("ANTHROPIC_API_KEY", (apiKey) =>
      this.getClient(apiKey).messages.create({
        model: this.chatModel,
        system: system || undefined,
        messages: formattedMessages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 1024,
      })
    );

    return res.content.map((b: any) => b.type === "text" ? b.text : "").join("");
  }

  async *streamComplete(options: LLMCompletionOptions): AsyncGenerator<LLMStreamChunk> {
    const { system, formattedMessages } = this.convertMessages(options.messages);

    const stream = await withKeyRotation("ANTHROPIC_API_KEY", (apiKey) =>
      this.getClient(apiKey).messages.create({
        model: this.chatModel,
        system: system || undefined,
        messages: formattedMessages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 1024,
        stream: true,
      })
    );

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        yield { delta: chunk.delta.text, done: false };
      }
    }
    yield { delta: "", done: true };
  }

  async embed(_text: string): Promise<EmbeddingResult> {
    throw new Error("Anthropic does not provide an embeddings endpoint. Configure Gemini or OpenAI for RAG.");
  }

  async embedBatch(_texts: string[]): Promise<EmbeddingResult[]> {
    throw new Error("Anthropic does not provide an embeddings endpoint.");
  }

  async transcribe(_audio: Buffer, _mimeType: string, _language?: string): Promise<TranscriptionResult> {
    throw new Error("Anthropic does not provide speech-to-text.");
  }

  async translate(text: string, targetLanguage: string, sourceLanguage = "auto"): Promise<TranslationResult> {
    const res = await this.complete({
      messages: [
        { role: "system", content: "You are a precise translator. Return only the translated text, nothing else." },
        { role: "user", content: `Translate to ${targetLanguage}:\n\n${text}` }
      ],
      temperature: 0
    });
    return { text: res.trim(), sourceLanguage, targetLanguage };
  }

  async ocr(_image: Buffer, _mimeType: string): Promise<OCRResult> {
    throw new Error("Anthropic OCR not currently implemented.");
  }
}
