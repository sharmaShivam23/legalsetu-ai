// lib/ai/errors.ts

export type AIErrorCode = 
  | "RATE_LIMIT"
  | "QUOTA_EXCEEDED"
  | "DAILY_USER_LIMIT"
  | "AUTH_ERROR"
  | "BILLING_REQUIRED"
  | "MODEL_UNAVAILABLE"
  | "TIMEOUT"
  | "PROVIDER_ERROR"
  | "INVALID_REQUEST"
  | "UNKNOWN_ERROR";

export class AIError extends Error {
  constructor(
    public code: AIErrorCode,
    public providerName: string,
    public userMessage: string,
    public originalError?: unknown
  ) {
    super(`[${code}] ${providerName}: ${userMessage}`);
    this.name = "AIError";
  }
}

/**
 * Per-request ceiling for every vendor SDK client. The SDK defaults were
 * a 10-minute timeout plus 2 automatic retries that honour a 429's
 * `retry-after` header — so a rate-limited key sat waiting (often 30-60s)
 * instead of failing fast and letting key rotation / provider fallback
 * move on. That wait was the "very late response" users saw.
 */
export const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS) || 45_000;

/** SDK-level retries are disabled: lib/ai/key-pool.ts and lib/ai/llm.ts
 *  already retry, and they do it on a DIFFERENT key or provider. */
export const AI_SDK_CLIENT_OPTIONS = { timeout: AI_REQUEST_TIMEOUT_MS, maxRetries: 0 } as const;

/**
 * Returns a safe, user-friendly message for any error.
 * Never exposes raw API errors or keys to the frontend.
 */
export function getSanitizedErrorMessage(error: unknown): { code: string; message: string } {
  if (error instanceof AIError) {
    return { code: error.code, message: error.userMessage };
  }

  // Handle standard HTTP errors if they leaked through
  const msg = String((error as any)?.message ?? error).toLowerCase();

  // Checked before the generic 429 branch: OpenAI reports an empty
  // account as a 429, which would otherwise read as "try again in a
  // moment" — advice that can never work.
  if (
    msg.includes("no credits") ||
    msg.includes("credit balance") ||
    msg.includes("insufficient balance") ||
    msg.includes("insufficient_quota") ||
    msg.includes("billing")
  ) {
    return {
      code: "BILLING_REQUIRED",
      message: "This model's API account has no credits left, so it can't answer right now. Please choose another model.",
    };
  }

  if (msg.includes("free tier can only be used")) {
    return {
      code: "MODEL_UNAVAILABLE",
      message: "This model's free tier can't be used from LegalSetu. Please choose another model.",
    };
  }

  if (msg.includes("not a valid model") || msg.includes("is not found for api version") || msg.includes("does not exist")) {
    return {
      code: "MODEL_UNAVAILABLE",
      message: "This model isn't available at the moment. Please choose another model.",
    };
  }

  if (msg.includes("invalid api key") || msg.includes("api key not valid") || msg.includes("401")) {
    return {
      code: "AUTH_ERROR",
      message: "LegalSetu couldn't sign in to this model's provider. Please choose another model.",
    };
  }

  if (msg.includes("empty response")) {
    return {
      code: "PROVIDER_ERROR",
      message: "The model didn't return an answer this time. Please try again or choose another model.",
    };
  }

  if (msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests")) {
    return { 
      code: "RATE_LIMIT", 
      message: "The AI provider is currently receiving too many requests. Please try again in a moment or switch to another model." 
    };
  }

  if (msg.includes("quota") || msg.includes("resource_exhausted") || msg.includes("insufficient_quota")) {
    return {
      code: "QUOTA_EXCEEDED",
      message: "The API limits for this model have been reached. Please switch to another model."
    };
  }

  if (msg.includes("timeout") || msg.includes("aborted")) {
    return {
      code: "TIMEOUT",
      message: "The AI model took too long to respond. Please try again."
    };
  }

  // Generic fallback that hides all technical details
  return {
    code: "UNKNOWN_ERROR",
    message: "An unexpected error occurred while communicating with the AI. Please try again or switch to another model."
  };
}

/** 
 * True when the error is a quota/rate-limit rejection worth rotating keys on.
 */
export function isQuotaError(err: unknown): boolean {
  if (err instanceof AIError) {
    return err.code === "QUOTA_EXCEEDED" || err.code === "RATE_LIMIT";
  }
  const message = String((err as any)?.message ?? err).toLowerCase();
  return (
    message.includes('"code":429') ||
    message.includes("resource_exhausted") ||
    message.includes("insufficient_quota") ||
    message.includes("exceeded your current quota") ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  );
}

/**
 * True when the error is a timeout.
 */
export function isTimeoutError(err: unknown): boolean {
  if (err instanceof AIError) return err.code === "TIMEOUT";
  const message = String((err as any)?.message ?? err).toLowerCase();
  return message.includes("timeout") || message.includes("aborted");
}
