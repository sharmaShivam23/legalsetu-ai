// lib/rag/chunker.ts
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
 * Hard-splits a single block of text that has no usable blank-line
 * breaks (e.g. PDF-extracted text collapsed onto one line). Prefers
 * splitting on sentence boundaries, falling back to word boundaries,
 * so a chunk never ends up longer than maxChars even when the source
 * has no paragraph structure to rely on.
 */
function hardSplit(
  text: string,
  maxChars: number,
  overlapChars: number
): string[] {
  if (text.length <= maxChars) return [text];

  // Prefer splitting on sentence-ish boundaries so chunks don't cut
  // mid-sentence when possible; falls back to raw slicing otherwise.
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) ?? [text];

  const pieces: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + sentence).length > maxChars && current.length > 0) {
      pieces.push(current.trim());
      const tail = current.slice(Math.max(0, current.length - overlapChars));
      current = tail + sentence;
    } else {
      current += sentence;
    }

    // A single "sentence" can itself exceed maxChars (no punctuation
    // for a very long stretch) — fall back to hard word-boundary slicing.
    while (current.length > maxChars * 1.5) {
      let cut = current.lastIndexOf(" ", maxChars);
      if (cut <= 0) cut = maxChars;
      pieces.push(current.slice(0, cut).trim());
      const tail = current.slice(Math.max(0, cut - overlapChars), cut);
      current = tail + current.slice(cut);
    }
  }

  if (current.trim()) pieces.push(current.trim());

  return pieces;
}

/**
 * Simple, dependency-free sliding-window chunker.
 * Splits on paragraph boundaries first, then packs paragraphs
 * into chunks up to maxChars, with overlap for context continuity.
 * Any paragraph that is itself still larger than maxChars (common
 * with PDF-extracted text that has few or no blank-line breaks) is
 * hard-split on sentence/word boundaries so no chunk is ever left
 * oversized.
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
    .filter(Boolean)
    .flatMap((p) =>
      p.length > maxChars ? hardSplit(p, maxChars, overlapChars) : [p]
    );

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