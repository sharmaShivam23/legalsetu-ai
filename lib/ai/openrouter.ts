import { OpenAIProvider } from "./openai";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export class OpenRouterProvider extends OpenAIProvider {
  constructor(modelId?: string) {
    super(modelId, "openrouter", OPENROUTER_BASE_URL, "OPENROUTER_API_KEY");
  }
}
