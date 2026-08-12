/**
 * Legal source ingestion script.
 * Usage: npm run rag:ingest -- --file=./path/to/document.txt --title="..." --jurisdiction="..."
 *
 * This is the entry point administrators use to add VERIFIED legal
 * documents to the RAG corpus. It does not scrape the web or invent
 * content — it only ingests documents explicitly provided to it.
 */
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { chunkText } from "../lib/rag/chunker";

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  for (const arg of args) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) parsed[match[1]] = match[2];
  }
  return parsed;
}

async function main() {
  const args = parseArgs();
  if (!args.file || !args.title || !args.jurisdiction) {
    console.error(
      "Usage: npm run rag:ingest -- --file=doc.txt --title=\"Act Name\" --jurisdiction=\"State\""
    );
    process.exit(1);
  }

  const rawText = readFileSync(args.file, "utf-8");
  const chunks = chunkText(rawText);

  const source = await prisma.legalSource.create({
    data: {
      title: args.title,
      actName: args.actName ?? args.title,
      sourceType: (args.sourceType as any) ?? "STATUTE",
      jurisdiction: args.jurisdiction,
      language: args.language ?? "en",
      officialUrl: args.url,
      verificationStatus: "PENDING_REVIEW", // admin must explicitly verify
      chunks: {
        create: chunks.map((c) => ({ text: c.text })),
      },
    },
  });

  console.log(
    `Ingested "${source.title}" with ${chunks.length} chunks. Status: PENDING_REVIEW — run generate-embeddings next, then verify via the admin panel.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
