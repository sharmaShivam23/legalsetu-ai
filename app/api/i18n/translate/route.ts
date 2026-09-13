// ==========================================================
// LegalSetu — Batch translation endpoint
// ----------------------------------------------------------
// The client sends every visible string on the page in ONE
// request; the server answers with translations in the same
// order. Cache hits are resolved without touching the model.
//
// Deliberately unauthenticated: the public landing page must
// translate too. Protected by IP rate limiting and hard caps
// on batch size and per-string length.
// ==========================================================

import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { translateBatchDetailed } from "@/lib/i18n/translator";
import { isSupportedLanguage, DEFAULT_LANGUAGE } from "@/lib/i18n/languages";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_STRINGS = 200;
const MAX_CHARS = 2000;

const batchSchema = z.object({
  texts: z.array(z.string().max(MAX_CHARS)).min(1).max(MAX_STRINGS),
  target: z.string().min(2).max(10),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anonymous";
  const rateLimit = await checkRateLimit(ip, "apiDefault");
  if (!rateLimit.success) {
    return apiError("RATE_LIMITED", "Too many translation requests.", 429);
  }

  const body = await req.json().catch(() => null);
  const parsed = batchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid translation request.", 422);
  }

  const { texts, target } = parsed.data;

  if (!isSupportedLanguage(target)) {
    return apiError("UNSUPPORTED_LANGUAGE", "That language is not supported.", 422);
  }

  // English is the source language — nothing to do, and no model call.
  if (target === DEFAULT_LANGUAGE) {
    return apiSuccess({ translations: texts, target });
  }

  const start = Date.now();
  try {
    const { translations, degraded } = await translateBatchDetailed(texts, target);
    logger.info("Batch translation completed", {
      target,
      count: texts.length,
      degraded,
      latencyMs: Date.now() - start,
    });
    // `degraded` tells the client the provider failed, so it can say so
    // instead of leaving the user staring at unchanged English text.
    return apiSuccess({ translations, target, degraded });
  } catch (err) {
    logger.error("Batch translation failed", {
      target,
      errorType: String(err),
    });
    // Degrade to the original strings rather than breaking the page.
    return apiSuccess({ translations: texts, target, degraded: true });
  }
}
