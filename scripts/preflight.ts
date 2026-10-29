/**
 * LegalSetu — pre-demo preflight check
 * ------------------------------------------------------------
 * Run this BEFORE any demo, presentation or deployment:
 *
 *     npm run preflight
 *
 * It answers one question — will this app actually work right
 * now? — by talking to every external dependency for real,
 * rather than trusting that a key in .env is a key that works.
 *
 * Why this exists: the app degrades gracefully by design. A dead
 * API key falls through to the next provider, an unreachable
 * database falls back to an empty corpus, and a failed translation
 * quietly returns the original English. Every one of those is the
 * right behaviour for a user mid-session, and every one of them
 * hides a broken dependency from the developer until the worst
 * possible moment. This script removes the graceful degradation
 * and shows the raw truth.
 *
 * Exit code is 1 if anything critical is down, so CI can use it too.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Minimal .env loader. Deliberately not `dotenv`: this script has to run
 * on a machine where `npm install` may not have completed, and adding a
 * dependency to a diagnostic that exists to diagnose a broken setup is
 * exactly the wrong trade. Existing process env always wins.
 */
const SPLIT_LINES = new RegExp(String.fromCharCode(13) + '?' + String.fromCharCode(10));

function loadEnv(): void {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(SPLIT_LINES)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue; // comments and blanks
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

loadEnv();

type Status = "pass" | "warn" | "fail";

interface Check {
  group: string;
  name: string;
  status: Status;
  ms: number;
  detail: string;
}

const checks: Check[] = [];

const mask = (k: string) => (k ? `${k.slice(0, 6)}...${k.slice(-4)}` : "(unset)");

function keysFor(prefix: string): { name: string; key: string }[] {
  const out: { name: string; key: string }[] = [];
  const seen = new Set<string>();
  const push = (name: string, value?: string) => {
    const key = value?.trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push({ name, key });
    }
  };
  push(prefix, process.env[prefix]);
  for (let i = 1; i <= 10; i++) push(`${prefix}_${i}`, process.env[`${prefix}_${i}`]);
  return out;
}

function record(group: string, name: string, status: Status, ms: number, detail: string): void {
  checks.push({ group, name, status, ms, detail });
}

async function run(
  group: string,
  name: string,
  critical: boolean,
  fn: () => Promise<string>
): Promise<void> {
  const started = Date.now();
  try {
    const detail = await fn();
    record(group, name, "pass", Date.now() - started, detail);
  } catch (err) {
    const message = String((err as any)?.message ?? err).replace(/\s+/g, " ").slice(0, 100);
    record(group, name, critical ? "fail" : "warn", Date.now() - started, message);
  }
}

// ---------------------------------------------------------------
// Database. The dependency whose absence is least visible and most
// damaging: no corpus means every answer is ungrounded, and no
// TranslationCache means every page translation is a cold model call.
// ---------------------------------------------------------------
async function checkDatabase(): Promise<void> {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  await run("Database", "Postgres reachable", true, async () => {
    await prisma.$queryRawUnsafe("SELECT 1");
    const url = process.env.DATABASE_URL ?? "";
    const hostPort = url.match(/@([^/]+)\//)?.[1] ?? "unknown";
    return `connected at ${hostPort}`;
  });

  await run("Database", "pgvector extension", true, async () => {
    const rows = await prisma.$queryRawUnsafe<{ extversion: string }[]>(
      "SELECT extversion FROM pg_extension WHERE extname = 'vector'"
    );
    if (rows.length === 0) throw new Error("vector extension not installed");
    return `v${rows[0].extversion}`;
  });

  await run("Database", "ANN index on embeddings", false, async () => {
    const rows = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes
        WHERE tablename = 'LegalSourceChunk'
          AND (indexdef ILIKE '%hnsw%' OR indexdef ILIKE '%ivfflat%')`
    );
    if (rows.length === 0) {
      throw new Error("no hnsw/ivfflat index - vector search is a sequential scan");
    }
    return rows[0].indexdef.includes("hnsw") ? "hnsw" : "ivfflat";
  });

  await run("Database", "Legal corpus ingested", true, async () => {
    const sources = await prisma.legalSource.count({
      where: { verificationStatus: "VERIFIED" },
    });
    const chunkRows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "LegalSourceChunk" WHERE embedding IS NOT NULL`
    );
    const embedded = Number(chunkRows[0]?.count ?? 0);
    if (sources === 0 || embedded === 0) {
      throw new Error(
        `${sources} verified sources, ${embedded} embedded chunks - RAG returns nothing and every answer is ungrounded`
      );
    }
    return `${sources} verified sources, ${embedded} embedded chunks`;
  });

  await run("Database", "Translation cache warm", false, async () => {
    const rows = await prisma.$queryRawUnsafe<{ targetlang: string; count: bigint }[]>(
      `SELECT "targetLang" AS targetlang, COUNT(*)::bigint AS count
         FROM "TranslationCache" GROUP BY "targetLang" ORDER BY count DESC LIMIT 6`
    );
    const total = rows.reduce((sum, r) => sum + Number(r.count), 0);
    if (total === 0) throw new Error("empty - the first language switch will be slow");
    return `${total} rows: ${rows.map((r) => `${r.targetlang}=${r.count}`).join(" ")}`;
  });

  await prisma.$disconnect().catch(() => {});
}

