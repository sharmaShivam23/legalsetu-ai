// ==========================================================
// LegalSetu — Runtime Translation Engine
// ----------------------------------------------------------
// Translates arbitrary strings into any supported language at
// request time. No locale files, no build step, no manual
// string extraction — anything rendered anywhere in the app
// can be passed through here.
//
// Key design points:
//  - MANY strings per model call (numbered JSON protocol),
//    so translating a whole page is one round trip, not 80.
//  - Legal citations are masked before the call and restored
//    after (lib/i18n/glossary.ts), so section numbers and act
//    names cannot be corrupted by the model.
//  - Cache-first (lib/i18n/cache.ts): the model is only asked
//    about strings nobody has ever translated before.
//  - Order-preserving: output[i] always corresponds to
//    input[i], even with duplicates, blanks and cache hits
//    interleaved.
// ==========================================================

import { getAIProvider } from "@/lib/ai/provider";
import { generateCompletion } from "@/lib/ai/llm";
import { canUseSarvamTranslation, sarvamTranslateMany } from "./sarvam-translate";
import { logger } from "@/lib/logging/logger";
import { lookupCached, storeTranslations } from "./cache";
import {
  isTranslatable,
  maskProtectedTerms,
  restoreProtectedTerms,
} from "./glossary";
import { DEFAULT_LANGUAGE, languageName, normalizeLanguage } from "./languages";

/** Strings sent to the model in a single call. */
const BATCH_SIZE = 40;

/**
 * How many LLM batches may be in flight at once.
 *
 * Two, not four. This is the FALLBACK path now that Sarvam handles the
 * common languages, and it shares a budget with chat: Groq's free tier
 * caps the whole organisation at 8,000 tokens/minute (every key in this
 * project belongs to one org, so rotating keys buys no headroom). A
 * 40-string batch asks for roughly 2,200 tokens, so four concurrent
 * batches exceed the minute budget on their own and return 429 for
 * everything, including whatever the user is asking the chatbot.
 */
const MAX_CONCURRENT_BATCHES = 2;

/**
 * Marker string that lets the mock/demo provider recognise a
 * translation request and answer with the right JSON shape
 * (see lib/ai/mock.ts). Harmless for real providers.
 */
export const TRANSLATION_BATCH_MARKER = "LEGALSETU_TRANSLATION_BATCH";

function buildBatchPrompt(items: string[], targetLanguage: string): string {
  const target = languageName(targetLanguage);
  const numbered = items
    .map((text, i) => `${i} >> ${text.replace(/\n/g, "\\n")}`)
    .join("\n");

  return `${TRANSLATION_BATCH_MARKER}
Translate each numbered line below into ${target}.

Rules:
- Each line is formatted as: <index> >> <text>. Translate ONLY the text after ">>".
- Never output the index or the ">>" marker in your translation.
- Preserve every {{n}} placeholder EXACTLY as written. They are legal citations, act names, URLs and product names. Never translate, reorder, renumber or remove them.
- Keep the tone plain, simple and respectful — the reader may be using a legal system for the first time.
- Preserve any leading/trailing punctuation and capitalisation style.
- Do NOT add explanations, notes, romanisation or alternatives. Return the translation only.
- If a line is already in ${target}, return it unchanged.
- Return exactly ${items.length} translations, in the same order.

Return ONLY valid JSON in this exact shape:
{"translations":[{"i":0,"t":"..."}]}

--- LINES ---
${numbered}
--- END ---`;
}

/**
 * Parses the model's JSON reply into an index->translation map.
 * Tolerates markdown fences, a bare array, or an object wrapper,
 * because a malformed reply must degrade to "keep the original"
 * rather than throw the whole page's translation away.
 */
