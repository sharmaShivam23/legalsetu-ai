/**
 * India Code ingestion — the accurate way to grow LegalSetu's corpus.
 * ------------------------------------------------------------------
 * India Code (https://indiacode.gov.in) is the Government of India's
 * official repository of Central and State legislation, maintained by
 * the Ministry of Law and Justice. It publishes every act SECTION BY
 * SECTION, each with its own section number and official text.
 *
 * That is far better than scraping a PDF:
 *   - every chunk is exactly one section, never cut mid-sentence
 *   - every chunk carries its real section number, so answers can
 *     cite "Section 303" and lib/rag/citation-guard.ts can verify it
 *   - the text is the official one, not an OCR approximation
 *
 * Usage:
 *   npx tsx scripts/ingest-indiacode.ts --list="Bharatiya Nyaya Sanhita"
 *   npx tsx scripts/ingest-indiacode.ts --act="The Bharatiya Nyaya Sanhita, 2023"
 *   npx tsx scripts/ingest-indiacode.ts --act="..." --verified
 *
 * Then generate embeddings:
 *   npm run rag:embed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE = "https://indiacode.gov.in/server/api";
const HEADERS = {
  Accept: "application/json",
  "User-Agent": "LegalSetu-Ingest/1.0",
};
const PAGE_SIZE = 100;
const MAX_PAGES = 40;

interface IndiaCodeSection {
  sectionNumber: string;
  title: string;
  text: string;
  actName: string;
  actId: string;
  handle: string;
}

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] ?? "true";
  }
  return out;
}

/** India Code times out intermittently, so retry before giving up. */
async function getJson(url: string, attempts = 4): Promise<any> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) throw new Error(`India Code returned ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === attempts) throw err;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

/** Strips the inline HTML India Code wraps section text in. */
function cleanText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const meta = (item: any, key: string): string | undefined =>
  item?.metadata?.[key]?.[0]?.value;

/**
 * The parent act's name. The search endpoint exposes it as
 * `dc.identifier.act_name` while the single-item endpoint uses
 * `dc.title.act_name`; reading only one of them silently matches
 * nothing, which is exactly how this went wrong before.
 */
const actNameOf = (item: any): string | undefined =>
  meta(item, "dc.title.act_name") ?? meta(item, "dc.identifier.act_name");

/**
 * Pulls every section belonging to one act.
 * Only CENTRAL entries are kept — states republish central acts under
 * the same title, and mixing them would produce duplicate sections.
 */
async function fetchSections(
  actQuery: string,
  exactActName?: string
): Promise<IndiaCodeSection[]> {
  const sections = new Map<string, IndiaCodeSection>();
  let page = 0;
  let total = Infinity;

  while (page < MAX_PAGES && page * PAGE_SIZE < total) {
    const url =
      `${BASE}/discover/search/objects?query=${encodeURIComponent(actQuery)}` +
      `&size=${PAGE_SIZE}&page=${page}&dsoType=item`;

    const data = await getJson(url);
    const result = data?._embedded?.searchResult;
    total = result?.page?.totalElements ?? 0;

    const objects = (result?._embedded?.objects ?? [])
      .map((o: any) => o?._embedded?.indexableObject)
      .filter(Boolean);

    if (objects.length === 0) break;

    for (const item of objects) {
      if (meta(item, "dc.identifier.collection") !== "SECTION") continue;
      if (meta(item, "dc.identifier.state_name") !== "CENTRAL") continue;

      const actName = actNameOf(item);
      if (!actName) continue;
      if (exactActName && actName !== exactActName) continue;

      const sectionNumber = meta(item, "dc.identifier.section_number");
      const rawText = meta(item, "dc.identifier.section_page_note");
      if (!sectionNumber || !rawText) continue;

      const text = cleanText(rawText);
      if (text.length < 20) continue;

      // Key by act + section so repeated hits collapse.
      const key = `${actName}#${sectionNumber}`;
      if (!sections.has(key)) {
        sections.set(key, {
          sectionNumber,
          title: item.name ?? "",
          text,
          actName,
          actId: meta(item, "dc.identifier.act_id") ?? "",
          handle: item.handle ?? "",
        });
      }
    }

    page++;
  }

  return Array.from(sections.values()).sort(
    (a, b) => Number(a.sectionNumber) - Number(b.sectionNumber)
  );
}

