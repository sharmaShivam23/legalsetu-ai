// lib/ai/key-pool.ts
import { Redis } from "ioredis";
import { isQuotaError } from "./errors";

const redisUrl = process.env.REDIS_URL;
const redis = redisUrl ? new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null;
const memoryBenched = new Map<string, number>();

/** A quota/rate limit usually clears within the hour on free tiers. */
const QUOTA_COOLDOWN_MS = 10 * 60 * 1000;
/** A revoked or blocked key does not come back on its own. */
const REJECTED_COOLDOWN_MS = 60 * 60 * 1000;

/** Bench entries for every scope share this marker. */
const ALL_SCOPES = "*";

/**
 * Reads every configured key for a given prefix (e.g., GEMINI_API_KEY).
 * Includes the base prefix, and prefix_1 to prefix_10.
 */
export function getKeysForProvider(prefix: string): string[] {
  const keys: string[] = [];

  const push = (value?: string) => {
    const key = value?.trim();
    if (key && !keys.includes(key)) keys.push(key);
  };

  push(process.env[prefix]);
  for (let i = 1; i <= 10; i++) push(process.env[`${prefix}_${i}`]);

  return keys;
}

const benchId = (key: string, scope: string) => `exhausted_key:${scope}:${key}`;

/**
 * Benches a key. `scope` is normally the model name: free-tier quotas
 * are counted per model, so a key that has used up gemini-flash-latest
 * for the day still works for embeddings or Flash-Lite and must not be
 * benched for those too.
 */
export async function markKeyExhausted(
  key: string,
  scope: string = ALL_SCOPES,
  cooldownMs: number = QUOTA_COOLDOWN_MS
): Promise<void> {
  const id = benchId(key, scope);
  memoryBenched.set(id, Date.now() + cooldownMs);
  if (redis) {
    await redis.set(id, "1", "PX", cooldownMs).catch(() => {});
  }
}

async function isBenched(id: string): Promise<boolean> {
  const until = memoryBenched.get(id);
  if (until !== undefined) {
    if (Date.now() < until) return true;
    memoryBenched.delete(id);
  }
  if (redis) {
    try {
      return (await redis.exists(id)) === 1;
    } catch {
      // Redis unavailable — the in-memory record above is authoritative.
    }
  }
  return false;
}

export async function isKeyAvailable(key: string, scope?: string): Promise<boolean> {
  if (await isBenched(benchId(key, ALL_SCOPES))) return false;
  if (scope && (await isBenched(benchId(key, scope)))) return false;
  return true;
}

export async function getAvailableKeys(prefix: string, scope?: string): Promise<string[]> {
  const allKeys = getKeysForProvider(prefix);
  const usable: string[] = [];

  for (const key of allKeys) {
    if (await isKeyAvailable(key, scope)) usable.push(key);
  }

  // All benched — the cooldown is a heuristic, not a fact, so rather
  // than fail outright, try everything again in order.
  return usable.length > 0 ? usable : allKeys;
}

/**
 * A key the provider refuses outright — revoked, mistyped, or from a
 * blocked project ("Your project has been denied access"). Retrying it is
 * pointless, but the NEXT key in the pool may be perfectly good:
 * GROQ_API_KEY was dead while GROQ_API_KEY_1..4 all worked.
 */
export function isAuthError(err: unknown): boolean {
  const status = (err as any)?.status;
  if (status === 401 || status === 403) return true;
  const message = String((err as any)?.message ?? err).toLowerCase();
  return (
    message.includes("invalid api key") ||
    message.includes("invalid_api_key") ||
    message.includes("api key not valid") ||
    message.includes("incorrect api key") ||
    message.includes("permission_denied") ||
    message.includes("denied access")
  );
}

/**
 * Runs `attempt` against each usable key until one succeeds.
 * Rotates on quota/rate-limit errors (benched for `scope` only) and on
 * rejected keys (benched for everything).
 */
export async function withKeyRotation<T>(
  prefix: string,
  attempt: (apiKey: string) => Promise<T>,
  scope?: string
): Promise<T> {
  const keys = await getAvailableKeys(prefix, scope);
  if (keys.length === 0) {
    throw new Error(`No API keys configured for provider prefix: ${prefix}`);
  }

  let lastError: unknown;

  for (const key of keys) {
    try {
      return await attempt(key);
    } catch (err) {
      lastError = err;
      if (isAuthError(err)) {
        await markKeyExhausted(key, ALL_SCOPES, REJECTED_COOLDOWN_MS);
        continue;
      }
      if (isQuotaError(err)) {
        await markKeyExhausted(key, scope ?? ALL_SCOPES, QUOTA_COOLDOWN_MS);
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}
