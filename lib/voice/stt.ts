import { getAIProvider } from "@/lib/ai/provider";

export async function transcribeAudio(
  audio: Buffer,
  mimeType: string
): Promise<{ text: string; language?: string }> {
  const provider = await getAIProvider();
  const result = await provider.transcribe(audio, mimeType);
  return { text: result.text, language: result.language };
}
