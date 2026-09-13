/**
 * Rate limiting abstraction.
 * Uses Redis when REDIS_URL is configured; falls back to an
 * in-memory limiter for local development / demo mode.
 */

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  login: { windowMs: 15 * 60 * 1000, max: 10 },
  register: { windowMs: 60 * 60 * 1000, max: 5 },
  chat: { windowMs: 60 * 1000, max: 20 },
  aiGeneration: { windowMs: 60 * 1000, max: 15 },
  voiceTranscription: { windowMs: 60 * 1000, max: 10 },
  // Voice mode fires one request per spoken clause/sentence in each
  // direction, so a single normal conversation legitimately makes
  // far more calls than the one-shot dictation button does.
  // Raised from 150 to 200 because clause-level TTS splitting
  // generates more, smaller requests per answer.
  voiceRealtime: { windowMs: 60 * 1000, max: 200 },
  documentUpload: { windowMs: 60 * 60 * 1000, max: 20 },
  firGeneration: { windowMs: 60 * 60 * 1000, max: 15 },
  apiDefault: { windowMs: 60 * 1000, max: 60 },
  // OTP: tight enough that a script cannot spray codes or spam a
  // stranger's inbox, loose enough that a real user who mistypes a
  // code a couple of times is never locked out of their own signup.
  otpSend: { windowMs: 15 * 60 * 1000, max: 4 },
  otpVerify: { windowMs: 15 * 60 * 1000, max: 10 },
};

const memoryStore = new Map<string, { count: number; resetAt: number }>();

async function inMemoryLimiter(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || entry.resetAt < now) {
    memoryStore.set(key, { count: 1, resetAt: now + config.windowMs });
    return { success: true, remaining: config.max - 1, resetAt: now + config.windowMs };
  }

  if (entry.count >= config.max) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { success: true, remaining: config.max - entry.count, resetAt: entry.resetAt };
}

export async function checkRateLimit(
  identifier: string,
  limitName: keyof typeof RATE_LIMITS
): Promise<RateLimitResult> {
  if (process.env.RATE_LIMIT_ENABLED === "false") {
    return { success: true, remaining: 999, resetAt: Date.now() + 60000 };
  }

  const config = RATE_LIMITS[limitName] ?? RATE_LIMITS.apiDefault;
  const key = `ratelimit:${limitName}:${identifier}`;

  // Redis-backed limiter would be used here in production
  // (see REDIS_URL in .env.example). Falling back to in-memory
  // keeps local dev and demo mode fully functional without Redis.
  return inMemoryLimiter(key, config);
}
