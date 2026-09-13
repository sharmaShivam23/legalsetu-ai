// lib/rag/retriever.ts

import { prisma } from "@/lib/db/prisma";
import { embedText, cosineSimilarity } from "@/lib/ai/embeddings";
import { extractSectionNumber } from "./sections";
import { logger } from "@/lib/logging/logger";
import type {
  RAGSearchFilters,
  RAGSearchResult,
  RetrievedChunk,
  EvidenceLevel,
} from "./types";

const TOP_K = 6;
const MIN_SIMILARITY = 0.15;

/** Short-lived cache of query embeddings — repeated/similar questions are common. */
const QUERY_EMBEDDING_CACHE = new Map<string, number[]>();
const QUERY_CACHE_LIMIT = 500;

function cacheKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Embeds the query, reusing a cached vector when the same question
 * has been asked before. The embedding round-trip is the single
 * biggest latency in retrieval, so this matters for perceived speed.
 */
async function embedQuery(query: string): Promise<number[]> {
  const key = cacheKey(query);
  const cached = QUERY_EMBEDDING_CACHE.get(key);
  if (cached) return cached;

  const embedding = await embedText(query);

  if (QUERY_EMBEDDING_CACHE.size >= QUERY_CACHE_LIMIT) {
    const oldest = QUERY_EMBEDDING_CACHE.keys().next().value;
    if (oldest !== undefined) QUERY_EMBEDDING_CACHE.delete(oldest);
  }
  QUERY_EMBEDDING_CACHE.set(key, embedding);
  return embedding;
}

/**
 * Vector similarity search over verified LegalSourceChunk rows.
 *
 * Uses pgvector's `<=>` cosine-distance operator, with a pure-JS
 * fallback for environments where the extension or the database
 * is unavailable (demo mode / local dev).
 *
 * NOTE: Prisma Client cannot select an `Unsupported("vector")`
 * column through its normal query API, so BOTH paths go through
 * raw SQL — the fallback casts the embedding to text and parses
 * it back, rather than using `prisma.legalSource.findMany`.
 */
export async function retrieveRelevantChunks(
  query: string,
  filters: RAGSearchFilters = {}
): Promise<RAGSearchResult> {
  // Some providers (e.g. Groq) have no embeddings endpoint. Without a
  // query vector there is nothing to search, so we report "no sources"
  // instead of failing the whole request — the grounding prompt then
  // makes the model say it lacks sources rather than inventing any.
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedQuery(query);
  } catch {
    return { chunks: [], evidenceLevel: "INSUFFICIENT" };
  }

  let chunks: RetrievedChunk[] = [];

  try {
    chunks = await vectorSearchSQL(queryEmbedding, filters);
  } catch (err) {
    // Log the real reason the primary SQL path failed — silently
    // swallowing this made past failures impossible to diagnose.
    logger.warn("Vector SQL search failed, using in-memory fallback", {
      errorType: String(err).slice(0, 200),
    });
    chunks = await vectorSearchInMemory(queryEmbedding, filters);
  }

  // Recover a section number from the chunk text when the ingestion
  // pipeline did not record one, so answers can cite precisely.
  chunks = chunks.map((c) => ({
    ...c,
    section: c.section ?? extractSectionNumber(c.text),
  }));

  const evidenceLevel = computeEvidenceLevel(chunks);
  return { chunks, evidenceLevel };
}

async function vectorSearchSQL(
  queryEmbedding: number[],
  filters: RAGSearchFilters
): Promise<RetrievedChunk[]> {
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  // SECURITY: every filter value is bound as a parameter. These values
  // arrive from a public, unauthenticated endpoint (/api/rag/search),
  // so string-interpolating them into the SQL would be an injection
  // hole. `$3 IS NULL OR col = $3` keeps one prepared statement able
  // to serve both the filtered and unfiltered cases.
  const rows = await (
    prisma.$queryRawUnsafe as (
      query: string,
      ...values: unknown[]
    ) => Promise<any[]>
  )(
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
      AND c.embedding IS NOT NULL
      AND ($3::text IS NULL OR s.jurisdiction = $3::text)
      AND ($4::text IS NULL OR s.language = $4::text)
    ORDER BY c.embedding <=> $1::vector
    LIMIT $2
    `,
    vectorLiteral,
    TOP_K,
    filters.jurisdiction ?? null,
    filters.language ?? null
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
  // SECURITY: filters are bound as parameters, never interpolated.
  // These values arrive from /api/rag/search, which is public and
  // unauthenticated, so `AND s.jurisdiction = '${filters.jurisdiction}'`
  // would be a live SQL injection hole. The `$n IS NULL OR col = $n`
  // form lets one prepared statement serve the filtered and
  // unfiltered cases alike — same approach as vectorSearchSQL above.
  const rows = await (
    prisma.$queryRawUnsafe as (
      query: string,
      ...values: unknown[]
    ) => Promise<any[]>
  )(
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
      AND c.embedding IS NOT NULL
      AND ($1::text IS NULL OR s.jurisdiction = $1::text)
      AND ($2::text IS NULL OR s.language = $2::text)
    `,
    filters.jurisdiction ?? null,
    filters.language ?? null
  ).catch((err) => {
    logger.error("In-memory fallback fetch failed too", {
      errorType: String(err).slice(0, 200),
    });
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