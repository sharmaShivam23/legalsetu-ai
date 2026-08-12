import { getAIProvider } from "@/lib/ai/provider";

/**
 * UI-string translation vs legal-answer translation are handled
 * separately by design (see project spec): UI copy can be
 * translated once and cached; legal answers must be translated
 * dynamically per-response since content is generated live.
 *
 * IMPORTANT: legal source names, section numbers, and official
 * act titles are protected from translation inside the AI prompt
 * (see lib/ai/openai.ts translate()) to avoid corrupting citations.
 */
export async function translateText(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string
): Promise<string> {
  if (targetLanguage === sourceLanguage) return text;
  const provider = await getAIProvider();
  const result = await provider.translate(text, targetLanguage, sourceLanguage);
  return result.text;
}
