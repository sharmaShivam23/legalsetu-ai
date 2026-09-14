// lib/ai/usage.ts
import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL;
// Same bounded-failure config as lib/ai/key-pool.ts, and for the same
// reason: this client is hit on the FIRST line of every chat request
// (incrementAndCheckUsage runs before retrieval even starts), so with
// ioredis's default retry strategy a broken/stale REDIS_URL silently
// burns several seconds of the serverless function's own timeout budget
// on every single request before falling back to the in-memory map
// below — indistinguishable from the app just being slow or hanging.
const redis = redisUrl
  ? new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      retryStrategy: () => null,
    })
  : null;
redis?.on("error", () => {});
const memoryUsage = new Map<string, number>();

export interface UsageCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

/**
 * Returns the current date formatted as YYYY-MM-DD in the configured timezone.
 * Used as the suffix for usage keys so they automatically roll over at midnight.
 */
function getTodayKeySuffix(): string {
  const tz = process.env.USAGE_TIMEZONE || "Asia/Kolkata";
  // 'en-CA' gives YYYY-MM-DD format naturally.
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  } catch {
    // Fallback if timezone is invalid
    return new Date().toISOString().split("T")[0];
  }
}

/**
 * Gets the daily limit for a provider from environment variables.
 */
function getDailyLimit(provider: string): number {
  const envKey = `MODEL_DAILY_LIMIT_${provider.toUpperCase()}`;
  const envValue = process.env[envKey];
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed)) return parsed;
  }
  
  // Default limits if not configured
  const defaults: Record<string, number> = {
    gemini: 50,
    openai: 30,
    anthropic: 30,
    groq: 50,
    openrouter: 30,
    opencode: 30,
  };
  
  return defaults[provider.toLowerCase()] ?? 30;
}

/**
 * Checks and increments the user's daily usage for a specific model/provider.
 * Must be called exactly once per user request, regardless of key rotation.
 */
export async function incrementAndCheckUsage(
  userId: string,
  provider: string,
  modelId: string
): Promise<UsageCheckResult> {
  const limit = getDailyLimit(provider);
  const dateSuffix = getTodayKeySuffix();
  const key = `ai_usage:${userId}:${provider}:${modelId}:${dateSuffix}`;

  let currentCount = 0;

  if (redis) {
    try {
      // Atomic increment
      currentCount = await redis.incr(key);
      // Set expiration to 48 hours to ensure cleanup (longer than 1 day to be safe)
      if (currentCount === 1) {
        await redis.expire(key, 48 * 60 * 60);
      }
    } catch {
      // Fallback to memory on redis error
      currentCount = (memoryUsage.get(key) || 0) + 1;
      memoryUsage.set(key, currentCount);
    }
  } else {
    currentCount = (memoryUsage.get(key) || 0) + 1;
    memoryUsage.set(key, currentCount);
  }

  const remaining = Math.max(0, limit - currentCount);
  const allowed = currentCount <= limit;

  return { allowed, remaining, limit };
}

/**
 * Just checks the usage without incrementing it.
 * Used for UI rendering of remaining quotas.
 */
export async function checkUsage(
  userId: string,
  provider: string,
  modelId: string
): Promise<UsageCheckResult> {
  const limit = getDailyLimit(provider);
  const dateSuffix = getTodayKeySuffix();
  const key = `ai_usage:${userId}:${provider}:${modelId}:${dateSuffix}`;

  let currentCount = 0;

  if (redis) {
    try {
      const val = await redis.get(key);
      currentCount = val ? parseInt(val, 10) : 0;
    } catch {
      currentCount = memoryUsage.get(key) || 0;
    }
  } else {
    currentCount = memoryUsage.get(key) || 0;
  }

  const remaining = Math.max(0, limit - currentCount);
  return { allowed: currentCount < limit, remaining, limit };
}
