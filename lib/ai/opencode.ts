import { OpenAIProvider } from "./openai";

// OpenCode Zen's OpenAI-compatible endpoint. The previous guess,
// api.opencode.ai/v1, answers every path with a plain-text "Not Found"
// and a 200 status, so the SDK saw a successful, empty stream.
// Note: OpenCode's *free* models are restricted to its own app and CLI —
// calls from here need a paid Zen balance.
const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL || "https://opencode.ai/zen/v1";

export class OpenCodeProvider extends OpenAIProvider {
  constructor(modelId?: string) {
    super(modelId, "opencode", OPENCODE_BASE_URL, "OPENCODE_API_KEY");
  }
}