function parseBatchResponse(raw: string, expected: number): Map<number, string> {
  const result = new Map<number, string>();
  if (!raw) return result;

  let body = raw.trim();
  // Strip ```json ... ``` fences if the model added them.
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) body = fenced[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return result;
  }

  const rows: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as any)?.translations)
      ? (parsed as any).translations
      : [];

  rows.forEach((row, position) => {
    if (typeof row === "string") {
      // Bare array form: ["...", "..."] — position is the index.
      if (position < expected) result.set(position, row);
      return;
    }
    if (row && typeof row === "object") {
      const index = Number((row as any).i ?? (row as any).index ?? position);
      const text = (row as any).t ?? (row as any).text ?? (row as any).translation;
      if (Number.isInteger(index) && index >= 0 && index < expected && typeof text === "string") {
        result.set(index, text);
      }
    }
  });

  return result;
}

/** Translates one batch of already-deduplicated, translatable strings. */
async function translateChunk(
  items: string[],
  targetLanguage: string
): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  // Mask citations before the model ever sees the text.
  const masked = items.map((text) => maskProtectedTerms(text));
  const prompt = buildBatchPrompt(
    masked.map((m) => m.masked),
    targetLanguage
  );

  // Routed through generateCompletion, NOT provider.complete(), so that a
  // dead or blocked primary provider falls through to the next configured
  // one exactly as chat does. Calling the raw provider here meant a single
  // blocked API project silently disabled translation for the whole app:
  // every batch threw, every batch was caught, and every page quietly
  // stayed in English.
  const raw = await generateCompletion(
    [
      {
        role: "system",
        content:
          "You are a precise translation engine for an Indian legal-information platform. You output JSON only.",
      },
      { role: "user", content: prompt },
    ],
    { temperature: 0, maxTokens: 8000 }
  );

  const parsed = parseBatchResponse(raw, items.length);

  items.forEach((source, index) => {
    const translated = parsed.get(index);
    if (typeof translated !== "string" || !translated.trim()) return;
    // Put the real citations back.
    out.set(source, restoreProtectedTerms(translated, masked[index].tokens).replace(/\\n/g, "\n"));
  });

  return out;
}

export interface BatchTranslationResult {
  translations: string[];
  /**
   * True when at least one batch could not be translated (provider
   * down, bad API key, quota exhausted). The caller gets usable
   * English text back, but the UI should say so rather than leave
   * the user wondering why nothing changed.
   */
  degraded: boolean;
}

/**
 * Translates a list of strings, preserving order and length.
 * Anything that cannot be translated (blank, numeric, model
 * failure) comes back as the original string.
 */