/** Shows which acts match a search term, and how many sections each has. */
async function listActs(query: string): Promise<void> {
  const all = await fetchSections(query);
  const byAct = new Map<string, number>();
  for (const s of all) byAct.set(s.actName, (byAct.get(s.actName) ?? 0) + 1);

  if (byAct.size === 0) {
    console.log(`No central acts found for "${query}".`);
    return;
  }

  console.log(`\nActs matching "${query}":\n`);
  for (const [act, count] of [...byAct].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(4)} sections  ${act}`);
  }
  console.log(`\nIngest one with:\n  npx tsx scripts/ingest-indiacode.ts --act="<exact act name>"\n`);
}

/**
 * Serverless Postgres (Neon and similar) suspends when idle and needs a
 * few seconds to wake. Retry rather than failing an ingestion that has
 * already downloaded everything it needs.
 */
async function waitForDatabase(attempts = 8): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await prisma.$queryRawUnsafe("SELECT 1");
      return;
    } catch {
      if (i === 1) console.log("Waiting for the database to wake up...");
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  throw new Error("Database is unreachable. Check DATABASE_URL and try again.");
}

async function main() {
  const args = parseArgs();

  if (args.list) {
    await listActs(args.list);
    return;
  }

  if (!args.act) {
    console.error(
      [
        "Usage:",
        '  npx tsx scripts/ingest-indiacode.ts --list="Bharatiya Nyaya Sanhita"',
        '  npx tsx scripts/ingest-indiacode.ts --act="The Bharatiya Nyaya Sanhita, 2023"',
        "",
        "Options:",
        "  --verified     mark the source VERIFIED immediately (default: PENDING_REVIEW)",
        '  --jurisdiction set jurisdiction label (default: "India")',
      ].join("\n")
    );
    process.exit(1);
  }

  console.log(`Fetching "${args.act}" from India Code...`);
  // Search with the distinctive words only. India Code's relevance
  // ranking buries the actual sections when the query carries "The"
  // and the year, so searching the full official title returns nothing
  // while the exact title is still used to filter what comes back.
  const searchQuery = args.act
    .replace(/^The\s+/i, "")
    .replace(/,?\s*\d{4}\.?$/, "")
    .trim();
  const sections = await fetchSections(searchQuery, args.act);

  if (sections.length === 0) {
    console.error(
      `No sections found for exactly "${args.act}".\n` +
        `Run with --list="<part of the name>" to see exact titles.`
    );
    process.exit(1);
  }

  await waitForDatabase();

  const existing = await prisma.legalSource.findFirst({
    where: { title: args.act },
  });
  if (existing) {
    console.error(
      `"${args.act}" is already in the database (id ${existing.id}). ` +
        `Delete it first if you want to re-ingest.`
    );
    process.exit(1);
  }

  const source = await prisma.legalSource.create({
    data: {
      title: args.act,
      actName: args.act,
      sourceType: "STATUTE",
      jurisdiction: args.jurisdiction ?? "India",
      language: "en",
      officialUrl: `https://indiacode.gov.in/handle/${sections[0].handle}`,
      // Official government source, but the admin still decides.
      verificationStatus: args.verified ? "VERIFIED" : "PENDING_REVIEW",
      lastVerifiedAt: args.verified ? new Date() : null,
      chunks: {
        create: sections.map((s) => ({
          // One chunk per section, labelled with its real number.
          section: s.sectionNumber,
          text: `${s.sectionNumber}. ${s.title}\n\n${s.text}`,
        })),
      },
    },
  });

  const chars = sections.reduce((n, s) => n + s.text.length, 0);
  console.log(
    [
      ``,
      `Ingested "${args.act}"`,
      `  sections stored : ${sections.length}`,
      `  section range   : ${sections[0].sectionNumber} – ${sections[sections.length - 1].sectionNumber}`,
      `  total text      : ${Math.round(chars / 1000)}k characters`,
      `  status          : ${args.verified ? "VERIFIED" : "PENDING_REVIEW"}`,
      `  source id       : ${source.id}`,
      ``,
      `Next: npm run rag:embed   (generates embeddings so retrieval can use it)`,
      ...(args.verified
        ? []
        : [`Then mark it VERIFIED in the admin panel — retrieval ignores unverified sources.`]),
      ``,
    ].join("\n")
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
