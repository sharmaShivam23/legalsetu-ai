import { getAIProvider } from "@/lib/ai/provider";

/**
 * Server-side transcription. `language` is the user's chosen
 * language so the model transcribes in that language's own
 * script rather than guessing or translating to English.
 */
export async function transcribeAudio(
  audio: Buffer,
  mimeType: string,
  language?: string
): Promise<{ text: string; language?: string }> {
  const provider = await getAIProvider();
  const result = await provider.transcribe(audio, mimeType, language);
  return { text: result.text, language: result.language ?? language };
}