// ---------------------------------------------------------------
// Redis is optional: the app falls back to in-memory stores, which
// is correct for a single instance. What matters is that a
// CONFIGURED Redis is reachable, because a stale URL costs a
// connect timeout on every cold start.
// ---------------------------------------------------------------
async function checkRedis(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    record("Cache", "Redis", "pass", 0, "not configured - using in-memory stores");
    return;
  }
  await run("Cache", "Redis reachable", false, async () => {
    const { Redis } = await import("ioredis");
    const redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      retryStrategy: () => null,
    });
    redis.on("error", () => {});
    try {
      await redis.connect();
      await redis.ping();
      return "connected";
    } finally {
      redis.disconnect();
    }
  });
}

// ---------------------------------------------------------------
// AI providers. The app rotates keys and falls back between
// providers silently, so a dead key is invisible in normal use.
// Every key gets one real, tiny completion.
// ---------------------------------------------------------------
async function checkOpenAICompatible(
  group: string,
  prefix: string,
  baseUrl: string,
  model: string
): Promise<void> {
  const keys = keysFor(prefix);
  if (keys.length === 0) {
    record(group, prefix, "warn", 0, "no keys configured");
    return;
  }
  for (const { name, key } of keys) {
    await run(group, `${name} ${mask(key)}`, false, async () => {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "say ok" }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${body.replace(/\s+/g, " ").slice(0, 80)}`);
      return `${model} responding`;
    });
  }
}

async function checkGemini(): Promise<void> {
  const model = process.env.GEMINI_CHAT_MODEL || "gemini-flash-latest";
  const keys = keysFor("GEMINI_API_KEY");
  if (keys.length === 0) {
    record("Gemini", "GEMINI_API_KEY", "warn", 0, "no keys configured");
    return;
  }
  for (const { name, key } of keys) {
    await run("Gemini", `${name} ${mask(key)} chat`, false, async () => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: "say ok" }] }] }),
          signal: AbortSignal.timeout(20_000),
        }
      );
      const body = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${body.replace(/\s+/g, " ").slice(0, 80)}`);
      return `${model} responding`;
    });
  }
}

// Embeddings get their own group: they sit on the critical path of
// EVERY chat request (retrieval embeds the query first), and they are
// the one capability with no fallback provider configured.
async function checkEmbeddings(): Promise<void> {
  const keys = keysFor("GEMINI_API_KEY");
  if (keys.length === 0) {
    record("Embeddings", "GEMINI_API_KEY", "fail", 0, "no keys - RAG retrieval cannot run");
    return;
  }
  const model = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
  for (const { name, key } of keys) {
    await run("Embeddings", `${name} ${mask(key)}`, false, async () => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: { parts: [{ text: "preflight" }] },
            outputDimensionality: 1536,
          }),
          signal: AbortSignal.timeout(20_000),
        }
      );
      const body = await res.text();
      if (!res.ok) throw new Error(`${res.status} ${body.replace(/\s+/g, " ").slice(0, 80)}`);
      const dims = JSON.parse(body).embedding?.values?.length ?? 0;
      if (dims !== 1536) throw new Error(`returned ${dims} dims, the column is vector(1536)`);
      return "1536 dims - matches the pgvector column";
    });
  }
}

