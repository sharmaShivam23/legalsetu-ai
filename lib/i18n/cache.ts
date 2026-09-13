// ==========================================================
// LegalSetu — Translation Cache (server side)
// ----------------------------------------------------------
// Three tiers, cheapest first:
//   1. process memory  — instant, per-instance
//   2. Postgres        — shared across users AND instances, so
//                        a string any user has ever translated
//                        is free for everyone afterwards
//   3. the AI provider — only for genuinely new strings
//
// Every database call is best-effort: this app is designed to
// boot with no DB in demo mode, so a cache miss must degrade
// to "call the model", never to an exception.
// ==========================================================

import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";

/** Stable short hash — the cache key for a source string. */
export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("base64url").slice(0, 22);
}

const MEMORY_LIMIT = 5000;
const memory = new Map<string, string>();

function memoryKey(hash: string, lang: string): string {
  return `${lang}:${hash}`;
}

function rememberInMemory(key: string, value: string): void {
  // Simple FIFO eviction — good enough, and avoids pulling in an LRU dep.
  if (memory.size >= MEMORY_LIMIT) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, value);
}

export interface CacheLookup {
  /** sourceText -> translatedText for everything already known. */
  hits: Map<string, string>;
  /** Source strings that still need the model. */
  misses: string[];
}

/**
 * Looks up many strings at once. Checks memory first, then a
 * single batched database query for whatever is left.
 */
export async function lookupCached(
  texts: string[],
  targetLanguage: string
): Promise<CacheLookup> {
  const hits = new Map<string, string>();
  const pending: { text: string; hash: string }[] = [];

  for (const text of texts) {
    const hash = hashText(text);
    const cached = memory.get(memoryKey(hash, targetLanguage));
    if (cached !== undefined) {
      hits.set(text, cached);
    } else {
      pending.push({ text, hash });
    }
  }

  if (pending.length === 0) return { hits, misses: [] };

  try {
    const rows = await prisma.translationCache.findMany({
      where: {
        targetLang: targetLanguage,
        sourceHash: { in: pending.map((p) => p.hash) },
      },
      select: { sourceHash: true, translatedText: true },
    });

    const byHash = new Map(rows.map((r) => [r.sourceHash, r.translatedText]));
    const misses: string[] = [];

    for (const { text, hash } of pending) {
      const found = byHash.get(hash);
      if (found !== undefined) {
        hits.set(text, found);
        rememberInMemory(memoryKey(hash, targetLanguage), found);
      } else {
        misses.push(text);
      }
    }
    return { hits, misses };
  } catch {
    // No database (demo mode) — everything unresolved goes to the model.
    return { hits, misses: pending.map((p) => p.text) };
  }
}

/** Persists newly translated pairs. Never throws. */
export async function storeTranslations(
  pairs: { source: string; translated: string }[],
  targetLanguage: string
): Promise<void> {
  if (pairs.length === 0) return;

  const rows = pairs.map(({ source, translated }) => {
    const hash = hashText(source);
    rememberInMemory(memoryKey(hash, targetLanguage), translated);
    return {
      sourceHash: hash,
      targetLang: targetLanguage,
      sourceText: source.slice(0, 5000),
      translatedText: translated,
    };
  });

  try {
    await prisma.translationCache.createMany({
      data: rows,
      skipDuplicates: true,
    });
  } catch {
    // Memory cache already updated above; persistence is a bonus.
  }
}
