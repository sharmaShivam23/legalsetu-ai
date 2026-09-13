/**
 * Generates embeddings for every LegalSourceChunk that lacks one.
 * Usage: npm run rag:embed
 *
 * Built to handle a real corpus (thousands of sections), so it:
 *   - processes the whole backlog, not a fixed slice
 *   - embeds concurrently, since each call is network-bound
 *   - retries rate-limit / transient failures with backoff
 *   - is resumable: it only ever selects rows still missing an
 *     embedding, so re-running after an interruption continues
 *     where it stopped rather than redoing work
 */
import { PrismaClient } from "@prisma/client";
import { getEmbeddingProvider } from "../lib/ai/provider";

const prisma = new PrismaClient();

/** Parallel embed calls. Kept modest to stay inside free-tier rate limits. */
const CONCURRENCY = 6;
/** Rows pulled from the database at a time. */
const BATCH_SIZE = 200;
const MAX_RETRIES = 4;

interface ChunkRow {
  id: string;
  text: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Embeds one chunk, retrying on transient failures. Rate limiting is
 * the common case on a free tier, so back off rather than abort the
 * whole run and lose the progress made so far.
 */
async function embedWithRetry(
  provider: Awaited<ReturnType<typeof getEmbeddingProvider>>,
  chunk: ChunkRow
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { embedding } = await provider.embed(chunk.text);
      const vectorLiteral = `[${embedding.join(",")}]`;
      await prisma.$executeRawUnsafe(
        `UPDATE "LegalSourceChunk" SET embedding = $1::vector WHERE id = $2`,
        vectorLiteral,
        chunk.id
      );
      return true;
    } catch (err) {
      const message = String(err);
      const isLast = attempt === MAX_RETRIES;
      if (isLast) {
        console.warn(`  ! failed chunk ${chunk.id.slice(0, 8)}: ${message.slice(0, 100)}`);
        return false;
      }
      // Exponential backoff: 1s, 2s, 4s.
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
  return false;
}

/** Runs `worker` over `items` with a bounded number in flight. */
async function pooled<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<boolean>
): Promise<{ ok: number; failed: number }> {
  let index = 0;
  let ok = 0;
  let failed = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      (await worker(item)) ? ok++ : failed++;
    }
  });

  await Promise.all(runners);
  return { ok, failed };
}

async function main() {
  // Embeddings must use the embedding provider, not the chat one:
  // the fast chat provider (Groq) has no embeddings endpoint.
  const provider = await getEmbeddingProvider();
  console.log(`Using embedding provider: ${provider.name} (demo mode: ${provider.isDemo})`);

  if (provider.isDemo) {
    console.warn(
      "\nWARNING: the demo provider produces deterministic pseudo-embeddings.\n" +
        "Retrieval will run but results will be meaningless. Configure a real\n" +
        "AI_PROVIDER before embedding a corpus you intend to rely on.\n"
    );
  }

  // `embedding` is a pgvector Unsupported() column, so Prisma's typed
  // query API cannot filter on it — this has to be raw SQL.
  const countRows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM "LegalSourceChunk" WHERE embedding IS NULL`
  );
  const remaining = countRows[0]?.n ?? 0;

  console.log(`${remaining} chunk(s) need embeddings.\n`);
  if (remaining === 0) {
    console.log("Nothing to do.");
    return;
  }

  const started = Date.now();
  let done = 0;
  let failedTotal = 0;

  // Loop until the backlog is cleared. Each pass re-queries for rows
  // still missing an embedding, so failures simply get retried next run
  // instead of blocking the ones behind them.
  for (;;) {
    const chunks: ChunkRow[] = await prisma.$queryRawUnsafe(
      `SELECT id, text FROM "LegalSourceChunk" WHERE embedding IS NULL LIMIT ${BATCH_SIZE}`
    );
    if (chunks.length === 0) break;

    const { ok, failed } = await pooled(chunks, CONCURRENCY, (c) =>
      embedWithRetry(provider, c)
    );

    done += ok;
    failedTotal += failed;

    const elapsed = (Date.now() - started) / 1000;
    const rate = done / Math.max(elapsed, 1);
    const left = Math.max(remaining - done - failedTotal, 0);
    console.log(
      `  embedded ${done}/${remaining}` +
        (failedTotal ? ` (${failedTotal} failed)` : "") +
        ` — ${rate.toFixed(1)}/s, ~${Math.round(left / Math.max(rate, 0.1))}s left`
    );

    // Every row in this pass failed — the provider is down or the key is
    // rejected. Stop rather than spin through the whole corpus failing.
    if (ok === 0 && failed > 0) {
      console.error("\nAborting: no chunk in this batch could be embedded.");
      break;
    }
  }

  console.log(
    `\nDone. ${done} embedded${failedTotal ? `, ${failedTotal} failed (re-run to retry)` : ""}.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
