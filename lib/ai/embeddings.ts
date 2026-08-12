import { getAIProvider } from "./provider";

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function embedText(text: string): Promise<number[]> {
  const provider = await getAIProvider();
  const result = await provider.embed(text);
  return result.embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const provider = await getAIProvider();
  const results = await provider.embedBatch(texts);
  return results.map((r) => r.embedding);
}
