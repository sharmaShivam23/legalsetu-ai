// ==========================================================
// LegalSetu — Sarvam Mayura translation (server side)
// ----------------------------------------------------------
// The primary translation engine, ahead of the chat LLM.
//
// Why a dedicated translator instead of the chat model
// ----------------------------------------------------
// 1. QUOTA. Groq's free tier caps the whole ORGANISATION at
//    8,000 tokens/minute, and every key in this project belongs
//    to one org — so rotating keys buys no extra headroom. When
//    translation ran on that budget, switching language and
//    asking a question competed for the same 8k, and whichever
//    lost got a 429. Mayura is a separate service on a separate
//    quota, so a page translating in the background can no
//    longer starve the chatbot.
//
// 2. QUALITY. Mayura is trained for Indian languages, and
//    mode="formal" produces the register a legal product needs.
//    Asked for the same sentence, the colloquial setting gives
//    "आपको free legal aid का right है" while formal gives
//    "आपको निःशुल्क कानूनी सहायता प्राप्त करने का अधिकार है।"
//    Only the second belongs in a legal-information product.
//
// 3. DETERMINISM. A translation model returns a translation. An
//    LLM asked for numbered JSON sometimes returns prose, a
//    markdown fence, or 39 of the 40 rows requested, and every
//    one of those degrades to untranslated English on screen.
//
// Sarvam takes ONE string per request (1,000 chars), so throughput
// comes from running many small requests concurrently rather than
// from batching — the opposite shape to the LLM path, which is why
// this is a separate module rather than another branch inside it.
//
// Coverage: twelve of this app's sixteen languages, across two Sarvam
// models (see WIDE_MODEL_ONLY below). Maithili, Bhojpuri and Santali
// are on neither, so those are reported as unsupported and the caller
// falls back to the LLM path, which will attempt any language.
// ==========================================================

import { benchSarvamKey, getSarvamKeys, isSarvamConfigured } from "@/lib/voice/sarvam";
import { logger } from "@/lib/logging/logger";

const TRANSLATE_URL = "https://api.sarvam.ai/translate";

/** Mayura's documented per-request ceiling. */
const MAX_CHARS = 1000;

/**
 * Concurrent in-flight requests.
 *
 * One string per call means wall-clock time is
 * (strings / concurrency) x per-request latency, so the temptation is
 * to push this high. Measured against the real account, that backfires:
 * at 24 the API returns "rate_limit_exceeded_error" in bulk, and every
 * string it refuses falls through to the chat model's 8,000 token/minute
 * budget — turning a fast page into a 429 storm that also breaks chat.
 *
 * Sarvam's limiter is tight enough that even sequential requests 400ms
 * apart can trip it while a burst is draining. Eight, combined with the
 * backoff below, translated a 281-string page cleanly where 24 did not.
 * Throughput that arrives is worth more than throughput that 429s.
 */
const MAX_CONCURRENCY = 8;

/** Per-request timeout. A slow translation must not hold a page open. */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * This app's language codes -> Sarvam codes.
 *
 * Note "od-IN" for Odia. Sarvam spells it "od" where this app uses "or",
 * and sending "or-IN" is rejected outright with a 400 rather than being
 * normalised, so the mapping is load-bearing.
 */
const SARVAM_LANGUAGES: Record<string, string> = {
  en: "en-IN",
  hi: "hi-IN",
  bn: "bn-IN",
  gu: "gu-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  mr: "mr-IN",
  or: "od-IN",
  pa: "pa-IN",
  ta: "ta-IN",
  te: "te-IN",
  // Below: rejected by mayura:v1, served by sarvam-translate:v1.
  ur: "ur-IN",
  as: "as-IN",
};

/**
 * Sarvam has two translation models and they do not cover the same
 * languages. mayura:v1 is the better translator for the ten it knows;
 * sarvam-translate:v1 spans all 22 scheduled languages and is the only
 * way to reach Urdu and Assamese. Asking mayura for Urdu returns a 400
 * that names the alternative:
 *
 *   "Language 'ur-IN' is not supported in mayura:v1.
 *    Please switch to sarvam-translate:v1"
 *
 * So: mayura where it is strongest, the wider model where it is the
 * only option. Everything outside both (Maithili, Bhojpuri, Santali)
 * still falls through to the LLM path.
 */
const WIDE_MODEL_ONLY = new Set(["ur", "as"]);

export function sarvamModelFor(appLanguage: string): string {
  const base = (appLanguage ?? "").split("-")[0].toLowerCase();
  return WIDE_MODEL_ONLY.has(base) ? "sarvam-translate:v1" : "mayura:v1";
}

/** This app's language code -> the code Sarvam expects, or null. */
export function sarvamLanguageCode(appLanguage: string): string | null {
  const base = (appLanguage ?? "").split("-")[0].toLowerCase();
  return SARVAM_LANGUAGES[base] ?? null;
}

/**
 * Sarvam's code -> this app's code. The inverse of sarvamLanguageCode,
 * used when STT reports which language it heard. Lives here so the
 * "od" / "or" discrepancy has exactly one home.
 */
export function appLanguageFromSarvam(sarvamCode: string | null | undefined): string | null {
  if (!sarvamCode) return null;
  const base = sarvamCode.split("-")[0].toLowerCase();
  return base === "od" ? "or" : base;
}

