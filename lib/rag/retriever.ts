import { prisma } from "@/lib/db/prisma";
import { embedText, cosineSimilarity } from "@/lib/ai/embeddings";
import type { RAGSearchFilters, RAGSearchResult, RetrievedChunk, EvidenceLevel } from "./types";

const TOP_K = 6;
const MIN_SIMILARITY = 0.15;

/**
 * Vector similarity search over verified LegalSourceChunk rows.
 *
 * In production with pgvector, this should use a native SQL query
 * with the `<=>` cosine-distance operator for performance:
 *
 *   SELECT id, 1 - (embedding <=> $1::vector) AS similarity
 *   FROM "LegalSourceChunk"
 *   ORDER BY embedding <=> $1::vector
 *   LIMIT $2;
 *
 * That raw-SQL version is provided in `vectorSearchSQL()` below.
 * The JS fallback (`vectorSearchInMemory`) is used automatically
 * when running in demo mode / without a live pgvector database,
 * so local development never breaks.
 */
export async function retrieveRelevantChunks(
  query: string,
  filters: RAGSearchFilters = {}
): Promise<RAGSearchResult> {
  const queryEmbedding = await embedText(query);

  let chunks: RetrievedChunk[] = [];

  try {
    chunks = await vectorSearchSQL(queryEmbedding, filters);
  } catch (err) {
    // Falls back gracefully (e.g. no DB configured yet in demo mode)
    chunks = await vectorSearchInMemory(queryEmbedding, filters);
  }

  const evidenceLevel = computeEvidenceLevel(chunks);
  return { chunks, evidenceLevel };
}

async function vectorSearchSQL(
  queryEmbedding: number[],
  filters: RAGSearchFilters
): Promise<RetrievedChunk[]> {
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  const rows = await (prisma.$queryRawUnsafe as (query: string, ...values: unknown[]) => Promise<any[]>)(
    `
    SELECT
      c.id as "chunkId",
      c."sourceId" as "sourceId",
      s.title as "sourceTitle",
      s."actName" as "actName",
      c.section as "section",
      s.jurisdiction as "jurisdiction",
      s."officialUrl" as "officialUrl",
      s."verificationStatus" as "verificationStatus",
      c.text as "text",
      1 - (c.embedding <=> $1::vector) as "similarity"
    FROM "LegalSourceChunk" c
    JOIN "LegalSource" s ON s.id = c."sourceId"
    WHERE s."verificationStatus" = 'VERIFIED'
      ${filters.jurisdiction ? `AND s.jurisdiction = '${filters.jurisdiction}'` : ""}
      ${filters.language ? `AND s.language = '${filters.language}'` : ""}
    ORDER BY c.embedding <=> $1::vector
    LIMIT $2
    `,
    vectorLiteral,
    TOP_K
  );

  return rows
    .filter((r: any) => r.similarity >= MIN_SIMILARITY)
    .map((r: any) => ({ ...r, similarity: Number(r.similarity) }));
}

/**
 * Pure-JS fallback vector search (used in demo mode / when
 * pgvector queries are unavailable). Pulls chunks and computes
 * cosine similarity in memory. Fine for small demo datasets;
 * NOT intended for production scale.
 */
async function vectorSearchInMemory(
  queryEmbedding: number[],
  filters: RAGSearchFilters
): Promise<RetrievedChunk[]> {
  const sources = await prisma.legalSource
    .findMany({
      where: {
        verificationStatus: "VERIFIED",
        ...(filters.jurisdiction ? { jurisdiction: filters.jurisdiction } : {}),
        ...(filters.language ? { language: filters.language } : {}),
      },
      include: { chunks: true },
    })
    .catch(() => [] as any[]);

  const scored: RetrievedChunk[] = [];

  for (const source of sources) {
    for (const chunk of source.chunks) {
      if (!chunk.embedding) continue;
      const embedding = Array.isArray(chunk.embedding)
        ? (chunk.embedding as unknown as number[])
        : [];
      if (embedding.length === 0) continue;

      const similarity = cosineSimilarity(queryEmbedding, embedding);
      if (similarity < MIN_SIMILARITY) continue;

      scored.push({
        chunkId: chunk.id,
        sourceId: source.id,
        sourceTitle: source.title,
        actName: source.actName,
        section: chunk.section,
        jurisdiction: source.jurisdiction,
        officialUrl: source.officialUrl,
        verificationStatus: source.verificationStatus,
        text: chunk.text,
        similarity,
      });
    }
  }

  return scored.sort((a, b) => b.similarity - a.similarity).slice(0, TOP_K);
}

function computeEvidenceLevel(chunks: RetrievedChunk[]): EvidenceLevel {
  if (chunks.length === 0) return "INSUFFICIENT";

  const avgSimilarity =
    chunks.reduce((s, c) => s + c.similarity, 0) / chunks.length;
  const verifiedCount = chunks.filter(
    (c) => c.verificationStatus === "VERIFIED"
  ).length;

  if (avgSimilarity > 0.55 && verifiedCount >= 3) return "STRONG";
  if (avgSimilarity > 0.35 && verifiedCount >= 2) return "MODERATE";
  if (avgSimilarity > MIN_SIMILARITY) return "LIMITED";
  return "INSUFFICIENT";
}
