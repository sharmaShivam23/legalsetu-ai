// ==========================================================
// LegalSetu — Gemini API key pool
// ----------------------------------------------------------
// Free-tier Gemini keys carry a daily quota. When it runs out
// every call returns 429, and because embeddings are what turn
// a question into a vector, retrieval stops finding anything —
// the assistant silently degrades into an ungrounded chatbot,
// which is the exact failure mode this project exists to avoid.
//
// Several keys can be configured (GEMINI_API_KEY plus
// GEMINI_API_KEY_1..N). They have independent quotas, so when
// one is exhausted the pool moves to the next and keeps going.
// A key marked exhausted is retried after a cooldown, since
// Google's quotas reset on their own schedule.
// ==========================================================

/** Reads every configured key, in priority order, without duplicates. */
export function getGeminiKeys(): string[] {
  const keys: string[] = [];

  const push = (value?: string) => {
    const key = value?.trim();
    if (key && !keys.includes(key)) keys.push(key);
  };

  push(process.env.GEMINI_API_KEY);
  // GEMINI_API_KEY_1 ... _10
  for (let i = 1; i <= 10; i++) push(process.env[`GEMINI_API_KEY_${i}`]);

  return keys;
}

/** True when the error is a quota/rate-limit rejection worth rotating on. */
export function isQuotaError(err: unknown): boolean {
  const message = String((err as any)?.message ?? err);
  return (
    message.includes('"code":429') ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.toLowerCase().includes("exceeded your current quota") ||
    message.toLowerCase().includes("rate limit")
  );
}

/** How long a key stays benched after reporting quota exhaustion. */
const COOLDOWN_MS = 10 * 60 * 1000;

/** Keys currently believed exhausted -> when they may be retried. */
const benched = new Map<string, number>();

function isAvailable(key: string): boolean {
  const until = benched.get(key);
  if (until === undefined) return true;
  if (Date.now() >= until) {
    benched.delete(key);
    return true;
  }
  return false;
}

export function markKeyExhausted(key: string): void {
  benched.set(key, Date.now() + COOLDOWN_MS);
}

/** Keys worth trying right now, best-first. */
export function availableGeminiKeys(): string[] {
  const all = getGeminiKeys();
  const usable = all.filter(isAvailable);
  // All benched — the cooldown is a heuristic, not a fact, so rather
  // than fail outright, try everything again in order.
  return usable.length > 0 ? usable : all;
}

/**
 * Runs `attempt` against each usable key until one succeeds.
 *
 * Rotates only on quota errors: any other failure (bad request,
 * model not found, network) is the caller's problem and is
 * rethrown immediately rather than silently burning every key.
 */
export async function withKeyRotation<T>(
  attempt: (apiKey: string) => Promise<T>
): Promise<T> {
  const keys = availableGeminiKeys();
  if (keys.length === 0) throw new Error("No Gemini API key is configured.");

  let lastError: unknown;

  for (const key of keys) {
    try {
      return await attempt(key);
    } catch (err) {
      lastError = err;
      if (!isQuotaError(err)) throw err;
      markKeyExhausted(key);
    }
  }

  throw lastError;
}