export function sarvamSupportsLanguage(appLanguage: string): boolean {
  const base = (appLanguage ?? "").split("-")[0].toLowerCase();
  return Boolean(SARVAM_LANGUAGES[base]);
}

export function canUseSarvamTranslation(appLanguage: string): boolean {
  return isSarvamConfigured() && sarvamSupportsLanguage(appLanguage);
}

/**
 * Statuses that mean "try a different key" rather than "this request is
 * malformed". 402 is the one that matters most here: Sarvam reports an
 * exhausted account with "No credits available", and omitting it meant a
 * single spent key sent every remaining string to the LLM fallback -
 * which shares the chat model's 8,000 token/minute budget and turned a
 * language switch back into a 16-second wait per batch.
 */
function shouldRotate(status: number): boolean {
  return status === 429 || status === 401 || status === 402 || status === 403;
}

/**
 * Rate-limit backoff, in milliseconds, between full passes over the key
 * pool. A 429 here means "too fast", not "out of quota", so waiting is
 * the correct response and giving up is not: every string handed back
 * to the caller lands on the chat model's 8,000 token/minute budget,
 * which is precisely the contention this module exists to avoid. Two
 * short waits recover a burst without making a stuck page wait long.
 */
const RETRY_DELAYS_MS = [700, 1800];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Translates one string. Tries each key in turn, starting at `offset`
 * so concurrent callers spread themselves across the pool instead of
 * all hammering key #1 and rotating in lockstep. If every key is rate
 * limited, backs off and sweeps the pool again.
 */
async function translateSingle(
  text: string,
  target: string,
  model: string,
  offset: number
): Promise<string | null> {
  const keys = getSarvamKeys();
  if (keys.length === 0) return null;

  // output_script / numerals_format are transliteration controls and
  // exist only on mayura:v1. Sending them to sarvam-translate:v1 is a
  // hard 400 ("Transliteration is not supported in sarvam-translate:v1"),
  // which silently cost every Urdu and Assamese string on the first
  // attempt — they all fell through to the LLM instead.
  const isMayura = model === "mayura:v1";
  const body = JSON.stringify({
    input: text.slice(0, MAX_CHARS),
    source_language_code: "en-IN",
    target_language_code: target,
    model,
    mode: process.env.SARVAM_TRANSLATE_MODE || "formal",
    ...(isMayura ? { output_script: "fully-native", numerals_format: "international" } : {}),
  });

  for (let pass = 0; pass <= RETRY_DELAYS_MS.length; pass++) {
    let rateLimited = false;

    for (let attempt = 0; attempt < keys.length; attempt++) {
      const key = keys[(offset + attempt) % keys.length];
      let res: Response;
      try {
        res = await fetch(TRANSLATE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "api-subscription-key": key },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        // Network failure or timeout: another key will not help.
        return null;
      }

      if (res.ok) {
        const json = (await res.json().catch(() => null)) as { translated_text?: string } | null;
        const translated = json?.translated_text?.trim();
        return translated ? translated : null;
      }

      // Being told to slow down is worth waiting out; an exhausted or
      // revoked key is worth setting aside so the next of the 280
      // strings on this page does not rediscover it.
      if (res.status === 429) {
        rateLimited = true;
        benchSarvamKey(key, res.status);
      } else if (shouldRotate(res.status)) {
        benchSarvamKey(key, res.status);
      } else {
        return null;
      }
    }

    if (!rateLimited || pass === RETRY_DELAYS_MS.length) break;
    await sleep(RETRY_DELAYS_MS[pass]);
  }

  return null;
}

export interface SarvamTranslationResult {
  /** sourceText -> translatedText, only for strings that succeeded. */
  translations: Map<string, string>;
  /** Strings Sarvam could not translate; the caller should fall back. */
  failed: string[];
}

/**
 * Translates many strings concurrently, in waves of MAX_CONCURRENCY.
 * Never throws: anything that fails comes back in `failed` so the
 * caller can route it to the LLM path rather than losing it.
 */
export async function sarvamTranslateMany(
  texts: string[],
  appLanguage: string
): Promise<SarvamTranslationResult> {
  const translations = new Map<string, string>();
  const failed: string[] = [];

  const base = (appLanguage ?? "").split("-")[0].toLowerCase();
  const target = SARVAM_LANGUAGES[base];
  if (!target || texts.length === 0) {
    return { translations, failed: [...texts] };
  }
  const model = sarvamModelFor(base);

  const started = Date.now();

  for (let i = 0; i < texts.length; i += MAX_CONCURRENCY) {
    const wave = texts.slice(i, i + MAX_CONCURRENCY);
    const settled = await Promise.all(
      wave.map((text, slot) => translateSingle(text, target, model, i + slot))
    );
    settled.forEach((translated, slot) => {
      const source = wave[slot];
      if (translated) translations.set(source, translated);
      else failed.push(source);
    });
  }

  logger.info("Sarvam translation batch", {
    targetLanguage: target,
    model,
    requested: texts.length,
    translated: translations.size,
    failed: failed.length,
    latencyMs: Date.now() - started,
  });

  return { translations, failed };
}
