import { getAIProvider } from "./provider";
import type { ChatMessage } from "./provider";

export async function generateCompletion(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  const provider = await getAIProvider();
  return provider.complete({ messages, ...opts });
}

export async function* streamCompletion(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number }
) {
  const provider = await getAIProvider();
  yield* provider.streamComplete({ messages, ...opts });
}
