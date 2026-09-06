// lib/rag/retriever.ts

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
 * when the SQL query fails (e.g. no pgvector extension configured
 * yet), so local development never hard-breaks. NOTE: because
 * Prisma Client cannot select `Unsupported("vector")` columns
 * through its normal query API, the fallback also fetches
 * embeddings via raw SQL rather than `prisma.legalSource.findMany`.
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
    // Log the real reason the primary SQL path failed — silently
    // swallowing this made past failures impossible to diagnose.
    console.error("[retriever] vectorSearchSQL failed, falling back to in-memory search:", err);
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
 * Pure-JS fallback vector search (used only when the primary
 * pgvector SQL query above throws). Fetches chunk text AND
 * embeddings via raw SQL — a normal `prisma.legalSource.findMany`
 * query cannot be used here because `embedding` is declared as
 * `Unsupported("vector")` in schema.prisma, which Prisma Client
 * silently omits from any non-raw query. Computes cosine
 * similarity in memory. Fine for small demo datasets; NOT
 * intended for production scale.
 */
async function vectorSearchInMemory(
  queryEmbedding: number[],
  filters: RAGSearchFilters
): Promise<RetrievedChunk[]> {
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
      c.embedding::text as "embeddingText"
    FROM "LegalSourceChunk" c
    JOIN "LegalSource" s ON s.id = c."sourceId"
    WHERE s."verificationStatus" = 'VERIFIED'
      ${filters.jurisdiction ? `AND s.jurisdiction = '${filters.jurisdiction}'` : ""}
      ${filters.language ? `AND s.language = '${filters.language}'` : ""}
      AND c.embedding IS NOT NULL
    `
  ).catch((err) => {
    console.error("[retriever] vectorSearchInMemory raw fetch also failed:", err);
    return [] as any[];
  });

  const scored: RetrievedChunk[] = [];

  for (const row of rows) {
    if (!row.embeddingText) continue;

    // pgvector's ::text cast returns "[0.1,0.2,...]" — parse it back into a number[].
    const embedding = row.embeddingText
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map(Number);

    if (embedding.length === 0 || embedding.some(Number.isNaN)) continue;

    const similarity = cosineSimilarity(queryEmbedding, embedding);
    if (similarity < MIN_SIMILARITY) continue;

    scored.push({
      chunkId: row.chunkId,
      sourceId: row.sourceId,
      sourceTitle: row.sourceTitle,
      actName: row.actName,
      section: row.section,
      jurisdiction: row.jurisdiction,
      officialUrl: row.officialUrl,
      verificationStatus: row.verificationStatus,
      text: row.text,
      similarity,
    });
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