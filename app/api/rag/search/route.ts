import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/utils/api-response";
import { ragSearchSchema } from "@/lib/validation/schemas";
import { retrieveRelevantChunks } from "@/lib/rag/retriever";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logging/logger";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anonymous";
  const rateLimit = await checkRateLimit(ip, "apiDefault");
  if (!rateLimit.success) {
    return apiError("RATE_LIMITED", "Too many requests. Please slow down.", 429);
  }

  const body = await req.json().catch(() => null);
  const parsed = ragSearchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Invalid search request.", 422);
  }

  const start = Date.now();
  try {
    const result = await retrieveRelevantChunks(parsed.data.query, {
      jurisdiction: parsed.data.jurisdiction,
      language: parsed.data.language,
      sourceType: parsed.data.sourceType,
    });

    logger.info("RAG search completed", {
      retrievalLatencyMs: Date.now() - start,
      resultCount: result.chunks.length,
    });

    return apiSuccess(result);
  } catch (err) {
    logger.error("RAG search failed", { errorType: String(err) });
    return apiError("RAG_SEARCH_FAILED", "Could not complete search.", 500);
  }
}
