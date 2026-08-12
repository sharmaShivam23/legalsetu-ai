/**
 * Generates embeddings for any LegalSourceChunk rows that don't
 * have one yet, using the configured AI provider (mock or real).
 * Usage: npm run rag:embed
 */
import { PrismaClient } from "@prisma/client";
import { getAIProvider } from "../lib/ai/provider";

const prisma = new PrismaClient();

async function main() {
  const provider = await getAIProvider();
  console.log(`Using AI provider: ${provider.name} (demo mode: ${provider.isDemo})`);

  const chunks: any[] = await (prisma.$queryRawUnsafe as (query: string) => Promise<any[]>)(
    `SELECT id, text FROM "LegalSourceChunk" WHERE embedding IS NULL LIMIT 500`
  );

  console.log(`Found ${chunks.length} chunks needing embeddings.`);

  for (const chunk of chunks) {
    const { embedding } = await provider.embed(chunk.text);
    const vectorLiteral = `[${embedding.join(",")}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE "LegalSourceChunk" SET embedding = $1::vector WHERE id = $2`,
      vectorLiteral,
      chunk.id
    );
  }

  console.log("Embedding generation complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
