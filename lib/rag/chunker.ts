/**
 * Document chunking utilities used by both:
 *  - the legal-source ingestion pipeline (scripts/ingest-documents.ts)
 *  - user-uploaded document analysis (lib/documents pipeline)
 */

export interface ChunkOptions {
  maxChars?: number;
  overlapChars?: number;
}

export interface TextChunk {
  text: string;
  index: number;
}

/**
 * Simple, dependency-free sliding-window chunker.
 * Splits on paragraph boundaries first, then packs paragraphs
 * into chunks up to maxChars, with overlap for context continuity.
 */
export function chunkText(
  text: string,
  options: ChunkOptions = {}
): TextChunk[] {
  const maxChars = options.maxChars ?? 1200;
  const overlapChars = options.overlapChars ?? 150;

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: TextChunk[] = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > maxChars && current.length > 0) {
      chunks.push({ text: current.trim(), index: chunks.length });
      // carry the tail of the previous chunk forward for overlap
      const tail = current.slice(Math.max(0, current.length - overlapChars));
      current = tail + "\n\n" + para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }

  if (current.trim()) {
    chunks.push({ text: current.trim(), index: chunks.length });
  }

  return chunks;
}
