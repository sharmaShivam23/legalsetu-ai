import { getAIProvider } from "@/lib/ai/provider";

export async function extractTextFromImage(
  image: Buffer,
  mimeType: string
): Promise<string> {
  const provider = await getAIProvider();
  const result = await provider.ocr(image, mimeType);
  return result.text;
}