async function checkSarvam(): Promise<void> {
  const keys = keysFor("SARVAM_API_KEY");
  if (keys.length === 0) {
    record("Sarvam (voice)", "SARVAM_API_KEY", "warn", 0, "no keys - voice mode is disabled");
    return;
  }
  const [first] = keys;

  await run("Sarvam (voice)", `TTS bulbul:v3 ${mask(first.key)}`, false, async () => {
    const res = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-subscription-key": first.key },
      body: JSON.stringify({
        text: "नमस्ते",
        language_code: "hi-IN",
        model: "bulbul:v3",
        speaker: process.env.SARVAM_TTS_SPEAKER?.trim() || "ritu",
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${body.replace(/\s+/g, " ").slice(0, 80)}`);
    const bytes = (JSON.parse(body).audios?.[0] ?? "").length;
    if (bytes === 0) throw new Error("empty audio returned");
    return `${bytes} base64 bytes of Hindi speech`;
  });

  await run("Sarvam (voice)", `Translate mayura ${mask(first.key)}`, false, async () => {
    const res = await fetch("https://api.sarvam.ai/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-subscription-key": first.key },
      body: JSON.stringify({
        input: "You have the right to free legal aid.",
        source_language_code: "en-IN",
        target_language_code: "hi-IN",
        mode: process.env.SARVAM_TRANSLATE_MODE || "formal",
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${body.replace(/\s+/g, " ").slice(0, 80)}`);
    return JSON.parse(body).translated_text ?? "(no text returned)";
  });
}

// ---------------------------------------------------------------
// Report
// ---------------------------------------------------------------
const GREEN = "[32m";
const YELLOW = "[33m";
const RED = "[31m";
const DIM = "[2m";
const BOLD = "[1m";
const RESET = "[0m";

function icon(status: Status): string {
  if (status === "pass") return `${GREEN}PASS${RESET}`;
  if (status === "warn") return `${YELLOW}WARN${RESET}`;
  return `${RED}FAIL${RESET}`;
}

/**
 * What "healthy" means per provider group.
 *
 * Chat providers are a CHAIN, not a set of requirements: the app walks
 * Groq -> Cerebras -> Gemini and only needs one of them answering. So
 * they are judged together. Treating each separately made the preflight
 * cry NO-GO because Gemini's free-tier keys were throttled, while Groq —
 * the provider that actually serves every request — was fine. A check
 * that reports a healthy system as broken gets ignored, and an ignored
 * check is worse than no check.
 *
 * Embeddings are different: there is no second provider, and without
 * them retrieval silently returns zero sources and every answer loses
 * its grounding. That one really is pass/fail on its own.
 */
const CHAT_GROUPS = ["Groq (primary)", "Cerebras (fallback)", "Gemini"];
const REQUIRED_GROUPS = ["Embeddings"];

function groupHasLiveKey(group: string): boolean | null {
  const rows = checks.filter((c) => c.group === group);
  if (rows.length === 0) return null; // not configured at all
  return rows.some((c) => c.status === "pass");
}

function report(): number {
  let currentGroup = "";
  console.log(`\n${BOLD}LegalSetu preflight${RESET} ${DIM}${new Date().toLocaleString()}${RESET}\n`);

  for (const c of checks) {
    if (c.group !== currentGroup) {
      currentGroup = c.group;
      console.log(`${BOLD}${currentGroup}${RESET}`);
    }
    const ms = c.ms > 0 ? `${String(c.ms).padStart(6)}ms` : "        ";
    console.log(`  ${icon(c.status)}  ${c.name.padEnd(34)} ${DIM}${ms}${RESET}  ${DIM}${c.detail}${RESET}`);
  }

  const failures = checks.filter((c) => c.status === "fail");
  const warnings = checks.filter((c) => c.status === "warn");

  const blockers: string[] = [];
  const softNotes: string[] = [];

  // One live chat provider anywhere in the chain is enough to serve.
  const liveChat = CHAT_GROUPS.filter((g) => groupHasLiveKey(g) === true);
  const deadChat = CHAT_GROUPS.filter((g) => groupHasLiveKey(g) === false);

  if (liveChat.length === 0) {
    blockers.push("no chat provider answered - " + CHAT_GROUPS.join(", ") + " all failed");
  } else {
    for (const g of deadChat) {
      softNotes.push(`${g}: every key failed, but ${liveChat[0]} is serving, so the chain still works`);
    }
  }

  for (const group of REQUIRED_GROUPS) {
    if (groupHasLiveKey(group) === false) {
      blockers.push(`${group}: every key failed - retrieval returns no sources and answers lose their grounding`);
    }
  }

  console.log(`\n${BOLD}Verdict${RESET}`);

  if (failures.length === 0 && blockers.length === 0) {
    console.log(`  ${GREEN}GO${RESET} - every critical dependency answered.`);
    console.log(`  ${DIM}serving chat from: ${liveChat.join(" -> ")}${RESET}`);
    const allNotes = [...warnings.map((w) => `${w.group} / ${w.name}: ${w.detail}`), ...softNotes];
    if (allNotes.length > 0) {
      console.log(`  ${YELLOW}${allNotes.length} warning(s)${RESET}, degraded but usable:`);
      for (const note of allNotes) console.log(`      ${DIM}${note}${RESET}`);
    }
    return 0;
  }

  console.log(`  ${RED}NO-GO${RESET} - fix these before demoing:`);
  for (const f of failures) {
    console.log(`      ${RED}*${RESET} ${f.group} / ${f.name}: ${f.detail}`);
  }
  for (const b of blockers) {
    console.log(`      ${RED}*${RESET} ${b}`);
  }

  console.log(`
${DIM}Common fixes:
  Postgres or Redis down ...... start Docker Desktop, then: docker compose up -d db redis
  Corpus empty ................ npm run rag:ingest && npm run rag:embed
  No ANN index ................ npx prisma migrate dev
  Dead API key ................ comment it out in .env; the rotator wastes a round-trip on it${RESET}`);
  return 1;
}

async function main(): Promise<void> {
  await checkDatabase();
  await checkRedis();
  await checkOpenAICompatible(
    "Groq (primary)",
    "GROQ_API_KEY",
    "https://api.groq.com/openai/v1",
    process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b"
  );
  if (keysFor("CEREBRAS_API_KEY").length > 0) {
    await checkOpenAICompatible(
      "Cerebras (fallback)",
      "CEREBRAS_API_KEY",
      "https://api.cerebras.ai/v1",
      process.env.CEREBRAS_CHAT_MODEL || "gpt-oss-120b"
    );
  }
  await checkGemini();
  await checkEmbeddings();
  await checkSarvam();
  process.exit(report());
}

void main();
