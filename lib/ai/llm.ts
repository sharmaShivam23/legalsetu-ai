import { getAIProvider, getFallbackChatProviders } from "./provider";
import type { ChatMessage } from "./provider";
import { isAuthError } from "./key-pool";
import { logger } from "@/lib/logging/logger";

/**
 * Free tiers run out. Groq caps tokens-per-day and then returns 429 on
 * every request; a key can also be revoked, or the network can blip
 * mid-stream. When that happens the app must not simply stop answering.
 *
 * So both helpers below try the configured provider first and, if it
 * fails BEFORE producing any output, transparently retry once on a
 * different provider (see getFallbackChatProvider). The "before any
 * output" condition matters: once tokens have reached the user, this
 * restarts nothing, because switching mid-answer would splice two
 * different replies together.
 */

/**
 * "The model is busy right now", as opposed to "this key is finished".
 *
 * Quota exhaustion (429) is handled a layer down by key rotation, and a
 * revoked key is permanent — but a 503/overload is neither. It clears on
 * its own in a second or two, so switching providers over one is throwing
 * away a request that was about to succeed. That matters most when the
 * OTHER provider is unavailable: a transient Gemini blip was turning into
 * a completely empty answer because the fallback key was dead.
 */
function isTransientError(err: unknown): boolean {
  const message = String((err as any)?.message ?? err).toLowerCase();
  const cause = String((err as any)?.cause?.code ?? "").toLowerCase();

  // Server-side "busy, try again".
  if (
    message.includes('"code":503') ||
    message.includes('"code":500') ||
    message.includes("unavailable") ||
    message.includes("overloaded") ||
    message.includes("high demand") ||
    message.includes("internal error")
  ) {
    return true;
  }

  // Network-level failures. On a weak or congested connection these are
  // routine and usually succeed on a second attempt, so they deserve the
  // same treatment as an overloaded model rather than being mistaken for
  // "this provider is down" and burning the cross-provider fallback.
  return (
    message.includes("fetch failed") ||
    message.includes("socket") ||
    message.includes("timeout") ||
    cause.includes("econnreset") ||
    cause.includes("etimedout") ||
    cause.includes("econnrefused") ||
    cause.includes("enotfound") ||
    cause.includes("und_err")
  );
}

const TRANSIENT_RETRY_DELAY_MS = 1200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Failures that will not fix themselves in the next few minutes: an
 * account with no credits, a key or project the provider has blocked, a
 * model the provider refuses. Retrying these on every single message is
 * what made each answer walk Gemini -> OpenAI -> Claude -> Groq and pay
 * for two doomed round-trips before anything useful happened.
 */
function isPermanentFailure(err: unknown): boolean {
  if (isAuthError(err)) return true;
  const message = String((err as any)?.message ?? err).toLowerCase();
  return (
    message.includes("no credits") ||
    message.includes("credit balance") ||
    message.includes("insufficient balance") ||
    message.includes("insufficient_quota") ||
    message.includes("billing") ||
    message.includes("free tier can only be used") ||
    message.includes("not a valid model") ||
    message.includes("is not supported")
  );
}

const PROVIDER_BENCH_MS = 15 * 60 * 1000;
const benchedProviders = new Map<string, number>();

function benchIfPermanent(name: string, err: unknown) {
  if (!isPermanentFailure(err)) return;
  benchedProviders.set(name, Date.now() + PROVIDER_BENCH_MS);
  lastPermanentError.set(name, err);
}

function isProviderBenched(name: string): boolean {
  const until = benchedProviders.get(name);
  if (until === undefined) return false;
  if (Date.now() < until) return true;
  benchedProviders.delete(name);
  return false;
}

/** Keeps the original reason so the user still sees e.g. "no credits". */
const lastPermanentError = new Map<string, unknown>();

function benchedError(name: string): unknown {
  return lastPermanentError.get(name) ?? new Error(`${name} is temporarily unavailable`);
}

function logFailure(failed: string, err: unknown, next?: string) {
  logger.warn("AI provider failed", {
    failed,
    next: next ?? null,
    errorType: String((err as any)?.message ?? err).slice(0, 200),
  });
}

async function fallbacksFor(primaryName: string) {
  return (await getFallbackChatProviders(primaryName)).filter((p) => !isProviderBenched(p.name));
}

export async function generateCompletion(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number; modelId?: string }
): Promise<string> {
  const provider = await getAIProvider(opts?.modelId);

  try {
    if (isProviderBenched(provider.name)) throw benchedError(provider.name);
    return await provider.complete({ messages, ...opts });
  } catch (err) {
    if (isTransientError(err)) {
      logger.warn("AI provider hit a transient error, retrying it", {
        provider: provider.name,
        errorType: String(err).slice(0, 160),
      });
      await sleep(TRANSIENT_RETRY_DELAY_MS);
      try {
        return await provider.complete({ messages, ...opts });
      } catch {
        // Still failing — fall through to the other providers.
      }
    }

    benchIfPermanent(provider.name, err);
    const fallbacks = await fallbacksFor(provider.name);
    logFailure(provider.name, err, fallbacks[0]?.name);

    for (let i = 0; i < fallbacks.length; i++) {
      try {
        return await fallbacks[i].complete({ messages, ...opts });
      } catch (fallbackErr) {
        benchIfPermanent(fallbacks[i].name, fallbackErr);
        logFailure(fallbacks[i].name, fallbackErr, fallbacks[i + 1]?.name);
      }
    }
    // Surface the chosen model's own failure — that is the one the user
    // picked, and its message is the useful one.
    throw err;
  }
}

export async function* streamCompletion(
  messages: ChatMessage[],
  opts?: { temperature?: number; maxTokens?: number; modelId?: string }
) {
  const provider = await getAIProvider(opts?.modelId);
  let emittedAnything = false;

  try {
    if (isProviderBenched(provider.name)) throw benchedError(provider.name);
    for await (const chunk of provider.streamComplete({ messages, ...opts })) {
      if (chunk.delta) emittedAnything = true;
      yield chunk;
    }
    return;
  } catch (err) {
    if (emittedAnything) throw err;

    if (isTransientError(err)) {
      logger.warn("AI provider hit a transient error, retrying the stream", {
        provider: provider.name,
        errorType: String(err).slice(0, 160),
      });
      await sleep(TRANSIENT_RETRY_DELAY_MS);

      let retryEmitted = false;
      try {
        for await (const chunk of provider.streamComplete({ messages, ...opts })) {
          if (chunk.delta) retryEmitted = true;
          yield chunk;
        }
        return;
      } catch (retryErr) {
        if (retryEmitted) throw retryErr;
      }
    }

    benchIfPermanent(provider.name, err);
    const fallbacks = await fallbacksFor(provider.name);
    logFailure(provider.name, err, fallbacks[0]?.name);

    for (let i = 0; i < fallbacks.length; i++) {
      const fallback = fallbacks[i];
      let fallbackEmitted = false;
      try {
        // Tell the caller a different provider is answering, so the user
        // who picked a model isn't silently handed another one.
        yield { delta: "", done: false, servedBy: fallback.name };
        for await (const chunk of fallback.streamComplete({ messages, ...opts })) {
          if (chunk.delta) fallbackEmitted = true;
          yield chunk;
        }
        return;
      } catch (fallbackErr) {
        // Same rule as the primary: once text is on screen, never start
        // a second provider's reply after it.
        if (fallbackEmitted) throw fallbackErr;
        benchIfPermanent(fallback.name, fallbackErr);
        logFailure(fallback.name, fallbackErr, fallbacks[i + 1]?.name);
      }
    }
    throw err;
  }
}