export async function translateBatchDetailed(
  texts: string[],
  targetLanguage: string
): Promise<BatchTranslationResult> {
  const target = normalizeLanguage(targetLanguage);

  // English is the source language of this codebase — nothing to do.
  if (target === DEFAULT_LANGUAGE) return { translations: texts, degraded: false };
  if (texts.length === 0) return { translations: [], degraded: false };

  // Unique, meaningful strings only — a page usually repeats many labels.
  const unique = Array.from(
    new Set(texts.filter((t) => typeof t === "string" && isTranslatable(t)))
  );
  if (unique.length === 0) return { translations: texts, degraded: false };

  let degraded = false;
  // A demo/mock provider cannot really translate. Returning invented
  // "[MARATHI DEMO] ..." strings would deface every page and look
  // broken, so we keep clean English and report the degraded state —
  // the UI then tells the user an API key is needed.
  const provider = await getAIProvider();
  if (provider.isDemo) {
    return { translations: texts, degraded: true };
  }

  const resolved = new Map<string, string>();

  const { hits, misses } = await lookupCached(unique, target);
  hits.forEach((value, key) => resolved.set(key, value));

  if (misses.length > 0) {
    const fresh: { source: string; translated: string }[] = [];

    // ---- Tier 1: Sarvam Mayura -------------------------------------
    // A dedicated translation model, on a quota of its own. This is
    // what keeps a page translating in the background from eating the
    // chat model's tokens-per-minute budget and 429-ing the chatbot
    // mid-answer. Anything Mayura cannot take (Urdu, Assamese,
    // Maithili, Bhojpuri, Santali, or a transient failure) drops
    // through to the LLM path below rather than being lost.
    let pending = misses;
    if (canUseSarvamTranslation(target)) {
      try {
        const { translations: viaSarvam, failed } = await sarvamTranslateMany(misses, target);
        viaSarvam.forEach((value, key) => {
          resolved.set(key, value);
          fresh.push({ source: key, translated: value });
        });
        pending = failed;
      } catch (err) {
        // Never fatal: the LLM path can still serve every string.
        logger.warn("Sarvam translation unavailable, using the model instead", {
          targetLanguage: target,
          errorType: String(err).slice(0, 160),
        });
      }
    }

    // ---- Tier 2: the chat LLM --------------------------------------
    const batches: string[][] = [];
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      batches.push(pending.slice(i, i + BATCH_SIZE));
    }

    // Batches run CONCURRENTLY, in waves of MAX_CONCURRENT_BATCHES.
    //
    // They used to run one after another, which is what made switching
    // language feel broken: a full page is ~150 strings, so four model
    // calls of 40, each generating a few thousand tokens of Devanagari,
    // strictly in series. Four x ~25s is the better part of two minutes
    // of staring at English text.
    //
    // Concurrency is capped rather than unbounded because every batch
    // shares one provider's per-minute request limit; firing twenty at
    // once would trade a slow page for a 429 and a page that never
    // translates at all.
    for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
      const wave = batches.slice(i, i + MAX_CONCURRENT_BATCHES);

      const settled = await Promise.all(
        wave.map(async (chunk) => {
          try {
            return { chunk, translated: await translateChunk(chunk, target) };
          } catch (err) {
            // Partial failure must not break the page — untranslated
            // strings simply stay in English.
            logger.warn("Translation batch failed", {
              targetLanguage: target,
              batchSize: chunk.length,
              errorType: String(err),
            });
            return { chunk, translated: null };
          }
        })
      );

      for (const { translated } of settled) {
        if (translated === null) {
          degraded = true;
          continue;
        }
        translated.forEach((value, key) => {
          resolved.set(key, value);
          fresh.push({ source: key, translated: value });
        });
      }
    }

    if (fresh.length > 0) await storeTranslations(fresh, target);
  }

  return {
    translations: texts.map((text) => resolved.get(text) ?? text),
    degraded,
  };
}

/** Order-preserving translation; failures fall back to the original text. */
export async function translateBatch(
  texts: string[],
  targetLanguage: string
): Promise<string[]> {
  const { translations } = await translateBatchDetailed(texts, targetLanguage);
  return translations;
}

/** Single-string convenience wrapper. */
export async function translateOne(
  text: string,
  targetLanguage: string
): Promise<string> {
  const [result] = await translateBatch([text], targetLanguage);
  return result ?? text;
}

/**
 * Translates chosen string fields of API payload objects — used
 * where backend records (case titles, document summaries) are
 * returned to a client running in a non-English language.
 */
export async function translateRecords<T extends Record<string, any>>(
  records: T[],
  fields: (keyof T)[],
  targetLanguage: string
): Promise<T[]> {
  const target = normalizeLanguage(targetLanguage);
  if (target === DEFAULT_LANGUAGE || records.length === 0) return records;

  const source: string[] = [];
  for (const record of records) {
    for (const field of fields) {
      const value = record[field];
      if (typeof value === "string" && value.trim()) source.push(value);
    }
  }
  if (source.length === 0) return records;

  const translated = await translateBatch(source, target);
  const map = new Map<string, string>();
  source.forEach((text, i) => map.set(text, translated[i]));

  return records.map((record) => {
    const copy: Record<string, any> = { ...record };
    for (const field of fields) {
      const value = record[field];
      if (typeof value === "string" && map.has(value)) {
        copy[field as string] = map.get(value);
      }
    }
    return copy as T;
  });
}
